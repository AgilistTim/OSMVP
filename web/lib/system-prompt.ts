import path from "node:path";
import { readFile } from "node:fs/promises";
import type { ConversationPhase } from "@/lib/conversation-phases";
import { CHAT_MODES, DEFAULT_CHAT_MODE, type ChatMode } from "@/lib/chat-mode";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
const MODE_PROMPT_PATHS: Record<ChatMode, string> = {
	voice: path.join(PROMPTS_DIR, "career-coach-system-prompt.md"),
	text: path.join(PROMPTS_DIR, "career-coach-system-prompt.text.md"),
};
const PHASE_PROMPT_PATHS: Partial<Record<ConversationPhase, string>> = {
	"story-mining": path.join(PROMPTS_DIR, "career-coach-story-mining-addendum.md"),
};

const promptCache: Record<
	ChatMode,
	{
		content: string | null;
		loadAttempted: boolean;
		lastLoggedPrompt: string | null;
	}
> = CHAT_MODES.reduce(
	(acc, mode) => ({
		...acc,
		[mode]: { content: null, loadAttempted: false, lastLoggedPrompt: null },
	}),
	{} as Record<ChatMode, { content: string | null; loadAttempted: boolean; lastLoggedPrompt: string | null }>
);

const phasePromptCache = new Map<ConversationPhase, string | null>();
const phasePromptAttempts = new Set<ConversationPhase>();

function logPrompt(prompt: string, context: { reason: string; mode: ChatMode }) {
	const cache = promptCache[context.mode];
	if (prompt === cache.lastLoggedPrompt) {
		return;
	}

	const preview = prompt.length > 160 ? `${prompt.slice(0, 160)}…` : prompt;
	console.info("[system-prompt] Updated", {
		mode: context.mode,
		reason: context.reason,
		length: prompt.length,
		preview,
	});
	console.debug("[system-prompt] Full prompt:\n" + prompt);
	cache.lastLoggedPrompt = prompt;
}

async function ensureBasePrompt(mode: ChatMode): Promise<string | undefined> {
	const cache = promptCache[mode];
	if (cache.content !== null) {
		return cache.content;
	}

	if (cache.loadAttempted) {
		return undefined;
	}

	cache.loadAttempted = true;

	try {
		const filePath = MODE_PROMPT_PATHS[mode];
		const content = await readFile(filePath, "utf8");
		cache.content = content.trim();
		return cache.content ?? undefined;
	} catch (error) {
		console.error(`[system-prompt] Failed to load ${mode} prompt`, error);
		return undefined;
	}
}

async function loadPhasePrompt(phase: ConversationPhase): Promise<string | undefined> {
	if (phasePromptCache.has(phase)) {
		return phasePromptCache.get(phase) ?? undefined;
	}

	if (phasePromptAttempts.has(phase)) {
		return undefined;
	}

	const filePath = PHASE_PROMPT_PATHS[phase];
	if (!filePath) {
		phasePromptAttempts.add(phase);
		phasePromptCache.set(phase, null);
		return undefined;
	}

	try {
		const content = await readFile(filePath, "utf8");
		const trimmed = content.trim();
		phasePromptCache.set(phase, trimmed.length > 0 ? trimmed : null);
		return trimmed.length > 0 ? trimmed : undefined;
	} catch (error) {
		console.error(`[system-prompt] Failed to load ${phase} prompt`, error);
		phasePromptAttempts.add(phase);
		phasePromptCache.set(phase, null);
		return undefined;
	}
}

export async function getSystemPrompt(options?: {
	phase?: ConversationPhase;
	mode?: ChatMode;
}): Promise<string | undefined> {
	const mode = options?.mode ?? DEFAULT_CHAT_MODE;
	const basePrompt = await ensureBasePrompt(mode);
	if (!basePrompt) {
		return undefined;
	}

	let compositePrompt = basePrompt;

	if (options?.phase) {
		const phasePrompt = await loadPhasePrompt(options.phase);
		if (phasePrompt) {
			compositePrompt = `${compositePrompt}\n\n${phasePrompt}`.trim();
		}
	}

	const reasonParts: string[] = [];
	if (options?.phase) {
		reasonParts.push(`phase:${options.phase}`);
	}
	reasonParts.push(`mode:${mode}`);

	logPrompt(compositePrompt, {
		mode,
		reason: reasonParts.join("|"),
	});
	return compositePrompt;
}

export function setSystemPromptForTesting(prompt: string | null, options?: { mode?: ChatMode }) {
	const modes: ChatMode[] = options?.mode ? [options.mode] : CHAT_MODES;
	for (const mode of modes) {
		promptCache[mode].content = prompt;
		promptCache[mode].loadAttempted = prompt !== null;
		promptCache[mode].lastLoggedPrompt = null;
	}
	phasePromptCache.clear();
	phasePromptAttempts.clear();
	if (prompt !== null && options?.mode) {
		logPrompt(prompt, { reason: "test-override", mode: options.mode });
	} else if (prompt !== null) {
		console.info("[system-prompt] Prompt cache primed for tests across all modes");
	} else {
		console.info("[system-prompt] Prompt cache cleared for tests");
	}
}
