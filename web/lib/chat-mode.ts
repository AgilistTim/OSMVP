export type ChatMode = "voice" | "text";

export const DEFAULT_CHAT_MODE: ChatMode = "voice";

export const CHAT_MODES: ChatMode[] = ["voice", "text"];

export function isChatMode(value: unknown): value is ChatMode {
	return value === "voice" || value === "text";
}

