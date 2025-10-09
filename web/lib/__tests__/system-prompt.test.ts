import { describe, expect, it, beforeEach } from "vitest";
import { getSystemPrompt, setSystemPromptForTesting } from "@/lib/system-prompt";

describe("system prompt", () => {
	beforeEach(() => {
		setSystemPromptForTesting(null);
	});

	it("loads the off-script guide prompt with core sections", async () => {
		const prompt = await getSystemPrompt();
		expect(prompt).toBeDefined();
		const content = prompt ?? "";

		expect(content).toContain("# Off-Script Conversational AI Agent System Prompt");
		expect(content).toContain("## Core Identity & Mission");
		expect(content).toContain("## Critical Communication Principles");
		expect(content).toContain("## Conversation Flow Guidelines");
		expect(content).toContain("## Transition to Exploration Suggestions");
		expect(content).toContain("## Presenting Opportunities");
		expect(content).toContain("## Language & Tone Guidelines");
		expect(content).toContain("## Boundaries & Safety");
		expect(content).toContain("## Memory & Summaries");
		expect(content).toContain("## Success Indicators");
	});

	it("emphasises mutual exchange and transparency", async () => {
		const prompt = await getSystemPrompt();
		expect(prompt).toBeTruthy();
		const content = prompt ?? "";

		expect(content).toMatch(/Mutual exchange/i);
		expect(content).toMatch(/Share small pieces of your own experience/i);
		expect(content).toMatch(/Stay transparent/i);
		expect(content).toMatch(/flag it/i);
		expect(content).toMatch(/possible career lane/i);
	});

	it("removes legacy five-phase framing and corporate wording cues", async () => {
		const prompt = await getSystemPrompt();
		expect(prompt).toBeTruthy();
		const content = prompt ?? "";

		expect(content).not.toMatch(/Phase\s*\d/i);
		expect(content).not.toMatch(/Five-Phase Journey/i);
		expect(content).not.toMatch(/career report/i);
		expect(content).not.toMatch(/professional career coach/i);
	});
});
