import type { ConversationPhase, ConversationRubric } from "@/lib/conversation-phases";

interface BuildRealtimeInstructionsInput {
	phase: ConversationPhase;
	rubric?: ConversationRubric | null;
	baseGuidance?: string[];
	seedTeaserCard?: boolean;
	allowCardPrompt?: boolean;
	cardPromptTone?: "normal" | "fallback";
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
	allowCardPrompt = true,
	cardPromptTone = "normal",
}: BuildRealtimeInstructionsInput): string | undefined {
	const lines = [...baseGuidance.filter((line) => typeof line === "string" && line.trim().length > 0)];

	if (!lines.some((line) => line.toLowerCase().includes("british"))) {
		lines.push(
			"Keep every spoken and written response in natural British English—maintain the same UK accent and spelling throughout the conversation, even mid-response."
		);
	}

	if (!lines.some((line) => line.toLowerCase().includes("surface at least one specific skill"))) {
		lines.push(
			"Always surface at least one specific skill, strength, or habit you can infer from what they shared (even if they shrug it off). Anchor it to the behaviour you just heard and note where it already helps them or others."
		);
	}

	if (!lines.some((line) => line.toLowerCase().includes("downplay themselves"))) {
		lines.push(
			"If they downplay themselves with phrases like “not really” or “I just make it work”, respond by naming the skill you’re hearing (e.g. time management, reliability, patience) and ask for a concrete example or who benefits when they do it."
		);
	}

	const phaseTip = PHASE_TIPS[phase];
	if (phaseTip) {
		lines.push(phaseTip);
	}

	if (rubric) {
		const gapPrompts: Record<keyof ConversationRubric["insightCoverage"], string> = {
			interests: "Draw out what they tinker with or learn for fun so we can anchor ideas.",
			aptitudes: "Ask about strengths or skills they rely on when things go well.",
			goals: "Surface a hope or mission they want to move toward.",
			constraints: "Check for boundaries that would make an idea a non-starter.",
		};

		if (rubric.engagementStyle === "blocked") {
			lines.push("User energy seems low. Keep prompts lightweight and specific to coax a fresh detail.");
		}
		if (!rubric.insightCoverage.aptitudes) {
			lines.push(
				"We still owe them named strengths. Call out the practical skill you notice (balancing revision with caregiving, anchoring a defence, keeping plans moving) and ask where else it shows up so we can log it as a strength."
			);
		}
		if (rubric.explicitIdeasRequest || rubric.readinessBias === "seeking-options") {
			lines.push("They are open to ideas - frame suggestions as experiments and ask what lands or misses.");
		}
		if (rubric.readinessBias === "deciding") {
			lines.push("They are edging toward a decision. Firm up their next steps using their own language.");
		}

		const missingSignals = rubric.insightGaps ?? [];
		const promptLines = missingSignals
			.map((gap) => gapPrompts[gap])
			.filter(Boolean);

		if (!allowCardPrompt) {
			if (rubric.cardReadiness.status !== "ready") {
				if (promptLines.length > 0) {
					lines.push(
						"Hold off on ideas for now. Ask follow-ups like: " + promptLines.join(" ")
					);
				} else {
					lines.push("Keep building the story with concrete examples before floating options.");
				}
			} else {
				lines.push(
					"You have enough context for cards, but do not promise them this turn. Stay curious and deepen the thread before the next idea drop."
				);
			}
		} else if (cardPromptTone === "fallback" && rubric.cardReadiness.status !== "ready") {
			lines.push(
				"Context is still thin, so frame these cards as rough starting points to spark the conversation. Say they're early sketches and invite the user to help refine them."
			);
			if (promptLines.length > 0) {
				lines.push(
					"After sharing, name the gaps you're still chasing (" +
					promptLines.join(" ") +
					") and ask for concrete examples so the next batch can sharpen."
				);
			} else {
				lines.push(
					"Invite them to spell out a recent example so you can tighten the follow-up cards."
				);
			}
			lines.push(
				"Do NOT enumerate the individual card titles or explain each one in the transcript. Instead, preview why the cards might be useful and point them to the details."
			);
			lines.push(
				"When you preview the ideas, structure the response as a tight list (e.g., start each line with 🔹 or —) instead of a single dense paragraph so it's easy to scan."
			);
			lines.push(
				"Keep the spoken response short—highlight the hunch behind the cards, then ask what lands or what feels off so you can iterate."
			);
			lines.push(
				"Anchor each idea in the little context you do have (like their stated interests) and avoid hyper-specific job titles until they provide more signal."
			);
			lines.push(
				"Close by telling them you can pull a sharper set once they share more specifics or reactions."
			);
		} else if (rubric.cardReadiness.status === "ready") {
			lines.push(
				"You now have enough context to surface three pathways via the career cards: a core fit, an adjacent remix, and a stretch/experimental idea. Point out that the cards just popped in rather than listing each option in your message."
			);
			lines.push(
				"Do NOT enumerate the individual card titles or explain each one in the transcript. Instead, briefly preview why they matter (one sentence) and invite the user to check the cards."
			);
			lines.push(
				"Lay out the preview as a short bullet-style list (use 🔹, 🔸, or em dashes) so multiple ideas don't blur into one block."
			);
			lines.push(
				"Keep the spoken response tight—set up why the cards matter, invite reactions, and let the detailed copy live in the cards themselves."
			);
			lines.push(
				"Keep each suggestion grounded in routes they could test within the next few months; skip hyper-niche titles unless they named them."
			);
			lines.push(
				"Close by telling them they can ask for more idea cards if these miss the mark or if they want to explore a different angle."
			);
		} else {
			if (promptLines.length > 0) {
				lines.push(
					"Hold off on ideas for now. Ask follow-ups like: " + promptLines.join(" ")
				);
			} else {
				lines.push("Keep building the story with concrete examples before floating options.");
			}
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
