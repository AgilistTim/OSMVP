import { describe, expect, it } from "vitest";
import { matchCareerVibes } from "@/lib/vibe-matcher";

describe("matchCareerVibes", () => {
	it("matches gameplay tinkerer vibes from modding insights", () => {
		const suggestions = matchCareerVibes({
			insights: [
				{ kind: "interest", value: "modding our Minecraft server" },
				{ kind: "goal", value: "maybe run a mini event on the server" },
			],
		});

		expect(suggestions[0]?.id).toBe("gameplay-systems-tinkerer");
		expect(suggestions[0]?.careerAngles).toContain(
			"Gameplay tools designer – prototype mechanics, balance systems, and document player impact."
		);
	});

	it("matches AI ethics navigator when conversation centres on automation bias", () => {
		const suggestions = matchCareerVibes({
			insights: [
				{ kind: "interest", value: "AI ethics and automation impact on jobs" },
				{ kind: "goal", value: "help people understand AI bias" },
			],
		});

		expect(suggestions[0]?.id).toBe("ai-ethics-navigator");
		expect(suggestions[0]?.whyItFits.some((reason) => reason.includes("bias"))).toBe(true);
	});

	it("ignores loose matches when there is only a single vague keyword", () => {
		const suggestions = matchCareerVibes({
			insights: [{ kind: "interest", value: "Hanging out with friends after class" }],
		});

		expect(suggestions).toHaveLength(0);
	});

	it("falls back when no insights provided", () => {
		const suggestions = matchCareerVibes({ insights: [] });
		expect(suggestions).toHaveLength(0);
	});
});
