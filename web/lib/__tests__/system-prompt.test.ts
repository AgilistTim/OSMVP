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

		expect(content).toContain("# Off-Script Guide — System Prompt");
		expect(content).toContain("## Who You Are");
		expect(content).toContain("## Core Principles");
		expect(content).toContain("## Conversation Flow");
		expect(content).toContain("## Suggestion Style");
		expect(content).toContain("## Boundaries & Safety");
		expect(content).toContain("## Memory & Summaries");
		expect(content).toContain("## Tone Checklist (Hard Stops)");
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
