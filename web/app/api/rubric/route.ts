import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ConversationRubric } from "@/lib/conversation-phases";
import type { RubricEvaluationRequestBody, RubricEvaluationResponseBody } from "@/lib/conversation-rubric";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const MAX_TURNS = 12;

function buildSystemPrompt() {
	return [
		"You are evaluating a coaching-style conversation between a peer guide and a user exploring careers.",
		"Analyse the transcript and produce a rubric with the following fields:",
		"- engagement_style: leaning-in, hesitant, blocked, or seeking-options (based on willingness to share detail or explicitly request ideas).",
		"- context_depth: integer 0-3 capturing how much concrete, first-person evidence we have about influences, aspirations, aptitudes, and constraints:",
		"  - 0: only surface pleasantries or single-word replies.",
		"  - 1: basic interests mentioned without motivations or constraints.",
		"  - 2: includes at least one driver (hope/goal) OR constraint with some specific detail.",
		"  - 3: rich story covering influences, aspirations, aptitudes/strengths, and boundaries with concrete examples.",
		"- energy_level: low, medium, or high based on the user's language.",
		"- readiness_bias: exploring, seeking-options, or deciding (prefer seeking-options/deciding only when the user clearly shifts towards asking for ideas or next steps).",
		"- explicit_ideas_request: true only if the user directly asks for ideas, options, or suggestions.",
		"Always favour accuracy over optimism: if aspirations or constraints are missing, keep context_depth low.",
		"Return strictly formatted JSON with keys { rubric, reasoning } where reasoning is an array of short bullet strings explaining your judgement.",
		"Do not include markdown, code fences, apologies, or additional text.",
	].join(" ");
}

function validateRubricPayload(payload: unknown): ConversationRubric {
	if (!payload || typeof payload !== "object") {
		throw new Error("Rubric payload missing");
	}

	const data = payload as Partial<ConversationRubric & { [key: string]: unknown }>;

	const engagementStyle = data.engagementStyle;
	if (engagementStyle !== "leaning-in" && engagementStyle !== "hesitant" && engagementStyle !== "blocked" && engagementStyle !== "seeking-options") {
		throw new Error(`Invalid engagementStyle: ${engagementStyle}`);
	}

	const contextDepth = data.contextDepth;
	if (contextDepth !== 0 && contextDepth !== 1 && contextDepth !== 2 && contextDepth !== 3) {
		throw new Error(`Invalid contextDepth: ${contextDepth}`);
	}

	const energyLevel = data.energyLevel;
	if (energyLevel !== "low" && energyLevel !== "medium" && energyLevel !== "high") {
		throw new Error(`Invalid energyLevel: ${energyLevel}`);
	}

	const readinessBias = data.readinessBias;
	if (readinessBias !== "exploring" && readinessBias !== "seeking-options" && readinessBias !== "deciding") {
		throw new Error(`Invalid readinessBias: ${readinessBias}`);
	}

	const explicitIdeasRequest = data.explicitIdeasRequest;
	if (typeof explicitIdeasRequest !== "boolean") {
		throw new Error(`Invalid explicitIdeasRequest: ${explicitIdeasRequest}`);
	}

	return {
		engagementStyle,
		contextDepth,
		energyLevel,
		readinessBias,
		explicitIdeasRequest,
		lastUpdatedAt: Date.now(),
	};
}

function normaliseRubricKeys(raw: unknown): Partial<ConversationRubric> {
	if (!raw || typeof raw !== "object") {
		return {};
	}

	const source = raw as Record<string, unknown>;
	const map: Record<string, keyof ConversationRubric> = {
		engagement_style: "engagementStyle",
		context_depth: "contextDepth",
		energy_level: "energyLevel",
		readiness_bias: "readinessBias",
		explicit_ideas_request: "explicitIdeasRequest",
	};

	const result: Partial<ConversationRubric> = {};
	for (const [key, value] of Object.entries(source)) {
		if (key in map) {
			result[map[key]] = value as never;
		} else if (key in result || key === "lastUpdatedAt") {
			continue;
		} else if (
			key === "engagementStyle" ||
			key === "contextDepth" ||
			key === "energyLevel" ||
			key === "readinessBias" ||
			key === "explicitIdeasRequest"
		) {
			result[key] = value as never;
		}
	}

	return result;
}

export async function POST(request: NextRequest) {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error("[rubric] Missing OPENAI_API_KEY");
		return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
	}

	let body: RubricEvaluationRequestBody;
	try {
		body = (await request.json()) as RubricEvaluationRequestBody;
	} catch (error) {
		console.error("[rubric] Invalid JSON body", error);
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!Array.isArray(body.turns) || body.turns.length === 0) {
		return NextResponse.json({ error: "turns array required" }, { status: 400 });
	}

	const trimmedTurns = body.turns.slice(-MAX_TURNS).map((turn) => ({
		role: turn.role,
		text: typeof turn.text === "string" ? turn.text.trim() : "",
	}));

	const payload = {
		turns: trimmedTurns,
		insights: Array.isArray(body.insights) ? body.insights : [],
		suggestions: Array.isArray(body.suggestions) ? body.suggestions : [],
		votes: body.votes ?? {},
	};

	console.info("[rubric] Evaluating conversation", {
		turnCount: payload.turns.length,
		insightCount: payload.insights.length,
		suggestionCount: payload.suggestions.length,
	});

	const openai = new OpenAI({ apiKey });

	try {
	const completion = await openai.chat.completions.create({
			model: MODEL,
			temperature: 0,
			max_tokens: 220,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: buildSystemPrompt() },
				{
					role: "user",
					content: JSON.stringify(payload),
				},
			],
		});

		const content = completion.choices[0]?.message?.content;
		if (!content) {
			throw new Error("Empty rubric response");
		}

		const parsed = JSON.parse(content) as RubricEvaluationResponseBody | { rubric?: unknown; reasoning?: unknown };
		if (!parsed || typeof parsed !== "object" || !("rubric" in parsed)) {
			console.error("[rubric] Malformed response payload", { content });
			throw new Error("Malformed rubric JSON");
		}

		let rubric: ConversationRubric;
		try {
			const normalised = normaliseRubricKeys((parsed as RubricEvaluationResponseBody).rubric);
			rubric = validateRubricPayload(normalised);
		} catch (validationError) {
			console.error("[rubric] Invalid rubric structure", {
				rubric: (parsed as RubricEvaluationResponseBody).rubric,
				normalised: normaliseRubricKeys((parsed as RubricEvaluationResponseBody).rubric),
				raw: content,
				error: validationError,
			});
			throw validationError;
		}

		const reasoning = Array.isArray(parsed.reasoning)
			? (parsed.reasoning as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
			: undefined;

		console.info("[rubric] Evaluation complete", {
			engagementStyle: rubric.engagementStyle,
			contextDepth: rubric.contextDepth,
			readinessBias: rubric.readinessBias,
			explicitIdeasRequest: rubric.explicitIdeasRequest,
		});

		return NextResponse.json({
			rubric,
			reasoning,
		});
	} catch (error) {
		console.error("[rubric] Evaluation failed", error);
		return NextResponse.json({ error: "Failed to evaluate rubric" }, { status: 500 });
	}
}
