import type { ConversationPhase, ConversationRubric } from "@/lib/conversation-phases";

interface BuildRealtimeInstructionsInput {
	phase: ConversationPhase;
	rubric?: ConversationRubric | null;
	baseGuidance?: string[];
	seedTeaserCard?: boolean;
}

const PHASE_TIPS: Record<ConversationPhase, string> = {
	warmup:
		"Stay in warmup mode: keep the opener short, ask for their preferred name, then use a single open question like \"What's been keeping you busy when you're not in school or work?\". Deliver the greeting once and wait for the user to reply before continuing.",
	"story-mining":
		"Focus on story mining. Ask short, open follow-ups about what they build, notice, and struggle with. Avoid pitching ideas yet.",
	"pattern-mapping":
		"Start connecting threads they've shared. Reflect themes in their own language before offering ideas. Ask longer questions that link their interests and strengths.",
	"option-seeding":
		"Blend context with exploratory options. Offer career cards casually and invite reactions, always grounding each option in their words.",
	"commitment":
		"Help them pick experiments or next steps. Nudge them to choose a pathway and define a tiny action in the next week.",
};

export function buildRealtimeInstructions({
	phase,
	rubric,
	baseGuidance = [],
	seedTeaserCard = false,
}: BuildRealtimeInstructionsInput): string | undefined {
	const lines = [...baseGuidance.filter((line) => typeof line === "string" && line.trim().length > 0)];

	const phaseTip = PHASE_TIPS[phase];
	if (phaseTip) {
		lines.push(phaseTip);
	}

	if (rubric) {
		if (rubric.engagementStyle === "blocked") {
			lines.push("User energy seems low. Keep prompts lightweight and specific to coax a fresh detail.");
		}
		if (rubric.explicitIdeasRequest || rubric.readinessBias === "seeking-options") {
			lines.push("They are open to ideas - frame suggestions as experiments and ask what lands or misses.");
		}
		if (rubric.readinessBias === "deciding") {
			lines.push("They are edging toward a decision. Firm up their next steps using their own language.");
		}
	}

	if (seedTeaserCard) {
			lines.push(
				"Offer one quick teaser idea (adjacent or unexpected) and explicitly ask what's off about it to spark engagement."
			);
	}

	if (lines.length === 0) {
		return undefined;
	}

	return lines.join("\n\n");
}
