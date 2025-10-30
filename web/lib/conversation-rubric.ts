import type { ConversationRubric, InsightSnapshot } from "@/lib/conversation-phases";
import type { ConversationTurn } from "@/components/session-provider";

export interface RubricEvaluationRequestBody {
	turns: ConversationTurn[];
	insights: InsightSnapshot[];
	suggestions: Array<{ id: string; title: string }>;
	votes: Record<string, 1 | 0 | -1 | null | undefined>;
}

export interface RubricEvaluationResponseBody {
	rubric: ConversationRubric;
	reasoning?: string[];
}

export function sanitizeTurns(turns: ConversationTurn[], limit = 12): ConversationTurn[] {
	const recent = turns.slice(-limit);
	return recent.map((turn) => ({
		role: turn.role,
		text: turn.text.trim(),
	}));
}
