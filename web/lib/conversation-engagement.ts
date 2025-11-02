import type { ConversationTurn, InsightKind } from "@/components/session-provider";

export interface EngagementAnalysis {
	replyCount: number;
	alignedReplies: number;
	depthSignals: number;
	themeAdoptions: number;
	initiativeSignals: number;
	negativeSignals: number;
	engagementScore: number;
	salientTopics: string[];
}

const STOPWORDS = new Set(
	[
		"the",
		"a",
		"an",
		"and",
		"or",
		"of",
		"in",
		"to",
		"for",
		"on",
		"with",
		"that",
		"this",
		"is",
		"it",
		"as",
		"are",
		"was",
		"were",
		"be",
		"by",
		"i",
		"you",
		"we",
		"they",
		"he",
		"she",
		"him",
		"her",
		"them",
		"me",
		"my",
		"your",
		"our",
		"their",
		"at",
		"from",
		"but",
		"about",
	]
);

const NEGATIVE_PATTERNS = [
	/(i\s*(?:don't|do not)\s*know)/i,
	/nothing (?:much|really)/i,
	/it('s)? (?:all )?pointless/i,
	/no idea/i,
	/not sure/i,
];

const INITIATIVE_PATTERNS = [
	/what if/i,
	/maybe (we|i) could/i,
	/how about/i,
	/i wonder/i,
	/let'?s/i,
];

const MAX_SALIENT_TOPICS = 20;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function extractTopics(tokens: string[]): string[] {
	const topics: string[] = [];
	for (const token of tokens) {
		if (token.length >= 4) {
			topics.push(token);
		}
	}
	return Array.from(new Set(topics));
}

export function analyzeEngagement(turns: ConversationTurn[], windowSize = 12): EngagementAnalysis {
	const recent = turns.slice(-windowSize);
	let replyCount = 0;
	let alignedReplies = 0;
	let depthSignals = 0;
	let themeAdoptions = 0;
	let initiativeSignals = 0;
	let negativeSignals = 0;

	let pendingQuestionTokens: string[] = [];
	let lastAssistantTopics: string[] = [];
	const addressedTopics = new Set<string>();
	const seenUserTokens = new Set<string>();
	const salientTopics = new Set<string>();

recent.forEach((turn) => {
		if (turn.role === "assistant") {
			const tokens = tokenize(turn.text);
			const topics = extractTopics(tokens);
			if (topics.length > 0) {
				lastAssistantTopics = topics;
			}
			if (turn.text.includes("?")) {
				pendingQuestionTokens = topics.length > 0 ? topics : tokens;
			} else {
				pendingQuestionTokens = [];
			}
			return;
		}

		const tokens = tokenize(turn.text);
		if (tokens.length === 0) {
			pendingQuestionTokens = [];
			return;
		}

		replyCount += 1;
		tokens.forEach((token) => salientTopics.add(token));

		if (pendingQuestionTokens.length > 0) {
			const overlap = pendingQuestionTokens.filter((token) => tokens.includes(token));
			const ratio = overlap.length / pendingQuestionTokens.length;
			if (ratio >= 0.2) {
				alignedReplies += ratio >= 0.5 ? 1 : 0.5;
			}
		}

		if (lastAssistantTopics.length > 0) {
			const adoption = lastAssistantTopics.some((topic) => tokens.includes(topic));
			if (adoption) {
				const newTopics = lastAssistantTopics.filter((topic) => tokens.includes(topic) && !addressedTopics.has(topic));
				if (newTopics.length > 0) {
					themeAdoptions += 1;
					newTopics.forEach((topic) => addressedTopics.add(topic));
				}
			}
		}

		const newTokens = tokens.filter((token) => !seenUserTokens.has(token));
		if (newTokens.length >= 3) {
			depthSignals += 1;
		}
		newTokens.forEach((token) => seenUserTokens.add(token));

		if (turn.text.includes("?")) {
			initiativeSignals += 1;
		} else if (INITIATIVE_PATTERNS.some((pattern) => pattern.test(turn.text))) {
			initiativeSignals += 1;
		}

		if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(turn.text))) {
			negativeSignals += 1;
		}

		pendingQuestionTokens = [];
	});

	const replyScore = clamp(replyCount / 4, 0, 1);
	const alignmentScore = clamp(replyCount > 0 ? alignedReplies / replyCount : 0, 0, 1);
	const depthScore = clamp(depthSignals / 3, 0, 1);
	const themeScore = clamp(themeAdoptions / 3, 0, 1);
	const initiativeScore = clamp(initiativeSignals / 2, 0, 1);
	const negativePenalty = clamp(negativeSignals * 0.25, 0, 0.75);

	const engagementScore = clamp(
		replyScore * 0.2 +
		alignmentScore * 0.25 +
		depthScore * 0.2 +
		themeScore * 0.2 +
		initiativeScore * 0.15 -
		negativePenalty,
		0,
		1
	);

	return {
		replyCount,
		alignedReplies,
		depthSignals,
		themeAdoptions,
		initiativeSignals,
		negativeSignals,
		engagementScore,
		salientTopics: Array.from(salientTopics).slice(-MAX_SALIENT_TOPICS),
	};
}

export interface HeuristicInsightCandidate {
	kind: InsightKind;
	value: string;
}

const INSIGHT_PATTERNS: Array<{ kind: InsightKind; regex: RegExp }> = [
	{ kind: "goal", regex: /\b(?:i\s*(?:want|hope|plan|aim|would like|intend|looking) to)\s+([^.!?]+)/i },
	{ kind: "goal", regex: /\bmy (?:goal|dream|mission) is to\s+([^.!?]+)/i },
	{ kind: "strength", regex: /\b(?:i(?:'m| am)?\s*(?:good|great|strong) at|i\s*(?:can|could|manage to))\s+([^.!?]+)/i },
	{ kind: "strength", regex: /\b(?:i\s*(?:build|built|create|created|develop|developed|prototype|prototyped))\s+([^.!?]+)/i },
	{ kind: "interest", regex: /\b(?:i(?:'m| am)?\s*(?:into|interested in|passionate about|love|enjoy|fascinated by))\s+([^.!?]+)/i },
	{ kind: "constraint", regex: /\b(?:i\s*(?:don't want|wouldn't|won't|avoid|can't|refuse|prefer not) to)\s+([^.!?]+)/i },
	{ kind: "constraint", regex: /\bno interest in\s+([^.!?]+)/i },
	{ kind: "constraint", regex: /\bnot comfortable with\s+([^.!?]+)/i },
];

function normaliseSnippet(snippet: string, kind: InsightKind): string {
	let value = snippet.trim();
	value = value.replace(/^to\s+/i, "");
	value = value.replace(/^about\s+/i, "");
	value = value.replace(/\s+/g, " ");
	if (value.length > 160) {
		value = value.slice(0, 157) + "...";
	}
	if (kind === "constraint" && !/^avoid/i.test(value)) {
		value = `Avoid ${value}`;
	}
	if (kind === "strength" && /^[a-z]/.test(value)) {
		value = value.charAt(0).toUpperCase() + value.slice(1);
	}
	return value;
}

export function extractConversationInsights(turns: ConversationTurn[], windowSize = 16): HeuristicInsightCandidate[] {
	const candidates: HeuristicInsightCandidate[] = [];
	const seen = new Set<string>();
	const recentUserTurns = turns
		.filter((turn) => turn.role === "user")
		.slice(-windowSize);

	recentUserTurns.forEach((turn) => {
		const sentences = turn.text
			.split(/[.!?]/)
			.map((sentence) => sentence.trim())
			.filter((sentence) => sentence.length > 0);

		sentences.forEach((sentence) => {
			for (const pattern of INSIGHT_PATTERNS) {
				const match = sentence.match(pattern.regex);
				if (!match || !match[1]) continue;
				const rawValue = normaliseSnippet(match[1], pattern.kind);
				if (rawValue.length < 3) continue;
				const key = `${pattern.kind}:${rawValue.toLowerCase()}`;
				if (seen.has(key)) continue;
				seen.add(key);
				candidates.push({ kind: pattern.kind, value: rawValue });
				break;
			}
		});
	});

	return candidates.slice(0, 12);
}
