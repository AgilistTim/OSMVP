import type { CareerSuggestion, Profile, ProfileInsight } from "@/components/session-provider";

export interface ExplorationTheme {
	label: string;
	evidence?: string;
	confidence?: ProfileInsight["confidence"];
}

export interface DiscoveryInsight {
	title: string;
	description: string;
	tone: "celebratory" | "observational" | "growth";
}

export interface OpportunityLane {
	title: string;
	description: string;
	highlights: string[];
	callToAction?: string;
}

export interface OpportunityMap {
	directPaths: OpportunityLane[];
	adjacentOpportunities: OpportunityLane[];
	transferableSkills: OpportunityLane[];
	innovationPotential: OpportunityLane[];
}

export interface MarketRealityItem {
	title: string;
	salaryRange: string;
	sources: Array<{ label: string; url: string }>;
	opportunitySignal: string;
}

export interface MarketReality {
	salaryData: MarketRealityItem[];
	marketDemand: MarketRealityItem[];
	successStories: MarketRealityItem[];
}

export interface LearningPathwayGroup {
	title: string;
	resources: Array<{
		label: string;
		description: string;
		url: string;
		source: "youtube" | "community" | "course" | "experience";
	}>;
}

export interface StakeholderMessage {
	audience: "parents" | "teachers" | "mentors";
	headline: string;
	points: string[];
}

export interface ActionTimeline {
	immediate: string[];
	shortTerm: string[];
	mediumTerm: string[];
}

export interface ExplorationSnapshot {
	themes: ExplorationTheme[];
	discoveryInsights: DiscoveryInsight[];
	opportunities: OpportunityMap;
	marketReality: MarketReality;
	learningPathways: LearningPathwayGroup[];
	stakeholderMessages: StakeholderMessage[];
	nextSteps: ActionTimeline;
}

type VoteLookup = Record<string, 1 | 0 | -1 | undefined>;

const SALARY_BANDS: Array<{ matcher: RegExp; range: string; note: string }> = [
	{ matcher: /(software|developer|engineer|data)/i, range: "£32k – £70k", note: "Growing demand across UK tech hubs" },
	{ matcher: /(design|creative|arts|media)/i, range: "£24k – £48k", note: "Portfolio-led hiring, strong freelance options" },
	{ matcher: /(sustain|environment|climate|green)/i, range: "£28k – £55k", note: "Net-zero programmes expanding nationwide" },
	{ matcher: /(health|care|nurse|therap)/i, range: "£26k – £52k", note: "NHS-led demand plus private practice" },
	{ matcher: /(education|teacher|learning|mentor)/i, range: "£23k – £45k", note: "Consistent demand with alternative pathways" },
];

const GENERAL_SALARY = { range: "£25k – £45k", note: "UK median earnings for early-career roles" };

const RESOURCE_LOOKUP: Array<{
	matcher: RegExp;
	resources: LearningPathwayGroup[];
}> = [
	{
		matcher: /(music|sound|producer|song|dj)/i,
		resources: [
			{
				title: "Self-directed sparks",
				resources: [
					{
						label: "Andrew Huang",
						description: "YouTube producer breaking down genre-blending experiments.",
						url: "https://www.youtube.com/c/andrewhuang",
						source: "youtube",
					},
					{
						label: "Spitfire Audio Labs",
						description: "Free instruments and challenges to grow your sound design palette.",
						url: "https://labs.spitfireaudio.com/",
						source: "experience",
					},
				],
			},
		],
	},
	{
		matcher: /(code|software|app|game|tech|developer)/i,
		resources: [
			{
				title: "Ship experiments quickly",
				resources: [
					{
						label: "Scrimba Front-end Career Path",
						description: "Hands-on curriculum that fits around school and work.",
						url: "https://scrimba.com/learn/frontend",
						source: "course",
					},
					{
						label: "Buildspace Nights & Weekends",
						description: "Global community sprinting on ambitious projects with live mentors.",
						url: "https://buildspace.so/",
						source: "community",
					},
				],
			},
		],
	},
	{
		matcher: /(fashion|style|design|textile)/i,
		resources: [
			{
				title: "Creative practice in public",
				resources: [
					{
						label: "Fashion Textiles Hub",
						description: "UK-based Discord sharing sustainable techniques and briefs.",
						url: "https://discord.com/invite/fashionrevolution",
						source: "community",
					},
					{
						label: "Fashion Innovation Agency events",
						description: "London College of Fashion programmes on emerging tech.",
						url: "https://www.arts.ac.uk/colleges/london-college-of-fashion/business-and-innovation/fashion-innovation-agency",
						source: "experience",
					},
				],
			},
		],
	},
];

const DEFAULT_PATHWAYS: LearningPathwayGroup[] = [
	{
		title: "Self-directed curiosities",
		resources: [
			{
				label: "Skillshare free classes",
				description: "Bite-sized lessons to prototype ideas quickly.",
				url: "https://www.skillshare.com/en/browse/free",
				source: "course",
			},
			{
				label: "FutureLearn tasters",
				description: "UK universities sharing open short courses—great for credibility.",
				url: "https://www.futurelearn.com/courses",
				source: "course",
			},
		],
	},
	{
		title: "Plug into communities",
		resources: [
			{
				label: "Eventbrite UK",
				description: "Filter by interest to find local meetups, panels, and workshops.",
				url: "https://www.eventbrite.co.uk/",
				source: "community",
			},
			{
				label: "Meetup passion groups",
				description: "Join or observe groups testing similar missions in your city.",
				url: "https://www.meetup.com/find/",
				source: "community",
			},
		],
	},
	{
		title: "Learn by doing",
		resources: [
			{
				label: "Do It volunteering finder",
				description: "UK-wide opportunities to trial roles and build proof.",
				url: "https://doit.life/opportunities/search",
				source: "experience",
			},
			{
				label: "Young Enterprise competitions",
				description: "Try entrepreneurial experiments with national support.",
				url: "https://www.young-enterprise.org.uk/programmes/company-programme/",
				source: "experience",
			},
		],
	},
];

function pickSalaryMeta(title: string): { range: string; note: string } {
	for (const entry of SALARY_BANDS) {
		if (entry.matcher.test(title)) {
			return { range: entry.range, note: entry.note };
		}
	}
	return GENERAL_SALARY;
}

function formatSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function deriveThemes(profile: Profile): ExplorationTheme[] {
	const themes: ExplorationTheme[] = [];

	const interestInsights = profile.insights.filter((insight) => insight.kind === "interest");
	interestInsights.slice(0, 5).forEach((insight) => {
		themes.push({
			label: insight.value,
			evidence: insight.evidence,
			confidence: insight.confidence,
		});
	});

	if (themes.length === 0 && profile.interests.length > 0) {
		profile.interests.slice(0, 5).forEach((interest) => {
			themes.push({ label: interest });
		});
	}

	return themes;
}

function describeStrength(insight: ProfileInsight): string {
	const base = insight.value;
	if (!insight.evidence) return base;
	return `${base} — backed by moments like "${insight.evidence}"`;
}

export function buildDiscoveryInsights(profile: Profile, themes: ExplorationTheme[]): DiscoveryInsight[] {
	const insights: DiscoveryInsight[] = [];

	const strengthInsights = profile.insights.filter((insight) => insight.kind === "strength");
	if (strengthInsights.length > 0) {
		insights.push({
			title: "Strengths you keep returning to",
			description: strengthInsights.slice(0, 3).map(describeStrength).join("; "),
			tone: "celebratory",
		});
	}

	if (themes.length > 0) {
		insights.push({
			title: "Signals from the conversation",
			description: themes
				.slice(0, 3)
				.map((theme) => theme.label)
				.join(", "),
			tone: "observational",
		});
	}

	if (profile.hopes.length > 0 || profile.goals.length > 0) {
		const hopes = [...profile.hopes, ...profile.goals].slice(0, 3);
		insights.push({
			title: "What you’re hungry to change",
			description: hopes.join("; "),
			tone: "growth",
		});
	}

	return insights;
}

export function buildOpportunityMap(
	suggestions: CareerSuggestion[],
	votesByCareerId: VoteLookup
): OpportunityMap {
	const direct: OpportunityLane[] = [];
	const adjacent: OpportunityLane[] = [];
	const transferable: OpportunityLane[] = [];
	const innovation: OpportunityLane[] = [];

	suggestions.forEach((suggestion) => {
		const vote = votesByCareerId[suggestion.id];
		const summary = suggestion.summary;
		const highlights = suggestion.whyItFits.slice(0, 3);
		const cta = suggestion.nextSteps[0];
		const distance = suggestion.distance ?? "core";
		const baseLane: OpportunityLane = {
			title: suggestion.title,
			description: summary,
			highlights,
			callToAction: cta,
		};

		if (vote === -1) {
			// use disliked items to illustrate boundaries in transferable section
			transferable.push({
				title: `Skills from ${suggestion.title}`,
				description: "If you repurpose the bits that worked:",
				highlights: suggestion.whyItFits.slice(0, 3),
			});
			return;
		}

		if (distance === "core") {
			direct.push(baseLane);
		} else {
			const adjacentHighlights =
				suggestion.neighborTerritories.length > 0
					? suggestion.neighborTerritories.slice(0, 3)
					: suggestion.careerAngles.slice(0, 3);
			adjacent.push({
				...baseLane,
				highlights: adjacentHighlights,
			});
		}

		if (suggestion.careerAngles.length > 0) {
			innovation.push({
				title: `${suggestion.title.split(" ").slice(0, 3).join(" ")} experiments`,
				description: "Ways to remix this into your own project:",
				highlights: suggestion.careerAngles.slice(0, 3),
				callToAction: suggestion.nextSteps[1],
			});
		}
	});

	return {
		directPaths: direct.slice(0, 4),
		adjacentOpportunities: adjacent.slice(0, 4),
		transferableSkills: transferable.slice(0, 4),
		innovationPotential: innovation.slice(0, 4),
	};
}

export function buildMarketReality(
	suggestions: CareerSuggestion[],
	votesByCareerId: VoteLookup
): MarketReality {
	const salaryData: MarketRealityItem[] = [];
	const demandData: MarketRealityItem[] = [];
	const stories: MarketRealityItem[] = [];

	const focusSuggestions =
		suggestions.filter((suggestion) => votesByCareerId[suggestion.id] === 1) || suggestions.slice(0, 3);

	focusSuggestions.forEach((suggestion) => {
		const { range, note } = pickSalaryMeta(suggestion.title);
		const slug = formatSlug(suggestion.title);
		const onsLink = `https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours`;
		const ncsLink = `https://nationalcareers.service.gov.uk/job-profiles/${slug}`;
		const jobSearchLink = `https://www.reed.co.uk/jobs/${encodeURIComponent(
			suggestion.title.replace(/\s+/g, "-")
		)}-jobs`;

		salaryData.push({
			title: suggestion.title,
			salaryRange: range,
			sources: [
				{ label: "ONS data", url: onsLink },
				{ label: "National Careers Service", url: ncsLink },
			],
			opportunitySignal: note,
		});

		demandData.push({
			title: `UK demand for ${suggestion.title}`,
			salaryRange: "Live roles",
			sources: [
				{ label: "Reed.co.uk search", url: jobSearchLink },
				{
					label: "LinkedIn UK",
					url: `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(suggestion.title)}`,
				},
			],
			opportunitySignal: "Scan live listings to see required skills and hotspots.",
		});

		if (suggestion.careerAngles.length > 0) {
			stories.push({
				title: `${suggestion.title} in the UK`,
				salaryRange: "Story spotlight",
				sources: suggestion.careerAngles.slice(0, 2).map((angle) => ({
					label: angle,
					url: `https://www.google.co.uk/search?q=${encodeURIComponent(`UK ${angle}`)}`,
				})),
				opportunitySignal: "Explore how others have carved unexpected routes.",
			});
		}
	});

	return {
		salaryData,
		marketDemand: demandData,
		successStories: stories,
	};
}

export function buildLearningPathways(themes: ExplorationTheme[]): LearningPathwayGroup[] {
	for (const theme of themes) {
		const match = RESOURCE_LOOKUP.find((entry) => entry.matcher.test(theme.label));
		if (match) {
			// merge with defaults ensuring uniqueness
			const combined = new Map<string, LearningPathwayGroup>();
			[...DEFAULT_PATHWAYS, ...match.resources].forEach((group) => {
				if (!combined.has(group.title)) {
					combined.set(group.title, group);
					return;
				}
				const existing = combined.get(group.title)!;
				const seen = new Set(existing.resources.map((resource) => resource.url));
				group.resources.forEach((resource) => {
					if (!seen.has(resource.url)) {
						existing.resources.push(resource);
						seen.add(resource.url);
					}
				});
			});
			return Array.from(combined.values());
		}
	}

	return DEFAULT_PATHWAYS;
}

export function buildStakeholderMessages(
	themes: ExplorationTheme[],
	marketReality: MarketReality
): StakeholderMessage[] {
	const topTheme = themes[0]?.label ?? "this mission";
	const salaryCallout = marketReality.salaryData[0]?.salaryRange ?? "£25k – £45k";

	return [
		{
			audience: "parents",
			headline: "There’s financial grounding here",
			points: [
				`Typical UK earnings for ${topTheme.toLowerCase()} roles sit around ${salaryCallout}.`,
				"We’re mapping multiple routes so we can pivot without losing momentum.",
				"Exploration now means fewer costly course changes later.",
			],
		},
		{
			audience: "teachers",
			headline: "Connect it to curriculum and credentials",
			points: [
				"We’re lining up project-based evidence that can feed personal statements and coursework.",
				"Industry resources show where academic subjects translate into emerging roles.",
				"We’ll keep documenting progress so feedback loops stay tight.",
			],
		},
		{
			audience: "mentors",
			headline: "Help pressure-test the mission",
			points: [
				"We’re collecting live market validation to focus on high-signal experiments.",
				"Introductions to operators in adjacent spaces will accelerate learning.",
				"Feedback on the opportunities map keeps the plan honest and ambitious.",
			],
		},
	];
}

export function buildNextSteps(
	suggestions: CareerSuggestion[],
	votesByCareerId: VoteLookup
): ActionTimeline {
	const immediate: string[] = [];
	const shortTerm: string[] = [];
	const mediumTerm: string[] = [];

	suggestions.forEach((suggestion) => {
		const vote = votesByCareerId[suggestion.id];
		const firstStep = suggestion.nextSteps[0];
		const laterStep = suggestion.nextSteps[1];

		if (firstStep && immediate.length < 4) {
			immediate.push(firstStep);
		}
		if (laterStep && shortTerm.length < 4) {
			shortTerm.push(laterStep);
		}
		if (suggestion.careerAngles.length > 0 && mediumTerm.length < 4) {
			mediumTerm.push(`Prototype: ${suggestion.careerAngles[0]}`);
		}

		if (vote === 0 && suggestion.nextSteps[2]) {
			mediumTerm.push(`Revisit maybe: ${suggestion.nextSteps[2]}`);
		}
	});

	return {
		immediate: immediate.slice(0, 4),
		shortTerm: shortTerm.slice(0, 4),
		mediumTerm: mediumTerm.slice(0, 4),
	};
}

export function buildExplorationSnapshot(
	profile: Profile,
	suggestions: CareerSuggestion[],
	votesByCareerId: VoteLookup
): ExplorationSnapshot {
	const themes = deriveThemes(profile);
	const discoveryInsights = buildDiscoveryInsights(profile, themes);
	const opportunities = buildOpportunityMap(suggestions, votesByCareerId);
	const marketReality = buildMarketReality(suggestions, votesByCareerId);
	const learningPathways = buildLearningPathways(themes);
	const stakeholderMessages = buildStakeholderMessages(themes, marketReality);
	const nextSteps = buildNextSteps(suggestions, votesByCareerId);

	return {
		themes,
		discoveryInsights,
		opportunities,
		marketReality,
		learningPathways,
		stakeholderMessages,
		nextSteps,
	};
}
