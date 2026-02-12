import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured" }, { status: 500 })
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

    // Build GPT-4o messages with vision
    const content: Array<Record<string, unknown>> = []

    content.push({
      type: "text",
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
Set valid=true only if score >= 4.`,
    })

    // If there's a photo, fetch it and convert to base64 for reliable delivery
    if (photo_url) {
      try {
        const imgRes = await fetch(photo_url)
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer()
          if (buf.byteLength < 4 * 1024 * 1024) {
            const b64 = Buffer.from(buf).toString("base64")
            const mime = imgRes.headers.get("content-type") || "image/jpeg"
            content.push({
              type: "image_url",
              image_url: { url: `data:${mime};base64,${b64}`, detail: "low" },
            })
            content.push({
              type: "text",
              text: "Above is the photo attached to this report. Factor it into your assessment - does the photo show a real civic issue?",
            })
          }
        }
      } catch (imgErr) {
        console.error("[v0] Photo fetch error:", imgErr)
      }
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
      const errText = await gptRes.text()
      console.error("[v0] OpenAI validate error:", gptRes.status, errText)
      // On AI failure, let the report through for manual review
      return NextResponse.json({
        valid: true,
        score: 5,
        reason: `AI validation unavailable (${gptRes.status}) - report accepted for manual review`,
        suggested_priority: "medium",
      })
    }

    const gptData = await gptRes.json()
    const rawText = gptData?.choices?.[0]?.message?.content || ""

    // Parse JSON from GPT response
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
    // On any error, let report through
    return NextResponse.json({
      valid: true,
      score: 5,
      reason: "Validation error - report accepted for manual review",
      suggested_priority: "medium",
    })
  }
}
