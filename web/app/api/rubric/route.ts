import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type {
	ConversationRubric,
	InsightCoverageSnapshot,
	CardReadinessSnapshot,
	ConversationFocus,
	CardReadinessStatus,
} from "@/lib/conversation-phases";
import type { RubricEvaluationRequestBody, RubricEvaluationResponseBody } from "@/lib/conversation-rubric";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const MAX_TURNS = 12;
const RUBRIC_SCHEMA = {
	name: "rubric_response",
	schema: {
		type: "object",
		additionalProperties: false,
		required: ["rubric", "reasoning"],
		properties: {
			rubric: {
				type: "object",
				additionalProperties: false,
				required: [
					"engagement_style",
					"context_depth",
					"energy_level",
					"readiness_bias",
					"explicit_ideas_request",
					"insight_coverage",
					"insight_gaps",
					"card_readiness",
					"recommended_focus",
				],
				properties: {
					engagement_style: {
						type: "string",
						enum: ["leaning-in", "hesitant", "blocked", "seeking-options"],
					},
					context_depth: {
						type: "integer",
						enum: [0, 1, 2, 3],
					},
					energy_level: {
						type: "string",
						enum: ["low", "medium", "high"],
					},
					readiness_bias: {
						type: "string",
						enum: ["exploring", "seeking-options", "deciding"],
					},
					explicit_ideas_request: {
						type: "boolean",
					},
					insight_coverage: {
						type: "object",
						additionalProperties: false,
						required: ["interests", "aptitudes", "goals", "constraints"],
						properties: {
							interests: { type: "boolean" },
							aptitudes: { type: "boolean" },
							goals: { type: "boolean" },
							constraints: { type: "boolean" },
						},
					},
					insight_gaps: {
						type: "array",
						items: {
							type: "string",
							enum: ["interests", "aptitudes", "goals", "constraints"],
						},
					},
					card_readiness: {
						type: "object",
						additionalProperties: false,
						required: ["status", "missing_signals"],
						properties: {
							status: {
								type: "string",
								enum: ["blocked", "context-light", "ready"],
							},
							reason: {
								type: "string",
							},
							missing_signals: {
								type: "array",
								items: {
									type: "string",
									enum: ["interests", "aptitudes", "goals", "constraints"],
								},
							},
						},
					},
					recommended_focus: {
						type: "string",
						enum: ["rapport", "story", "pattern", "ideation", "decision"],
					},
				},
			},
			reasoning: {
				type: "array",
				items: {
					type: "string",
				},
			},
		},
	},
};

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
		"- insight_coverage: object with boolean keys interests, aptitudes, goals, constraints indicating whether the user has supplied concrete evidence for each.",
		"- insight_gaps: array listing which of {\"interests\",\"aptitudes\",\"goals\",\"constraints\"} still lack evidence and need follow-up.",
		"- card_readiness: object with fields status (blocked, context-light, or ready), reason (short string), and missing_signals (array mirroring insight_gaps). Mark status as ready ONLY when context_depth ≥ 2, interests is true, at least one of aptitudes/goals is true, and the user either requested ideas or showed clear intent to act.",
		"- recommended_focus: rapport, story, pattern, ideation, or decision — the next coaching move you recommend.",
		"Always favour accuracy over optimism: only mark coverage true when the user states it explicitly. If aspirations or constraints are missing, keep context_depth low and set card_readiness to blocked or context-light.",
		"Return strictly formatted JSON with keys { rubric, reasoning } where reasoning is an array of short bullet strings explaining your judgement.",
		"Do not include markdown, code fences, apologies, or additional text.",
	].join(" ");
}

function coerceInsightCoverage(value: unknown): InsightCoverageSnapshot {
	const defaults: InsightCoverageSnapshot = {
		interests: false,
		aptitudes: false,
		goals: false,
		constraints: false,
	};
	if (!value || typeof value !== "object") {
		return defaults;
	}
	const incoming = value as Partial<Record<keyof InsightCoverageSnapshot, unknown>>;
	return {
		interests: Boolean(incoming.interests),
		aptitudes: Boolean(incoming.aptitudes),
		goals: Boolean(incoming.goals),
		constraints: Boolean(incoming.constraints),
	};
}

function coerceInsightGaps(value: unknown): Array<keyof InsightCoverageSnapshot> {
	if (!Array.isArray(value)) {
		return [];
	}
	const allowed: Array<keyof InsightCoverageSnapshot> = ["interests", "aptitudes", "goals", "constraints"];
	return value
		.map((item) => (typeof item === "string" ? item.toLowerCase() : ""))
		.filter((item): item is keyof InsightCoverageSnapshot => allowed.includes(item as keyof InsightCoverageSnapshot));
}

function coerceCardReadiness(value: unknown): CardReadinessSnapshot {
	const allowedStatus: CardReadinessStatus[] = ["blocked", "context-light", "ready"];
	if (!value || typeof value !== "object") {
		return { status: "blocked", missingSignals: ["interests", "aptitudes", "goals", "constraints"] };
	}
	const incoming = value as Partial<CardReadinessSnapshot> &
		Partial<{ status: unknown; missingSignals: unknown; missing_signals: unknown; reason: unknown }>;
	const statusCandidate = typeof incoming.status === "string" ? (incoming.status as CardReadinessStatus) : undefined;
	const status = allowedStatus.includes(statusCandidate ?? "blocked") ? (statusCandidate as CardReadinessStatus) : "blocked";
	const rawMissing =
		incoming.missingSignals !== undefined
			? incoming.missingSignals
			: (incoming as { missing_signals?: unknown }).missing_signals;
	let missingSignals = coerceInsightGaps(rawMissing);
	if (missingSignals.length === 0 && status !== "ready") {
		missingSignals = ["interests", "aptitudes", "goals", "constraints"];
	}
	const reason = typeof incoming.reason === "string" && incoming.reason.trim().length > 0 ? incoming.reason.trim() : undefined;
	return {
		status,
		reason,
		missingSignals,
	};
}

function coerceConversationFocus(value: unknown): ConversationFocus {
	const allowed: ConversationFocus[] = ["rapport", "story", "pattern", "ideation", "decision"];
	if (typeof value === "string" && allowed.includes(value as ConversationFocus)) {
		return value as ConversationFocus;
	}
	return "story";
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

	const insightCoverage = coerceInsightCoverage(data.insightCoverage ?? (data as never)["insight_coverage"]);
	const insightGaps = coerceInsightGaps(data.insightGaps ?? (data as never)["insight_gaps"]);
	const cardReadiness = coerceCardReadiness(data.cardReadiness ?? (data as never)["card_readiness"]);
	const recommendedFocus = coerceConversationFocus(data.recommendedFocus ?? (data as never)["recommended_focus"]);

	return {
		engagementStyle,
		contextDepth,
		energyLevel,
		readinessBias,
		explicitIdeasRequest,
		insightCoverage,
		insightGaps,
		cardReadiness,
		recommendedFocus,
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
		insight_coverage: "insightCoverage",
		insight_gaps: "insightGaps",
		card_readiness: "cardReadiness",
		recommended_focus: "recommendedFocus",
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
			key === "explicitIdeasRequest" ||
			key === "insightCoverage" ||
			key === "insightGaps" ||
			key === "cardReadiness" ||
			key === "recommendedFocus"
		) {
			result[key] = value as never;
		}
	}

	return result;
}

export async function POST(request: NextRequest) {
	const apiKey = process.env.OPENAI_API_KEY;

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

	if (!apiKey) {
		console.error("[rubric] Missing OPENAI_API_KEY");
		return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
	}

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
			max_tokens: 400,
			response_format: {
				type: "json_schema",
				json_schema: RUBRIC_SCHEMA,
			},
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

		let parsed: RubricEvaluationResponseBody | { rubric?: unknown; reasoning?: unknown };
		try {
			parsed = JSON.parse(content) as RubricEvaluationResponseBody | { rubric?: unknown; reasoning?: unknown };
		} catch (error) {
			console.error("[rubric] Failed to parse JSON from completion", {
				contentPreview: content.slice(0, 200),
				error,
			});
			throw error instanceof Error ? error : new Error("Malformed rubric JSON");
		}
		if (typeof parsed !== "object" || !("rubric" in parsed)) {
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
		const message = error instanceof Error ? error.message : String(error);
		console.error("[rubric] Evaluation failed", message);
		return NextResponse.json({ error: "Failed to evaluate rubric", details: message }, { status: 500 });
	}
}
