import { describe, expect, it } from "vitest";
import { summariseTranscript } from "@/app/api/suggestions/transcript";

describe("summariseTranscript", () => {
	it("joins turns with a single newline and trims whitespace", () => {
		const result = summariseTranscript([
			{ role: " user ", text: "  First message " },
			{ role: "assistant", text: "\tSecond reply\t" },
		]);

		expect(result).toBe("user: First message\nassistant: Second reply");
	});

	it("omits entries with empty roles or text", () => {
		const result = summariseTranscript([
			{ role: "user", text: "   " },
			{ role: "", text: "Missing role" },
			// @ts-expect-error testing resilience to malformed entries
			{ role: "assistant" },
		]);

		expect(result).toBe("");
	});
});

