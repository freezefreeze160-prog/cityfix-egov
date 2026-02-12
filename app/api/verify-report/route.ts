import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const maxDuration = 60

export async function POST(request: Request) {
  try {
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

    // Check OpenAI key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured. Add it in the Vars section." },
        { status: 500 }
      )
    }

    // Build GPT-4o messages with vision
    const content: Array<Record<string, unknown>> = []

    content.push({
      type: "text",
      text: `You are an AI inspector for a municipal 311-style service request system.
${beforeUrl ? "Compare the BEFORE photo and AFTER photo of a civic issue (pothole, trash, graffiti, etc.)." : "Analyze this AFTER photo of a completed civic maintenance job."}

Determine:
1. Is the issue resolved? (true/false)
2. Rate the quality of work from 1 to 10.
3. Brief comment about what you see.

Return STRICTLY valid JSON only, no markdown, no backticks:
{"resolved": true, "score": 8, "comment": "The pothole has been properly filled and paved."}`,
    })

    // Add "before" image if available - convert to base64 for reliable delivery
    if (beforeUrl) {
      try {
        const beforeRes = await fetch(beforeUrl)
        if (beforeRes.ok) {
          const beforeBuf = await beforeRes.arrayBuffer()
          if (beforeBuf.byteLength < 4 * 1024 * 1024) {
            const b64 = Buffer.from(beforeBuf).toString("base64")
            const mime = beforeRes.headers.get("content-type") || "image/jpeg"
            content.push({
              type: "image_url",
              image_url: { url: `data:${mime};base64,${b64}`, detail: "low" },
            })
          }
        }
      } catch (imgErr) {
        console.error("[v0] Before photo fetch error:", imgErr)
      }
    }

    // Add "after" image as base64
    if (arrayBuffer.byteLength < 4 * 1024 * 1024) {
      const afterBase64 = Buffer.from(arrayBuffer).toString("base64")
      const afterMime = afterFile.type || "image/jpeg"
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${afterMime};base64,${afterBase64}`,
          detail: "low",
        },
      })
    }

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "o3-mini",
        messages: [{ role: "user", content }],
        temperature: 0.2,
        max_tokens: 300,
      }),
    })

    if (!gptRes.ok) {
      const errBody = await gptRes.text()
      console.error("[v0] OpenAI HTTP error:", gptRes.status, errBody)
      return NextResponse.json(
        { error: `OpenAI API error (${gptRes.status}): ${errBody.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const gptData = await gptRes.json()
    const rawText = gptData?.choices?.[0]?.message?.content ?? ""

    // Parse JSON from GPT response
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
