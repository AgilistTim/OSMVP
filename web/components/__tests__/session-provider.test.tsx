import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionProvider, useSession } from "@/components/session-provider";

const wrapper = ({ children }: { children: React.ReactNode }) => (
	<SessionProvider>{children}</SessionProvider>
);

describe("SessionProvider conversational state", () => {
	it("stores insights using user phrasing without relabelling", () => {
		const { result } = renderHook(() => useSession(), { wrapper });

		act(() => {
			result.current.appendProfileInsights([
				{
					kind: "frustration",
					value: "group projects where no-one commits",
					source: "user",
				},
				{
					kind: "hope",
					value: "want to take my streetwear edits into pop-ups",
					source: "user",
				},
			]);
		});

		expect(result.current.profile.frustrations).toContain(
			"group projects where no-one commits"
		);
		expect(result.current.profile.hopes).toContain(
			"want to take my streetwear edits into pop-ups"
		);
		expect(result.current.profile.insights).toHaveLength(2);
	});

	it("allows editing and removing insights while keeping aggregates fresh", () => {
		const { result } = renderHook(() => useSession(), { wrapper });

		act(() => {
			result.current.appendProfileInsights([
				{
					id: "abc",
					kind: "boundary",
					value: "no all-night shifts thanks",
					source: "user",
				},
			]);
		});

		const insightId = result.current.profile.insights[0]?.id ?? "";
		expect(insightId).toBeTruthy();

		act(() => {
			result.current.updateProfileInsight(insightId, {
				value: "need gigs that don’t kill my sleep",
			});
		});

		expect(result.current.profile.boundaries).toContain("need gigs that don’t kill my sleep");

		act(() => {
			result.current.removeProfileInsight(insightId);
		});

		expect(result.current.profile.insights).toHaveLength(0);
		expect(result.current.profile.boundaries).toHaveLength(0);
	});

	it("records mutual moments when the guide shares something personal", () => {
		const { result } = renderHook(() => useSession(), { wrapper });

		act(() => {
			result.current.addMutualMoment("I’ve been tinkering with game mods too lately.");
			result.current.addMutualMoment("I’ve been tinkering with game mods too lately."); // duplicate
		});

		expect(result.current.profile.mutualMoments).toHaveLength(1);
		expect(result.current.profile.mutualMoments[0]?.text).toBe(
			"I’ve been tinkering with game mods too lately."
		);
	});

	it("resets profile back to an empty state", () => {
		const { result } = renderHook(() => useSession(), { wrapper });

		act(() => {
			result.current.appendProfileInsights([
				{ kind: "interest", value: "late-night beat sessions", source: "user" },
			]);
			result.current.addMutualMoment("I’m always up too late mixing tracks.");
			result.current.resetProfile();
		});

		expect(result.current.profile.insights).toHaveLength(0);
		expect(result.current.profile.interests).toHaveLength(0);
		expect(result.current.profile.mutualMoments).toHaveLength(0);
	});

	it("stores suggestions for later phases", () => {
		const { result } = renderHook(() => useSession(), { wrapper });

		act(() => {
		result.current.setSuggestions([
			{
				id: "gameplay-systems-tinkerer",
				title: "Gameplay Systems Tinkerer",
				summary: "Turning mod nights into real-world game systems experience.",
				careerAngles: ["Gameplay tools designer – prototype mechanics, balance systems, and document player impact."],
				nextSteps: ["Ship a micro-mod with a change log explaining what you tweaked and why."],
				whyItFits: ["You mentioned modding with friends, which lines up with gameplay prototyping."],
				confidence: "high",
				score: 4,
				neighborTerritories: ["Live ops experimentation for collaborative games"],
				distance: "core",
			},
		]);
	});

		expect(result.current.suggestions).toHaveLength(1);
		expect(result.current.suggestions[0]?.id).toBe("gameplay-systems-tinkerer");

		act(() => {
			result.current.clearSuggestions();
		});

		expect(result.current.suggestions).toHaveLength(0);
	});
});
