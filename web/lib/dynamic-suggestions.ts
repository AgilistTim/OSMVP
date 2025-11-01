import OpenAI from "openai";
import type { InsightKind } from "@/components/session-provider";

export interface DynamicSuggestionInput {
	insights: Array<{ kind: InsightKind; value: string }>;
	votes: Record<string, 1 | 0 | -1 | undefined>;
	limit?: number;
}

export type CardDistance = "core" | "adjacent" | "unexpected";

interface RawDynamicSuggestion {
    title?: string;
    summary?: string;
    why_it_fits?: string[];
    pathways?: string[];
    next_steps?: string[];
    micro_experiments?: string[];
    neighbor_tags?: string[];
    distance?: string;
}

export interface DynamicSuggestion {
    id: string;
    title: string;
    summary: string;
    whyItFits: string[];
    careerAngles: string[];
    nextSteps: string[];
    microExperiments: string[];
    neighborTerritories: string[];
    confidence: "high" | "medium" | "low";
    score: number;
    distance: CardDistance;
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

function coerceDistance(value: string | undefined): CardDistance {
    if (!value) return "core";
    const normalized = value.toLowerCase();
    if (normalized === "adjacent" || normalized === "unexpected") {
        return normalized;
    }
    return "core";
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set<string>([
    "the","and","for","with","that","this","from","into","about","your","their","they","you","are","our","use","using","build","based","help","guide","create","maker","builder","design","designer","consultant","coach","educator","teacher","content","curator","community","connector","ai","poc","proof","concept","business","startup","founder","small","medium","enterprise","sme","tool","tools","voice"
]);

function jaccard(a: Set<string>, b: Set<string>): number {
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}

function isSimilarSuggestion(a: DynamicSuggestion, b: DynamicSuggestion): boolean {
    const ta = new Set([
        ...tokenize(a.title),
        ...tokenize(a.summary),
        ...a.whyItFits.flatMap(tokenize),
        ...a.careerAngles.flatMap(tokenize),
    ]);
    const tb = new Set([
        ...tokenize(b.title),
        ...tokenize(b.summary),
        ...b.whyItFits.flatMap(tokenize),
        ...b.careerAngles.flatMap(tokenize),
    ]);
    const sim = jaccard(ta, tb);
    return sim >= 0.6; // consider near-duplicates as the same intent/scope
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
		model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
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
	if (insights.length === 0) {
		return [];
	}

	const grouped = groupInsightsByKind(insights);

	const apiKey = process.env.PERPLEXITY_API_KEY;
	if (!apiKey) {
		console.error("[dynamic-suggestions] CRITICAL: PERPLEXITY_API_KEY is not set in environment variables");
		throw new Error("PERPLEXITY_API_KEY is required for card generation");
	}

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
				"Ensure the three cards cover distinct lanes: (1) deepen the current project, (2) channel their skills into broader community impact or supporting others, (3) stretch into an experimental or unexpected medium/audience.",
				"Do not invent generic corporate titles; coin language that still makes sense to a teen/young adult.",
				"Ground every card in realistic roles or pathways (freelance, employment, or community) and mention how someone would credibly enter that space.",
				"Vary target audiences and industries—avoid repeating the same niche (e.g. the exact same community) across multiple cards unless the user explicitly insisted.",
			"Show how the pathway could scale with experimentation, community, or paid opportunities.",
			"Provide next steps that nudge the user into motion within 1–2 weeks.",
			"If the user rejected a similar idea, pivot to a different theme.",
			"Tag exactly one card per distance: core = extends what they already build, adjacent = nearby lane stretching audience or medium, unexpected = bold crossover that still respects their motivations.",
			"Use neighbor_tags to list the industries, communities, or technologies each card leans on—especially for adjacent and unexpected pathways.",
			"If the user loves flipping/reselling, ensure at least one card explores a different marketplace or channel (e.g., antiques, auctions, live sales, specialty retail) beyond their current niche.",
			"Adjacent pathways must explicitly reference the user’s current skills/inventory and show how those transfer into the new lane—do not pitch unrelated industries.",
			"Unexpected pathways must feel genuinely novel: introduce a domain, audience, or medium the user has not mentioned yet (e.g., live experiences, hardware, hospitality, travel, education) while clearly stating how their existing skills unlock it.",
		],
		},
	};

	const systemPrompt = [
		"You are a career pathway generator that creates personalized career cards.",
		"Read the user profile, motivation summary, and vote signals. Base all suggestions on that data only.",
		"",
		"CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations. Just raw JSON.",
		"",
		"JSON FORMAT:",
		"{",
		'  "cards": [',
		"    {",
		'      "title": "Career Title",',
		'      "summary": "One sentence description",',
		'      "why_it_fits": ["reason 1", "reason 2", "reason 3"],',
		'      "pathways": ["angle 1", "angle 2", "angle 3"],',
		'      "next_steps": ["step 1", "step 2", "step 3"],',
		'      "micro_experiments": ["experiment 1", "experiment 2", "experiment 3"],',
		'      "neighbor_tags": ["tag1", "tag2"],',
		'      "distance": "core"',
		"    }",
		"  ]",
		"}",
		"",
"RULES:",
"- Generate exactly 3 cards: 1 core, 1 adjacent, 1 unexpected—never reuse a distance.",
"- distance must be \"core\", \"adjacent\", or \"unexpected\".",
"  • core = deepens their current project/identity; stay anchored in what they already said they're building.",
"  • adjacent = applies their current skills or inventory to a new audience, medium, or business model while explicitly calling back to what they already do.",
"  • unexpected = bold crossover that introduces a domain the user never mentioned (e.g., hospitality, live events, hardware, travel) and explains how their skills transfer.",
"- Use neighbor_tags to highlight the new territories introduced (industries, communities, technologies).",
"- When the user focuses on flipping/reselling, anchor at least one adjacent or unexpected card in a different physical or digital marketplace (antiques, vintage trading, live auctions, specialty retail, etc.).",
"- If the user already has multiple passions (e.g., tech + cooking), ensure the unexpected card stretches into a third space or novel format rather than reusing the same combination.",
"- micro_experiments: 2-3 small actions they can try in 1-7 days (e.g., 'Interview someone in this role', 'Build a tiny prototype')",
"- why_it_fits: Use their actual words and patterns from the profile",
"- Keep all arrays to ≤3 items",
"- Focus on viable pathways: paid work, community leadership, indie projects, or learning",
"- For adjacent/unexpected cards, identify skills they haven't mentioned that complement their strengths",
	].join("\n");

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
			console.error(`[dynamic-suggestions] Perplexity API error (${response.status}):`, text);
			throw new Error(text || `Perplexity request failed with ${response.status}`);
		}

    const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };

		const rawContent = result.choices?.[0]?.message?.content ?? "{}";
		console.log("[dynamic-suggestions] Perplexity raw response:", rawContent.substring(0, 500));
		
		// Try to extract JSON from markdown code blocks if present
		let jsonContent = rawContent;
		const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (codeBlockMatch) {
			jsonContent = codeBlockMatch[1].trim();
			console.log("[dynamic-suggestions] Extracted JSON from markdown code block");
		}
		
		let parsed: { cards?: RawDynamicSuggestion[] };
		try {
			parsed = JSON.parse(jsonContent) as { cards?: RawDynamicSuggestion[] };
		} catch (parseError) {
			console.error("[dynamic-suggestions] Failed to parse Perplexity response as JSON:", parseError);
			console.error("[dynamic-suggestions] Raw content (first 1000 chars):", rawContent.substring(0, 1000));
			console.error("[dynamic-suggestions] Attempted to parse:", jsonContent.substring(0, 1000));
			throw new Error(`Failed to parse card generation response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
		}

		const cards = Array.isArray(parsed.cards) ? parsed.cards.slice(0, limit) : [];
		
		if (cards.length === 0) {
			console.error("[dynamic-suggestions] Perplexity returned empty cards array");
			console.error("[dynamic-suggestions] Full parsed response:", JSON.stringify(parsed, null, 2));
			console.error("[dynamic-suggestions] Input profile:", JSON.stringify(profile, null, 2));
			throw new Error("Card generation returned no cards");
		}
		
    let invalidDistanceCount = 0;
    const mapped = cards.reduce<DynamicSuggestion[]>((acc, card, index) => {
        const title = (card.title ?? "").trim();
        const summary = (card.summary ?? "").trim();
        if (!title || !summary) {
            console.warn(`[dynamic-suggestions] Skipping card ${index} - missing title or summary:`, card);
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
		const microExperiments = Array.isArray(card.micro_experiments)
			? card.micro_experiments.map((item) => item.trim()).filter(Boolean)
			: [];
		const neighborTerritories = Array.isArray(card.neighbor_tags)
			? card.neighbor_tags.map((item) => item.trim()).filter(Boolean)
			: [];
        const rawDistance = coerceDistance(card.distance);
        if (!card.distance || (card.distance !== 'core' && card.distance !== 'adjacent' && card.distance !== 'unexpected')) {
            invalidDistanceCount++;
        }

        acc.push({
            id: `dynamic-${index}-${title.toLowerCase().replace(/\s+/g, "-").slice(0, 32)}`,
            title,
            summary,
            whyItFits,
            careerAngles,
            nextSteps,
            microExperiments,
            neighborTerritories,
            confidence: "medium",
            score: 5 - index,
            distance: rawDistance,
        });
        return acc;
    }, []);

        let uniqueCards = mapped.filter((card, index, array) => {
            const normalisedTitle = card.title.toLowerCase();
            return array.findIndex((candidate) => candidate.title.toLowerCase() === normalisedTitle) === index;
        });

        if (uniqueCards.length < mapped.length) {
            console.warn("[dynamic-suggestions] Removed duplicate card titles", {
                originalTitles: mapped.map((card) => card.title),
                uniqueTitles: uniqueCards.map((card) => card.title),
            });
        }

        // Extra semantic dedupe by intent/scope
        const semanticallyDeduped: DynamicSuggestion[] = [];
        for (const cand of uniqueCards) {
            if (semanticallyDeduped.some((keep) => isSimilarSuggestion(keep, cand))) {
                console.warn('[dynamic-suggestions] Dropping near-duplicate by intent/scope', { title: cand.title });
                continue;
            }
            semanticallyDeduped.push(cand);
        }
        uniqueCards = semanticallyDeduped;

        // Distance distribution logging and light rebalancing to ensure variety
        const distCounts = uniqueCards.reduce<Record<CardDistance, number>>((acc, c) => {
            acc[c.distance] = (acc[c.distance] ?? 0) + 1;
            return acc;
        }, { core: 0, adjacent: 0, unexpected: 0 });
        if (invalidDistanceCount > 0) {
            console.warn('[dynamic-suggestions] Cards missing/invalid distance tagged by model', { invalidDistanceCount });
        }
        console.log('[dynamic-suggestions] Distance distribution before rebalancing', distCounts);

        // If all cards are still core, force diversification so UI gets core/adjacent/unexpected mix.
        if (uniqueCards.length >= 2 && distCounts.core === uniqueCards.length) {
            const rebalanceLog: Array<{ title: string; from: CardDistance; to: CardDistance }> = [];

            const clone = (idx: number, distance: CardDistance) => {
                const before = uniqueCards[idx].distance;
                if (before === distance) return;
                uniqueCards[idx] = { ...uniqueCards[idx], distance };
                rebalanceLog.push({ title: uniqueCards[idx].title, from: before, to: distance });
            };

            // Candidate with most neighbor territories becomes adjacent (if any)
            const withNeighbors = uniqueCards
                .map((c, i) => ({ index: i, neighbors: c.neighborTerritories?.length ?? 0 }))
                .sort((a, b) => b.neighbors - a.neighbors);
            let adjacentIndex = withNeighbors.find((item) => item.neighbors > 0)?.index;
            if (adjacentIndex === undefined) {
                adjacentIndex = uniqueCards.length > 1 ? 1 : 0;
            }
            clone(adjacentIndex, 'adjacent');

            // Lowest-scored card becomes unexpected (different index from adjacent)
            let unexpectedIndex = uniqueCards.reduce((minIdx, card, idx, arr) => (card.score < arr[minIdx].score ? idx : minIdx), 0);
            if (unexpectedIndex === adjacentIndex) {
                unexpectedIndex = (unexpectedIndex + 1) % uniqueCards.length;
            }
            clone(unexpectedIndex, 'unexpected');

            console.warn('[dynamic-suggestions] Rebalanced distances to ensure variety', rebalanceLog);
        }

        console.log(`[dynamic-suggestions] Successfully generated ${uniqueCards.length} cards`);
        console.log('[dynamic-suggestions] Cards after rebalancing:', uniqueCards.map(c => ({ title: c.title, distance: c.distance })));

        return uniqueCards;
	} catch (error) {
		console.error("[dynamic-suggestions] CRITICAL ERROR:", error);
		throw error;
	}
}
