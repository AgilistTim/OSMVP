import OpenAI from "openai";
import type { InsightKind } from "@/components/session-provider";

export interface DynamicSuggestionInput {
	insights: Array<{ kind: InsightKind; value: string }>;
	votes: Record<string, 1 | 0 | -1 | undefined>;
	limit?: number;
	recentTurns?: Array<{ role: string; text: string }>;
	transcriptSummary?: string;
	existingSuggestions?: Array<{ id?: string; title: string; distance?: string }>;
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

type ProfileEnvelope = {
    interests: string[];
    strengths: string[];
    goals: string[];
    frustrations: string[];
    hopes: string[];
    constraints: string[];
    highlights: string[];
};

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

const DISTANCE_ORDER: CardDistance[] = ["core", "adjacent", "unexpected"];
const DISTANCE_SCORE: Record<CardDistance, number> = {
    core: 5,
    adjacent: 4,
    unexpected: 3,
};

const NOVEL_DOMAINS = [
    "immersive travel experiences",
    "live culinary pop-up events",
    "hands-on maker workshops",
    "heritage and cultural tourism",
    "wellness retreats",
    "field service robotics",
    "nature restoration projects",
    "museum and exhibit design",
    "eco hospitality",
    "sports fan engagement",
    "festival production",
];

export async function generateDynamicSuggestions({
    insights,
    votes,
    limit = 3,
    recentTurns = [],
    transcriptSummary,
    existingSuggestions = [],
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

    const profile: ProfileEnvelope = {
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

    const dominantKeywords = computeDominantKeywords(insights, transcriptSummary);
    const avoidTitles = new Set<string>(
        existingSuggestions
            .map((item) => item.title?.toLowerCase())
            .filter((title): title is string => Boolean(title))
    );

    const suggestions: DynamicSuggestion[] = [];

    for (const distance of DISTANCE_ORDER.slice(0, Math.min(limit, DISTANCE_ORDER.length))) {
        const candidate = await generateCardForDistance({
            apiKey,
            profile,
            insights,
            motivationSummary,
            likes,
            dislikes,
            recentTurns,
            transcriptSummary,
            dominantKeywords,
            distance,
            existing: suggestions,
            avoidTitles,
        });

        if (candidate) {
            suggestions.push(candidate);
            avoidTitles.add(candidate.title.toLowerCase());
        }
    }

    return suggestions;
}

interface PerplexityContext {
    apiKey: string;
    profile: ProfileEnvelope;
    insights: DynamicSuggestionInput["insights"];
    motivationSummary: string | null;
    likes: string[];
    dislikes: string[];
    recentTurns: Array<{ role: string; text: string }>;
    transcriptSummary?: string;
    dominantKeywords: string[];
    distance: CardDistance;
    existing: DynamicSuggestion[];
    avoidTitles: Set<string>;
}

async function generateCardForDistance(context: PerplexityContext): Promise<DynamicSuggestion | null> {
    const {
        apiKey,
        profile,
        insights,
        motivationSummary,
        likes,
        dislikes,
        recentTurns,
        transcriptSummary,
        dominantKeywords,
        distance,
        existing,
        avoidTitles,
    } = context;

    const maxAttempts = distance === "unexpected" ? 5 : 3;
    let bannedKeywords = distance === "unexpected" ? new Set(dominantKeywords) : new Set<string>();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const rawCard = await requestCardFromPerplexity({
            apiKey,
            profile,
            insights,
            motivationSummary,
            likes,
            dislikes,
            recentTurns,
            transcriptSummary,
            dominantKeywords,
            distance,
            avoidTitles,
            existing,
            bannedKeywords: Array.from(bannedKeywords),
            attempt,
        });

        if (!rawCard) continue;

        const candidate = mapRawSuggestion(rawCard, distance);
        if (!candidate) continue;

        if (avoidTitles.has(candidate.title.toLowerCase())) {
            console.warn("[dynamic-suggestions] Skipping card with duplicate title", { title: candidate.title });
            continue;
        }

        if (existing.some((s) => isSimilarSuggestion(s, candidate))) {
            console.warn("[dynamic-suggestions] Skipping card similar to earlier suggestion", { title: candidate.title });
            continue;
        }

        if (distance === "unexpected" && isTooCloseToKeywords(candidate, dominantKeywords)) {
            const extra = extractCandidateKeywords(candidate);
            extra.forEach((kw) => bannedKeywords.add(kw));
            console.warn("[dynamic-suggestions] Unexpected card overlapped with dominant keywords, retrying", {
                title: candidate.title,
                bannedKeywords: Array.from(bannedKeywords),
            });
            continue;
        }

        return candidate;
    }

    console.warn(`[dynamic-suggestions] Falling back for ${distance} after exhausting attempts`);
    return buildFallbackSuggestion(distance, insights, dominantKeywords, existing);
}

interface PerplexityRequestInput {
    apiKey: string;
    profile: ProfileEnvelope;
    insights: DynamicSuggestionInput["insights"];
    motivationSummary: string | null;
    likes: string[];
    dislikes: string[];
    recentTurns: Array<{ role: string; text: string }>;
    transcriptSummary?: string;
    dominantKeywords: string[];
    distance: CardDistance;
    avoidTitles: Set<string>;
    existing: DynamicSuggestion[];
    bannedKeywords: string[];
    attempt: number;
}

async function requestCardFromPerplexity(params: PerplexityRequestInput): Promise<RawDynamicSuggestion | null> {
    const {
        apiKey,
        profile,
        insights,
        motivationSummary,
        likes,
        dislikes,
        recentTurns,
        transcriptSummary,
        dominantKeywords,
        distance,
        avoidTitles,
        existing,
        bannedKeywords,
        attempt,
    } = params;

    const systemPrompt = buildSystemPrompt(distance);

    const payload = {
        distance,
        attempt,
        user_profile: profile,
        insights: insights.map((item) => ({ kind: item.kind, value: item.value })),
        motivation_summary: motivationSummary,
        positive_votes: likes,
        negative_votes: dislikes,
        recent_turns: recentTurns,
        transcript_summary: transcriptSummary,
        avoid_titles: Array.from(avoidTitles),
        previous_cards: existing.map((card) => ({
            title: card.title,
            distance: card.distance,
        })),
        dominant_keywords: dominantKeywords,
        banned_keywords: bannedKeywords,
    };

    const temperature = distance === "unexpected" ? 0.4 : 0.2;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "sonar",
            temperature,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: JSON.stringify(payload) },
            ],
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`[dynamic-suggestions] Perplexity API error (${response.status}):`, text);
        return null;
    }

    const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = result.choices?.[0]?.message?.content ?? "{}";
    const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonContent = codeBlockMatch ? codeBlockMatch[1].trim() : rawContent;

    try {
        const parsed = JSON.parse(jsonContent) as { card?: RawDynamicSuggestion; cards?: RawDynamicSuggestion[] };
        if (parsed.card) return parsed.card;
        if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
            return parsed.cards[0];
        }
        return null;
    } catch (err) {
        console.error("[dynamic-suggestions] Failed to parse Perplexity response", {
            distance,
            attempt,
            raw: rawContent.substring(0, 500),
            error: err,
        });
        return null;
    }
}

function buildSystemPrompt(distance: CardDistance): string {
    const base = [
        "You generate exactly one career pathway card per request.",
        "Respond with strict JSON: { \"card\": { ... } } and nothing else.",
        "Keep copy concrete, based on the provided context.",
        "Each array field must contain at most 3 bullet points.",
    ];

    if (distance === "core") {
        base.push(
            "Focus on deepening what they already build. Show refinement, packaging, or scaling opportunities inside their current lane.",
            "Reference their stated wins or tools explicitly so it feels tailored."
        );
    } else if (distance === "adjacent") {
        base.push(
            "Pivot their existing skills or inventory into a nearby audience or medium.",
            "Explicitly mention the bridge from the current work to the new context, so it feels like a natural stretch."
        );
    } else {
        base.push(
            "Introduce a domain, audience, or medium the user has NOT mentioned yet.",
            "Do not reuse dominant keywords or niches; pick something genuinely fresh (e.g., hospitality, travel, live experiences, environmental work, education).",
            "Explain explicitly how their current skills would unlock success in this new domain."
        );
    }

    return base.join("\n");
}

function mapRawSuggestion(card: RawDynamicSuggestion, distance: CardDistance): DynamicSuggestion | null {
    const title = (card.title ?? "").trim();
    const summary = (card.summary ?? "").trim();
    if (!title || !summary) {
        return null;
    }

    const normalizeList = (value?: string[]) =>
        Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean).slice(0, 3) : [];

    const idBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    return {
        id: `dynamic-${distance}-${idBase.slice(0, 28)}`,
        title,
        summary,
        whyItFits: normalizeList(card.why_it_fits),
        careerAngles: normalizeList(card.pathways),
        nextSteps: normalizeList(card.next_steps),
        microExperiments: normalizeList(card.micro_experiments),
        neighborTerritories: normalizeList(card.neighbor_tags),
        confidence: "medium",
        score: DISTANCE_SCORE[distance],
        distance,
    };
}

function computeDominantKeywords(insights: DynamicSuggestionInput["insights"], transcriptSummary?: string): string[] {
    const counts = new Map<string, number>();

    const addText = (text: string) => {
        tokenize(text).forEach((token) => {
            counts.set(token, (counts.get(token) ?? 0) + 1);
        });
    };

    insights.forEach((item) => addText(item.value));
    if (transcriptSummary) {
        addText(transcriptSummary);
    }

    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([token]) => token);
}

function extractCandidateKeywords(card: DynamicSuggestion): Set<string> {
    const tokens = [card.title, card.summary, ...card.whyItFits, ...card.careerAngles, ...card.nextSteps];
    const combined = new Set<string>();
    tokens.forEach((text) => tokenize(text).forEach((token) => combined.add(token)));
    return combined;
}

function isTooCloseToKeywords(card: DynamicSuggestion, dominantKeywords: string[]): boolean {
    if (dominantKeywords.length === 0) return false;
    const candidateTokens = extractCandidateKeywords(card);
    let overlap = 0;
    dominantKeywords.forEach((keyword) => {
        if (candidateTokens.has(keyword)) overlap++;
    });
    return overlap >= 2;
}

function buildFallbackSuggestion(
    distance: CardDistance,
    insights: DynamicSuggestionInput["insights"],
    dominantKeywords: string[],
    existing: DynamicSuggestion[]
): DynamicSuggestion {
    const primaryInsight = insights[0]?.value ?? "their current skills";

    if (distance === "unexpected") {
        const usedTokens = new Set(dominantKeywords);
        const existingTokens = existing.flatMap((card) => Array.from(extractCandidateKeywords(card)));
        existingTokens.forEach((token) => usedTokens.add(token));

        const novelDomain = NOVEL_DOMAINS.find((domain) => {
            const domainTokens = tokenize(domain);
            return domainTokens.every((token) => !usedTokens.has(token));
        }) ?? NOVEL_DOMAINS[0];

        return {
            id: `fallback-unexpected-${Date.now()}`,
            title: `Immersive ${capitalizeWords(novelDomain)} Architect`,
            summary: `Channel your ${primaryInsight} into designing ${novelDomain}, using AI prototypes to craft memorable real-world experiences.`,
            whyItFits: [
                `You already translate complex ideas into tangible tools—apply that skill to ${novelDomain}.`,
                "Your low-code speed lets you test concepts quickly with real audiences.",
                "This lane opens a fresh network and revenue stream beyond software projects.",
            ],
            careerAngles: [
                `Partner with hospitality or event teams to build rapid AI-driven mockups.`,
                `Offer pop-up experiences that showcase data-driven storytelling.`,
            ],
            nextSteps: [
                "Interview someone who delivers premium live experiences about their biggest bottleneck.",
                "Prototype a micro-experience that blends your AI toolkit with sensory elements.",
            ],
            microExperiments: [
                "Design a storyboard for a 30-minute immersive demo.",
                "Run a small feedback session with potential guests to refine the concept.",
            ],
            neighborTerritories: ["hospitality", "events", "experience-design"],
            confidence: "medium",
            score: DISTANCE_SCORE.unexpected,
            distance: "unexpected",
        };
    }

    if (distance === "adjacent") {
        return {
            id: `fallback-adjacent-${Date.now()}`,
            title: "Applied AI Coach for Specialty Teams",
            summary: `Bring your ${primaryInsight} into niche teams (healthcare, logistics, education) by packaging AI playbooks and lightweight tools.`,
            whyItFits: [
                "You already teach yourself through tutorials—turn that into structured guidance for others.",
                "SMEs need tailored support that blends training with build support.",
            ],
            careerAngles: [
                "Offer workshop + build bundles to a specific industry cohort.",
                "Create template kits that teams can adapt with your guidance.",
            ],
            nextSteps: [
                "Reach out to a specialist network and ask what AI workflows they wish existed.",
                "Draft a mini curriculum pairing tutorials with done-with-you implementation.",
            ],
            microExperiments: [
                "Host a 45-minute live teardown of a workflow and capture questions.",
            ],
            neighborTerritories: ["industry-training", "playbooks"],
            confidence: "medium",
            score: DISTANCE_SCORE.adjacent,
            distance: "adjacent",
        };
    }

    return {
        id: `fallback-core-${Date.now()}`,
        title: "AI Systems Architect for SME Productivity",
        summary: "Productize your existing AI productivity builds into a signature playbook that bundles training, templates, and build sprints for SMEs.",
        whyItFits: [
            "You already proved the concept with your productivity tool.",
            "SMEs crave done-with-you solutions that feel custom but are repeatable for you.",
        ],
        careerAngles: [
            "Create tiered packages: assessment, prototype, automation rollout.",
            "Layer in subscription support where you monitor and tweak automations.",
        ],
        nextSteps: [
            "Interview two SME leaders about their calendar or workflow pain points.",
            "Document your existing build into a repeatable template.",
        ],
        microExperiments: [
            "Turn your current tool into a short case study and share it with three prospects.",
        ],
        neighborTerritories: ["sme-productivity", "automation"],
        confidence: "medium",
        score: DISTANCE_SCORE.core,
        distance: "core",
    };
}

function capitalizeWords(text: string): string {
    return text.replace(/(^|\s)([a-z])/g, (_, space, letter) => `${space}${letter.toUpperCase()}`);
}
