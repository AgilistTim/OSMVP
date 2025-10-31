import { describe, expect, it } from "vitest";
import { appendUnique } from "@/lib/utils";

describe("appendUnique", () => {
	it("preserves existing order while appending new unique values", () => {
		const initial = ["a", "b", "c"];
		const result = appendUnique(initial, ["c", "d", "e"]);
		expect(result).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("returns the same array when incoming items already exist", () => {
		const initial = ["card-1", "card-2"];
		const result = appendUnique(initial, ["card-1", "card-2"]);
		expect(result).toEqual(["card-1", "card-2"]);
	});

	it("handles empty incoming arrays gracefully", () => {
		const initial = ["baseline-1"];
		const result = appendUnique(initial, []);
		expect(result).toEqual(["baseline-1"]);
	});
});
