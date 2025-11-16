import { describe, expect, it } from "vitest";

import { parseGeneratedSummaryContent } from "../exploration-summary-engine";

const baseSummary = {
	themes: ["AI-enabled care"],
	strengths: ["Organised teamwork"],
	constraint: "Balancing exam revision",
	whyItMatters:
		"Your organised care projects show you can scale impact alongside exams.",
	callToAction: "Pair with a mentor to scope the next pilot.",
	closing: "Keep building steadily—you’re on the right track.",
};

describe("parseGeneratedSummaryContent", () => {
	it("returns the summary when JSON is already clean", () => {
		const result = parseGeneratedSummaryContent(JSON.stringify(baseSummary));
		expect(result).toEqual(baseSummary);
	});

	it("extracts JSON from within code fences", () => {
		const fenced = [
			"```json",
			JSON.stringify(baseSummary, null, 2),
			"```",
		].join("\n");

		const result = parseGeneratedSummaryContent(fenced);
		expect(result).toEqual(baseSummary);
	});

	it("handles JSON nested inside a wrapper object", () => {
		const wrapped = JSON.stringify({ summary: baseSummary });
		const result = parseGeneratedSummaryContent(wrapped);
		expect(result).toEqual(baseSummary);
	});
});

