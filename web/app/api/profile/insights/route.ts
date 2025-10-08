import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSystemPrompt } from "@/lib/system-prompt";

type InsightKind = "interest" | "strength" | "constraint" | "goal" | "value";

type InsightConfidence = "low" | "medium" | "high";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface ExistingInsightInput {
  kind: InsightKind;
  value: string;
}

interface ProfileInsightsRequestBody {
  sessionId?: string;
  turns: Turn[];
  existingInsights?: ExistingInsightInput[];
}

interface ProfileInsightResponse {
  kind: InsightKind;
  value: string;
  confidence?: InsightConfidence;
  evidence?: string;
  source?: "assistant" | "user" | "system";
}

type Readiness = "G1" | "G2" | "G3" | "G4";

interface ProfileInsightsResponseBody {
  insights: ProfileInsightResponse[];
  summary?: string;
  readiness?: Readiness;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ProfileInsightsRequestBody;
  const { turns, existingInsights = [] } = body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const latestUser = [...turns].reverse().find((turn) => turn.role === "user");
    const fallbackInsight = latestUser?.text
      ? [{ kind: "interest" as InsightKind, value: latestUser.text.slice(0, 64) }]
      : [];
    return NextResponse.json({ insights: fallbackInsight });
  }

  const openai = new OpenAI({ apiKey });
  const basePrompt = await getSystemPrompt();
  const existingSummary = existingInsights.length
    ? existingInsights.map((item) => `${item.kind}: ${item.value}`).join("; ")
    : "none";

  const system = `${basePrompt ? `${basePrompt}\n\n` : ""}You are analysing the conversation to extract structured career profile insights.

Return strictly formatted JSON with:
- insights: array of objects { kind (interest|strength|constraint|goal|value), value, confidence (optional low|medium|high), evidence (optional short paraphrase), source (optional assistant|user|system) }
- summary: optional short (<= 2 sentences) recap of the new information learned in this turn.
- readiness: one of G1, G2, G3, G4 reflecting the user's current career readiness based on the full conversation so far.

Guidelines:
- Only add NEW insights that are not already present in this list: ${existingSummary}.
- Make each insight specific and actionable (e.g. "enjoys collaborative world-building survival games" rather than "likes games").
- Base evidence on the provided conversation turns. If a fact is inferred, note the reasoning in the evidence field.
- If no new insights are present, return an empty array.
- Maintain a supportive coaching interpretation in the summary.`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: JSON.stringify({ turns, existingInsights }) },
  ];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: ProfileInsightsResponseBody;
  try {
    parsed = JSON.parse(content) as ProfileInsightsResponseBody;
  } catch {
    parsed = { insights: [] };
  }

  const insights = Array.isArray(parsed.insights) ? parsed.insights : [];

  return NextResponse.json({
    insights,
    summary: parsed.summary,
    readiness: parsed.readiness,
  });
}
