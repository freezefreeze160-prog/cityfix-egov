import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    // Clone the request so we can read both cookies and formData
    const formData = await request.formData()
    const requestId = formData.get("request_id") as string
    const beforeUrl = formData.get("before_url") as string | null
    const afterFile = formData.get("after_photo") as File | null

    if (!requestId || !afterFile) {
      return NextResponse.json(
        { error: "Missing request_id or after_photo" },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              try {
                cookieStore.set(name, value, options)
              } catch {
                // ignore
              }
            })
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Upload the "after" photo to Supabase storage
    const ext = afterFile.name.split(".").pop() || "jpg"
    const filePath = `${user.id}/after_${Date.now()}.${ext}`
    const arrayBuffer = await afterFile.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from("request-photos")
      .upload(filePath, arrayBuffer, {
        contentType: afterFile.type || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const {
      data: { publicUrl: afterUrl },
    } = supabase.storage.from("request-photos").getPublicUrl(filePath)

    // Check Gemini key exists
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured. Add it in the Vars section." },
        { status: 500 }
      )
    }

    // Build Gemini request with image URLs instead of base64 (avoids payload size issues)
    const parts: Array<Record<string, unknown>> = []

    // Add "before" image if available - use URL reference
    if (beforeUrl) {
      try {
        const beforeRes = await fetch(beforeUrl)
        if (beforeRes.ok) {
          const beforeBuf = Buffer.from(await beforeRes.arrayBuffer())
          // Limit image size to 4MB for Gemini
          if (beforeBuf.byteLength < 4 * 1024 * 1024) {
            const beforeBase64 = beforeBuf.toString("base64")
            const contentType = beforeRes.headers.get("content-type") || "image/jpeg"
            parts.push({
              inline_data: { mime_type: contentType, data: beforeBase64 },
            })
          }
        }
      } catch {
        // skip before image if fetch fails
      }
    }

    // Add "after" image - use the already-read buffer
    // Limit to 4MB
    if (arrayBuffer.byteLength < 4 * 1024 * 1024) {
      const afterBase64 = Buffer.from(arrayBuffer).toString("base64")
      const afterMime = afterFile.type || "image/jpeg"
      parts.push({
        inline_data: { mime_type: afterMime, data: afterBase64 },
      })
    } else {
      // If too large, resize by skipping and just use text analysis
      parts.push({
        text: "[After photo was too large to analyze directly]",
      })
    }

    // Add the prompt
    parts.push({
      text: `You are an AI inspector for a municipal 311-style service request system.
${beforeUrl ? "Compare the BEFORE photo (first image) and AFTER photo (second image) of a civic issue (pothole, trash, graffiti, etc.)." : "Analyze this AFTER photo of a completed civic maintenance job."}

Determine:
1. Is the issue resolved? (true/false)
2. Rate the quality of work from 1 to 10.
3. Brief comment about what you see.

Return STRICTLY valid JSON only, no markdown, no backticks, no explanation:
{"resolved": true, "score": 8, "comment": "The pothole has been properly filled and paved."}`,
    })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 256,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text()
      console.error("[v0] Gemini HTTP error:", geminiRes.status, errBody)
      return NextResponse.json(
        { error: `Gemini API error (${geminiRes.status}): ${errBody.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const geminiData = await geminiRes.json()
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    // Parse JSON from Gemini response
    let verification: { resolved: boolean; score: number; comment: string }
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      verification = JSON.parse(jsonMatch?.[0] ?? rawText)
    } catch {
      verification = {
        resolved: false,
        score: 0,
        comment: rawText.slice(0, 300) || "Could not parse AI response",
      }
    }

    // Store verification result on the service request
    const { error: dbError } = await supabase
      .from("service_requests")
      .update({ ai_verification: verification })
      .eq("id", requestId)

    if (dbError) {
      console.error("[v0] DB update error:", dbError)
    }

    return NextResponse.json({
      verification,
      after_url: afterUrl,
    })
  } catch (err) {
    console.error("[v0] Verify report error:", err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Server error: ${err.message}`
            : "Internal server error",
      },
      { status: 500 }
    )
  }
}
