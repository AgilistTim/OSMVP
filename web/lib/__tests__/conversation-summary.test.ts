import { buildConversationSummary } from "@/lib/conversation-summary";
import type { ConversationTurn, Profile } from "@/components/session-provider";

const baseProfile: Profile = {
	readiness: "G2",
	demographics: {},
	insights: [],
	onboardingResponses: [],
	interests: [],
	strengths: [],
	constraints: [],
	goals: [],
	frustrations: [],
	hopes: [],
	boundaries: [],
	highlights: [],
	inferredAttributes: {
		skills: [],
		aptitudes: [],
		workStyles: [],
	},
	mutualMoments: [],
	activitySignals: [],
};

describe("buildConversationSummary", () => {
	it("captures themes, strengths, constraint, and closing clip", () => {
		const profile: Profile = {
			...baseProfile,
			insights: [
				{
					id: "1",
					kind: "interest",
					value: "community storytelling",
					source: "user",
					createdAt: Date.now() - 10,
					updatedAt: Date.now() - 10,
				},
				{
					id: "2",
					kind: "strength",
					value: "organising people fast",
					source: "user",
					createdAt: Date.now() - 5,
					updatedAt: Date.now() - 5,
				},
				{
					id: "3",
					kind: "constraint",
					value: "no spare cash for courses right now",
					source: "user",
					createdAt: Date.now() - 2,
					updatedAt: Date.now() - 2,
				},
			],
			strengths: ["bringing calm to chaos"],
			goals: ["launch a pilot programme in Leeds"],
			frustrations: ["limited adult support"],
		};

		const turns: ConversationTurn[] = [
			{ role: "assistant", text: "Let’s shape a journey you feel ownership of." },
			{ role: "user", text: "I want to build something that helps teens like me see a future." },
		];

		const summary = buildConversationSummary(profile, turns);

		expect(summary.paragraphs.length).toBeGreaterThan(0);
		expect(summary.themes).toContain("community storytelling");
		expect(summary.strengths).toContain("organising people fast");
		expect(summary.constraint).toBe("no spare cash for courses right now");
		expect(summary.closing).toMatch(/You wrapped by saying/);
	});

	it("handles sparse profiles without crashing", () => {
		const profile: Profile = {
			...baseProfile,
			interests: ["digital art"],
			hopes: ["find collaborative projects"],
		};
		const turns: ConversationTurn[] = [{ role: "assistant", text: "Tell me about your daydreams." }];

		const summary = buildConversationSummary(profile, turns);

		expect(summary.themes).toContain("digital art");
		expect(summary.strengths).toEqual([]);
		expect(summary.constraint).toBeNull();
		expect(summary.paragraphs.join(" ")).toContain(
			"Each move keeps you edging closer to find collaborative projects"
		);
	});

	it("clips long final user turns for the closing sentence", () => {
		const profile: Profile = { ...baseProfile };
		const turns: ConversationTurn[] = [
			{ role: "user", text: "A".repeat(200) },
			{ role: "assistant", text: "Got it." },
		];

		const summary = buildConversationSummary(profile, turns);

		expect(summary.closing).toMatch(/“A{137}…”/);
	});
});

