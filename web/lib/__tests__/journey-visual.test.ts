import { describe, expect, it } from "vitest";
import { buildJourneyVisualPlan, type JourneyVisualContext } from "@/lib/journey-visual";

function createContext(partial?: Partial<JourneyVisualContext>): JourneyVisualContext {
	const baseProfile: JourneyVisualContext["profile"] = {
		insights: [],
		inferredAttributes: {
			skills: [],
			aptitudes: [],
			workStyles: [],
		},
		goals: [],
		hopes: [],
		highlights: [],
		mutualMoments: [],
		interests: [],
		strengths: [],
		readiness: "G1",
		activitySignals: [],
	};
	const profile = {
		...baseProfile,
		...partial?.profile,
		inferredAttributes: {
			skills: partial?.profile?.inferredAttributes?.skills ?? [],
			aptitudes: partial?.profile?.inferredAttributes?.aptitudes ?? [],
			workStyles: partial?.profile?.inferredAttributes?.workStyles ?? [],
		},
	} as JourneyVisualContext["profile"];

	return {
		sessionId: partial?.sessionId ?? "test-session",
		profile,
		suggestions: partial?.suggestions ?? [],
		votes: partial?.votes ?? {},
		snapshot: {
			themes: partial?.snapshot?.themes ?? [],
			discoveryInsights: partial?.snapshot?.discoveryInsights ?? [],
		},
	};
}

describe("buildJourneyVisualPlan", () => {
	it("selects sports theme when sports keywords are present", () => {
		const context = createContext({
			profile: {
				insights: [{ kind: "interest", value: "Rugby league midfielder", source: "user", createdAt: 0, updatedAt: 0, id: "1" }],
				inferredAttributes: { skills: [], aptitudes: [], workStyles: [] },
				goals: [],
				hopes: [],
				highlights: [],
				mutualMoments: [],
				interests: ["Rugby"],
				strengths: [],
				readiness: "G1",
			},
			suggestions: [
				{
					id: "card-1",
					title: "Sports Analytics Assistant",
					summary: "Support analysts with match insights.",
					distance: "core",
					whyItFits: ["You love rugby"],
					nextSteps: [],
					microExperiments: [],
				},
			],
			votes: { "card-1": 1 },
		});

		const plan = buildJourneyVisualPlan(context);
		expect(plan.themeId).toBe("sports-playbook");
		expect(plan.caption).toContain("Rugby");
		expect(plan.highlights.some((line) => line.includes("Path"))).toBe(true);
	});

	it("falls back to exploration trail when no specific theme matches", () => {
		const context = createContext({
			profile: {
				insights: [{ kind: "interest", value: "Exploring different ideas", source: "user", createdAt: 0, updatedAt: 0, id: "2" }],
				inferredAttributes: { skills: [], aptitudes: [], workStyles: [] },
				goals: ["Launch a community project"],
				hopes: [],
				highlights: [],
				mutualMoments: [],
				interests: ["Community building"],
				strengths: ["Curiosity"],
				readiness: "G1",
			},
			suggestions: [],
			votes: {},
		});

		const plan = buildJourneyVisualPlan(context);
		expect(plan.themeId).toBe("adventure-trail");
		expect(plan.caption).toContain("Community building");
	});
});
