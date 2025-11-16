import { describe, expect, it } from "vitest";

import { formatHeroSummary } from "@/lib/exploration-language";

describe("formatHeroSummary", () => {
	it("references leading strengths and goals when both are available", () => {
		const summary = formatHeroSummary(
			[
				{ label: "teamwork and coordination" },
				{ label: "care and support" },
			],
			[
				{ label: "get paid for helping others" },
				{ label: "turn the AI tool into something that could help others" },
			],
			[]
		);

		expect(summary).toBe(
		"Leading with Teamwork and coordination and Care and support while you pursue Get paid for helping others and Turn the AI tool into something that could help others."
		);
	});

	it("falls back to goals when strengths are missing", () => {
		const summary = formatHeroSummary(
			[],
			[{ label: "launching an AI caregiving pilot" }],
			[]
		);

		expect(summary).toBe(
			"Focusing on Launching an AI caregiving pilot and mapping the moves to get there."
		);
	});

	it("falls back to themes when neither strengths nor goals exist", () => {
		const summary = formatHeroSummary([], [], [{ label: "ai care" }]);
		expect(summary).toBe("Exploring pathways around AI care.");
	});
});

