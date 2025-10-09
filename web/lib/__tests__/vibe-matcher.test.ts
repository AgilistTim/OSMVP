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

	it("falls back when no insights provided", () => {
		const suggestions = matchCareerVibes({ insights: [] });
		expect(suggestions[0]?.id).toBe("curious-explorer");
	});
});
