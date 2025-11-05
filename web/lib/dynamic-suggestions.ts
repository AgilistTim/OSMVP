import OpenAI from "openai";
import type { InsightKind } from "@/components/session-provider";

const OPENAI_SUGGESTION_MODEL = process.env.OPENAI_SUGGESTION_MODEL ?? "gpt-4.1-mini";
const OPENAI_DOMAIN_MODEL = process.env.OPENAI_DOMAIN_MODEL ?? OPENAI_SUGGESTION_MODEL;

type AttributeStage = "established" | "developing" | "hobby";

export interface AttributeInput {
    label: string;
    confidence?: "low" | "medium" | "high";
    stage?: AttributeStage;
}

export interface DynamicSuggestionInput {
    insights: Array<{ kind: InsightKind; value: string }>;
    votes: Record<string, 1 | 0 | -1 | undefined>;
    limit?: number;
    recentTurns?: Array<{ role: string; text: string }>;
    transcriptSummary?: string;
    focusStatement?: string;
    previousSuggestions?: Array<{ title: string; summary?: string; distance?: CardDistance }>;
    attributes?: {
        skills?: AttributeInput[];
        aptitudes?: AttributeInput[];
        workStyles?: AttributeInput[];
    };
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

type AttributeBuckets = {
    skills: string[];
    aptitudes: string[];
    work_styles: string[];
};

type CanonicalRoleLibraryEntry = {
    keywords: string[];
    titles: string[];
};

const CANONICAL_ROLE_LIBRARY: CanonicalRoleLibraryEntry[] = [
    {
        keywords: ["research", "analysis", "insight", "analytics", "data"],
        titles: ["Research Analyst", "Market Research Associate", "Insights Coordinator", "Field Researcher"],
    },
    {
        keywords: ["content", "writing", "story", "editor", "copy"],
        titles: ["Content Strategist", "Editorial Researcher", "Content Marketing Specialist", "Editorial Assistant"],
    },
    {
        keywords: ["product", "tech", "technology", "software"],
        titles: ["Product Research Associate", "Technical Support Specialist", "Customer Insights Analyst", "Implementation Specialist"],
    },
    {
        keywords: ["community", "team", "sports", "athlete"],
        titles: ["Community Programs Coordinator", "Youth Development Coordinator", "Event Operations Specialist", "Partnerships Associate"],
    },
    {
        keywords: ["travel", "fieldwork", "global", "international"],
        titles: ["Field Operations Coordinator", "Travel Program Coordinator", "International Programs Associate", "Global Research Analyst"],
    },
    {
        keywords: ["gaming", "esports", "game"],
        titles: ["Community Manager", "Gameplay Insights Analyst", "User Research Associate", "Engagement Strategist"],
    },
    {
        keywords: ["education", "learning", "training"],
        titles: ["Learning Experience Designer", "Education Program Coordinator", "Training Content Specialist", "Instructional Associate"],
    },
    {
        keywords: ["operations", "logistics", "planning"],
        titles: ["Operations Coordinator", "Project Coordinator", "Program Specialist", "Logistics Analyst"],
    },
];

type TransferableAttributes = {
    established: AttributeBuckets;
    developing: AttributeBuckets;
    hobby: AttributeBuckets;
};

type ProfileEnvelope = {
    interests: string[];
    strengths: string[];
    goals: string[];
    frustrations: string[];
    hopes: string[];
    constraints: string[];
    highlights: string[];
    transferable_attributes: TransferableAttributes;
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

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set<string>([
    "the","and","for","with","that","this","from","into","about","your","their","they","you","are","our","use","using","used","build","builds","based","help","guide","create","maker","builder","design","designer","consultant","coach","educator","teacher","content","curator","community","connector","ai","poc","proof","concept","business","startup","founder","small","medium","enterprise","sme","tool","tools","voice","user","assistant","what","when","where","how","why","goal","goals","daily","tasks","task","adds","then","asks","like","just","really","thing","things","pretty","much","lot","stuff","yeah","sure","okay","nothing","really"
]);

function deriveCanonicalTitles(
    insights: DynamicSuggestionInput["insights"],
    attributes: TransferableAttributes,
    focusStatement?: string,
    transcriptSummary?: string
): string[] {
    const tokenSource: string[] = [];
    insights.forEach((item) => tokenSource.push(item.value));
    if (focusStatement) {
        tokenSource.push(focusStatement);
    }
    if (transcriptSummary) {
        tokenSource.push(transcriptSummary);
    }

    const appendAttributes = (entries: string[]) => {
        entries.forEach((entry) => tokenSource.push(entry));
    };

    appendAttributes(attributes.established.skills);
    appendAttributes(attributes.established.aptitudes);
    appendAttributes(attributes.established.work_styles);
    appendAttributes(attributes.developing.skills);
    appendAttributes(attributes.developing.aptitudes);
    appendAttributes(attributes.developing.work_styles);

    const tokens = new Set<string>();
    tokenSource.forEach((text) => tokenize(text).forEach((token) => tokens.add(token)));

    const titleScores = new Map<string, number>();

    CANONICAL_ROLE_LIBRARY.forEach((entry) => {
        const matches = entry.keywords.reduce((acc, keyword) => (tokens.has(keyword) ? acc + 1 : acc), 0);
        if (matches > 0) {
            entry.titles.forEach((title, index) => {
                const current = titleScores.get(title) ?? 0;
                titleScores.set(title, current + matches + (entry.titles.length - index) * 0.1);
            });
        }
    });

    return Array.from(titleScores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([title]) => title)
        .slice(0, 8);
}

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
    focusStatement,
    previousSuggestions = [],
    attributes,
}: DynamicSuggestionInput): Promise<DynamicSuggestion[]> {
    if (insights.length === 0) {
        return [];
    }

    const inferStage = (stage?: AttributeStage, confidence?: "low" | "medium" | "high"): AttributeStage => {
        if (stage === "established" || stage === "developing" || stage === "hobby") {
            return stage;
        }
        if (confidence === "high") return "established";
        if (confidence === "medium") return "developing";
        return "hobby";
    };

    const emptyBuckets = (): AttributeBuckets => ({ skills: [], aptitudes: [], work_styles: [] });
    const transferableBuckets: TransferableAttributes = {
        established: emptyBuckets(),
        developing: emptyBuckets(),
        hobby: emptyBuckets(),
    };

    const attributeInsights: Array<{ kind: InsightKind; value: string }> = [];
    const insightSet = new Set<string>();

    const pushInsight = (kind: InsightKind, value: string) => {
        const key = `${kind}:${value.toLowerCase()}`;
        if (insightSet.has(key)) {
            return;
        }
        insightSet.add(key);
        attributeInsights.push({ kind, value });
    };

    const pushToBucket = (bucket: string[], label: string) => {
        const normalized = label.trim();
        if (!normalized) return;
        if (!bucket.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
            bucket.push(normalized);
        }
    };

    const processAttributes = (entries: AttributeInput[] | undefined, category: keyof AttributeBuckets) => {
        if (!entries) return;
        entries.forEach((entry) => {
            const label = entry.label.trim();
            if (!label) {
                return;
            }
            const stage = inferStage(entry.stage, entry.confidence);
            pushToBucket(transferableBuckets[stage][category], label);

            if (category === "skills") {
                if (stage === "hobby") {
                    pushInsight("hope", label);
                } else {
                    pushInsight("strength", label);
                }
            } else if (category === "aptitudes") {
                if (stage === "hobby") {
                    pushInsight("hope", label);
                } else {
                    pushInsight("strength", label);
                }
            } else {
                pushInsight("highlight", label);
            }
        });
    };

    processAttributes(attributes?.skills, "skills");
    processAttributes(attributes?.aptitudes, "aptitudes");
    processAttributes(attributes?.workStyles, "work_styles");

    const compositeInsights = [...insights, ...attributeInsights];

    const establishedExamples = [
        ...transferableBuckets.established.skills,
        ...transferableBuckets.established.aptitudes,
        ...transferableBuckets.established.work_styles,
    ].slice(0, 4);
    const developingExamples = [
        ...transferableBuckets.developing.skills,
        ...transferableBuckets.developing.aptitudes,
        ...transferableBuckets.developing.work_styles,
    ].slice(0, 4);
    const hobbyExamples = [
        ...transferableBuckets.hobby.skills,
        ...transferableBuckets.hobby.aptitudes,
        ...transferableBuckets.hobby.work_styles,
    ].slice(0, 4);
    const establishedTotal =
        transferableBuckets.established.skills.length +
        transferableBuckets.established.aptitudes.length +
        transferableBuckets.established.work_styles.length;
    const developingTotal =
        transferableBuckets.developing.skills.length +
        transferableBuckets.developing.aptitudes.length +
        transferableBuckets.developing.work_styles.length;
    const hobbyTotal =
        transferableBuckets.hobby.skills.length +
        transferableBuckets.hobby.aptitudes.length +
        transferableBuckets.hobby.work_styles.length;

    const promptHints: PromptHints = {
        transferableAttributes: transferableBuckets,
        hobbyOnly: establishedTotal === 0 && developingTotal === 0 && hobbyTotal > 0,
        hobbyExamples,
        establishedExamples,
        developingExamples,
        canonicalTitles: deriveCanonicalTitles(compositeInsights, transferableBuckets, focusStatement, transcriptSummary),
    };

    const grouped = groupInsightsByKind(compositeInsights);

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
        transferable_attributes: transferableBuckets,
    };

    const likes = Object.entries(votes)
        .filter(([, value]) => value === 1)
        .map(([id]) => id);
    const dislikes = Object.entries(votes)
        .filter(([, value]) => value === -1)
        .map(([id]) => id);

    let motivationSummary: string | null = null;
    try {
        motivationSummary = await buildMotivationSummary(compositeInsights);
    } catch (error) {
        if (process.env.NODE_ENV !== "production") {
            console.warn("[dynamic-suggestions] motivation summary failed", error);
        }
    }

    const dominantKeywords = computeDominantKeywords(compositeInsights, transcriptSummary);
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
            insights: compositeInsights,
            motivationSummary,
            likes,
            dislikes,
            recentTurns,
            transcriptSummary,
            focusStatement,
            dominantKeywords,
            distance,
            existing: suggestions,
            avoidTitles,
            previousSuggestions,
            promptHints,
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
    focusStatement?: string;
    dominantKeywords: string[];
    distance: CardDistance;
    existing: DynamicSuggestion[];
    avoidTitles: Set<string>;
    previousSuggestions: Array<{ title: string; summary?: string; distance?: CardDistance }>;
    promptHints: PromptHints;
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
        focusStatement,
        dominantKeywords,
        distance,
        existing,
        avoidTitles,
        previousSuggestions,
        promptHints,
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

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
            focusStatement,
            dominantKeywords,
            distance,
            avoidTitles,
            existing,
            previousSuggestions,
            attempt,
            novelDomains,
            promptHints,
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

    console.warn(`[dynamic-suggestions] No ${distance} suggestion produced after ${maxAttempts} attempts`, {
        distance,
        dominantKeywords,
    });
    return null;
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
    focusStatement?: string;
    dominantKeywords: string[];
    distance: CardDistance;
    avoidTitles: Set<string>;
    existing: DynamicSuggestion[];
    attempt: number;
    novelDomains?: string[];
    previousSuggestions: Array<{ title: string; summary?: string; distance?: CardDistance }>;
    promptHints: PromptHints;
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
        attempt,
        novelDomains,
        previousSuggestions,
        promptHints,
    } = params;

    if (!openaiKey) {
        return null;
    }

    const focusText = (() => {
        if (params.focusStatement && params.focusStatement.trim().length > 0) {
            return params.focusStatement.trim();
        }
        const recent = recentTurns
            .slice()
            .reverse()
            .find((turn) => turn.text.trim().length > 0)?.text.trim();
        if (recent) return recent;
        if (transcriptSummary) {
            const lastUserLine = transcriptSummary
                .split(/\n/)
                .map((line) => line.trim())
                .reverse()
                .find((line) => line.toLowerCase().startsWith("user:"));
            if (lastUserLine) {
                return lastUserLine.replace(/^user:\s*/, "").trim();
            }
        }
        return undefined;
    })();

    const systemPrompt = buildSystemPrompt(distance, focusText, promptHints);

    const payload = {
        distance,
        attempt,
        user_profile: profile,
        transferable_attributes: profile.transferable_attributes,
        insights: insights.map((item) => ({ kind: item.kind, value: item.value })),
        motivation_summary: motivationSummary,
        positive_votes: likes,
        negative_votes: dislikes,
        recent_turns: recentTurns,
        transcript_summary: transcriptSummary,
        focus_statement: focusText,
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
        attribute_context: promptHints,
    };

    const temperature = distance === "unexpected" ? 0.5 : 0.3;

    console.debug("[suggestions] OpenAI prompt", {
        distance,
        attempt,
        systemPrompt,
        payload,
    });

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
        attempt,
        novelDomains,
        previousSuggestions,
        promptHints,
    } = params;

    const apiKey = perplexityKey;
    if (!apiKey) {
        return null;
    }

    const focusText = (() => {
        if (params.focusStatement && params.focusStatement.trim().length > 0) {
            return params.focusStatement.trim();
        }
        const recent = recentTurns
            .slice()
            .reverse()
            .find((turn) => turn.text.trim().length > 0)?.text.trim();
        if (recent) return recent;
        if (transcriptSummary) {
            const lastUserLine = transcriptSummary
                .split(/\n/)
                .map((line) => line.trim())
                .reverse()
                .find((line) => line.toLowerCase().startsWith("user:"));
            if (lastUserLine) {
                return lastUserLine.replace(/^user:\s*/, "").trim();
            }
        }
        return undefined;
    })();

    const systemPrompt = buildSystemPrompt(distance, focusText, promptHints);

    const payload = {
        distance,
        attempt,
        user_profile: profile,
        transferable_attributes: profile.transferable_attributes,
        insights: insights.map((item) => ({ kind: item.kind, value: item.value })),
        motivation_summary: motivationSummary,
        positive_votes: likes,
        negative_votes: dislikes,
        recent_turns: recentTurns,
        transcript_summary: transcriptSummary,
        focus_statement: focusText,
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
        attribute_context: promptHints,
    };

    const temperature = distance === "unexpected" ? 0.4 : 0.2;

    console.debug("[suggestions] Perplexity prompt", {
        distance,
        attempt,
        systemPrompt,
        payload,
    });

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

type PromptHints = {
    transferableAttributes?: TransferableAttributes;
    hobbyOnly?: boolean;
    establishedExamples?: string[];
    developingExamples?: string[];
    hobbyExamples?: string[];
    canonicalTitles?: string[];
};

function buildSystemPrompt(distance: CardDistance, focusStatement?: string, hints?: PromptHints): string {
    const base = [
        "You generate exactly one career pathway card per request.",
        "Respond with strict JSON: { \"card\": { ... } } and nothing else.",
        "Required card fields: title, summary, why_it_fits[], pathways[], next_steps[], micro_experiments[], neighbor_tags[], distance.",
        "Each array field must contain 1-3 concise bullet strings (no numbering).",
        "Keep copy concrete, based on the provided context.",
        "Study user_profile.transferable_attributes.established / developing / hobby buckets to understand which capabilities are proven versus casual.",
        "Ensure every card leans on a proven or developing capability and treats hobby-level abilities as practice steps or supporting context.",
        "Never reuse any titles from avoid_titles or previous_cards; invent new concepts.",
        "Do not recreate or lightly remix entries listed in already_provided_cards.",
        "Avoid repetition and do not invent personal details that were not provided.",
        "Use sentence case and avoid emoji or markdown formatting.",
        "Make transferable skills and aptitudes the anchor of every section; casual interests or fandoms are supporting flavour only.",
        "Prioritise economically viable career paths or consulting lanes with clear sources of income.",
        "If you mention a side hustle, label it explicitly as a side hustle and show how it fits alongside a primary path.",
        "Avoid fantasy or celebrity-dependent jobs (e.g. roles tied to a specific sports team or pop star). Keep outcomes broadly applicable.",
        "Only bridge into domains when there is a demonstrated strength or aptitude that makes the leap credible.",
        "Keep the title concise (max five words) and ensure it matches job boards or LinkedIn listings.",
        "Avoid stacking descriptors in the title (e.g. no \"Sports Travel Research Consultant\"); place niche focus in the summary or bullets instead.",
    ];

    if (focusStatement) {
        base.push(
            `Anchor the concept to this intent: "${focusStatement}".`,
            "Make sure the summary and why_it_fits explicitly speak to that request."
        );
    }

    const addContextList = (label: string, items?: string[]) => {
        if (!items || items.length === 0) return;
        const preview = items.slice(0, 3).join(", ");
        base.push(`${label}: ${preview}.`);
    };

    if (hints) {
        addContextList("Established capabilities to anchor", hints.establishedExamples);
        addContextList("Developing capabilities to nurture", hints.developingExamples);
        addContextList("Hobby-level interests", hints.hobbyExamples);

        if (hints.hobbyOnly) {
            const summary = hints.hobbyExamples && hints.hobbyExamples.length > 0
                ? hints.hobbyExamples.join(", ")
                : "hobby-level abilities";
            base.push(
                `The user currently only references hobby-level abilities (${summary}). Provide realistic starter pathways—assistant roles, certifications, structured practice, or community programs—before suggesting full professional outcomes.`
            );
            base.push(
                "Spell out which transferable skills need to be built before they can earn money from this lane."
            );
        }

        if (hints.canonicalTitles && hints.canonicalTitles.length > 0) {
            const titlePreview = hints.canonicalTitles.slice(0, 6).join(", ");
            base.push(
                `Prefer titles drawn from: ${titlePreview}. If none fit perfectly, choose a close canonical role rather than inventing a new compound title.`
            );
        }
    }

    if (distance === "core") {
        base.push(
            "Focus on deepening what they already build. Show refinement, packaging, or scaling opportunities inside their current lane.",
            "Reference their stated wins or tools explicitly so it feels tailored.",
            "Flag any missing capability that would make the idea shaky and suggest how to shore it up.",
            "Ensure the summary spells out why the role fits their proven strengths."
        );
    } else if (distance === "adjacent") {
        base.push(
            "Pivot their existing skills or inventory into a nearby audience or medium.",
            "Explicitly mention the bridge from the current work to the new context, so it feels like a natural stretch.",
            "Call out which strengths carry over so it does not read like a random hobby mash-up.",
            "Keep the title grounded in recognisable roles from mainstream job boards."
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

    const summaryLines = transcriptSummary
        ?.split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("user:"))
        .map((line) => line.replace(/^user:\s*/, "")) ?? [];

    summaryLines.forEach((line) => addText(line));

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
    const threshold = Math.max(8, Math.ceil(dominantKeywords.length * 0.6));
    const tooClose = overlap >= threshold;
    if (tooClose && process.env.NODE_ENV !== "production") {
        console.debug("[dynamic-suggestions] Candidate rejected for overlap", {
            title: card.title,
            overlap,
            threshold,
            dominantKeywords,
        });
    }
    return tooClose;
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
