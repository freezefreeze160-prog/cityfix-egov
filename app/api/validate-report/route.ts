import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

const GEMINI_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { title, description, category, photo_url } = body

    if (!title || !description || !category) {
      return NextResponse.json(
        { error: "Title, description, and category are required" },
        { status: 400 }
      )
    }

    const parts: Array<Record<string, unknown>> = []

    parts.push({
      text: `You are an AI moderator for a 311-style municipal service request platform called CityFix.

A citizen has submitted a report. Your job is to evaluate whether this is a VALID civic issue that warrants dispatching city workers.

REJECT reports that are:
- Trivially insignificant (e.g., "one small bottle on the road", "a single leaf on the sidewalk")
- Not a civic/municipal matter (personal complaints, business disputes, neighbor arguments)
- Spam, jokes, gibberish, or test submissions
- Too vague to act on with no useful details

ACCEPT reports that are:
- Real infrastructure problems (potholes, broken streetlights, water leaks, damaged sidewalks)
- Public safety hazards
- Sanitation issues (overflowing bins, illegal dumping, significant trash accumulation)
- Issues that affect multiple people or public spaces
- Clearly described with enough detail to locate and address

Report details:
- Title: ${title}
- Description: ${description}
- Category: ${category}

Respond with ONLY valid JSON (no markdown, no code blocks):
{"valid": true, "score": 7, "reason": "Brief explanation in the same language as the report", "suggested_priority": "medium"}

Score guide: 1-3 = reject (trivial/invalid), 4-5 = borderline, 6-8 = valid issue, 9-10 = urgent/critical.
Set valid=true only if score >= 4.`,
    })

    // If there's a photo, fetch and include as base64
    if (photo_url) {
      try {
        const imgRes = await fetch(photo_url)
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer()
          if (buf.byteLength < 4 * 1024 * 1024) {
            const b64 = Buffer.from(buf).toString("base64")
            const mime = imgRes.headers.get("content-type") || "image/jpeg"
            parts.push({
              inline_data: { mime_type: mime, data: b64 },
            })
            parts.push({
              text: "Above is the photo attached to this report. Factor it into your assessment - does the photo show a real civic issue?",
            })
          }
        }
      } catch {
        // photo fetch failed, evaluate text-only
      }
    }

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error("[v0] Gemini validate error:", geminiRes.status, errText)
      return NextResponse.json({
        valid: true,
        score: 5,
        reason: `AI validation unavailable (${geminiRes.status}) - report accepted for manual review`,
        suggested_priority: "medium",
      })
    }

    const geminiData = await geminiRes.json()
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ""

    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        valid: true,
        score: 5,
        reason: "Could not parse AI response - report accepted for manual review",
        suggested_priority: "medium",
      })
    }

    const parsed = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      valid: Boolean(parsed.valid),
      score: Math.min(10, Math.max(1, Number(parsed.score) || 5)),
      reason: String(parsed.reason || "No reason provided"),
      suggested_priority: ["low", "medium", "high", "urgent"].includes(
        parsed.suggested_priority
      )
        ? parsed.suggested_priority
        : "medium",
    })
  } catch (err) {
    console.error("[v0] Validate report error:", err)
    return NextResponse.json({
      valid: true,
      score: 5,
      reason: "Validation error - report accepted for manual review",
      suggested_priority: "medium",
    })
  }
}
