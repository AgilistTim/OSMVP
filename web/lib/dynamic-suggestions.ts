import OpenAI from "openai";
import type { InsightKind } from "@/components/session-provider";

const OPENAI_SUGGESTION_MODEL = process.env.OPENAI_SUGGESTION_MODEL ?? "gpt-4.1-mini";
const OPENAI_DOMAIN_MODEL = process.env.OPENAI_DOMAIN_MODEL ?? OPENAI_SUGGESTION_MODEL;

export interface DynamicSuggestionInput {
	insights: Array<{ kind: InsightKind; value: string }>;
	votes: Record<string, 1 | 0 | -1 | undefined>;
	limit?: number;
	recentTurns?: Array<{ role: string; text: string }>;
	transcriptSummary?: string;
    previousSuggestions?: Array<{ title: string; summary?: string; distance?: CardDistance }>;
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


export async function generateDynamicSuggestions({
    insights,
    votes,
    limit = 3,
    recentTurns = [],
    transcriptSummary,
    previousSuggestions = [],
}: DynamicSuggestionInput): Promise<DynamicSuggestion[]> {
    if (insights.length === 0) {
        return [];
    }

    const grouped = groupInsightsByKind(insights);

    const openaiKey = process.env.OPENAI_API_KEY ?? null;
    const perplexityKey = process.env.PERPLEXITY_API_KEY ?? null;

    if (!openaiKey && !perplexityKey) {
        console.error("[dynamic-suggestions] CRITICAL: Missing both OPENAI_API_KEY and PERPLEXITY_API_KEY");
        throw new Error("At least one API key is required for card generation");
    }

    const useOpenAI = Boolean(openaiKey);

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
        previousSuggestions
            .map((item) => item.title.toLowerCase())
            .filter((title): title is string => Boolean(title))
    );

    const suggestions: DynamicSuggestion[] = [];

    for (const distance of DISTANCE_ORDER.slice(0, Math.min(limit, DISTANCE_ORDER.length))) {
        const candidate = await generateCardForDistance({
            openaiKey,
            perplexityKey,
            useOpenAI,
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
            previousSuggestions,
        });

        if (candidate) {
            suggestions.push(candidate);
            avoidTitles.add(candidate.title.toLowerCase());
        }
    }

    return suggestions;
}

interface PerplexityContext {
    openaiKey: string | null;
    perplexityKey: string | null;
    useOpenAI: boolean;
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
    previousSuggestions: Array<{ title: string; summary?: string; distance?: CardDistance }>;
}

async function generateCardForDistance(context: PerplexityContext): Promise<DynamicSuggestion | null> {
    const {
        openaiKey,
        perplexityKey,
        useOpenAI,
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
        previousSuggestions,
    } = context;

    const maxAttempts = distance === "unexpected" ? 5 : 3;
    let novelDomains: string[] = [];

    if (distance === "unexpected") {
        novelDomains = await fetchNovelDomains({
            openaiKey,
            perplexityKey,
            useOpenAI,
            dominantKeywords,
            existing,
            previousSuggestions,
            recentTurns,
            transcriptSummary,
        });
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const rawCard = await requestCardFromModel({
            openaiKey,
            perplexityKey,
            useOpenAI,
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
            previousSuggestions,
            attempt,
            novelDomains,
        });

        console.info("[suggestions] requesting card", {
            distance,
            provider: useOpenAI ? "openai" : "perplexity",
            attempt,
        });

        if (!rawCard) continue;

        const candidate = mapRawSuggestion(rawCard, distance);
        if (!candidate) continue;

        if (avoidTitles.has(candidate.title.toLowerCase())) {
            console.warn("[dynamic-suggestions] Skipping card with duplicate title", { title: candidate.title, distance, attempt });
            continue;
        }

        if (existing.some((s) => isSimilarSuggestion(s, candidate))) {
            console.warn("[dynamic-suggestions] Skipping card similar to earlier suggestion", { title: candidate.title, distance, attempt });
            continue;
        }

        if (distance === "unexpected" && isTooCloseToKeywords(candidate, dominantKeywords)) {
            novelDomains = await fetchNovelDomains({
                openaiKey,
                perplexityKey,
                useOpenAI,
                dominantKeywords,
                existing: [...existing, candidate],
                recentTurns,
                transcriptSummary,
                previousSuggestions,
            });
            console.warn("[dynamic-suggestions] Unexpected card overlapped with dominant keywords, retrying", {
                title: candidate.title,
                distance,
                attempt,
            });
            continue;
        }

        return candidate;
    }

    console.warn(`[dynamic-suggestions] Falling back for ${distance} after exhausting attempts`);
    return buildFallbackSuggestion(distance, insights, dominantKeywords, existing, novelDomains);
}

interface ModelRequestInput {
    openaiKey: string | null;
    perplexityKey: string | null;
    useOpenAI: boolean;
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
    attempt: number;
    novelDomains?: string[];
    previousSuggestions: Array<{ title: string; summary?: string; distance?: CardDistance }>;
}

async function requestCardFromModel(params: ModelRequestInput): Promise<RawDynamicSuggestion | null> {
    if (params.useOpenAI) {
        return requestCardFromOpenAI(params);
    }
    return requestCardFromPerplexity(params);
}

async function requestCardFromOpenAI(params: ModelRequestInput): Promise<RawDynamicSuggestion | null> {
    const {
        openaiKey,
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
        attempt,
        novelDomains,
        previousSuggestions,
    } = params;

    if (!openaiKey) {
        return null;
    }

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
        previous_cards: previousSuggestions.map((card) => ({
            title: card.title,
            summary: card.summary,
            distance: card.distance,
        })),
        already_provided_cards: previousSuggestions
            .map((card) => `${card.title}${card.summary ? ` — ${card.summary}` : ''}`)
            .join("\n"),
        dominant_keywords: dominantKeywords,
        target_domains: novelDomains,
    };

    const temperature = distance === "unexpected" ? 0.5 : 0.3;

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
            model: OPENAI_SUGGESTION_MODEL,
            temperature,
            input: [
                { role: "system", content: systemPrompt },
                { role: "user", content: JSON.stringify(payload) },
            ],
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`[dynamic-suggestions] OpenAI API error (${response.status}):`, text);
        return null;
    }

    const responseJson = await response.json() as OpenAIResponse;

    const rawText = extractOpenAIText(responseJson);
    if (!rawText) {
        console.warn("[dynamic-suggestions] OpenAI response missing text payload", responseJson);
        return null;
    }

    const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonContent = codeMatch ? codeMatch[1].trim() : rawText;

    try {
        const parsed = JSON.parse(jsonContent) as { card?: RawDynamicSuggestion; cards?: RawDynamicSuggestion[] };
        if (parsed.card) return parsed.card;
        if (Array.isArray(parsed.cards) && parsed.cards.length > 0) {
            return parsed.cards[0];
        }
        return null;
    } catch (err) {
        console.error("[dynamic-suggestions] Failed to parse OpenAI response", {
            distance,
            attempt,
            raw: rawText.substring(0, 500),
            error: err,
        });
        return null;
    }
}

async function requestCardFromPerplexity(params: ModelRequestInput): Promise<RawDynamicSuggestion | null> {
    const {
        perplexityKey,
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
        attempt,
        novelDomains,
        previousSuggestions,
    } = params;

    const apiKey = perplexityKey;
    if (!apiKey) {
        return null;
    }

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
        previous_cards: previousSuggestions.map((card) => ({
            title: card.title,
            summary: card.summary,
            distance: card.distance,
        })),
        already_provided_cards: previousSuggestions
            .map((card) => `${card.title}${card.summary ? ` — ${card.summary}` : ''}`)
            .join("\n"),
        dominant_keywords: dominantKeywords,
        target_domains: novelDomains,
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
        console.warn("[dynamic-suggestions] Response missing card", { distance, attempt, raw: rawContent.substring(0, 120) });
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
        "Required card fields: title, summary, why_it_fits[], pathways[], next_steps[], micro_experiments[], neighbor_tags[], distance.",
        "Each array field must contain 1-3 concise bullet strings (no numbering).",
        "Keep copy concrete, based on the provided context.",
        "Never reuse any titles from avoid_titles or previous_cards; invent new concepts.",
        "Do not recreate or lightly remix entries listed in already_provided_cards.",
        "Avoid repetition and do not invent personal details that were not provided.",
        "Use sentence case and avoid emoji or markdown formatting.",
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
            "If target_domains is provided, choose one of those domains for the concept.",
            "Explain explicitly how their current skills would unlock success in this new domain.",
            "Include neighbor_tags that call out the new territory you are introducing."
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
        .filter(([token]) => token.length >= 4)
        .slice(0, 12)
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
    return overlap >= Math.max(4, Math.ceil(dominantKeywords.length * 0.25));
}

function buildFallbackSuggestion(
    distance: CardDistance,
    insights: DynamicSuggestionInput["insights"],
    dominantKeywords: string[],
    existing: DynamicSuggestion[],
    novelHints?: string[]
): DynamicSuggestion {
    const primaryInsight = insights[0]?.value ?? "their current skills";

    if (distance === "unexpected") {
        const novelDomain = (novelHints && novelHints[0]) || "a totally new audience you haven’t explored yet";

        return {
            id: `fallback-unexpected-${Date.now()}`,
            title: "Signature Innovation Lab",
            summary: `Launch a limited-run experiment that brings your ${primaryInsight} into ${novelDomain}, blending rapid AI prototyping with real-world immersion.`,
            whyItFits: [
                "You already translate complex ideas into tangible tools—bring that power to a frontier no one expects from you.",
                "Small-batch pilots let you test appetite before you commit.",
                "Cross-disciplinary storytelling sets you apart from other AI builders.",
            ],
            careerAngles: [
                "Co-create with a partner in the emerging domain and package the experience as a premium pilot.",
                "Document learnings as a playbook that feeds back into your core SME offer.",
            ],
            nextSteps: [
                "Interview a practitioner in that new domain about their biggest friction point.",
                "Sketch how your AI toolkit could produce a wow moment for their audience.",
            ],
            microExperiments: [
                "Draft a storyboard for a 20-minute demo and share it with two potential partners.",
                "Host a tiny rehearsal with friends and gather reactions.",
            ],
            neighborTerritories: novelHints && novelHints.length > 0 ? novelHints.slice(0, 3) : ["cross-domain", "experiential", "innovation"],
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

interface NovelDomainParams {
    openaiKey: string | null;
    perplexityKey: string | null;
    useOpenAI: boolean;
    dominantKeywords: string[];
    existing: DynamicSuggestion[];
    previousSuggestions: Array<{ title: string; summary?: string; distance?: CardDistance }>;
    recentTurns: Array<{ role: string; text: string }>;
    transcriptSummary?: string;
}

async function fetchNovelDomains(params: NovelDomainParams): Promise<string[]> {
    const { openaiKey, perplexityKey, useOpenAI, dominantKeywords, existing, previousSuggestions, recentTurns, transcriptSummary } = params;

    const avoidTokens = new Set<string>(dominantKeywords);
    existing.forEach((card) => extractCandidateKeywords(card).forEach((token) => avoidTokens.add(token)));
    previousSuggestions.forEach((card) => {
        tokenize(card.title).forEach((token) => avoidTokens.add(token));
        if (card.summary) {
            tokenize(card.summary).forEach((token) => avoidTokens.add(token));
        }
    });

    const systemPrompt = [
        "You suggest fresh domains or audiences the user has NOT mentioned.",
        "Respond with strict JSON: { \"domains\": [string, ...] } and nothing else.",
        "Each domain must be 2-5 words and feel like a vivid frontier (e.g., 'culinary travel residencies').",
        "Avoid overlapping with the provided dominant keywords or previously shared card titles.",
        "Do NOT include markdown, bullet points, or commentary—JSON only.",
    ].join("\n");

    const userPayload = {
        dominant_keywords: Array.from(avoidTokens).slice(0, 60),
        recent_turns: recentTurns.slice(-4),
        transcript_summary: transcriptSummary,
    };

    try {
        if (useOpenAI && openaiKey) {
            const response = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${openaiKey}`,
                },
                body: JSON.stringify({
                    model: OPENAI_DOMAIN_MODEL,
                    temperature: 0.6,
                    input: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: JSON.stringify(userPayload) },
                    ],
                }),
            });

            if (!response.ok) {
                return [];
            }

            const result = await response.json() as {
                output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }>;
            };

            const rawContent = extractOpenAIText(result) ?? "";
            if (!rawContent) {
                return [];
            }

            return extractDomainsFromResponse(rawContent);
        }

        const apiKey = perplexityKey;
        if (!apiKey) {
            return [];
        }

        const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "sonar",
                temperature: 0.6,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: JSON.stringify(userPayload) },
                ],
            }),
        });

        if (!response.ok) {
            return [];
        }

        const result = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };

        const rawContent = result.choices?.[0]?.message?.content ?? "{}";
        const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonContent = codeBlockMatch ? codeBlockMatch[1].trim() : rawContent;

        return extractDomainsFromResponse(jsonContent);
    } catch (error) {
        console.warn("[dynamic-suggestions] Novel domain fetch failed", error);
        return [];
    }
}

function extractDomainsFromResponse(raw: string): string[] {
    const results: string[] = [];

    const tryParse = (content: string) => {
        try {
            const parsed = JSON.parse(content) as { domains?: unknown };
            if (Array.isArray(parsed.domains)) {
                parsed.domains.forEach((entry) => {
                    if (typeof entry === "string") {
                        const cleaned = entry.trim();
                        if (cleaned.length > 0) {
                            results.push(cleaned);
                        }
                    }
                });
            }
        } catch {
            // ignore parse error
        }
    };

    tryParse(raw);

    if (results.length === 0) {
        const jsonMatch = raw.match(/\{[^]*?\}/);
        if (jsonMatch) {
            tryParse(jsonMatch[0]);
        }
    }

    if (results.length === 0) {
        raw
            .split(/\n|\r|,|;/)
            .map((line) => line.trim().replace(/^[-*•\d\.\s]+/, ""))
            .filter((line) => line.length > 0 && line.includes(" "))
            .slice(0, 5)
            .forEach((line) => results.push(line));
    }

    return results.slice(0, 5);
}

type OpenAIResponse = {
    output?: Array<{
        type?: string;
        role?: string;
        content?: Array<{ type?: string; text?: string }>;
    }>;
};

function extractOpenAIText(response: OpenAIResponse): string | null {
    if (!response.output) return null;
    for (const item of response.output) {
        if (item.type === "message" && item.content) {
            const textParts = item.content
                .filter((chunk) => chunk.type === "output_text" && typeof chunk.text === "string")
                .map((chunk) => chunk.text as string);
            if (textParts.length > 0) {
                return textParts.join("\n");
            }
        }
    }
    return null;
}
