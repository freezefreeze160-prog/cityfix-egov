import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const requestId = formData.get("request_id") as string
    const beforeUrl = formData.get("before_url") as string
    const afterFile = formData.get("after_photo") as File | null

    if (!requestId || !afterFile) {
      return NextResponse.json(
        { error: "Missing request_id or after_photo" },
        { status: 400 }
      )
    }

    // Upload the "after" photo to Supabase storage
    const ext = afterFile.name.split(".").pop()
    const filePath = `${user.id}/after_${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from("request-photos")
      .upload(filePath, afterFile)
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
    const [beforeRes, afterRes] = await Promise.all([
      beforeUrl ? fetch(beforeUrl) : null,
      fetch(afterUrl),
    ])

    const afterBuf = Buffer.from(await afterRes.arrayBuffer())
    const afterBase64 = afterBuf.toString("base64")
    const afterMime = afterFile.type || "image/jpeg"

    const parts: Array<Record<string, unknown>> = []

    // Add "before" image if available
    if (beforeRes && beforeRes.ok) {
      const beforeBuf = Buffer.from(await beforeRes.arrayBuffer())
      const beforeBase64 = beforeBuf.toString("base64")
      const contentType = beforeRes.headers.get("content-type") || "image/jpeg"
      parts.push({
        inline_data: { mime_type: contentType, data: beforeBase64 },
      })
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
        { error: "Gemini API error", details: errText },
        { status: 502 }
      )
    }

    const geminiData = await geminiRes.json()
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    // Parse JSON from Gemini response (may contain markdown wrapping)
    let verification: { resolved: boolean; score: number; comment: string }
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      verification = JSON.parse(jsonMatch?.[0] ?? rawText)
    } catch {
      verification = { resolved: false, score: 0, comment: rawText.slice(0, 300) }
    }

    // Store verification result and after photo on the service request
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({
        ai_verification: verification,
      })
      .eq("id", requestId)

    if (updateError) {
      console.error("[v0] Update error:", updateError)
    }

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
