import path from "node:path";
import { readFile } from "node:fs/promises";

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "prompts", "career-coach-system-prompt.md");

let cachedSystemPrompt: string | null = null;
let loadAttempted = false;

export async function getSystemPrompt(): Promise<string | undefined> {
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
    return cachedSystemPrompt;
  } catch (error) {
    console.error("Failed to load system prompt", error);
    return undefined;
  }
}

export function setSystemPromptForTesting(prompt: string | null) {
  cachedSystemPrompt = prompt;
  loadAttempted = false;
}
