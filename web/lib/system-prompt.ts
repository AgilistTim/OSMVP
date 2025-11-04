import path from "node:path";
import { readFile } from "node:fs/promises";

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "prompts", "career-coach-system-prompt.md");

let cachedSystemPrompt: string | null = null;
let loadAttempted = false;
let lastLoggedPrompt: string | null = null;

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

export async function getSystemPrompt(): Promise<string | undefined> {
  if (cachedSystemPrompt !== null) {
    logPrompt(cachedSystemPrompt, { reason: "cache-hit" });
    return cachedSystemPrompt;
  }

  if (loadAttempted) {
    return undefined;
  }

  loadAttempted = true;

  try {
    const content = await readFile(SYSTEM_PROMPT_PATH, "utf8");
    cachedSystemPrompt = content.trim();
    if (cachedSystemPrompt) {
      logPrompt(cachedSystemPrompt, { reason: "loaded-from-disk" });
    }
    return cachedSystemPrompt;
  } catch (error) {
    console.error("[system-prompt] Failed to load prompt", error);
    return undefined;
  }
}

export function setSystemPromptForTesting(prompt: string | null) {
  cachedSystemPrompt = prompt;
  loadAttempted = false;
  lastLoggedPrompt = null;
  if (prompt !== null) {
    logPrompt(prompt, { reason: "test-override" });
  } else {
    console.info("[system-prompt] Prompt cache cleared for tests");
  }
}
