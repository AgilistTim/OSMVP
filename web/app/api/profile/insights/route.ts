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

type ActivityCategory = "hobby" | "side_hustle" | "career_intent";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface ExistingInsightInput {
  kind: InsightKind;
  value: string;
}

interface ExistingActivitySignalInput {
  category: ActivityCategory;
  statement: string;
}

interface ProfileInsightsRequestBody {
  sessionId?: string;
  turns: Turn[];
  existingInsights?: ExistingInsightInput[];
  existingActivitySignals?: ExistingActivitySignalInput[];
}

interface ProfileInsightResponse {
  kind: InsightKind;
  value: string;
  confidence?: InsightConfidence;
  evidence?: string;
  source?: "assistant" | "user" | "system";
}

type AttributeStage = "established" | "developing" | "hobby";

interface InferredAttribute {
  label: string;
  confidence?: InsightConfidence;
  evidence?: string;
  stage?: AttributeStage;
}

interface InferredAttributes {
  skills: InferredAttribute[];
  aptitudes: InferredAttribute[];
  workStyles: InferredAttribute[];
}

interface ActivitySignal {
  statement: string;
  category: ActivityCategory;
  supportingSkills: string[];
  inferredGoals?: string[];
  confidence?: InsightConfidence;
  evidence?: string;
}

type Readiness = "G1" | "G2" | "G3" | "G4";

interface ProfileInsightsResponseBody {
  insights: ProfileInsightResponse[];
  summary?: string;
  readiness?: Readiness;
  inferredAttributes?: InferredAttributes | null;
  activitySignals?: ActivitySignal[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ProfileInsightsRequestBody;
  const { turns, existingInsights = [], existingActivitySignals = [] } = body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[profile/insights] Missing OPENAI_API_KEY; skipping insight extraction.");
    return NextResponse.json({
      insights: [],
      summary: undefined,
      readiness: undefined,
      inferredAttributes: null,
    });
  }

  const openai = new OpenAI({ apiKey });
  const basePrompt = await getSystemPrompt();
  const existingSummary = existingInsights.length
    ? existingInsights.map((item) => `${item.kind}: ${item.value}`).join("; ")
    : "none";
  const existingActivitySummary = existingActivitySignals.length
    ? existingActivitySignals.map((item) => `${item.category}: ${item.statement}`).join("; ")
    : "none";

  const system = `${basePrompt ? `${basePrompt}\n\n` : ""}You are analysing the conversation to extract structured career profile insights.

Return strictly formatted JSON with:
- insights: array of objects { kind (interest|strength|constraint|goal|frustration|hope|boundary|highlight), value, confidence (optional low|medium|high), evidence (optional short paraphrase), source (optional assistant|user|system) }
- inferredAttributes: object with keys skills, aptitudes, workStyles. Each key maps to an array of objects { label, confidence (optional low|medium|high), evidence (optional sentence linking back to the conversation), stage (required; established|developing|hobby) }.
- activitySignals: array of objects { statement (verbatim or tightly paraphrased user quote), category (hobby|side_hustle|career_intent), supportingSkills (array of transferable skill labels derived from the activity), inferredGoals (optional array of concise goal statements implied by the activity), confidence (optional low|medium|high), evidence (optional reminder of why it matters) }.
- summary: optional short (<= 2 sentences) recap of the new information learned in this turn.
- readiness: one of G1, G2, G3, G4 reflecting the user's current career readiness based on the full conversation so far.

## Insight Type Definitions

**interest**: Things they're drawn to, enjoy, or spend time on
- Examples: "building AI voice tools", "watching YouTube about tech", "helping ADHD communities"

**strength**: Skills, abilities, or qualities they demonstrate or claim
- Examples: "focus and productivity", "building tools", "problem-solving", "getting things done"
- Look for: "I built", "I can", "I'm good at", "I get them done", past accomplishments

**goal**: Concrete outcomes they want to achieve
- Examples: "sell the goal-setting tool", "start a business", "make it into a product"
- Look for: "I want to", "I'm going to", "I plan to", "turn it into"
- Only treat a statement as a goal if the USER clearly expresses intent or desire. Assistant suggestions or hypotheticals do **not** become goals unless the user explicitly opts in. If the user rejects or downplays an idea ("that's rubbish", "not me"), do not create a goal from it; instead, note a boundary if helpful.

**hope**: Aspirations or desires for the future (more abstract than goals)
- Examples: "help people focus better", "make a difference"

**frustration**: Pain points or challenges they face
- Examples: "can't focus", "struggling with", "annoyed by"

**constraint**: Limitations or boundaries affecting their choices
- Examples: "no time", "limited budget", "need to finish school first"

**boundary**: Personal limits or non-negotiables
- Examples: "won't work weekends", "must be remote"

**highlight**: Notable moments or achievements worth remembering
- Examples: "built a Pomodoro calendar tool", "solved a real problem for myself"

## Inferred Attributes

- **skills**: Transferable abilities the user demonstrates or implies (e.g. "observational analysis", "community building").
- **aptitudes**: Natural talents or competencies they are developing (e.g. "strategic thinking", "pattern recognition").
- **workStyles**: Preferences or ways of operating (e.g. "thrives under pressure", "learns through experimentation").
- Never echo an activity label (e.g. "breaking down match footage") as a skill. Instead, name the capabilities that make the activity possible (e.g. "tactical pattern recognition", "video analysis workflow design").
- Each attribute must include a \`stage\` field:
  - \`established\` when the person relies on it to deliver real outcomes or has clear evidence of mastery.
  - \`developing\` when they are actively practicing or recently applying the ability but still building confidence.
  - \`hobby\` when it is only mentioned as casual enjoyment or early experimentation (e.g. "I play tennis on weekends").
- Every attribute must cite evidence from the turns (paraphrased is fine) so we know why it was inferred.
- Use activity classification (defined below) to help choose the correct stage: hobbies -> stage "hobby", side hustles -> "developing" unless clearly proven, career intents -> "established" only when evidence shows track record.

## Activity Classification

- **hobby**: Pure enjoyment or casual tinkering with minimal stakes. Low signal strength.
- **side_hustle**: Real activity that already demonstrates marketable skills (organising gigs, building tools for friends, etc.). Medium signal strength.
- **career_intent**: Explicit statements about desired careers or transitions. High signal but may need grounding (e.g. "be a pro footballer").

Always populate \`activitySignals\` by translating user statements into these categories. For each signal:
- Quote the statement succinctly.
- Produce 1-4 supporting skill labels that describe the underlying capability (not the task itself).
- If the statement implies a goal, add it to \`inferredGoals\`.

Already captured insights: ${existingSummary}
Already captured activity signals: ${existingActivitySummary}

Guidelines:
- Only add NEW insights or activity signals that are not already present in the lists above.
- Capture the user's actual wording wherever possible (e.g. "obsessed with all-night beat-making" instead of "music production interest").
- Make each insight specific and actionable.
- **Be aggressive in extracting strengths and goals** - if they mention building something, that's a strength; if they mention wanting to sell it, that's a goal.
- Respect sourcing hierarchy: user statements > assistant ideas. Never promote an assistant-generated suggestion to an insight unless the user clearly accepts it.
- When the user pushes back on an idea (especially one introduced by the assistant), prefer adding a boundary insight describing the rejection rather than repeating the idea as a goal.
- Base evidence on the provided conversation turns. If a fact is inferred, note the reasoning in the evidence field.
- If no new insights are present, return an empty array.
- Maintain a supportive coaching interpretation in the summary.`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: JSON.stringify({ turns, existingInsights }) },
  ];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: ProfileInsightsResponseBody;
  try {
    parsed = JSON.parse(content) as ProfileInsightsResponseBody;
  } catch (error) {
    console.error("[profile/insights] Failed to parse LLM response:", content, error);
    return NextResponse.json({
      insights: [],
      summary: undefined,
      readiness: undefined,
      inferredAttributes: null,
    });
  }

  const normalizedInsights: ProfileInsightResponse[] = Array.isArray(parsed.insights)
    ? parsed.insights
        .filter(
          (item): item is ProfileInsightResponse =>
            Boolean(item) &&
            typeof item.kind === "string" &&
            typeof item.value === "string" &&
            item.value.trim().length > 0
        )
        .map((item) => ({
          ...item,
          value: item.value.trim(),
          confidence:
            item.confidence === "low" || item.confidence === "medium" || item.confidence === "high"
              ? item.confidence
              : undefined,
          evidence: typeof item.evidence === "string" ? item.evidence.trim() : undefined,
          source:
            item.source === "assistant" || item.source === "user" || item.source === "system"
              ? item.source
              : undefined,
        }))
    : [];

  const sanitizeAttributeList = (value: unknown): InferredAttribute[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (item): item is InferredAttribute =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { label?: unknown }).label === "string"
      )
      .map((item) => ({
        label: item.label.trim(),
        confidence:
          item.confidence === "low" || item.confidence === "medium" || item.confidence === "high"
            ? item.confidence
            : undefined,
        evidence: typeof item.evidence === "string" ? item.evidence.trim() : undefined,
        stage:
          item.stage === "established" || item.stage === "developing" || item.stage === "hobby"
            ? item.stage
            : undefined,
      }))
      .filter((item) => item.label.length > 0);
  };

  const inferredAttributes: InferredAttributes = {
    skills: sanitizeAttributeList(parsed.inferredAttributes?.skills),
    aptitudes: sanitizeAttributeList(parsed.inferredAttributes?.aptitudes),
    workStyles: sanitizeAttributeList(parsed.inferredAttributes?.workStyles),
  };

  const hasInferredAttributes =
    inferredAttributes.skills.length > 0 ||
    inferredAttributes.aptitudes.length > 0 ||
    inferredAttributes.workStyles.length > 0;

  const sanitizeStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    value.forEach((item) => {
      if (typeof item !== "string") return;
      const trimmed = item.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(trimmed);
    });
    return result;
  };

  const activitySignals: ActivitySignal[] = Array.isArray(parsed.activitySignals)
    ? parsed.activitySignals
        .filter(
          (item): item is ActivitySignal =>
            Boolean(item) &&
            typeof item.statement === "string" &&
            typeof item.category === "string" &&
            (item.category === "hobby" ||
              item.category === "side_hustle" ||
              item.category === "career_intent")
        )
        .map((item) => ({
          statement: item.statement.trim(),
          category: item.category,
          supportingSkills: sanitizeStringArray(item.supportingSkills),
          inferredGoals: sanitizeStringArray(item.inferredGoals),
          confidence:
            item.confidence === "low" || item.confidence === "medium" || item.confidence === "high"
              ? item.confidence
              : undefined,
          evidence: typeof item.evidence === "string" ? item.evidence.trim() : undefined,
        }))
        .filter((item) => item.statement.length > 0)
    : [];

  return NextResponse.json({
    insights: normalizedInsights,
    summary: parsed.summary,
    readiness: parsed.readiness,
    inferredAttributes: hasInferredAttributes ? inferredAttributes : null,
    activitySignals: activitySignals.length > 0 ? activitySignals : undefined,
  });
}
