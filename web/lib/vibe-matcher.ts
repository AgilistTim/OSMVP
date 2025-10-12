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
	neighbors?: string[];
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
	neighborTerritories: string[];
}

export interface MatchCareerVibesInput {
	insights: Array<{
		kind: InsightKind;
		value: string;
	}>;
	limit?: number;
	votes?: Record<string, 1 | 0 | -1>;
}

const VIBE_DEFINITIONS: VibeDefinition[] = [
	{
		id: "ai-ethics-navigator",
		title: "AI Ethics Navigator",
		summary: "You’re pulled toward keeping AI fair, transparent, and human-centred.",
		keywords: [
			{ term: "ai", reason: "You’re digging into AI directly—let’s channel that energy." },
			{ term: "automation", reason: "You’re weighing the impact of automation on people’s jobs." },
			{ term: "ethic" },
			{ term: "fair" },
			{ term: "bias" },
			{ term: "inclusion" },
			{ term: "neurodivers" },
		],
		strengthSignals: [
			{ term: "explain", reason: "You want to explain complex AI topics so others can act." },
			{ term: "communicat" },
			{ term: "research" },
		],
		careerAngles: [
			"Responsible AI researcher – audit models for bias and build guidelines teams will actually use.",
			"AI policy analyst – translate technical risks into moves that orgs and governments can deploy.",
			"Ethical technology advocate – help communities understand how automation touches their work.",
		],
		nextSteps: [
			"Write a short breakdown of one AI bias example and what a fairer alternative could look like.",
			"Join an AI ethics or accessibility meetup and note the questions people are asking.",
			"Shadow a product or policy team shipping AI features and map where human review fits.",
		],
		neighbors: [
			"Product sense translator for AI features",
			"Community educator helping teams adopt AI responsibly",
		],
	},
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
		neighbors: [
			"Live ops experimentation for collaborative games",
			"Prototyping assistant tools that speed up modders",
		],
	},
	{
		id: "community-hype-captain",
		title: "Community Hype Captain",
		summary: "You already rally people—turn that into events, content, or crew leadership.",
		keywords: [
			{ term: "event" },
			{ term: "crew" },
			{ term: "organise" },
			{ term: "community" },
			{ term: "host" },
			{ term: "mc" },
			{ term: "moderate" },
		],
		strengthSignals: [
			{ term: "collaborative" },
			{ term: "friends" },
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
		neighbors: [
			"Creator partnership wrangler",
			"Pop-up events producer",
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
		neighbors: [
			"Interactive storytelling for brands",
			"Short-form content studio collaborator",
		],
	},
	{
		id: "creature-dynamics-designer",
		title: "Creature Dynamics Designer",
		summary: "You’re obsessed with how creatures behave — that’s systems design energy.",
		keywords: [
			{ term: "taming", reason: "Caring about taming mechanics is live creature balancing." },
			{ term: "creature" },
			{ term: "dino" },
			{ term: "mob" },
			{ term: "zombie" },
			{ term: "sheep" },
			{ term: "morph", reason: "Morphing creatures is advanced behaviour design." },
			{ term: "ark" },
		],
		strengthSignals: [
			{ term: "team", reason: "You already collaborate with mates to test creature chaos." },
			{ term: "friends" },
			{ term: "goal", reason: "Wanting others to enjoy your mods shows product thinking." },
		],
		careerAngles: [
			"Creature systems designer – craft behaviours, abilities, and balance for live games.",
			"Simulation designer – build emergent systems where AI and players interact in surprising ways.",
			"Technical artist for character/creature pipelines – blend art, rigging, and behaviour tweaks.",
		],
		nextSteps: [
			"Prototype a single morphing creature behaviour and document the rules in a short design note.",
			"Record a clip of your most chaotic creature moment and talk through what made it interesting.",
			"Chat with a systems or AI designer about how they iterate on creature abilities and balance.",
		],
		neighbors: [
			"Simulation design for emerging worlds",
			"Creature animation TD roles",
		],
	},
	{
		id: "speculative-world-narrator",
		title: "Speculative World Narrator",
		summary: "If you’re constantly imagining futures, you’re already doing narrative design and foresight.",
		keywords: [
			{ term: "sci", reason: "Sci-fi fans often excel at future thinking and storytelling." },
			{ term: "future" },
			{ term: "world" },
			{ term: "story" },
			{ term: "imagin" },
			{ term: "write" },
			{ term: "reading" },
			{ term: "watching" },
		],
		strengthSignals: [
			{ term: "idea", reason: "Enjoying idea generation is the heartbeat of narrative design." },
			{ term: "randomness" },
		],
		careerAngles: [
			"Narrative designer – craft lore, mission arcs, and world hooks for studios.",
			"Foresight researcher – spot signals and imagine futures for teams planning products or policy.",
			"Transmedia storyteller – build worlds that live across games, film, and interactive media.",
		],
		nextSteps: [
			"Write a 200-word ‘what if’ snippet about a future tech or creature you’d love to see.",
			"Create a moodboard or collage for your favourite imagined world and share it with friends.",
			"Join a speculative design or writing community and lurk on how they workshop ideas.",
		],
		neighbors: [
			"Scenario planning sprints with product teams",
			"Worldbuilding labs for indie games",
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
		neighbors: [
			"Service design for community initiatives",
			"Grassroots accelerator projects",
		],
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
		if (process.env.NODE_ENV !== "production") {
			console.warn("[vibe-matcher] called without insights; returning no suggestions");
		}
		return [];
	}

	const lowerCaseInsights = insights.map((insight) => ({
		kind: insight.kind,
		value: insight.value,
		lower: insight.value.toLowerCase(),
	}));

	const votes = input.votes ?? {};
	const likedIds = new Set<string>();
	const dislikedIds = new Set<string>();
	Object.entries(votes).forEach(([id, value]) => {
		if (value === 1) likedIds.add(id);
		if (value === -1) dislikedIds.add(id);
	});

	const definitionById = new Map(VIBE_DEFINITIONS.map((def) => [def.id, def]));

	const likedNeighborTerms = new Set<string>();
	likedIds.forEach((id) => {
		const def = definitionById.get(id);
		if (!def?.neighbors) return;
		def.neighbors.forEach((neighbor) => likedNeighborTerms.add(neighbor.toLowerCase()));
	});

	const scored: VibeSuggestion[] = [];

	for (const vibe of VIBE_DEFINITIONS) {
		if (dislikedIds.has(vibe.id)) {
			continue;
		}

		let score = 0;
		const reasons: string[] = [];
		const isLiked = likedIds.has(vibe.id);

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

			if (insight.kind === "strength" && vibe.strengthSignals && vibe.strengthSignals.length > 0) {
				for (const keyword of vibe.strengthSignals) {
					if (insight.lower.includes(keyword.term)) {
						score += 1.5;
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

		if (isLiked) {
			score += 2;
			reasons.push("You already saved this lane, keeping it front and centre.");
		}

		if (vibe.neighbors && vibe.neighbors.length > 0) {
			const neighborHit = vibe.neighbors.find((neighbor) =>
				likedNeighborTerms.has(neighbor.toLowerCase())
			);
			if (neighborHit) {
				score += 1.5;
				reasons.push(`Connects with "${neighborHit}", which you’re already exploring.`);
			}
		}

		if (score <= 0) {
			continue;
		}

		const distinctReasons = Array.from(new Set(reasons));
		if (!isLiked && (score < 3 || distinctReasons.length < 2)) {
			continue;
		}

		const confidence = BASE_CONFIDENCE[Math.min(reasons.length, 4)] ?? "medium";
		scored.push({
			id: vibe.id,
			title: vibe.title,
			summary: vibe.summary,
			careerAngles: vibe.careerAngles,
			nextSteps: vibe.nextSteps,
			whyItFits: distinctReasons,
			confidence,
			score,
			neighborTerritories: vibe.neighbors ?? [],
		});
	}

	if (scored.length === 0 && process.env.NODE_ENV !== "production") {
		const preview = insights.slice(0, 3).map((item) => `${item.kind}:${item.value}`);
		console.warn("[vibe-matcher] no matches found for insights", preview);
	}

	const ordered = scored.sort((a, b) => b.score - a.score);
	return ordered.slice(0, limit);
}
