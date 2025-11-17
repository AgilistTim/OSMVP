import { describe, expect, it } from "vitest";
import type { ExplorationSnapshot } from "@/lib/exploration";
import type { CareerSuggestion, JourneyVisualAsset } from "@/components/session-provider";
import {
	buildSharedExplorationPayload,
	validateSharedExplorationPayload,
	MAX_SHARE_SUGGESTIONS,
	MAX_SHARE_PAYLOAD_BYTES,
	type SharedJourneyStats,
	type SharedSignalBuckets,
} from "@/lib/exploration-share";

const baseSnapshot: ExplorationSnapshot = {
	themes: [],
	discoveryInsights: [],
	opportunities: {
		directPaths: [],
		adjacentOpportunities: [],
		transferableSkills: [],
		innovationPotential: [],
	},
	marketReality: {
		salaryData: [],
		marketDemand: [],
		successStories: [],
	},
	learningPathways: [],
	stakeholderMessages: [],
	nextSteps: {
		immediate: [],
		shortTerm: [],
		mediumTerm: [],
	},
};

const baseStats: SharedJourneyStats = {
	insightsUnlocked: 4,
	pathwaysExplored: 6,
	pathsAmpedAbout: 2,
	boldMovesMade: 3,
};

const baseSignals: SharedSignalBuckets = {
	strengths: [{ label: "Focus", evidence: "You mentioned it" }],
	interests: [{ label: "Making things" }],
	goals: [{ label: "Start a studio" }],
};

const basePlan: JourneyVisualAsset["plan"] = {
	themeId: "test-theme",
	themeLabel: "Test Theme",
	imagePrompt: "Draw something inspiring.",
	caption: "A caption",
	highlights: ["Highlight one"],
	keywords: ["test"],
};

function buildSuggestion(id: number): CareerSuggestion {
	return {
		id: `suggestion-${id}`,
		title: `Suggestion ${id}`,
		summary: "Test summary",
		confidence: "medium",
		distance: "core",
		whyItFits: ["Because it resonates."],
		nextSteps: ["Write a plan"],
		microExperiments: [],
		careerAngles: [],
		neighborTerritories: [],
		externalLinks: [],
		score: 0.5,
	};
}

function buildPayloadInput(overrides: Partial<Parameters<typeof buildSharedExplorationPayload>[0]> = {}) {
	const suggestions = Array.from({ length: MAX_SHARE_SUGGESTIONS + 3 }).map((_, index) => buildSuggestion(index + 1));
	return {
		userName: "Alex",
		heroSummary: "You are exploring something new.",
		discoveryDate: "1 January 2025",
		sessionId: "session-1234",
		snapshot: baseSnapshot,
		stats: baseStats,
		topPathways: [
			{
				id: "one",
				title: "Path One",
				summary: "A neat summary",
				nextStep: "Do the thing",
			},
		],
		signalBuckets: baseSignals,
		summary: {
			themes: ["Making"],
			strengths: ["Focus"],
			constraint: null,
			whyItMatters: "Because it does.",
			callToAction: "Share it.",
			closing: "Keep going.",
		},
		learningResources: [],
		suggestions,
		votesByCareerId: { "suggestion-1": 1, "suggestion-2": 0, skip: undefined },
		journeyVisual: null,
		...overrides,
	};
}

describe("exploration-share helpers", () => {
	it("limits share suggestions and normalizes votes", () => {
		const payload = buildSharedExplorationPayload(buildPayloadInput());
		expect(payload.suggestions).toHaveLength(MAX_SHARE_SUGGESTIONS);
		expect(payload.votesByCareerId).toEqual({ "suggestion-1": 1, "suggestion-2": 0 });
	});

	it("rejects oversized payloads during validation", () => {
		const payload = buildSharedExplorationPayload(buildPayloadInput());
		const inflated = {
			...payload,
			heroSummary: "x".repeat(MAX_SHARE_PAYLOAD_BYTES),
		};
		expect(() => validateSharedExplorationPayload(JSON.parse(JSON.stringify(inflated)))).toThrow(/exceeds/i);
	});

	it("omits journey visuals without an image url", () => {
		const payload = buildSharedExplorationPayload(
			buildPayloadInput({
				journeyVisual: {
					imageBase64: "data",
					plan: basePlan,
					model: "gpt-image-1",
					createdAt: Date.now(),
					mimeType: "image/png",
				} as JourneyVisualAsset,
			})
		);
		expect(payload.journeyVisual).toBeNull();
	});

	it("retains journey visuals with an image url", () => {
		const payload = buildSharedExplorationPayload(
			buildPayloadInput({
				journeyVisual: {
					imageUrl: "https://example.com/visual.png",
					plan: basePlan,
					model: "gpt-image-1",
					createdAt: Date.now(),
					mimeType: "image/png",
				},
			})
		);
		expect(payload.journeyVisual?.imageUrl).toBe("https://example.com/visual.png");
		expect(payload.journeyVisual?.plan).toEqual(basePlan);
		expect(payload.journeyVisual?.imageBase64).toBeUndefined();
	});
});

