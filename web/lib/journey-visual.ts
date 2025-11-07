import type { CareerSuggestion, Profile } from "@/components/session-provider";
import type { ExplorationSnapshot } from "@/lib/exploration";

export interface JourneyVisualContext {
	sessionId: string;
	profile: Pick<
		Profile,
		| "insights"
		| "inferredAttributes"
		| "goals"
		| "hopes"
		| "highlights"
		| "mutualMoments"
		| "interests"
		| "strengths"
		| "readiness"
	>;
	suggestions: Array<
		Pick<
			CareerSuggestion,
			"id" | "title" | "summary" | "distance" | "whyItFits" | "nextSteps" | "microExperiments"
		>
	>;
	votes: Record<string, 1 | 0 | -1 | undefined>;
	snapshot?: Pick<ExplorationSnapshot, "themes" | "discoveryInsights">;
}

export interface JourneyVisualPlan {
	themeId: string;
	themeLabel: string;
	imagePrompt: string;
	caption: string;
	highlights: string[];
	keywords: string[];
}

type ThemeDefinition = {
	id: string;
	label: string;
	keywords: RegExp[];
	scene: string;
	palette: string;
	motifs: string;
};

const THEME_LIBRARY: ThemeDefinition[] = [
	{
		id: "sports-playbook",
		label: "competitive sports journey",
		keywords: [
			/(sport|rugby|football|athlete|coach|training|team|fitness)/i,
			/(play|stadium|match|league)/i,
		],
		scene: "dynamic stadium tunnel leading onto a floodlit pitch with strategy diagrams glowing in mid-air",
		palette: "electric blues, lime highlights, bold chalk-white lines",
		motifs: "pitch markings, teamwork silhouettes, motion trails, coach chalkboard icons",
	},
	{
		id: "tech-neon-lab",
		label: "technology innovation arc",
		keywords: [
			/(tech|software|code|ai|product|engineering|developer)/i,
			/(analysis|data|research|automation|systems)/i,
		],
		scene: "futuristic collaborative lab with holographic dashboards and interconnected circuits stretching into the horizon",
		palette: "deep navy, ultraviolet, neon turquoise highlights",
		motifs: "circuit traces, floating UI panels, glowing data nodes, collaborative avatars",
	},
	{
		id: "creative-studio",
		label: "creative studio montage",
		keywords: [
			/(design|music|art|creative|fashion|film|story)/i,
			/(studio|craft|performance|stage|gallery)/i,
		],
		scene: "sunlit studio packed with mood boards, instruments, and evolving prototypes arranged along a storytelling timeline",
		palette: "warm saffron, coral, deep violet accents",
		motifs: "paint strokes, tape strips, flowing typography, spotlight beams",
	},
	{
		id: "adventure-trail",
		label: "exploration trail",
		keywords: [],
		scene: "winding trail across varied landscapes with milestone markers, destination banners, and companions",
		palette: "earthy greens, copper, soft sky gradients",
		motifs: "compass, map annotations, handwritten notes, stacked postcards",
	},
];

const FALLBACK_STRENGTH = "resourcefulness";
const FALLBACK_THEME_ID = "adventure-trail";
const KEYWORD_STOP_WORDS = new Set([
	"and",
	"the",
	"that",
	"with",
	"from",
	"into",
	"your",
	"you",
	"using",
	"for",
	"this",
	"those",
	"their",
	"them",
	"they",
	"our",
	"it's",
	"its",
	"also",
	"then",
	"than",
	"over",
	"under",
	"onto",
	"about",
	"across",
	"around",
	"toward",
	"towards",
	"through",
	"while",
	"after",
	"before",
]);

function sanitizeKeywords(keywords: string[], limit: number): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const raw of keywords) {
		const clean = raw.replace(/[^a-z0-9-]/gi, "");
		if (!clean) continue;
		const lower = clean.toLowerCase();
		if (lower.length <= 2) continue;
		if (KEYWORD_STOP_WORDS.has(lower)) continue;
		if (seen.has(lower)) continue;
		seen.add(lower);
		result.push(clean);
		if (result.length >= limit) break;
	}

	return result;
}

function pickTheme(context: JourneyVisualContext, topKeywords: string[]): ThemeDefinition {
	const fallbackTheme = THEME_LIBRARY.find((t) => t.id === FALLBACK_THEME_ID)!;
	let bestTheme = fallbackTheme;
	let bestScore = 0;

	for (const candidate of THEME_LIBRARY) {
		if (candidate.id === FALLBACK_THEME_ID) continue;

		const score = candidate.keywords.reduce((acc, regex) => {
			return acc + (topKeywords.some((keyword) => regex.test(keyword)) ? 1 : 0);
		}, 0);

		if (score > bestScore) {
			bestScore = score;
			bestTheme = candidate;
		}
	}

	if (bestScore === 0 && topKeywords.some((keyword) => /(travel|journey|explore|adventure)/i.test(keyword))) {
		return fallbackTheme;
	}

	return bestTheme;
}

function resolveThemeDetails(
	theme: ThemeDefinition,
	context: {
		domainCue: string;
		headlineInterest: string;
		goal?: string;
		suggestionTitles: string[];
	}
): Pick<ThemeDefinition, "scene" | "palette" | "motifs"> {
	if (theme.id !== FALLBACK_THEME_ID) {
		return {
			scene: theme.scene,
			palette: theme.palette,
			motifs: theme.motifs,
		};
	}

	const pathLabels = context.suggestionTitles.slice(0, 3).join(", ");
	const journeyFocus =
		pathLabels ||
		context.goal ||
		context.headlineInterest ||
		context.domainCue ||
		"the user’s developing interests";

	return {
		scene: `adaptive journey storyboard or collage tailored to ${context.domainCue}, flowing from the initial spark (${context.headlineInterest}) through active experimentation and into ${journeyFocus}. Each scene can morph into environments (labs, studios, workshops, arenas) that make sense for those interests rather than resembling a literal fantasy map.`,
		palette: `colour story that starts with warm curiosity tones and gradually shifts into hues inspired by ${journeyFocus}; allow the palette to borrow from the user’s domain (e.g., neon tech glows, theatre lighting gels, athletic club colours).`,
		motifs: `handwritten annotations, pins, digital overlays, ${context.domainCue} tools/icons, collaborative silhouettes, optional wayfinding arrows or timelines—avoid parchment map tropes unless the conversation explicitly mentioned them.`,
	};
}

function rankKeywords(context: JourneyVisualContext): string[] {
	const keywords = new Map<string, number>();
	const bump = (text: string, weight: number) => {
		text
			.split(/[\s,]+/)
			.map((item) => item.trim())
			.filter((item) => item.length > 2)
			.forEach((word) => {
				const key = word.toLowerCase();
				keywords.set(key, (keywords.get(key) ?? 0) + weight);
			});
	};

	context.profile.insights.forEach((insight) => bump(insight.value, insight.kind === "strength" ? 3 : 1));
	context.profile.interests.forEach((interest) => bump(interest, 2));
	context.profile.strengths.forEach((strength) => bump(strength, 2));
	context.profile.goals.forEach((goal) => bump(goal, 3));
	context.profile.hopes.forEach((hope) => bump(hope, 2));
	context.profile.highlights.forEach((highlight) => bump(highlight, 1));

	context.suggestions.forEach((suggestion) => {
		bump(suggestion.title, 1);
		suggestion.whyItFits?.forEach((line) => bump(line, 1));
	});

	if (context.snapshot) {
		context.snapshot.themes.forEach((theme) => bump(theme.label, 3));
		context.snapshot.discoveryInsights.forEach((insight) => bump(insight.title, 1));
	}
	return Array.from(keywords.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 24)
		.map(([word]) => word);
}

function pickStrengths(context: JourneyVisualContext): string[] {
	const strengths = new Map<string, number>();
	context.profile.insights
		.filter((insight) => insight.kind === "strength")
		.forEach((insight) => {
			strengths.set(insight.value, Math.max(strengths.get(insight.value) ?? 0, 3));
		});
	context.profile.inferredAttributes.skills
		.filter((skill) => skill.stage === "established" || skill.stage === "developing")
		.forEach((skill) => {
			strengths.set(skill.label, Math.max(strengths.get(skill.label) ?? 0, skill.stage === "established" ? 2 : 1));
		});
	context.profile.strengths.forEach((value) => {
		strengths.set(value, Math.max(strengths.get(value) ?? 0, 1));
	});

	const ranked = Array.from(strengths.entries()).sort((a, b) => b[1] - a[1]);
	if (ranked.length === 0) {
		return [FALLBACK_STRENGTH];
	}
	return ranked.slice(0, 3).map(([value]) => value);
}

function pickSavedSuggestions(
	context: JourneyVisualContext
): Array<{ title: string; summary: string }> {
	const saved = context.suggestions
		.filter((suggestion) => context.votes[suggestion.id] === 1)
		.slice(0, 3);
	if (saved.length > 0) {
		return saved.map((suggestion) => ({
			title: suggestion.title,
			summary: suggestion.summary,
		}));
	}
	return context.suggestions.slice(0, 2).map((suggestion) => ({
		title: suggestion.title,
		summary: suggestion.summary,
	}));
}

function selectGoal(context: JourneyVisualContext): string | undefined {
	return (
		context.profile.goals[0] ??
		context.profile.hopes[0] ??
		context.profile.mutualMoments[0]?.text ??
		context.profile.highlights[0]
	);
}

export function buildJourneyVisualPlan(context: JourneyVisualContext): JourneyVisualPlan {
	const keywords = rankKeywords(context);
	const theme = pickTheme(context, keywords);
	const strengths = pickStrengths(context);
	const topSuggestions = pickSavedSuggestions(context);
	const goal = selectGoal(context);
	const suggestionTitles = topSuggestions.map((suggestion) => suggestion.title);
	const landmarkCues = sanitizeKeywords(keywords, 6);

	const headlineInterest =
		context.profile.interests[0] ??
		context.snapshot?.themes[0]?.label ??
		"curiosity";

	const domainCue =
		sanitizeKeywords(keywords, 5).join(", ") ||
		[headlineInterest, strengths[0], suggestionTitles[0]].filter(Boolean).join(", ") ||
		"their interests";

	const themeDetails = resolveThemeDetails(theme, {
		domainCue,
		headlineInterest,
		goal,
		suggestionTitles,
	});

	const captionParts = [
		`Started with an interest in ${headlineInterest}`,
		`leaned on strengths like ${strengths.join(", ")}`,
	];
	if (goal) {
		captionParts.push(`now aiming toward ${goal}`);
	}
	const caption = captionParts.join(" • ");

	const highlightLines = [
		`Strengths: ${strengths.join(", ")}`,
		`Focus: ${headlineInterest}`,
	];
	topSuggestions.forEach((suggestion, index) => {
		highlightLines.push(`Path ${index + 1}: ${suggestion.title}`);
	});
	if (goal) {
		highlightLines.push(`Next mission: ${goal}`);
	}

	const timelineCallouts = topSuggestions
		.map((suggestion, index) => `Milestone ${index + 1}: ${suggestion.title} — ${suggestion.summary}`)
		.join("\n");

	const promptSections = [
		`Topic: ${headlineInterest}`,
		`Core strengths: ${strengths.join(", ")}`,
		topSuggestions.length > 0 ? `Key milestones:\n${timelineCallouts}` : null,
		goal ? `Destination banner: ${goal}` : null,
		`Scene: ${themeDetails.scene}`,
		`Palette: ${themeDetails.palette}`,
		`Motifs: ${themeDetails.motifs}`,
		landmarkCues.length > 0 ? `Landmark labels should nod to: ${landmarkCues.join(", ")}` : null,
		"Composition: pick a narrative layout (panels, sweeping panorama, collage, or storyboard) that matches the user’s domain; show clear progression from starting spark to next mission with meaningful captions or signposts; weave in environment cues, tools, and collaborators that reflect their interests; feel free to lean into whichever visual language best suits the theme instead of forcing a single style.",
	];

	return {
		themeId: theme.id,
		themeLabel: theme.label,
		imagePrompt: promptSections.filter(Boolean).join("\n"),
		caption,
		highlights: highlightLines,
		keywords,
	};
}
