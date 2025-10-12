import OpenAI from "openai";
import type { InsightKind } from "@/components/session-provider";

export interface DynamicSuggestionInput {
	insights: Array<{ kind: InsightKind; value: string }>;
	votes: Record<string, 1 | 0 | -1 | undefined>;
	limit?: number;
}

interface RawDynamicSuggestion {
	title?: string;
	summary?: string;
	why_it_fits?: string[];
	pathways?: string[];
	next_steps?: string[];
	neighbor_tags?: string[];
}

export interface DynamicSuggestion {
	id: string;
	title: string;
	summary: string;
	whyItFits: string[];
	careerAngles: string[];
	nextSteps: string[];
	neighborTerritories: string[];
	confidence: "high" | "medium" | "low";
	score: number;
}

function groupInsightsByKind(insights: DynamicSuggestionInput["insights"]) {
	const grouped = new Map<InsightKind, string[]>();
	insights.forEach((item) => {
		const existing = grouped.get(item.kind) ?? [];
		existing.push(item.value);
		grouped.set(item.kind, existing);
	});
	return grouped;
}

async function buildMotivationSummary(insights: DynamicSuggestionInput["insights"]) {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) return null;

	const openai = new OpenAI({ apiKey });
	const insightSnapshot = insights.slice(0, 18).map((item) => `${item.kind}: ${item.value}`);

	const motivationPrompt = [
		"You’re turning raw conversation nuggets into a short motivation profile.",
		"Summarize the user’s drivers, preferred working style, constraints, and delights.",
		"Keep it factual, based only on the provided statements. Keep to 3-4 bullet points.",
	].join(" ");

	const result = await openai.chat.completions.create({
		model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
		temperature: 0.1,
		messages: [
			{ role: "system", content: motivationPrompt },
			{ role: "user", content: insightSnapshot.join("\n") },
		],
	});

	return result.choices[0]?.message?.content ?? null;
}

export async function generateDynamicSuggestions({
	insights,
	votes,
	limit = 3,
}: DynamicSuggestionInput): Promise<DynamicSuggestion[]> {
	const apiKey = process.env.PERPLEXITY_API_KEY;
	if (!apiKey) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[dynamic-suggestions] PERPLEXITY_API_KEY missing");
		}
		return [];
	}

	if (insights.length === 0) {
		return [];
	}

	const grouped = groupInsightsByKind(insights);
	const profile = {
		interests: grouped.get("interest") ?? [],
		strengths: grouped.get("strength") ?? [],
		goals: grouped.get("goal") ?? [],
		frustrations: grouped.get("frustration") ?? [],
		hopes: grouped.get("hope") ?? [],
		constraints: grouped.get("constraint") ?? grouped.get("boundary") ?? [],
		highlights: grouped.get("highlight") ?? [],
	};

	const likes = Object.entries(votes)
		.filter(([, value]) => value === 1)
		.map(([id]) => id);
	const dislikes = Object.entries(votes)
		.filter(([, value]) => value === -1)
		.map(([id]) => id);

	let motivationSummary: string | null = null;
	try {
		motivationSummary = await buildMotivationSummary(insights);
	} catch (error) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[dynamic-suggestions] motivation summary failed", error);
		}
	}

	const userContent = {
		user_profile: profile,
		motivation_summary: motivationSummary,
		positive_votes: likes,
		negative_votes: dislikes,
		instructions: {
			limit,
			must_avoid: dislikes,
			requirements: [
				"Base every pathway on the user’s own words and motivations.",
				"Translate hobbies or interests into viable roles, projects, or emerging pathways that can create income or impact.",
				"Highlight whether the pathway suits solo flow, partnership, or community building—only if we have evidence.",
				"Do not invent generic corporate titles; coin language that still makes sense to a teen/young adult.",
				"Show how the pathway could scale with experimentation, community, or paid opportunities.",
				"Provide next steps that nudge the user into motion within 1–2 weeks.",
				"If the user rejected a similar idea, pivot to a different theme.",
			],
		},
	};

	const systemPrompt = [
		"You co-create career pathway cards that feel hand-built for the user.",
		"Read the profile, motivation summary, and vote signals. Infer only from that data.",
		"Return JSON: { \"cards\": [ { \"title\", \"summary\", \"why_it_fits\", \"pathways\", \"next_steps\", \"neighbor_tags\" } ] }.",
		"Max three cards. Keep each list to ≤3 items. Use the user’s own phrasing in why_it_fits.",
		"Make sure every card ladders into viable pathways (paid work, community leadership, indie projects, or further learning).",
		"If evidence for collaboration vs. solo work is absent, stay neutral.",
	].join(" ");

	const body = {
		model: "sonar",
		temperature: 0.2,
		messages: [
			{ role: "system" as const, content: systemPrompt },
			{
				role: "user" as const,
				content: JSON.stringify(userContent),
			},
		],
	};

	try {
		const response = await fetch("https://api.perplexity.ai/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(text || `Perplexity request failed with ${response.status}`);
		}

		const result = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};

		const rawContent = result.choices?.[0]?.message?.content ?? "{}";
		let parsed: { cards?: RawDynamicSuggestion[] };
		try {
			parsed = JSON.parse(rawContent) as { cards?: RawDynamicSuggestion[] };
		} catch {
			if (process.env.NODE_ENV !== "production") {
				console.warn("[dynamic-suggestions] failed to parse response", rawContent);
			}
			return [];
		}

		const cards = Array.isArray(parsed.cards) ? parsed.cards.slice(0, limit) : [];
		const mapped = cards.reduce<DynamicSuggestion[]>((acc, card, index) => {
			const title = (card.title ?? "").trim();
			const summary = (card.summary ?? "").trim();
			if (!title || !summary) {
				return acc;
			}

			const whyItFits = Array.isArray(card.why_it_fits)
				? card.why_it_fits.map((item) => item.trim()).filter(Boolean)
				: [];
			const careerAngles = Array.isArray(card.pathways)
				? card.pathways.map((item) => item.trim()).filter(Boolean)
				: [];
			const nextSteps = Array.isArray(card.next_steps)
				? card.next_steps.map((item) => item.trim()).filter(Boolean)
				: [];
			const neighborTerritories = Array.isArray(card.neighbor_tags)
				? card.neighbor_tags.map((item) => item.trim()).filter(Boolean)
				: [];

			acc.push({
				id: `dynamic-${index}-${title.toLowerCase().replace(/\s+/g, "-").slice(0, 32)}`,
				title,
				summary,
				whyItFits,
				careerAngles,
				nextSteps,
				neighborTerritories,
				confidence: "medium",
				score: 5 - index,
			});
			return acc;
		}, []);

		return mapped;
	} catch (error) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[dynamic-suggestions] error", error);
		}
		return [];
	}
}
