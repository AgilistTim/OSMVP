/**
 * Career vibe matcher
 *
 * Maps conversational nuggets (insights) to lightweight exploration areas using
 * plain-language keywords. Each area includes a friendly blurb, career angles,
 * and suggested next moves that can feed later phases (tiles, actions).
 *
 * To add a new vibe:
 * 1. Add an entry to `VIBE_DEFINITIONS` with:
 *    - `id`: kebab-case identifier
 *    - `title`: chat-friendly label (“Gameplay Systems Tinkerer”)
 *    - `summary`: one-line hook that relates to the user’s vibe
 *    - `keywords`: array of { term, reason? } matched against insights
 *    - Optional `strengthSignals`: keywords that boost score when the user shows a related trait
 *    - `careerAngles`: 1-3 concrete “this could look like…” statements
 *    - `nextSteps`: experiments/resources for Phase 3+
 * 2. Keep language casual, avoid corporate jargon.
 * 3. Add a unit test in `lib/__tests__/vibe-matcher.test.ts`.
 */

import type { InsightKind } from "@/components/session-provider";

interface KeywordDefinition {
	term: string;
	reason?: string;
}

interface VibeDefinition {
	id: string;
	title: string;
	summary: string;
	keywords: KeywordDefinition[];
	strengthSignals?: KeywordDefinition[];
	careerAngles: string[];
	nextSteps: string[];
}

export interface VibeSuggestion {
	id: string;
	title: string;
	summary: string;
	careerAngles: string[];
	nextSteps: string[];
	whyItFits: string[];
	confidence: "high" | "medium" | "low";
	score: number;
}

export interface MatchCareerVibesInput {
	insights: Array<{
		kind: InsightKind;
		value: string;
	}>;
	limit?: number;
}

const VIBE_DEFINITIONS: VibeDefinition[] = [
	{
		id: "gameplay-systems-tinkerer",
		title: "Gameplay Systems Tinkerer",
		summary: "Turning mod nights into real-world game systems experience.",
		keywords: [
			{ term: "mod", reason: "You’re tweaking mods, which is core gameplay prototyping." },
			{ term: "minecraft" },
			{ term: "server" },
			{ term: "game" },
			{ term: "block" },
			{ term: "mechanic" },
			{ term: "tweak" },
		],
		strengthSignals: [
			{ term: "collaborative", reason: "You already collaborate with friends on a live server." },
			{ term: "team" },
			{ term: "friends" },
		],
		careerAngles: [
			"Gameplay tools designer – prototype mechanics, balance systems, and document player impact.",
			"Live-ops coordinator – run seasonal events, gather feedback, and iterate on the fly.",
			"Indie dev collaborator – join a small team to ship micro-experiences or jam projects.",
		],
		nextSteps: [
			"Ship a micro-mod with a change log explaining what you tweaked and why.",
			"Write up a short post on what you learnt running your server (medium, itch devlog, or Discord).",
			"Shadow or interview someone who designs Minecraft marketplace content or Roblox experiences.",
		],
	},
	{
		id: "community-hype-captain",
		title: "Community Hype Captain",
		summary: "You already rally people—turn that into events, content, or crew leadership.",
		keywords: [
			{ term: "hang", reason: "You love hanging out and keeping the vibe going." },
			{ term: "friends" },
			{ term: "event" },
			{ term: "crew" },
			{ term: "organise" },
			{ term: "community" },
		],
		strengthSignals: [
			{ term: "collaborative" },
			{ term: "host" },
			{ term: "group" },
		],
		careerAngles: [
			"Community events producer – design small IRL/online happenings that get people returning.",
			"Creator partnership coordinator – keep a roster of players engaged and excited.",
			"Student society or esports lead – manage schedules, hype content, and sponsor chats.",
		],
		nextSteps: [
			"Host a low-stakes themed night (in-game or IRL) and document what made it fun.",
			"Map out a mock calendar for a community you care about, noting hooks and collabs.",
			"Chat with someone running Discords or local events about what their day-to-day looks like.",
		],
	},
	{
		id: "creative-tech-storyteller",
		title: "Creative Tech Storyteller",
		summary: "Blending creative chaos with lightweight tech and storytelling.",
		keywords: [
			{ term: "film" },
			{ term: "edit" },
			{ term: "design" },
			{ term: "build" },
			{ term: "3d" },
			{ term: "art" },
			{ term: "sound" },
		],
		strengthSignals: [
			{ term: "share", reason: "You like sharing what you make – that’s storytelling." },
			{ term: "content" },
			{ term: "create" },
		],
		careerAngles: [
			"Creative technologist – prototype interactive experiences for agencies or startups.",
			"Content producer – script/film/play with formats for brands or studios.",
			"Experience designer – mix visuals, narrative, and tech for events or digital products.",
		],
		nextSteps: [
			"Turn one of your experiments into a 60-second breakdown (what, how, why).",
			"Join a game-jam or creative sprint weekend and document your process.",
			"Reach out to a creative technologist or content producer with two questions about their workflow.",
		],
	},
	{
		id: "impact-builder",
		title: "Impact Builder",
		summary: "When you care about something, you want to fix it – that’s a career superpower.",
		keywords: [
			{ term: "help" },
			{ term: "solve" },
			{ term: "issue" },
			{ term: "frustration" },
			{ term: "change" },
			{ term: "improve" },
		],
		strengthSignals: [
			{ term: "goal" },
			{ term: "hope" },
			{ term: "value" },
		],
		careerAngles: [
			"Innovation associate – translate frustrations into pilot ideas inside organisations.",
			"Product ops / service designer – map pains, test small fixes, scale what works.",
			"Social impact coordinator – rally people around causes with practical next steps.",
		],
		nextSteps: [
			"Keep a frustration log for a week and pick one to prototype a fix for.",
			"Interview someone tackling a similar issue and compare what tools they use.",
			"Join a local or online crew working on the same theme to see the roles in action.",
		],
	},
];

const FALLBACK_VIBES: VibeSuggestion[] = [
	{
		id: "curious-explorer",
		title: "Curious Explorer",
		summary: "You’re collecting sparks – let’s bottle them for the next phase.",
		careerAngles: [
			"Track themes that repeat (tech, community, creativity) and we’ll cross them with roles later.",
		],
		nextSteps: [
			"Note two things you loved doing this week and why they felt good.",
			"Screenshot or save anything that makes you think “I could do that” – even if it’s messy.",
		],
		whyItFits: [
			"You’re still formulating the angle, which is exactly where we start serious exploration.",
		],
		confidence: "low",
		score: 0,
	},
];

const BASE_CONFIDENCE: Record<number, "high" | "medium" | "low"> = {
	0: "low",
	1: "medium",
	2: "medium",
	3: "high",
	4: "high",
};

const MAX_SUGGESTIONS_DEFAULT = 3;

export function matchCareerVibes(input: MatchCareerVibesInput): VibeSuggestion[] {
	const { insights, limit = MAX_SUGGESTIONS_DEFAULT } = input;
	if (!Array.isArray(insights) || insights.length === 0) {
		return FALLBACK_VIBES.slice(0, limit);
	}

	const lowerCaseInsights = insights.map((insight) => ({
		kind: insight.kind,
		value: insight.value,
		lower: insight.value.toLowerCase(),
	}));

	const scored: VibeSuggestion[] = [];

	for (const vibe of VIBE_DEFINITIONS) {
		let score = 0;
		const reasons: string[] = [];

		for (const insight of lowerCaseInsights) {
			for (const keyword of vibe.keywords) {
				if (insight.lower.includes(keyword.term)) {
					score += 2;
					reasons.push(
						keyword.reason ??
							`You mentioned "${insight.value}" which lines up with ${vibe.title.toLowerCase()}.`
					);
				}
			}

			if (vibe.strengthSignals && vibe.strengthSignals.length > 0) {
				for (const keyword of vibe.strengthSignals) {
					if (insight.lower.includes(keyword.term)) {
						score += insight.kind === "strength" ? 1.5 : 1;
						reasons.push(
							keyword.reason ??
								`You show a knack for "${insight.value}", which boosts this lane.`
						);
					}
				}
			}

			if (insight.kind === "goal" || insight.kind === "hope") {
				score += 0.5;
			}
		}

		if (score <= 0) {
			continue;
		}

		const confidence = BASE_CONFIDENCE[Math.min(reasons.length, 4)] ?? "medium";
		scored.push({
			id: vibe.id,
			title: vibe.title,
			summary: vibe.summary,
			careerAngles: vibe.careerAngles,
			nextSteps: vibe.nextSteps,
			whyItFits: Array.from(new Set(reasons)),
			confidence,
			score,
		});
	}

	if (scored.length === 0) {
		return FALLBACK_VIBES.slice(0, limit);
	}

	const ordered = scored.sort((a, b) => b.score - a.score);
	return ordered.slice(0, limit);
}
