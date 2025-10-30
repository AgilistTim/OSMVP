import { describe, expect, it } from "vitest";
import type { ConversationTurn } from "@/components/session-provider";
import {
	inferRubricFromTranscript,
	recommendConversationPhase,
	type ConversationRubric,
	type InsightSnapshot,
	type PhaseContext,
} from "@/lib/conversation-phases";

const baseContext: Omit<PhaseContext, "currentPhase"> = {
	turns: [] as ConversationTurn[],
	insights: [] as InsightSnapshot[],
	suggestionCount: 0,
	voteCount: 0,
	rubric: null as ConversationRubric | null,
};

describe("conversation phase recommendation", () => {
	it("remains in warmup until the first user turn", () => {
		const decision = recommendConversationPhase({
			...baseContext,
			currentPhase: "warmup",
		});
		expect(decision.nextPhase).toBe("warmup");
		expect(decision.shouldSeedTeaserCard).toBe(false);
	});

	it("moves to story-mining after first user turn", () => {
		const decision = recommendConversationPhase({
			...baseContext,
			currentPhase: "warmup",
			turns: [{ role: "user", text: "Hi there" }],
		});
		expect(decision.nextPhase).toBe("story-mining");
	});

	it("stays in story-mining until core insights present", () => {
		const decision = recommendConversationPhase({
			...baseContext,
			currentPhase: "story-mining",
			turns: [
				{ role: "assistant", text: "Question" },
				{ role: "user", text: "Short reply" },
			],
			insights: [{ kind: "interest", value: "music" }],
		});
		expect(decision.nextPhase).toBe("story-mining");
	});

	it("promotes to pattern-mapping when insights cover interest and strength plus depth", () => {
		const decision = recommendConversationPhase({
			...baseContext,
			currentPhase: "story-mining",
			turns: [
				{ role: "assistant", text: "Tell me more" },
				{ role: "user", text: "I love mixing tracks and coding" },
				{ role: "assistant", text: "What do you want from it?" },
				{ role: "user", text: "Hoping to get people moving" },
				{ role: "assistant", text: "Anything getting in the way?" },
				{ role: "user", text: "Time is tight with college" },
			],
			insights: [
				{ kind: "interest", value: "music production" },
				{ kind: "strength", value: "coding lo-fi tools" },
				{ kind: "hope", value: "turn my hobby into gigs" },
				{ kind: "constraint", value: "balancing with college" },
			],
			rubric: {
				engagementStyle: "leaning-in",
				contextDepth: 2,
				energyLevel: "high",
				readinessBias: "exploring",
				explicitIdeasRequest: false,
				lastUpdatedAt: Date.now(),
			},
		});
		expect(decision.nextPhase).toBe("pattern-mapping");
	});

	it("seeds teaser card when engagement is blocked in story-mining", () => {
		const decision = recommendConversationPhase({
			...baseContext,
			currentPhase: "story-mining",
			turns: [
				{ role: "assistant", text: "Tell me about your thing" },
				{ role: "user", text: "Not sure" },
				{ role: "assistant", text: "What pulls you in?" },
				{ role: "user", text: "Nothing lately" },
				{ role: "assistant", text: "Okay, anything you're curious about?" },
				{ role: "user", text: "No idea" },
			],
			rubric: {
				engagementStyle: "blocked",
				contextDepth: 0,
				energyLevel: "low",
				readinessBias: "exploring",
				explicitIdeasRequest: false,
				lastUpdatedAt: Date.now(),
			},
		});
		expect(decision.nextPhase).toBe("story-mining");
		expect(decision.shouldSeedTeaserCard).toBe(true);
	});

	it("moves to option-seeding if user explicitly asks for ideas", () => {
		const decision = recommendConversationPhase({
			...baseContext,
			currentPhase: "pattern-mapping",
			turns: [
				{ role: "assistant", text: "Got it" },
				{ role: "user", text: "Any ideas I can try out?" },
				{ role: "assistant", text: "What's the goal here?" },
				{ role: "user", text: "Hope to get freelance work" },
				{ role: "assistant", text: "What's tough about that?" },
				{ role: "user", text: "No consistent clients yet" },
				{ role: "assistant", text: "What skill helps you?" },
				{ role: "user", text: "I'm great at prototyping fast" },
			],
			insights: [
				{ kind: "interest", value: "ai art" },
				{ kind: "strength", value: "prototyping fast" },
				{ kind: "constraint", value: "little budget" },
				{ kind: "hope", value: "build a freelance pipeline" },
			],
			rubric: {
				engagementStyle: "leaning-in",
				contextDepth: 2,
				energyLevel: "medium",
				readinessBias: "seeking-options",
				explicitIdeasRequest: true,
				lastUpdatedAt: Date.now(),
			},
		});
		expect(decision.nextPhase).toBe("option-seeding");
	});

	it("drops back to pattern-mapping if commitment stalls", () => {
		const decision = recommendConversationPhase({
			...baseContext,
			currentPhase: "commitment",
			voteCount: 0,
			rubric: {
				engagementStyle: "blocked",
				contextDepth: 1,
				energyLevel: "low",
				readinessBias: "exploring",
				explicitIdeasRequest: false,
				lastUpdatedAt: Date.now(),
			},
		});
		expect(decision.nextPhase).toBe("pattern-mapping");
	});
});

describe("rubric inference heuristics", () => {
	it("flags explicit idea requests", () => {
		const rubric = inferRubricFromTranscript([
			{ role: "assistant", text: "What are you exploring?" },
			{ role: "user", text: "Could you share some options or ideas?" },
		]);
		expect(rubric.explicitIdeasRequest).toBe(true);
		expect(rubric.readinessBias).toBe("seeking-options");
	});

	it("marks blocked when no user turns present", () => {
		const rubric = inferRubricFromTranscript([
			{ role: "assistant", text: "Tell me about your projects." },
		]);
		expect(rubric.engagementStyle).toBe("blocked");
		expect(rubric.energyLevel).toBe("low");
	});
});
