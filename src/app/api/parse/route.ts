import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

    const prompt = `
Convert the reminder into STRICT JSON with this format:

{
  "title": string,
  "triggers": [
    { "type": "location" | "person" | "time_window" | "activity", "value": string }
  ]
}

Rules:
- Output JSON only.
- If no clear trigger exists, return triggers: [].
- Keep title short.

Reminder: "${text}"
`;

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const out = (r.output_text || "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(out);
    } catch {
      parsed = { title: text.slice(0, 40), triggers: [] };
    }

    return Response.json(parsed);
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Parse failed" }, { status: 500 });
  }
}