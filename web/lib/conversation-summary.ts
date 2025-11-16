import type { ConversationTurn, Profile, ProfileInsight } from "@/components/session-provider";
import { deriveThemes } from "@/lib/exploration";

const MAX_THEMES = 5;
const MAX_STRENGTHS = 3;
const LAST_TURN_LOOKBACK = 6;

export interface ConversationSummary {
	intro: string;
	themes: string[];
	strengths: string[];
	constraint: string | null;
	whyItMatters: string;
	closing: string;
	paragraphs: string[];
}

function normaliseValue(value: string | undefined | null): string | null {
	if (!value) return null;
	const trimmed = value.replace(/\s+/g, " ").trim();
	return trimmed.length > 0 ? trimmed : null;
}

type KeyFn = (value: string) => string;

function dedupe(values: string[], limit: number, keyFn: KeyFn = defaultKeyFn): string[] {
	const seen = new Set<string>();
	const ordered: string[] = [];
	for (const raw of values) {
		const value = normaliseValue(raw);
		if (!value) continue;
		const key = keyFn(value);
		if (seen.has(key)) continue;
		seen.add(key);
		ordered.push(value);
		if (ordered.length >= limit) break;
	}
	return ordered;
}

function defaultKeyFn(value: string): string {
	return value.toLowerCase();
}

export function tokenKey(value: string): string {
	const stopWords = new Set([
		"a",
		"an",
		"and",
		"the",
		"to",
		"for",
		"of",
		"into",
		"with",
		"about",
		"thing",
		"gig",
		"paid",
		"your",
		"my",
		"our",
		"their",
	]);
	const tokens = value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 2 && !stopWords.has(token));
	const unique = Array.from(new Set(tokens)).sort();
	return unique.join("-");
}

function shortenPhrase(value: string, wordLimit = 8): string {
	const normalised = normaliseValue(value);
	if (!normalised) return "";
	const words = normalised.split(/\s+/);
	if (words.length <= wordLimit) {
		return normalised;
	}
	return `${words.slice(0, wordLimit).join(" ")}…`;
}

function weightForInsight(insight: ProfileInsight, index: number): number {
	const confidenceBoost =
		insight.confidence === "high" ? 2 : insight.confidence === "medium" ? 1.3 : 1;
	const recencyBoost = 1 + Math.max(0, 5 - index) * 0.1;
	const sourceBoost = insight.source === "user" ? 1.25 : 1;
	return confidenceBoost * recencyBoost * sourceBoost;
}

function scoreInsightList(insights: ProfileInsight[]): Array<{ label: string; score: number }> {
	return insights.map((insight, index) => ({
		label: insight.value,
		score: weightForInsight(insight, index),
	}));
}

function pickTopLabels(
	primary: Array<{ label: string; score: number }>,
	backup: string[],
	limit: number,
	wordLimit = 8,
	keyFn: KeyFn = defaultKeyFn
): string[] {
	const scored = primary
		.filter((item) => normaliseValue(item.label))
		.map((item) => ({
			value: shortenPhrase(item.label, wordLimit),
			score: item.score,
		}));

	const deduped = new Map<string, { score: number; label: string }>();
	scored.forEach((item) => {
		const key = keyFn(item.value);
		const existing = deduped.get(key);
		if (!existing || existing.score < item.score) {
			deduped.set(key, { score: item.score, label: item.value });
		}
	});

	const ordered = Array.from(deduped.values())
		.sort((a, b) => b.score - a.score)
		.map((item) => item.label);

	const backupLabels = backup
		.map((item) => shortenPhrase(item, wordLimit))
		.filter(Boolean)
		.filter((item) => !deduped.has(keyFn(item)));

	const combined = [...ordered, ...backupLabels];
	return combined.slice(0, limit);
}

function pickThemes(profile: Profile): string[] {
	const interests = scoreInsightList(
		(profile.insights ?? []).filter((insight) => insight.kind === "interest")
	);
	const goals = scoreInsightList(
		(profile.insights ?? []).filter((insight) => insight.kind === "goal" || insight.kind === "hope")
	);
	const derivedThemes = deriveThemes(profile).map((theme) => ({
		label: theme.label,
		score: 1.1,
	}));
	const combined = [...goals, ...interests, ...derivedThemes];
	const backup = [...profile.goals, ...profile.hopes, ...profile.interests];
	return pickTopLabels(combined, backup, MAX_THEMES, 9, tokenKey);
}

function pickStrengths(profile: Profile): string[] {
	const strengthInsights = scoreInsightList(
		(profile.insights ?? []).filter((insight) => insight.kind === "strength")
	);
	const backup = profile.strengths;
	return pickTopLabels(strengthInsights, backup, MAX_STRENGTHS, 8, tokenKey);
}

function pickConstraint(profile: Profile): string | null {
	const candidates = scoreInsightList(
		(profile.insights ?? []).filter(
			(insight) => insight.kind === "constraint" || insight.kind === "frustration"
		)
	);
	const backup = [...profile.constraints, ...profile.frustrations];
	const [top] = pickTopLabels(candidates, backup, 1, 14);
	return top ?? null;
}

function pickGoalOrHope(profile: Profile): string | null {
	const goal = normaliseValue(profile.goals[0]);
	if (goal) return goal;
	const hope = normaliseValue(profile.hopes[0]);
	if (hope) return hope;
	const highlight = normaliseValue(profile.highlights[0]);
	if (highlight) return highlight;
	return null;
}

function pickEmotionalNote(profile: Profile): string | null {
	const frustration = normaliseValue(profile.frustrations[0]);
	if (frustration) return frustration;
	const hope = normaliseValue(profile.hopes[0]);
	if (hope) return hope;
	return null;
}

function sentenceFromList(items: string[]): string {
	if (items.length === 0) return "";
	if (items.length === 1) return items[0];
	if (items.length === 2) return `${items[0]} and ${items[1]}`;
	const leading = items.slice(0, -1).join(", ");
	const ending = items.slice(-1)[0];
	return `${leading}, and ${ending}`;
}

function clipTurn(turns: ConversationTurn[]): string | null {
	for (let i = turns.length - 1; i >= 0 && turns.length - 1 - i < LAST_TURN_LOOKBACK; i -= 1) {
		const turn = turns[i];
		if (turn.role !== "user") continue;
		const normalised = normaliseValue(turn.text);
		if (!normalised) continue;
		const clipped = normalised.length > 140 ? `${normalised.slice(0, 137)}…` : normalised;
		return clipped;
	}
	return null;
}

function buildWhyItMatters(
	goal: string | null,
	constraint: string | null,
	emotion: string | null,
	topTheme: string | undefined,
	topStrength: string | undefined
): string {
	if (constraint && topTheme && topStrength) {
		return `Balancing ${constraint} gets easier when you lean on ${topStrength} while building ${topTheme}.`;
	}
	if (constraint && topTheme) {
		return `Keeping ${constraint} in mind means taking steady steps on ${topTheme} instead of rushing it.`;
	}
	if (goal && topStrength) {
		return `That ${topStrength} streak gives you traction towards ${goal} without the fluff or false hype.`;
	}
	if (goal) {
		return `Each move keeps you edging closer to ${goal} without burning out.`;
	}
	if (emotion) {
		return `This plan matters because it tackles ${emotion} head-on instead of pretending it doesn’t exist.`;
	}
	return "Staying focused on what genuinely energises you keeps the journey honest and sustainable.";
}

export function buildConversationSummary(profile: Profile, turns: ConversationTurn[]): ConversationSummary {
	const themes = pickThemes(profile);
	const strengths = pickStrengths(profile);
	const constraint = pickConstraint(profile);
	const goalOrHope = pickGoalOrHope(profile);
	const emotionalNote = pickEmotionalNote(profile);
	const primaryTheme = themes[0];
	const primaryStrength = strengths[0];
	const whyItMatters = buildWhyItMatters(
		goalOrHope,
		constraint,
		emotionalNote,
		primaryTheme,
		primaryStrength
	);

	const intro = "Here’s what I’m holding onto from today’s chat.";
	const topThemes = themes.slice(0, 3);
	const themeLine =
		topThemes.length > 0 ? `Themes that lit up: ${sentenceFromList(topThemes)}.` : null;
	const topStrengths = strengths.slice(0, 3);
	const strengthLine =
		topStrengths.length > 0 ? `Strengths you kept showing: ${sentenceFromList(topStrengths)}.` : null;
	const constraintLine = constraint ? `Reality check: ${constraint}.` : null;
	const closingLine = `Why that matters: ${whyItMatters}`;

	const lastUserClip = clipTurn(turns);
	const closing = lastUserClip
		? `You wrapped by saying “${lastUserClip}”. Keep moments like that coming and I’ll keep tuning the plan with you.`
		: "Keep dropping real details like this and I’ll stay in step with you.";

	const paragraphs = [intro, themeLine, strengthLine, constraintLine, closingLine]
		.filter((line): line is string => Boolean(line))
		.map((line) => (line.endsWith(".") || line.endsWith("!") || line.endsWith("?") ? line : `${line}.`));

	return {
		intro,
		themes,
		strengths,
		constraint,
		whyItMatters,
		closing,
		paragraphs,
	};
}

