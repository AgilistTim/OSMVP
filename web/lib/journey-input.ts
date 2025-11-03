import type { JourneyInput } from "@/lib/journey-page";
import type { ConversationTurn, Profile } from "@/components/session-provider";
import type { CareerSuggestion } from "@/components/session-provider";
import { deriveThemes } from "@/lib/exploration";

type Votes = Record<string, 1 | 0 | -1 | undefined>;

interface SessionSnapshot {
	profile: Profile;
	suggestions: CareerSuggestion[];
	votesByCareerId: Votes;
	turns: ConversationTurn[];
}

export function buildJourneyInputFromSession({
	profile,
	suggestions,
	votesByCareerId,
	turns,
}: SessionSnapshot): JourneyInput {
	const openingStatement = extractOpeningStatement(turns) ??
		profile.onboardingResponses[0]?.freeText ??
		profile.interests[0] ??
		"I’m exploring what to do next.";

	const totalInsights = profile.insights.length;
	const totalCardsGenerated = suggestions.length;
	const turningPoints = buildTurningPoints(profile);
	const mapData = buildMapData(profile, turns);
	const savedPaths = buildSavedPaths(suggestions, votesByCareerId);

	return {
		user_name: extractUserName(profile),
		conversation_data: {
			opening_statement: openingStatement,
			total_insights: totalInsights,
			total_cards_generated: totalCardsGenerated,
			turning_points: turningPoints,
			map_generation_data: mapData,
		},
		voting_data: {
			saved: savedPaths,
		},
	};
}

function extractUserName(profile: Profile): string {
	const name = typeof profile.demographics?.name === "string" ? profile.demographics.name.trim() : "";
	if (name.length > 0) {
		return name;
	}
	return profile.demographics?.preferred_name && typeof profile.demographics.preferred_name === "string"
		? profile.demographics.preferred_name
		: "Your";
}

function extractOpeningStatement(turns: ConversationTurn[]): string | null {
	const firstUserTurn = turns.find((turn) => turn.role === "user");
	return firstUserTurn?.text?.trim() ?? null;
}

function buildTurningPoints(profile: Profile): string[] {
	const points = new Set<string>();
	[profile.goals, profile.hopes, profile.highlights]
		.flat()
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.forEach((item) => points.add(item.trim()));

	profile.mutualMoments
		.slice(0, 2)
		.forEach((moment) => {
			if (moment.text.trim().length > 0) {
				points.add(moment.text.trim());
			}
		});

	return Array.from(points).slice(0, 4);
}

function buildMapData(profile: Profile, turns: ConversationTurn[]): JourneyInput["conversation_data"]["map_generation_data"] {
	const themes = deriveThemes(profile)
		.filter((theme) => Boolean(theme.label))
		.map((theme) => theme.label.trim())
		.slice(0, 3);

	const startPoint = profile.interests.find((interest) => interest.trim().length > 0) ??
		profile.insights.find((insight) => insight.kind === "interest")?.value ??
		extractOpeningStatement(turns) ??
		"Curiosity Basecamp";

	const landmarks = buildLandmarks(profile, themes);

	return {
		start_point: startPoint,
		themes: themes.length > 0 ? themes : ["Emerging Sparks"],
		landmarks,
	};
}

function buildLandmarks(profile: Profile, themes: string[]): string[] {
	const landmarks = new Set<string>();

	profile.strengths
		.filter((item) => item.trim().length > 0)
		.slice(0, 2)
		.forEach((item) => landmarks.add(item.trim()));

	profile.hopes
		.filter((item) => item.trim().length > 0)
		.slice(0, 2)
		.forEach((item) => landmarks.add(item.trim()));

	profile.highlights
		.filter((item) => item.trim().length > 0)
		.slice(0, 2)
		.forEach((item) => landmarks.add(item.trim()));

	if (landmarks.size < 3) {
		themes.slice(0, 2).forEach((theme) => landmarks.add(`${theme} Hub`));
	}

	return Array.from(landmarks).slice(0, 3);
}

function buildSavedPaths(suggestions: CareerSuggestion[], votesByCareerId: Votes): JourneyInput["voting_data"]["saved"] {
	const saved: JourneyInput["voting_data"]["saved"] = [];
	const seen = new Set<string>();

	suggestions.forEach((suggestion) => {
		if (votesByCareerId[suggestion.id] === 1 && !seen.has(suggestion.title)) {
			seen.add(suggestion.title);
			saved.push({
				title: suggestion.title,
				why_it_fits: suggestion.whyItFits[0] ?? suggestion.summary,
			});
		}
	});

	return saved.slice(0, 3);
}
