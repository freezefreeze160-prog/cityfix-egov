import { NextRequest, NextResponse } from "next/server"

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { title, description, category, photo_url } = body

    if (!title || !description || !category) {
      return NextResponse.json({ error: "Title, description, and category are required" }, { status: 400 })
    }

    // Build the prompt parts
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = []

    parts.push({
      text: `You are an AI moderator for a 311-style municipal service request platform called CityFix.

A citizen has submitted a report. Your job is to evaluate whether this is a VALID civic issue that warrants dispatching city workers.

REJECT reports that are:
- Trivially insignificant (e.g., "one small bottle on the road", "a single leaf on the sidewalk")
- Not a civic/municipal matter (personal complaints, business disputes, neighbor arguments)
- Spam, jokes, gibberish, or test submissions
- Too vague to act on with no useful details
- Duplicate-sounding generic reports

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
{
  "valid": true/false,
  "score": 1-10,
  "reason": "Brief 1-2 sentence explanation in the same language as the report",
  "suggested_priority": "low" | "medium" | "high" | "urgent"
}

Score guide: 1-3 = reject (trivial/invalid), 4-5 = borderline, 6-8 = valid issue, 9-10 = urgent/critical.
Set valid=true only if score >= 4.`
    })

    // If there's a photo, fetch and include it
    if (photo_url) {
      try {
        const imgRes = await fetch(photo_url)
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer()
          const base64 = Buffer.from(buffer).toString("base64")
          const contentType = imgRes.headers.get("content-type") || "image/jpeg"

          parts.push({
            inline_data: {
              mime_type: contentType,
              data: base64,
            },
          })
          parts.push({
            text: "Above is the photo attached to this report. Factor it into your assessment - does the photo show a real civic issue?",
          })
        }
      } catch {
        // Photo fetch failed, evaluate text-only
      }
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error("[v0] Gemini API error:", errText)
      // On AI failure, let the report through as valid with a note
      return NextResponse.json({
        valid: true,
        score: 5,
        reason: "AI validation unavailable - report accepted for manual review",
        suggested_priority: "medium",
      })
    }

    const geminiData = await geminiRes.json()
    const rawText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ""

    // Parse JSON from Gemini response
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
      suggested_priority: ["low", "medium", "high", "urgent"].includes(parsed.suggested_priority)
        ? parsed.suggested_priority
        : "medium",
    })
  } catch (err) {
    console.error("[v0] Validate report error:", err)
    // On any error, let report through
    return NextResponse.json({
      valid: true,
      score: 5,
      reason: "Validation error - report accepted for manual review",
      suggested_priority: "medium",
    })
  }
}
