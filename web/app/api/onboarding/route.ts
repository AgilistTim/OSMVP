import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSystemPrompt } from "@/lib/system-prompt";

type Readiness = "G1" | "G2" | "G3" | "G4";
type InsightKind = "interest" | "strength" | "constraint" | "goal" | "value";

interface ExistingInsight {
  kind: InsightKind;
  value: string;
}

function isReadiness(value: unknown): value is Readiness {
  return value === "G1" || value === "G2" || value === "G3" || value === "G4";
}

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface OnboardingRequestBody {
  sessionId?: string;
  profile?: Record<string, unknown>;
  turns: Turn[];
}

interface OnboardingModelInsight {
  kind: InsightKind;
  value: string;
  confidence?: "low" | "medium" | "high";
  evidence?: string;
}

interface OnboardingModelResponse {
  readiness?: Readiness | null;
  question?: string;
  rationale?: string;
  revealDraftCards?: boolean;
  insights?: OnboardingModelInsight[];
  summary?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as OnboardingRequestBody;
  const { turns, profile } = body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const countUserTurns = (turns ?? []).filter((t) => t.role === "user").length;
    const readiness: Readiness = countUserTurns <= 1 ? "G2" : countUserTurns >= 4 ? "G3" : "G2";
    const canned = [
      "Do you have a specific career or field in mind at this point?",
      "How confident and satisfied are you with that choice?",
      "Which activities do you find enjoyable?",
      "Which of the following have you done so far to explore careers?",
    ];
    const question = canned[Math.min(countUserTurns, canned.length - 1)];
    return NextResponse.json({
      readiness,
      question,
      rationale: "dev_fallback_no_api_key",
      revealDraftCards: countUserTurns >= 2,
      insights: [],
    });
  }

  const openai = new OpenAI({ apiKey });

  const basePrompt = await getSystemPrompt();
  const existingInsights: ExistingInsight[] = Array.isArray((profile as { insights?: ExistingInsight[] } | undefined)?.insights)
    ? (((profile as { insights?: ExistingInsight[] }).insights ?? []) as ExistingInsight[])
    : [];

  const existingSummary =
    existingInsights.length > 0
      ? existingInsights.map((item) => `${item.kind}: ${item.value}`).join("; ")
      : "none";

  const system = `${basePrompt ? `${basePrompt}\n\n` : ""}You are operating in text mode for the same career exploration journey. Continue the conversation using the established five-phase structure and persona.

Deliverables (strict JSON keys):
- readiness: one of G1, G2, G3, G4
- question: string
- rationale: short string
- revealDraftCards: boolean
- insights: array of objects { kind (interest|strength|constraint|goal|value), value, confidence (optional low|medium|high), evidence (optional short paraphrase) }
- summary: optional short recap (<= 2 sentences)

Instructions:
- Classify the user's readiness based on the dialogue so far.
- Craft the next question in UK English, <= 1 concise sentence.
- Offer a short reflective statement or suggestion before asking the question.
- Identify NEW insights gained from the latest user responses. Do not repeat items already known.
- Existing insights (do not repeat): ${existingSummary}.
- Make each insight specific and actionable (e.g. "enjoys collaborative world-building games" rather than "likes games").
- Maintain an empathetic, encouraging coaching tone.
- Never echo long fragments of user text verbatim.`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: JSON.stringify({ profile, turns }) },
  ];

  if (process.env.NODE_ENV !== "production") {
    console.info("[onboarding] system prompt snippet", system.slice(0, 240));
    console.info("[onboarding] turns count", turns.length, "existing insights", existingInsights.length);
  }

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: OnboardingModelResponse;
  try {
    parsed = JSON.parse(content) as OnboardingModelResponse;
  } catch {
    parsed = {
      readiness: null,
      question: "What matters most to you at work?",
      rationale: "fallback",
      revealDraftCards: false,
      insights: [],
    };
  }

  const readiness: Readiness = isReadiness(parsed.readiness) ? parsed.readiness : "G2";

  return NextResponse.json({
    readiness,
    question: parsed.question as string,
    rationale: parsed.rationale as string,
    revealDraftCards: Boolean(parsed.revealDraftCards),
    insights: Array.isArray(parsed.insights) ? parsed.insights : [],
    summary: parsed.summary,
  });
}
