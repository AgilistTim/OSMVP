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

export type CardReadinessStatus = "blocked" | "context-light" | "ready";

export interface InsightCoverageSnapshot {
	interests: boolean;
	aptitudes: boolean;
	goals: boolean;
	constraints: boolean;
}

export interface CardReadinessSnapshot {
	status: CardReadinessStatus;
	reason?: string;
	missingSignals?: Array<keyof InsightCoverageSnapshot>;
}

export type ConversationFocus = "rapport" | "story" | "pattern" | "ideation" | "decision";

export interface ConversationRubric {
	engagementStyle: EngagementStyle;
	contextDepth: 0 | 1 | 2 | 3;
	energyLevel: EnergyLevel;
	readinessBias: ReadinessBias;
	explicitIdeasRequest: boolean;
	insightCoverage: InsightCoverageSnapshot;
	insightGaps: Array<keyof InsightCoverageSnapshot>;
	cardReadiness: CardReadinessSnapshot;
	recommendedFocus: ConversationFocus;
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

	const defaultCoverage: InsightCoverageSnapshot = {
		interests: contextDepth >= 1,
		aptitudes: contextDepth >= 2,
		goals: contextDepth >= 2,
		constraints: contextDepth >= 2,
	};

	const missingSignals = (Object.keys(defaultCoverage) as Array<keyof InsightCoverageSnapshot>).filter(
		(key) => !defaultCoverage[key]
	);

	const cardReadiness: CardReadinessSnapshot =
		contextDepth >= 2 && (containsIdeaRequest || engagementStyle === "leaning-in")
			? { status: "ready", missingSignals: [] }
			: contextDepth >= 1
			? { status: "context-light", missingSignals }
			: { status: "blocked", missingSignals };

	const recommendedFocus: ConversationFocus =
		cardReadiness.status === "ready"
			? "ideation"
			: contextDepth >= 2
			? "pattern"
			: contextDepth >= 1
			? "story"
			: "rapport";

	return {
		engagementStyle,
		contextDepth,
		energyLevel,
		readinessBias,
		explicitIdeasRequest: containsIdeaRequest,
		insightCoverage: defaultCoverage,
		insightGaps: missingSignals,
		cardReadiness,
		recommendedFocus,
		lastUpdatedAt: Date.now(),
	};
}

// Compute rubric scores locally from transcript and insights, using the same static rubric
// dimensions as the server schema. This yields a stable, deterministic assessment that we
// can update on each final turn/insight/vote change without round-tripping to the LLM.
export function computeRubricScores({
    turns,
    insights,
    votes,
    suggestionCount,
    prevRubric,
}: {
    turns: ConversationTurn[];
    insights: InsightSnapshot[];
    votes: Record<string, 1 | 0 | -1 | undefined>;
    suggestionCount: number;
    prevRubric?: ConversationRubric | null;
}): ConversationRubric {
    // Start with transcript heuristics
    const base = inferRubricFromTranscript(turns);

    // Coverage from explicit insights
    const has = (kinds: InsightKind[]) => insights.some((i) => kinds.includes(i.kind));
    const coverage = {
        interests: has(["interest"]),
        aptitudes: has(["strength"]),
        goals: has(["goal", "hope", "highlight"]),
        constraints: has(["constraint", "frustration", "boundary"]),
    };
    const gaps = (Object.keys(coverage) as Array<keyof typeof coverage>).filter((k) => !coverage[k]);

    // Refine context depth using coverage richness
    let contextDepth: 0 | 1 | 2 | 3 = base.contextDepth;
    const uniqueKinds = new Set(insights.map((i) => i.kind)).size;
    if (uniqueKinds >= 2 && contextDepth < 1) contextDepth = 1;
    if (coverage.interests && (coverage.aptitudes || coverage.goals) && contextDepth < 2) contextDepth = 2;
    if (coverage.interests && coverage.aptitudes && coverage.goals && coverage.constraints && uniqueKinds >= 5) {
        contextDepth = 3;
    }

    // Readiness bias and explicit request from base; votes can nudge toward deciding
    const voteCount = Object.values(votes).filter((v) => v === 1 || v === -1).length;
    let readinessBias = base.readinessBias;
    if (voteCount > 0 && base.readinessBias === "exploring") {
        readinessBias = "seeking-options";
    }

    const currentPhaseFromPrev: ConversationPhase = prevRubric
        ? prevRubric.recommendedFocus === "ideation"
            ? "option-seeding"
            : prevRubric.recommendedFocus === "decision"
            ? "commitment"
            : prevRubric.recommendedFocus === "pattern"
            ? "pattern-mapping"
            : prevRubric.recommendedFocus === "rapport"
            ? "warmup"
            : "story-mining"
        : "warmup";

    // Provisional card readiness to inform phase decision
    let provisionalCardReadiness: CardReadinessSnapshot;
    if (contextDepth >= 1) {
        const status: CardReadinessStatus = contextDepth >= 2
            ? (coverage.interests ? "context-light" : "blocked")
            : "context-light";
        provisionalCardReadiness = {
            status,
            reason: undefined,
            missingSignals: gaps as Array<keyof typeof coverage>,
        };
    } else {
        provisionalCardReadiness = {
            status: "blocked",
            reason: undefined,
            missingSignals: gaps as Array<keyof typeof coverage>,
        };
    }

    const provisionalPhaseDecision = recommendConversationPhase({
        currentPhase: currentPhaseFromPrev,
        turns,
        insights,
        suggestionCount,
        voteCount,
        rubric: {
            ...base,
            contextDepth,
            insightCoverage: coverage,
            insightGaps: gaps,
            readinessBias,
            cardReadiness: provisionalCardReadiness,
        },
    });

    if (provisionalPhaseDecision.nextPhase === "option-seeding" && readinessBias === "exploring") {
        readinessBias = "seeking-options";
    }

    const intent =
        base.explicitIdeasRequest ||
        readinessBias === "seeking-options" ||
        provisionalPhaseDecision.nextPhase === "option-seeding";

    // Card readiness: ready only with sufficient depth + signals + intent
    let cardStatus: "blocked" | "context-light" | "ready" = "blocked";
    let cardReason: string | undefined;
    if (contextDepth >= 2 && coverage.interests && (coverage.aptitudes || coverage.goals) && intent) {
        cardStatus = "ready";
    } else if (contextDepth >= 1) {
        cardStatus = "context-light";
        cardReason = "Gather one of aptitudes/goals with a concrete example before ideas.";
    } else {
        cardStatus = "blocked";
        cardReason = "Surface interests first with specific examples.";
    }

    const cardReadiness = {
        status: cardStatus,
        reason: cardReason,
        missingSignals: cardStatus === "ready" ? [] : (gaps as Array<keyof typeof coverage>),
    };

    const phaseDecision = recommendConversationPhase({
        currentPhase: currentPhaseFromPrev,
        turns,
        insights,
        suggestionCount,
        voteCount,
        rubric: {
            ...base,
            contextDepth,
            insightCoverage: coverage,
            insightGaps: gaps,
            readinessBias,
            cardReadiness,
        },
    });
    const focusMap: Record<ConversationPhase, ConversationFocus> = {
        warmup: "rapport",
        "story-mining": "story",
        "pattern-mapping": "pattern",
        "option-seeding": "ideation",
        commitment: "decision",
    };

    return {
        engagementStyle: base.engagementStyle,
        contextDepth,
        energyLevel: base.energyLevel,
        readinessBias,
        explicitIdeasRequest: base.explicitIdeasRequest,
        insightCoverage: coverage,
        insightGaps: gaps,
        cardReadiness,
        recommendedFocus: focusMap[phaseDecision.nextPhase],
        lastUpdatedAt: Date.now(),
    };
}
