import OpenAI from "openai";

export interface SummaryMetrics {
	insightsUnlocked?: number;
	pathwaysExplored?: number;
	pathsAmpedAbout?: number;
	boldMovesMade?: number;
}

export interface SummaryPathway {
	title: string;
	summary: string;
	nextStep?: string | null;
}

export interface SummaryStrength {
	label: string;
	evidence?: string | null;
}

export interface SummaryRequestPayload {
	userName: string;
	themes?: string[];
	goals?: string[];
	strengths?: SummaryStrength[];
	constraint?: string | null;
	metrics?: SummaryMetrics;
	topPathways?: SummaryPathway[];
	anchorQuotes?: string[];
	notes?: string[];
}

export interface GeneratedSummary {
	themes: string[];
	strengths: string[];
	constraint: string | null;
	whyItMatters: string;
	callToAction?: string | null;
	closing: string;
}

export const SUMMARY_SYSTEM_PROMPT = `You are MirAI, a UK youth career guide. Craft concise, human summaries that a mentor,
teacher, or friend could read. Clarify vague phrases (e.g. "AI tools to help him") by
stating who/what/why using the context. Avoid repeating the user's exact wording.

Output JSON with keys:
- themes: array of up to 3 short phrases (≤70 characters) naming the main focus areas.
- strengths: array of up to 3 short phrases highlighting abilities or habits.
- constraint: short phrase capturing the main tension or competing priority (or null).
- whyItMatters: one sentence (≤160 characters) connecting strengths, themes, and constraint.
- callToAction: optional sentence (≤160 characters) suggesting a next step (or null).
- closing: MirAI-style closing sentence (≤140 characters) reinforcing encouragement.

Use British English. Keep tone direct, positive, grounded.`;

export async function generateExplorationSummary(
	payload: SummaryRequestPayload,
	{
		apiKey = process.env.OPENAI_API_KEY,
		model = process.env.OPENAI_MODEL ?? "o4-mini",
		temperature,
	}: {
		apiKey?: string;
		model?: string;
		temperature?: number;
	} = {}
): Promise<GeneratedSummary> {
	if (!apiKey) {
		throw new Error("OPENAI_API_KEY is not configured");
	}

	const openai = new OpenAI({ apiKey });

	const userPrompt = `Context JSON:
${JSON.stringify(payload, null, 2)}

Respond with a single JSON object matching the schema described above. Do not include extra text.`;

	const completion = await openai.chat.completions.create({
		model,
		messages: [
			{ role: "system", content: SUMMARY_SYSTEM_PROMPT },
			{ role: "user", content: userPrompt },
		],
		...(typeof temperature === "number" ? { temperature } : {}),
	});

	const content = completion.choices[0]?.message?.content?.trim();
	if (!content) {
		throw new Error("No content returned from model");
	}

	try {
		return JSON.parse(content) as GeneratedSummary;
	} catch (error) {
		throw new Error("Model returned non-JSON content");
	}
}

