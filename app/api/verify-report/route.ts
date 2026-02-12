import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
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
                // ignore - can't set cookies in route handler response after streaming
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

    // Fetch both images as base64 for Gemini
    const afterBuf = Buffer.from(arrayBuffer)
    const afterBase64 = afterBuf.toString("base64")
    const afterMime = afterFile.type || "image/jpeg"

    const parts: Array<Record<string, unknown>> = []

    // Add "before" image if available
    if (beforeUrl) {
      try {
        const beforeRes = await fetch(beforeUrl)
        if (beforeRes.ok) {
          const beforeBuf = Buffer.from(await beforeRes.arrayBuffer())
          const beforeBase64 = beforeBuf.toString("base64")
          const contentType =
            beforeRes.headers.get("content-type") || "image/jpeg"
          parts.push({
            inline_data: { mime_type: contentType, data: beforeBase64 },
          })
        }
      } catch {
        // skip before image if fetch fails
      }
    }

    // Add "after" image
    parts.push({
      inline_data: { mime_type: afterMime, data: afterBase64 },
    })

    // Add the prompt
    parts.push({
      text: `You are an AI inspector for a municipal 311-style service request system.
${beforeUrl ? "Compare the BEFORE photo (first) and AFTER photo (second) of a civic issue (pothole, trash, graffiti, etc.)." : "Analyze this AFTER photo of a completed civic maintenance job."}

Determine:
1. Is the issue resolved? (true/false)
2. Rate the quality of work from 1 to 10.
3. Brief comment about what you see.

Return STRICTLY valid JSON, no markdown, no backticks:
{"resolved": true, "score": 8, "comment": "The pothole has been properly filled and paved."}`,
    })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      )
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error("[v0] Gemini API error:", errText)
      return NextResponse.json(
        { error: "Gemini API error" },
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
        comment: rawText.slice(0, 300),
      }
    }

    // Store verification result on the service request
    await supabase
      .from("service_requests")
      .update({ ai_verification: verification })
      .eq("id", requestId)

    return NextResponse.json({
      verification,
      after_url: afterUrl,
    })
  } catch (err) {
    console.error("[v0] Verify report error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}
