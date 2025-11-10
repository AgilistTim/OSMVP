import path from "node:path";
import { readFile } from "node:fs/promises";
import type { ConversationPhase } from "@/lib/conversation-phases";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
const SYSTEM_PROMPT_PATH = path.join(PROMPTS_DIR, "career-coach-system-prompt.md");
const PHASE_PROMPT_PATHS: Partial<Record<ConversationPhase, string>> = {
	"story-mining": path.join(PROMPTS_DIR, "career-coach-story-mining-addendum.md"),
};

let cachedSystemPrompt: string | null = null;
let loadAttempted = false;
let lastLoggedPrompt: string | null = null;
const phasePromptCache = new Map<ConversationPhase, string | null>();
const phasePromptAttempts = new Set<ConversationPhase>();

function logPrompt(prompt: string, context: { reason: string }) {
  if (prompt === lastLoggedPrompt) {
    return;
  }

  const preview = prompt.length > 160 ? `${prompt.slice(0, 160)}…` : prompt;
  console.info("[system-prompt] Updated", {
    reason: context.reason,
    length: prompt.length,
    preview,
  });
  console.debug("[system-prompt] Full prompt:\n" + prompt);
  lastLoggedPrompt = prompt;
}

async function ensureBasePrompt(): Promise<string | undefined> {
	if (cachedSystemPrompt !== null) {
		return cachedSystemPrompt;
	}

	if (loadAttempted) {
		return undefined;
	}

	loadAttempted = true;

	try {
		const content = await readFile(SYSTEM_PROMPT_PATH, "utf8");
		cachedSystemPrompt = content.trim();
		return cachedSystemPrompt ?? undefined;
	} catch (error) {
		console.error("[system-prompt] Failed to load prompt", error);
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

export async function getSystemPrompt(options?: { phase?: ConversationPhase }): Promise<string | undefined> {
	const basePrompt = await ensureBasePrompt();
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

	logPrompt(compositePrompt, { reason: options?.phase ? `phase:${options.phase}` : "base" });
	return compositePrompt;
}

export function setSystemPromptForTesting(prompt: string | null) {
	cachedSystemPrompt = prompt;
	loadAttempted = false;
	lastLoggedPrompt = null;
	phasePromptCache.clear();
	phasePromptAttempts.clear();
	if (prompt !== null) {
		logPrompt(prompt, { reason: "test-override" });
	} else {
		console.info("[system-prompt] Prompt cache cleared for tests");
	}
}
