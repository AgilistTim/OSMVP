import OpenAI from "openai";
import type { VibeSuggestion } from "@/lib/vibe-matcher";

interface PersonaliseSuggestionsInput {
	suggestions: VibeSuggestion[];
	insights: Array<{ kind: string; value: string }>;
}

interface PersonalisedSuggestionPayload {
	id: string;
	summary?: string;
	careerAngles?: string[];
	nextSteps?: string[];
	whyItFits?: string[];
	neighbors?: string[];
}

const MAX_ITEMS = 3;

export async function personaliseSuggestions({
	suggestions,
	insights,
}: PersonaliseSuggestionsInput): Promise<VibeSuggestion[]> {
	if (suggestions.length === 0) {
		return suggestions;
	}

	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[personalise-suggestions] skipped: missing OPENAI_API_KEY");
		}
		return suggestions;
	}

	try {
		const openai = new OpenAI({ apiKey });
		const trimmedInsights = insights.slice(0, 12).map((item) => ({
			kind: item.kind,
			value: item.value.slice(0, 180),
		}));

		const basePayload = suggestions.map((suggestion) => ({
			id: suggestion.id,
			title: suggestion.title,
			summary: suggestion.summary,
			whyItFits: suggestion.whyItFits,
			careerAngles: suggestion.careerAngles,
			nextSteps: suggestion.nextSteps,
			neighbors: suggestion.neighborTerritories,
		}));

		const systemPrompt = [
			"You refit career exploration cards so they sound personal to the user data provided.",
			"Keep the structure tight and avoid generic filler.",
			"Do not invent unrelated jobs or experiments—tie everything back to the provided insights or explicitly say it's a general option.",
			"Respect the existing tone: informal, encouraging, practical.",
			"Keep lists short (max three items) and concrete.",
			"Suggest 1-3 neighboring territories that feel like adjacent experiments, phrased as short tags.",
		].join(" ");

		const userContent = JSON.stringify({
			insights: trimmedInsights,
			cards: basePayload,
		});

		const completion = await openai.chat.completions.create({
			model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
			temperature: 0.4,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: systemPrompt },
				{
					role: "user",
					content:
						"Return JSON with `cards` array. Each item must include id, summary (<=160 chars), careerAngles (max 3), nextSteps (max 3), neighbors (max 3 tags) all grounded in the insights. Use insights verbatim where possible.",
				},
				{ role: "user", content: userContent },
			],
		});

		const raw = completion.choices[0]?.message?.content ?? "{}";
		const parsed = JSON.parse(raw) as { cards?: PersonalisedSuggestionPayload[] };
		const updates = Array.isArray(parsed.cards) ? parsed.cards : [];

		const remapped = suggestions.map((suggestion) => {
			const override = updates.find((item) => item.id === suggestion.id);
			if (!override) {
				return suggestion;
			}
			return {
				...suggestion,
				summary: override.summary?.trim() || suggestion.summary,
				whyItFits:
					Array.isArray(override.whyItFits) && override.whyItFits.length > 0
						? override.whyItFits.slice(0, MAX_ITEMS).map((item) => item.trim()).filter(Boolean)
						: suggestion.whyItFits,
				careerAngles:
					Array.isArray(override.careerAngles) && override.careerAngles.length > 0
						? override.careerAngles.slice(0, MAX_ITEMS).map((item) => item.trim()).filter(Boolean)
						: suggestion.careerAngles,
				nextSteps:
					Array.isArray(override.nextSteps) && override.nextSteps.length > 0
						? override.nextSteps.slice(0, MAX_ITEMS).map((item) => item.trim()).filter(Boolean)
						: suggestion.nextSteps,
				neighborTerritories:
					Array.isArray(override.neighbors) && override.neighbors.length > 0
						? override.neighbors.slice(0, MAX_ITEMS).map((item) => item.trim()).filter(Boolean)
						: suggestion.neighborTerritories,
			};
		});

		return remapped;
	} catch (error) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[personalise-suggestions] failed to personalise", error);
		}
		return suggestions;
	}
}
