import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ConversationPhase, ConversationFocus, InsightSnapshot } from "@/lib/conversation-phases";
import { computeRubricScores } from "@/lib/conversation-phases";
import { buildRealtimeInstructions } from "@/lib/conversation-instructions";
import { getSystemPrompt } from "@/lib/system-prompt";

interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

interface ChatRequestBody {
  turns: ConversationTurn[];
  profile?: Record<string, unknown>;
  suggestions?: Array<{ id: string; title: string }>;
  phase?: ConversationPhase;
  votes?: Record<string, 1 | 0 | -1 | undefined>;
}

function isConversationPhase(value: unknown): value is ConversationPhase {
  return value === "warmup" || value === "story-mining" || value === "pattern-mapping" || value === "option-seeding" || value === "commitment";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as ChatRequestBody;
  const { turns, profile, suggestions, votes } = body;
  const phase = isConversationPhase(body.phase) ? body.phase : undefined;

  if (!Array.isArray(turns) || turns.length === 0) {
    return NextResponse.json(
      { error: "Invalid request: turns array required" },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });

  const profileInsights = sanitizeInsights((profile as { insights?: unknown })?.insights as Array<{ kind?: unknown; value?: unknown }>);

  const suggestionCount = Array.isArray(suggestions) ? suggestions.length : 0;
  const votesByCareerId = votes ?? {};

  const rubric = computeRubricScores({
    turns,
    insights: profileInsights,
    votes: votesByCareerId,
    suggestionCount,
    prevRubric: null,
  });

  const focusToPhase: Record<ConversationFocus, ConversationPhase> = {
    rapport: "warmup",
    story: "story-mining",
    pattern: "pattern-mapping",
    ideation: "option-seeding",
    decision: "commitment",
  };

  const effectivePhase = phase ?? focusToPhase[rubric.recommendedFocus] ?? "story-mining";
  const basePrompt = await getSystemPrompt({ phase: effectivePhase });
  if (!basePrompt) {
    return NextResponse.json({ error: "Unable to load system prompt" }, { status: 500 });
  }

  // Build context about the user's profile and suggestions
  let contextInfo = "";
  if (profileInsights.length > 0) {
    contextInfo += "User insights discovered so far:\n";
    contextInfo += profileInsights.map((i) => `- ${i.kind}: ${i.value}`).join("\n");
  }
  if (suggestions && suggestions.length > 0) {
    contextInfo += `${contextInfo ? "\n\n" : ""}Career suggestions shown to user:\n`;
    contextInfo += suggestions.map((s) => `- ${s.title}`).join("\n");
  }

  const guidanceText = buildRealtimeInstructions({
    phase: effectivePhase,
    rubric,
    allowCardPrompt: true,
  });

  const systemSections = [basePrompt.trim()];
  if (contextInfo.trim().length > 0) {
    systemSections.push(`## Session Context\n${contextInfo.trim()}`);
  }
  if (guidanceText && guidanceText.trim().length > 0) {
    systemSections.push(`## Phase Guidance\n${guidanceText.trim()}`);
  }

  const systemMessage = systemSections.join("\n\n");

  if (process.env.NODE_ENV !== "production") {
    console.info("[api/chat] System prompt payload", {
      phase: effectivePhase,
      baseLength: basePrompt.length,
      contextLength: contextInfo.trim().length,
      guidanceLength: guidanceText?.length ?? 0,
      preview: systemMessage.slice(0, 400),
    });
  }

  // Convert turns to OpenAI message format
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemMessage },
  ];

  for (const turn of turns) {
    messages.push({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.text,
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages,
      temperature: 0.7,
      max_tokens: 150,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "Sorry, I didn't catch that. Can you say more?";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
const INSIGHT_KINDS: Array<InsightSnapshot["kind"]> = [
  "interest",
  "strength",
  "constraint",
  "goal",
  "frustration",
  "hope",
  "boundary",
  "highlight",
];

function sanitizeInsights(raw?: Array<{ kind?: unknown; value?: unknown }>): InsightSnapshot[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      const kind = typeof item.kind === "string" && INSIGHT_KINDS.includes(item.kind as InsightSnapshot["kind"])
        ? (item.kind as InsightSnapshot["kind"])
        : undefined;
      const value = typeof item.value === "string" ? item.value.trim() : "";
      if (!kind || value.length === 0) {
        return null;
      }
      return { kind, value } satisfies InsightSnapshot;
    })
    .filter((item): item is InsightSnapshot => Boolean(item));
}
