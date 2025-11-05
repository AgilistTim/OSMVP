import { describe, expect, it } from "vitest";
import { hasRequiredInsightMix, summarizeAttributeSignals } from "@/lib/suggestion-guards";
import type { InsightKind } from "@/components/session-provider";

const insight = (kind: InsightKind) => ({ kind });

describe("hasRequiredInsightMix", () => {
	it("returns true when interest, strength, and goal present", () => {
		const result = hasRequiredInsightMix([
			insight("interest"),
			insight("strength"),
			insight("goal"),
		]);
		expect(result).toBe(true);
	});

	it("returns true when hope replaces goal", () => {
		const result = hasRequiredInsightMix([
			insight("interest"),
			insight("strength"),
			insight("hope"),
		]);
		expect(result).toBe(true);
	});

	it("returns false when missing strength", () => {
		const result = hasRequiredInsightMix([
			insight("interest"),
			insight("goal"),
		]);
		expect(result).toBe(false);
	});

	it("returns false when missing goal or hope", () => {
		const result = hasRequiredInsightMix([
			insight("interest"),
			insight("strength"),
		]);
		expect(result).toBe(false);
	});
});

describe("summarizeAttributeSignals", () => {
	it("counts established, developing, and hobby signals", () => {
		const summary = summarizeAttributeSignals({
			skills: [
				{ label: "Cooking", stage: "hobby" },
				{ label: "Project management", stage: "established" },
			],
			aptitudes: [{ label: "Facilitation", stage: "developing" }],
			workStyles: [],
		});

		expect(summary.careerSignalCount).toBe(1);
		expect(summary.developingSignalCount).toBe(1);
		expect(summary.hobbySignalCount).toBe(1);
		expect(summary.primaryHobbyLabel).toBe("Cooking");
	});

	it("handles empty snapshots", () => {
		const summary = summarizeAttributeSignals({ skills: [], aptitudes: [], workStyles: [] });
		expect(summary.careerSignalCount).toBe(0);
		expect(summary.developingSignalCount).toBe(0);
		expect(summary.hobbySignalCount).toBe(0);
		expect(summary.primaryHobbyLabel).toBeUndefined();
	});
});
