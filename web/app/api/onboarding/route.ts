import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

type Readiness = "G1" | "G2" | "G3" | "G4";

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

interface OnboardingModelResponse {
	readiness?: Readiness | null;
	question?: string;
	rationale?: string;
	revealDraftCards?: boolean;
}

export async function POST(req: NextRequest) {
	const body = (await req.json()) as OnboardingRequestBody;
	const { turns, profile } = body;

	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		// Dev fallback to enable local validation without an API key
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
		});
	}

	const openai = new OpenAI({ apiKey });

	const system = `You are an expert careers guide helping a user begin a career exploration journey.
Classify the user's current readiness (G1–G4) based on their answers so far:
- G1: Identity Diffusion (unsure, anxious, not yet exploring)
- G2: Exploring and Undecided (curious, trying options)
- G3: Tentatively Decided (leaning toward a choice, seeking validation)
- G4: Focused and Confident (clear preference, taking action)

Goals:
1) Ask the next best question in a natural, empathetic tone.
2) Keep it concise (<= 1 short sentence question), UK English.
3) Progressively disclose value: by Q3–Q4, you may hint at possible career themes to validate interest, but do not overfit.
4) Never parrot long fragments of the user's text.

Return strict JSON with keys: readiness (G1|G2|G3|G4), question (string), rationale (short), revealDraftCards (boolean).`;

	const messages = [
		{ role: "system" as const, content: system },
		{ role: "user" as const, content: JSON.stringify({ profile, turns }) },
	];

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
		};
	}

	const readiness: Readiness = isReadiness(parsed.readiness) ? parsed.readiness : "G2";

	return NextResponse.json({
		readiness,
		question: parsed.question as string,
		rationale: parsed.rationale as string,
		revealDraftCards: Boolean(parsed.revealDraftCards),
	});
}
