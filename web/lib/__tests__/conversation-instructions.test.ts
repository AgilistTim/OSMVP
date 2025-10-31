import { describe, expect, it } from "vitest";
import { buildRealtimeInstructions } from "@/lib/conversation-instructions";
import type { ConversationRubric } from "@/lib/conversation-phases";

function mockRubric(overrides: Partial<ConversationRubric>): ConversationRubric {
	return {
		engagementStyle: "leaning-in",
		contextDepth: 2,
		energyLevel: "medium",
		readinessBias: "exploring",
		explicitIdeasRequest: false,
		insightCoverage: {
			interests: true,
			aptitudes: true,
			goals: true,
			constraints: false,
		},
		insightGaps: [],
		cardReadiness: {
			status: "ready",
			missingSignals: [],
		},
		recommendedFocus: "pattern",
		lastUpdatedAt: Date.now(),
		...overrides,
	};
}

describe("buildRealtimeInstructions", () => {
	it("asks for missing context when card readiness is context-light", () => {
		const rubric = mockRubric({
			cardReadiness: {
				status: "context-light",
				missingSignals: ["aptitudes", "goals"],
			},
			insightGaps: ["aptitudes", "goals"],
		});

		const instructions = buildRealtimeInstructions({
			phase: "story-mining",
			rubric,
		});

		expect(instructions).toBeDefined();
		expect(instructions).toContain("Hold off on ideas for now");
		expect(instructions).toContain("Ask follow-ups");
	});

	it("nudges toward a three-lane idea mix when ready", () => {
		const rubric = mockRubric({
			cardReadiness: { status: "ready", missingSignals: [] },
			insightGaps: [],
			readinessBias: "seeking-options",
			explicitIdeasRequest: true,
		});

		const instructions = buildRealtimeInstructions({
			phase: "option-seeding",
			rubric,
		});

		expect(instructions).toBeDefined();
		expect(instructions).toContain("introduce three pathways");
		expect(instructions).toContain("core fit");
		expect(instructions).toContain("Keep each suggestion grounded");
	});

	it("adds teaser guidance when requested", () => {
		const rubric = mockRubric({
			cardReadiness: { status: "ready", missingSignals: [] },
		});

		const instructions = buildRealtimeInstructions({
			phase: "pattern-mapping",
			rubric,
			seedTeaserCard: true,
		});

		expect(instructions).toContain("Offer one quick teaser idea");
	});
});
