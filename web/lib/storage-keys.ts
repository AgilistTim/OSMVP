export const STORAGE_KEYS = {
	votes: "osmvp_votes",
	suggestions: "osmvp_suggestions",
	sessionStarted: "osmvp_session_started",
	lastInsightCount: "osmvp_last_insight_count",
	shownSuggestionIds: "osmvp_shown_suggestion_ids",
	chatMode: "osmvp_chat_mode",
	conversationSummary: "osmvp_conversation_summary",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

