import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSystemPrompt } from "@/lib/system-prompt";

type Readiness = "G1" | "G2" | "G3" | "G4";
type InsightKind =
  | "interest"
  | "strength"
  | "constraint"
  | "goal"
  | "frustration"
  | "hope"
  | "boundary"
  | "highlight";

interface ExistingInsight {
  kind: InsightKind;
  value: string;
}

interface OnboardingOption {
  id: string;
  title: string;
  description?: string;
}

interface OnboardingRound {
  questionId: string;
  question: string;
  selectedOptionId: string;
  selectedOptionTitle: string;
  selectedOptionDescription?: string;
  freeText?: string;
  readiness?: Readiness;
}

interface OnboardingRequestBody {
  sessionId?: string;
  profile?: Record<string, unknown>;
  rounds?: OnboardingRound[];
}

interface OnboardingModelInsight {
  kind: InsightKind;
  value: string;
  confidence?: "low" | "medium" | "high";
  evidence?: string;
}

interface OnboardingModelResponse {
  readiness?: Readiness | null;
  questionId?: string;
  question?: string;
  options?: OnboardingOption[];
  freeTextPrompt?: string | null;
  rationale?: string;
  revealDraftCards?: boolean;
  insights?: OnboardingModelInsight[];
  summary?: string;
}

const MULTIPLE_CHOICE_ROUNDS = 5;

const ROUND_GUIDANCE: string[] = [
  "Round 1 (readiness classifier): ask the user which statement best describes where they are in their career thinking. Provide four first-person options aligned to readiness groups G1 (identity diffusion, unsure where to start), G2 (exploring options), G3 (tentatively decided), and G4 (focused and confident).",
  "Round 2 (idea clarity): explore whether they have a specific career or field in mind. Present four nuanced options ranging from no idea yet, to a few broad themes, to one or two serious ideas, to a clear path.",
  "Round 3 (emotions or confidence): if earlier answers show uncertainty (G1/G2) focus on emotions around not knowing, otherwise focus on confidence and satisfaction with their current direction.",
  "Round 4 (motivations and activities): for users still exploring, ask which activities they enjoy or want to explore; for decided users, ask about main motivations for the current choice. Options should reveal interests, values, or strengths.",
  "Round 5 (actions taken): ask what steps they have already taken to explore careers (e.g., research, talking to people, hands-on experiences, none yet). Include an option that acknowledges they have not started if relevant.",
];

const FALLBACK_QUESTIONS: Array<{
  questionId: string;
  question: string;
  options: OnboardingOption[];
  freeTextPrompt?: string;
}> = [
  {
    questionId: "q1",
    question: "Which best describes your current situation?",
    options: [
      { id: "g1-lost", title: "I’m not sure where to start yet", description: "I haven’t really thought about careers before now." },
      { id: "g2-exploring", title: "I’m exploring a few ideas", description: "I’m gathering inspiration but nothing is set." },
      { id: "g3-narrowing", title: "I’ve got one or two front-runners", description: "I’m testing how they fit me." },
      { id: "g4-locked", title: "I already feel quite focused", description: "I have a clear career in mind and I’m pursuing it." },
    ],
    freeTextPrompt: "Anything else about where you’re at right now?",
  },
  {
    questionId: "q2",
    question: "Do you have a specific career or field in mind at this point?",
    options: [
      { id: "idea-none", title: "Not really", description: "I’m open and looking for inspiration." },
      { id: "idea-broad", title: "A few broad fields", description: "I have some themes, but nothing precise." },
      { id: "idea-shortlist", title: "One or two serious options", description: "I’m deciding between a small shortlist." },
      { id: "idea-clear", title: "Yes, a clear direction", description: "I know the role or pathway I’m aiming for." },
    ],
    freeTextPrompt: "Share any areas or roles you’ve considered.",
  },
  {
    questionId: "q3",
    question: "How are you feeling about your current stage?",
    options: [
      { id: "feeling-stressed", title: "Quite anxious", description: "Not knowing yet stresses me out." },
      { id: "feeling-curious", title: "Curious but calm", description: "I’m okay exploring for now." },
      { id: "feeling-testing", title: "Testing my fit", description: "I’m checking if my ideas truly suit me." },
      { id: "feeling-confident", title: "Confident and happy", description: "I feel good about the path I’m on." },
    ],
    freeTextPrompt: "What’s behind that feeling?",
  },
  {
    questionId: "q4",
    question: "Which activities sound most like you?",
    options: [
      { id: "activity-creative", title: "Creative projects", description: "Designing, making, or expressing ideas." },
      { id: "activity-people", title: "Helping people", description: "Supporting, teaching, or caring for others." },
      { id: "activity-analytical", title: "Analytical work", description: "Solving puzzles, data, or technical systems." },
      { id: "activity-action", title: "Hands-on action", description: "Building, experimenting, or being on the move." },
    ],
    freeTextPrompt: "Any specific activities you’d add?",
  },
  {
    questionId: "q5",
    question: "Which of the following have you done so far to explore careers?",
    options: [
      { id: "action-none", title: "Not yet", description: "I’m just getting started." },
      { id: "action-research", title: "Online research", description: "I’ve read articles, watched videos, or taken quizzes." },
      { id: "action-convos", title: "Talked to people", description: "I’ve spoken to friends, family, or mentors." },
      { id: "action-experience", title: "Tried experiences", description: "I’ve done volunteering, shadowing, or work experience." },
    ],
    freeTextPrompt: "What’s one thing you’d like to try next?",
  },
];

function isReadiness(value: unknown): value is Readiness {
  return value === "G1" || value === "G2" || value === "G3" || value === "G4";
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as OnboardingRequestBody;
  const rounds = Array.isArray(body.rounds) ? body.rounds : [];
  const { profile } = body;
  const roundNumber = Math.min(rounds.length + 1, MULTIPLE_CHOICE_ROUNDS);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = FALLBACK_QUESTIONS[Math.min(rounds.length, FALLBACK_QUESTIONS.length - 1)];
    const fallbackReadiness: Readiness = rounds.find((round) => round.selectedOptionId.startsWith("g3") || round.selectedOptionId.startsWith("idea-clear"))
      ? "G3"
      : rounds.find((round) => round.selectedOptionId.startsWith("g4"))
      ? "G4"
      : "G2";

    return NextResponse.json({
      readiness: fallbackReadiness,
      questionId: fallback.questionId,
      question: fallback.question,
      options: fallback.options,
      freeTextPrompt: fallback.freeTextPrompt,
      rationale: "dev_fallback_no_api_key",
      revealDraftCards: rounds.length >= 2,
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

  const stageGuidance = ROUND_GUIDANCE[Math.min(roundNumber - 1, ROUND_GUIDANCE.length - 1)];

const system = `${basePrompt ? `${basePrompt}\n\n` : ""}You are shaping the next message in a five-round warm-up for a career exploration chat. Keep it casual and peer-level.

Return strictly valid JSON with keys:
- readiness: one of G1, G2, G3, G4.
- questionId: short kebab-case identifier (e.g. "q3-confidence").
- question: the next question or nudge (<= 110 characters, UK English, conversational).
- options: array of exactly 4 objects { id (kebab-case), title (first-person or affirmative statement), description (<= 110 characters, optional) }.
- freeTextPrompt: optional short (<= 80 characters) invitation to add detail after choosing; omit or set null if unneeded.
- rationale: short note for internal logging.
- revealDraftCards: boolean flag for UI.
- insights: array of objects { kind (interest|strength|constraint|goal|frustration|hope|boundary|highlight), value, confidence optional (low|medium|high), evidence optional } capturing NEW insights from the latest answers. Keep the language exactly as the user phrases it where possible.
- summary: optional short recap (<= 2 sentences) in a coaching tone.

Context:
- Total rounds: ${MULTIPLE_CHOICE_ROUNDS}. You are preparing round ${roundNumber}.
- Stage guidance: ${stageGuidance}
- Existing insights (do not repeat): ${existingSummary}
- Previous rounds (JSON): ${JSON.stringify(rounds)}

Rules:
- Always provide exactly four distinct options with meaningful differences.
- Tailor wording using what the user has already shared.
- Map each option to one readiness group internally; ensure at least one option aligns with the user's likely readiness and one that nudges them forward.
- Keep language supportive, youth-friendly, and UK English. Avoid corporate phrasing.
- If you infer a new insight from a previous freeText answer or selection, include it in insights with concise evidence.
- Favour precise verbs and nouns; avoid corporate jargon.`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: JSON.stringify({ profile, rounds, roundNumber }) },
  ];

  if (process.env.NODE_ENV !== "production") {
    console.info("[onboarding] stage guidance", stageGuidance);
    console.info("[onboarding] rounds count", rounds.length, "existing insights", existingInsights.length);
  }

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: OnboardingModelResponse;
  try {
    parsed = JSON.parse(content) as OnboardingModelResponse;
  } catch {
    parsed = {
      readiness: null,
      questionId: `q${roundNumber}`,
      question: "What matters most to you at work?",
      options: FALLBACK_QUESTIONS[Math.min(roundNumber - 1, FALLBACK_QUESTIONS.length - 1)].options,
      freeTextPrompt: "Anything you want to add?",
      rationale: "fallback_parse_error",
      revealDraftCards: false,
      insights: [],
    };
  }

  const readiness: Readiness = isReadiness(parsed.readiness) ? parsed.readiness : "G2";

  return NextResponse.json({
    readiness,
    questionId: parsed.questionId || `q${roundNumber}`,
    question: parsed.question,
    options: Array.isArray(parsed.options) && parsed.options.length === 4 ? parsed.options : FALLBACK_QUESTIONS[Math.min(roundNumber - 1, FALLBACK_QUESTIONS.length - 1)].options,
    freeTextPrompt: typeof parsed.freeTextPrompt === "string" ? parsed.freeTextPrompt : null,
    rationale: parsed.rationale,
    revealDraftCards: Boolean(parsed.revealDraftCards),
    insights: Array.isArray(parsed.insights) ? parsed.insights : [],
    summary: parsed.summary,
  });
}
