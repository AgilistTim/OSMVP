import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSystemPrompt } from "@/lib/system-prompt";

type InsightKind =
  | "interest"
  | "strength"
  | "constraint"
  | "goal"
  | "frustration"
  | "hope"
  | "boundary"
  | "highlight";

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
    const existingKinds = new Set(existingInsights.map((item) => item.kind));
    const fallbackInsights: ProfileInsightResponse[] = [];

    const priorityOrder: InsightKind[] = [
      "interest",
      "strength",
      "hope",
      "goal",
      "highlight",
    ];

    const buildValue = (kind: InsightKind, text: string) => {
      const trimmed = text.trim().slice(0, 160);
      const sanitized =
        trimmed
          .replace(/^I['’]?\s+(am|was|have|feel|love|like|want|hope|enjoy|can)\s+/i, "")
          .trim() || trimmed;
      switch (kind) {
        case "strength":
          return sanitized.startsWith("Feels")
            ? sanitized
            : `Feels confident about ${sanitized}`;
        case "hope":
          return sanitized.startsWith("Hoping")
            ? sanitized
            : `Hoping to ${sanitized}`;
        case "goal":
          return sanitized.startsWith("Wants")
            ? sanitized
            : `Wants to ${sanitized}`;
        case "highlight":
          return sanitized.startsWith("Noted")
            ? sanitized
            : `Noted: ${sanitized}`;
        default:
          return sanitized;
      }
    };

    if (latestUser?.text) {
      const nextKind = priorityOrder.find((kind) => existingKinds.has(kind) === false);
      if (nextKind) {
        fallbackInsights.push({
          kind: nextKind,
          value: buildValue(nextKind, latestUser.text),
          confidence: "low",
          source: "assistant",
          evidence: "Heuristic fallback (no OpenAI key).",
        });
      }
    }

    const insightScore =
      Number(existingKinds.has("interest")) +
      Number(existingKinds.has("strength")) +
      Number(existingKinds.has("hope")) +
      Number(fallbackInsights.some((item) => item.kind === "interest")) +
      Number(fallbackInsights.some((item) => item.kind === "strength")) +
      Number(fallbackInsights.some((item) => item.kind === "hope"));

    const readiness: Readiness =
      insightScore >= 3 ? "G3" : insightScore >= 2 ? "G2" : "G1";

    const summary =
      latestUser?.text && fallbackInsights.length > 0
        ? `Captured a new note about ${fallbackInsights[0]?.kind ?? "their journey"}.`
        : undefined;

    return NextResponse.json({
      insights: fallbackInsights,
      summary,
      readiness,
    });
  }

  const openai = new OpenAI({ apiKey });
  const basePrompt = await getSystemPrompt();
  const existingSummary = existingInsights.length
    ? existingInsights.map((item) => `${item.kind}: ${item.value}`).join("; ")
    : "none";

  const system = `${basePrompt ? `${basePrompt}\n\n` : ""}You are analysing the conversation to extract structured career profile insights.

Return strictly formatted JSON with:
- insights: array of objects { kind (interest|strength|constraint|goal|frustration|hope|boundary|highlight), value, confidence (optional low|medium|high), evidence (optional short paraphrase), source (optional assistant|user|system) }
- summary: optional short (<= 2 sentences) recap of the new information learned in this turn.
- readiness: one of G1, G2, G3, G4 reflecting the user's current career readiness based on the full conversation so far.

Guidelines:
- Only add NEW insights that are not already present in this list: ${existingSummary}.
- Capture the user's actual wording wherever possible (e.g. "obsessed with all-night beat-making" instead of "music production interest").
- Make each insight specific and actionable.
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
