import type { InsightKind, ConversationTurn } from "@/components/session-provider";

export type ConversationPhase =
	| "warmup"
	| "story-mining"
	| "pattern-mapping"
	| "option-seeding"
	| "commitment";

export type EngagementStyle = "leaning-in" | "hesitant" | "blocked" | "seeking-options";
export type EnergyLevel = "low" | "medium" | "high";
export type ReadinessBias = "exploring" | "seeking-options" | "deciding";

export interface ConversationRubric {
	engagementStyle: EngagementStyle;
	contextDepth: 0 | 1 | 2 | 3;
	energyLevel: EnergyLevel;
	readinessBias: ReadinessBias;
	explicitIdeasRequest: boolean;
	lastUpdatedAt: number;
}

export interface InsightSnapshot {
	kind: InsightKind;
	value: string;
}

export interface PhaseContext {
	currentPhase: ConversationPhase;
	turns: ConversationTurn[];
	insights: InsightSnapshot[];
	suggestionCount: number;
	voteCount: number;
	rubric?: ConversationRubric | null;
}

export interface PhaseDecision {
	nextPhase: ConversationPhase;
	rationale: string[];
	shouldSeedTeaserCard: boolean;
}

const REQUIRED_BASE_KINDS: InsightKind[] = ["interest", "strength"];
const ASPIRATION_KINDS: InsightKind[] = ["hope", "goal", "highlight"];
const CONSTRAINT_KINDS: InsightKind[] = ["constraint", "frustration", "boundary"];

const MIN_CONTEXT_DEPTH_FOR_PATTERN = 2;
const MIN_CONTEXT_DEPTH_FOR_OPTIONS = 2;

function hasInsightOfKind(insights: InsightSnapshot[], targetKinds: InsightKind[]): boolean {
	return insights.some((insight) => targetKinds.includes(insight.kind));
}

function countInsightKinds(insights: InsightSnapshot[]): number {
	const unique = new Set(insights.map((item) => item.kind));
	return unique.size;
}

export function recommendConversationPhase(context: PhaseContext): PhaseDecision {
	const { currentPhase, turns, insights, rubric, suggestionCount, voteCount } = context;

	const rationale: string[] = [];
	const insightKindCount = countInsightKinds(insights);

	const baseInsightsSatisfied = REQUIRED_BASE_KINDS.every((kind) =>
		hasInsightOfKind(insights, [kind])
	);
	const hasAspirations = hasInsightOfKind(insights, ASPIRATION_KINDS);
	const hasConstraints = hasInsightOfKind(insights, CONSTRAINT_KINDS);
	const engagementStyle = rubric?.engagementStyle ?? "blocked";
	const contextDepthScore = rubric?.contextDepth ?? 0;
	const readinessBias = rubric?.readinessBias ?? "exploring";
	const explicitIdeasRequest = rubric?.explicitIdeasRequest ?? false;

	let nextPhase: ConversationPhase = currentPhase;
	let shouldSeedTeaserCard = false;

	if (currentPhase === "warmup") {
		if (turns.some((turn) => turn.role === "user")) {
			nextPhase = "story-mining";
			rationale.push("User has started responding; move into story mining.");
		} else {
			rationale.push("Awaiting initial user response; stay in warmup.");
		}
	} else if (currentPhase === "story-mining") {
		const readyForPatterns =
			baseInsightsSatisfied &&
			hasAspirations &&
			(hasConstraints || contextDepthScore >= MIN_CONTEXT_DEPTH_FOR_PATTERN);

		if (readyForPatterns) {
			nextPhase = "pattern-mapping";
			rationale.push("Insights now cover interests, strengths, and aspirations; move to pattern mapping.");
		} else if ((engagementStyle === "blocked" || engagementStyle === "hesitant") && turns.length >= 6) {
			shouldSeedTeaserCard = true;
			rationale.push("Rubric shows low engagement; seed teaser card to spark reaction.");
		} else {
			rationale.push("Stay in story mining until aspirations (and ideally constraints) are surfaced.");
		}
	} else if (currentPhase === "pattern-mapping") {
		const deepContext =
			baseInsightsSatisfied &&
			hasAspirations &&
			hasConstraints &&
			(contextDepthScore >= MIN_CONTEXT_DEPTH_FOR_OPTIONS || insightKindCount >= 5);
		const hasRecentVotes = voteCount > 0;

		if (explicitIdeasRequest || readinessBias === "seeking-options") {
			nextPhase = "option-seeding";
			rationale.push("Rubric signals they're seeking options; progress to option seeding.");
		} else if (deepContext && (engagementStyle === "leaning-in" || hasRecentVotes)) {
			nextPhase = "option-seeding";
			rationale.push("Insight coverage and rubric depth high; ready to introduce cards.");
		} else if ((engagementStyle === "blocked" || engagementStyle === "hesitant") && suggestionCount === 0 && turns.length >= 8) {
			shouldSeedTeaserCard = true;
			rationale.push("Stalled despite coaching; try a teaser card to gauge reactions.");
		} else {
			rationale.push("Continue mapping patterns to strengthen aspirations and constraints.");
		}
	} else if (currentPhase === "option-seeding") {
		if (voteCount > 0 && readinessBias === "deciding") {
			nextPhase = "commitment";
			rationale.push("Votes on cards and readiness to decide; shift to commitment.");
		} else if ((engagementStyle === "blocked" || engagementStyle === "hesitant") && suggestionCount === 0 && turns.length >= 10) {
			shouldSeedTeaserCard = true;
			rationale.push("Option seeding stalled without cards; seed teaser to regain momentum.");
		} else {
			rationale.push("Stay in option seeding to gather reactions and refine.");
		}
	} else if (currentPhase === "commitment") {
		if ((engagementStyle === "blocked" || engagementStyle === "hesitant") && voteCount === 0) {
			nextPhase = "pattern-mapping";
			rationale.push("Commitment stalled; revert to pattern mapping for more context.");
		} else {
			rationale.push("Remain in commitment to coach next steps.");
		}
	}

	return {
		nextPhase,
		rationale,
		shouldSeedTeaserCard,
	};
}

export function inferRubricFromTranscript(turns: ConversationTurn[]): ConversationRubric {
	const recent = turns.slice(-4);
	const userTurns = recent.filter((turn) => turn.role === "user");
	const assistantTurns = recent.filter((turn) => turn.role === "assistant");

	const userTextLength = userTurns.reduce((total, turn) => total + turn.text.trim().length, 0);
	const assistantTextLength = assistantTurns.reduce((total, turn) => total + turn.text.trim().length, 0);

	const engagementStyle: EngagementStyle =
		userTurns.length === 0
			? "blocked"
			: userTextLength > 280
			? "leaning-in"
			: userTextLength > 120
			? "hesitant"
			: "blocked";

	const energyLevel: EnergyLevel =
		userTextLength > 320 ? "high" : userTextLength > 160 ? "medium" : "low";

	const containsIdeaRequest = userTurns.some((turn) =>
		/\b(options?\b|\bideas?\b|\bcareers?\b|\bsuggestions?\b)/i.test(turn.text)
	);

	const readinessBias: ReadinessBias = containsIdeaRequest
		? "seeking-options"
		: engagementStyle === "leaning-in" && assistantTextLength > 0
		? "deciding"
		: "exploring";

	const contextDepth: 0 | 1 | 2 | 3 =
		userTextLength > 400 ? 3 : userTextLength > 220 ? 2 : userTextLength > 120 ? 1 : 0;

	return {
		engagementStyle,
		contextDepth,
		energyLevel,
		readinessBias,
		explicitIdeasRequest: containsIdeaRequest,
		lastUpdatedAt: Date.now(),
	};
}
