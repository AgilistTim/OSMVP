import OpenAI from "openai";
import type { InsightKind } from "@/components/session-provider";
import {
    generateExplorationSummary,
    type GeneratedSummary,
    type SummaryRequestPayload,
    type SummaryStrength,
} from "@/lib/exploration-summary-engine";
import { tokenKey } from "@/lib/conversation-summary";

const OPENAI_SUGGESTION_MODEL = process.env.OPENAI_SUGGESTION_MODEL ?? "o4-mini";
const OPENAI_DOMAIN_MODEL = process.env.OPENAI_DOMAIN_MODEL ?? OPENAI_SUGGESTION_MODEL;
const OPENAI_TITLE_MODEL = process.env.OPENAI_TITLE_MODEL ?? OPENAI_SUGGESTION_MODEL;

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
    userName?: string;
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

const GROUNDED_VERBS = ["build", "launch", "start", "design", "coach", "mentor", "organise", "organize", "lead", "write", "ship", "sell", "prototype", "analyze", "analyse", "research"];
const FANTASY_GOAL_PATTERNS = [
    /play\s+for\b/i,
    /sign\s+for\b/i,
    /\b(be|become)\s+(a\s+)?pro\b/i,
    /\bbecome\s+famous\b/i,
    /\bworld\s+cup\b/i,
    /\bchampions\s+league\b/i,
    /\bolympic/i,
    /\bharvard/i,
    /\bnba\b/i,
    /\bnfl\b/i,
    /\bhollywood\b/i,
    /\bcelebrity\b/i,
];
const SPORTS_CLUB_KEYWORDS = ["arsenal", "chelsea", "liverpool", "manchester", "real madrid", "barcelona", "juventus", "psg", "bayern", "dortmund"];
const PRO_SPORTS_TERMS = ["football", "soccer", "basketball", "premier league", "premier", "world cup", "champions league", "nba", "nfl"];

function isGroundedGoal(goal: string, provenCapabilityCount: number): boolean {
    const lower = goal.toLowerCase();
    if (FANTASY_GOAL_PATTERNS.some((pattern) => pattern.test(lower))) {
        return false;
    }
    if (SPORTS_CLUB_KEYWORDS.some((club) => lower.includes(club))) {
        return false;
    }

    const hasGroundedVerb = GROUNDED_VERBS.some((verb) => lower.includes(verb));
    if (hasGroundedVerb) {
        return true;
    }

    if (provenCapabilityCount === 0) {
        const hasProVerb = /\b(play|coach|join|win|sign|score|become)\b/.test(lower);
        const mentionsProArena = PRO_SPORTS_TERMS.some((term) => lower.includes(term));
        if (hasProVerb && mentionsProArena) {
            return false;
        }
    }

    return true;
}

function sanitizeGoalInsights(
    insights: Array<{ kind: InsightKind; value: string }>,
    attributes: TransferableAttributes
): Array<{ kind: InsightKind; value: string }> {
    const provenCapabilityCount =
        attributes.established.skills.length +
        attributes.established.aptitudes.length +
        attributes.established.work_styles.length +
        attributes.developing.skills.length +
        attributes.developing.aptitudes.length +
        attributes.developing.work_styles.length;

    return insights.map((item) => {
        if (item.kind !== "goal") {
            return item;
        }
        if (isGroundedGoal(item.value, provenCapabilityCount)) {
            return item;
        }
        return { kind: "hope", value: item.value };
    });
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
    userName,
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

    const normalizedInsights = sanitizeGoalInsights(insights, transferableBuckets);
    if (normalizedInsights.length === 0) {
        return [];
    }

    const compositeInsights = [...normalizedInsights, ...attributeInsights];


    const promptHints: PromptHints = {
        transferableAttributes: transferableBuckets,
        hobbyOnly: establishedTotal === 0 && developingTotal === 0 && hobbyTotal > 0,
        hobbyExamples,
        establishedExamples,
        developingExamples,
    };

    const grouped = groupInsightsByKind(compositeInsights);

    const openaiKey = process.env.OPENAI_API_KEY ?? null;
    if (!openaiKey) {
        console.error("[dynamic-suggestions] Missing OPENAI_API_KEY for dynamic title generation");
        throw new Error("missing_openai_api_key");
    }
    const perplexityKey = process.env.PERPLEXITY_API_KEY ?? null;

    const useOpenAI = true;

    let profile: ProfileEnvelope = {
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

    const summaryPayload = buildSummaryPayload({
        userName,
        profile,
        groupedInsights: grouped,
        transferable: transferableBuckets,
        dominantKeywords,
        motivationSummary,
        recentTurns,
        focusStatement,
        transcriptSummary,
        insightCount: compositeInsights.length,
        previousSuggestionCount: previousSuggestions.length,
        likeCount: likes.length,
    });

    let canonicalSummary: GeneratedSummary | null = null;
    if (openaiKey) {
        try {
            canonicalSummary = await generateExplorationSummary(summaryPayload, {
                apiKey: openaiKey,
                model: OPENAI_SUGGESTION_MODEL,
            });
        } catch (error) {
            if (process.env.NODE_ENV !== "production") {
                console.warn("[dynamic-suggestions] exploration summary failed", error);
            }
        }
    }

    if (canonicalSummary) {
        profile = blendProfileWithSummary(profile, canonicalSummary, summaryPayload);
        promptHints.canonicalSummary = canonicalSummary;
    }
    promptHints.summaryPayload = summaryPayload;

    let canonicalTitles: string[];
    try {
        canonicalTitles = await generateCanonicalTitleList({
            apiKey: openaiKey,
            summaryPayload,
            groupedInsights: grouped,
            transferable: transferableBuckets,
            dominantKeywords,
            motivationSummary,
            focusStatement,
            recentTurns,
            transcriptSummary,
            previousSuggestions,
        });
    } catch (error) {
        console.error("[dynamic-suggestions] title generation failed", error);
        throw error instanceof Error ? error : new Error("title_generation_failed");
    }

    promptHints.canonicalTitles = canonicalTitles;
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
            summaryPayload,
            canonicalSummary,
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
    summaryPayload: SummaryRequestPayload;
    canonicalSummary: GeneratedSummary | null;
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
        summaryPayload,
        canonicalSummary,
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
            summaryPayload,
            canonicalSummary,
            existing: existing,
            attempt,
            novelDomains,
            previousSuggestions,
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
    summaryPayload: SummaryRequestPayload;
    canonicalSummary: GeneratedSummary | null;
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
        summaryPayload,
        canonicalSummary,
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
        canonical_summary: canonicalSummary,
        canonical_payload: summaryPayload,
        attribute_context: promptHints,
    };

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
        summaryPayload,
        canonicalSummary,
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
        canonical_summary: canonicalSummary,
        canonical_payload: summaryPayload,
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
    canonicalSummary?: GeneratedSummary | null;
    summaryPayload?: SummaryRequestPayload;
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

        if (hints.hobbyExamples && hints.hobbyExamples.length > 0) {
            const hobbyPreview = hints.hobbyExamples.slice(0, 4).join(", ");
            base.push(
                `Hobby-only signals (${hobbyPreview}) are acknowledgement material only. Mention them inside why_it_fits to show you listened, but do NOT anchor the title, summary, pathways, next_steps, or micro_experiments to them.`
            );
            base.push(
                "Angles to explore and next steps must reference transferable capabilities, market-facing experiments, or neutral practice reps—not casual fandoms or pickup hobbies."
            );
        }

        if (hints.canonicalSummary) {
            const { themes, strengths, constraint, whyItMatters, callToAction } = hints.canonicalSummary;
            if (themes.length > 0) {
                base.push(`Themes to respect: ${themes.join(", ")}.`);
            }
            if (strengths.length > 0) {
                base.push(`Strength anchors: ${strengths.join(", ")}.`);
            }
            if (constraint) {
                base.push(`Reality check in play: ${constraint}.`);
            }
            base.push(`Why this matters: ${whyItMatters}`);
            if (callToAction) {
                base.push(`Suggested CTA to echo: ${callToAction}`);
            }
        }

        if (hints.summaryPayload?.anchorQuotes && hints.summaryPayload.anchorQuotes.length > 0) {
            base.push(`Recent user quotes worth weaving in: ${hints.summaryPayload.anchorQuotes.join(" | ")}.`);
        }

        if (hints.summaryPayload?.notes && hints.summaryPayload.notes.length > 0) {
            base.push(`Keep notes in mind: ${hints.summaryPayload.notes.join(" | ")}.`);
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

function buildSummaryPayload({
    userName,
    profile,
    groupedInsights,
    transferable,
    dominantKeywords,
    motivationSummary,
    recentTurns,
    focusStatement,
    transcriptSummary,
    insightCount,
    previousSuggestionCount,
    likeCount,
}: {
    userName?: string;
    profile: ProfileEnvelope;
    groupedInsights: Map<InsightKind, string[]>;
    transferable: TransferableAttributes;
    dominantKeywords: string[];
    motivationSummary: string | null;
    recentTurns: Array<{ role: string; text: string }>;
    focusStatement?: string;
    transcriptSummary?: string;
    insightCount: number;
    previousSuggestionCount: number;
    likeCount: number;
}): SummaryRequestPayload {
    const safeName = userName && userName.trim().length > 0 ? userName.trim() : "You";

    const goalSeeds = [
        ...(groupedInsights.get("goal") ?? []),
        ...(groupedInsights.get("hope") ?? []),
        ...profile.goals,
        ...profile.hopes,
    ];
    const goals = dedupeOrdered(goalSeeds, 5);

    const themeSeeds = [
        ...profile.interests,
        ...goals,
        ...dominantKeywords.map(beautifyKeyword),
        ...(focusStatement ? [focusStatement] : []),
    ];
    const themes = dedupeOrdered(themeSeeds, 5);

    const constraintSeeds = [
        ...(groupedInsights.get("constraint") ?? []),
        ...(groupedInsights.get("frustration") ?? []),
        ...profile.constraints,
        ...profile.frustrations,
    ];
    const constraint = rewriteConstraintPhrase(dedupeOrdered(constraintSeeds, 1)[0]);

    const strengths = buildStrengthSummaries({ profile, groupedInsights, transferable });

    const transcriptNotes = transcriptSummary
        ? transcriptSummary
                .split("\n")
                .map((line) => line.replace(/^user:\s*/i, "").trim())
                .filter(Boolean)
                .slice(0, 3)
        : [];

    const notes = dedupeOrdered(
        [
            ...profile.highlights,
            ...profile.hopes,
            ...extractMotivationNotes(motivationSummary),
            ...transcriptNotes,
        ],
        6
    );

    const anchorQuotes = collectAnchorQuotes(recentTurns, 3);

    return {
        userName: safeName,
        themes,
        goals,
        strengths,
        constraint,
        metrics: {
            insightsUnlocked: insightCount,
            pathwaysExplored: previousSuggestionCount,
            pathsAmpedAbout: likeCount,
            boldMovesMade: profile.goals.length,
        },
        anchorQuotes,
        notes,
    };
}

function blendProfileWithSummary(
    profile: ProfileEnvelope,
    summary: GeneratedSummary,
    payload: SummaryRequestPayload
): ProfileEnvelope {
    const interests = dedupeOrdered([...(payload.themes ?? []), ...profile.interests], 8);
    const strengths = dedupeOrdered([...summary.strengths, ...profile.strengths], 8);
    const goals = dedupeOrdered([...(payload.goals ?? []), ...profile.goals], 8);
    const highlights = dedupeOrdered([...(payload.notes ?? []), ...profile.highlights], 8);
    const constraintSeeds = [
        ...(summary.constraint ? [summary.constraint] : []),
        ...(payload.constraint ? [payload.constraint] : []),
        ...profile.constraints,
    ];
    const constraints = dedupeOrdered(constraintSeeds, 3);

    return {
        ...profile,
        interests,
        strengths,
        goals,
        highlights,
        constraints,
    };
}

function buildStrengthSummaries({
    profile,
    groupedInsights,
    transferable,
}: {
    profile: ProfileEnvelope;
    groupedInsights: Map<InsightKind, string[]>;
    transferable: TransferableAttributes;
}): SummaryStrength[] {
    const labels: string[] = [];
    const pushLabel = (label: string, stage?: AttributeStage) => {
        const formatted = decorateStrength(label, stage);
        if (formatted) {
            labels.push(formatted);
        }
    };

    profile.strengths.forEach((label) => pushLabel(label));
    (groupedInsights.get("strength") ?? []).forEach((label) => pushLabel(label));

    const pushStage = (values: string[], stage: AttributeStage) => {
        values.forEach((label) => pushLabel(label, stage));
    };

    pushStage(transferable.established.skills, "established");
    pushStage(transferable.established.aptitudes, "established");
    pushStage(transferable.established.work_styles, "established");

    pushStage(transferable.developing.skills, "developing");
    pushStage(transferable.developing.aptitudes, "developing");
    pushStage(transferable.developing.work_styles, "developing");

    const deduped = dedupeOrdered(labels, 5);
    return deduped.map((label) => ({ label }));
}

function decorateStrength(label: string, stage?: AttributeStage): string {
    const tidy = tidyPhrase(label);
    if (!tidy) return "";
    if (!stage) return tidy;
    if (stage === "established") return `${tidy} (proven)`;
    if (stage === "developing") return `${tidy} (building)`;
    return `${tidy} (practice)`;
}

function collectAnchorQuotes(turns: Array<{ role: string; text: string }>, limit = 3): string[] {
    const anchors: string[] = [];
    for (let i = turns.length - 1; i >= 0; i -= 1) {
        const turn = turns[i];
        if (turn.role !== "user") continue;
        const text = tidyPhrase(turn.text);
        if (!text || text.length < 30) continue;
        const snippet = text.length > 220 ? `${text.slice(0, 217)}…` : text;
        anchors.unshift(snippet);
        if (anchors.length >= limit) break;
    }
    return anchors;
}

function extractMotivationNotes(summary: string | null): string[] {
    if (!summary) return [];
    return summary
        .replace(/[•◆●]/g, "\n")
        .split(/\n+/)
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .map(tidyPhrase)
        .filter(Boolean)
        .slice(0, 6);
}

function dedupeOrdered(values: string[], limit: number): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach((raw) => {
        const tidy = tidyPhrase(raw);
        if (!tidy) return;
        const key = tokenKey(tidy);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(tidy);
    });
    return result.slice(0, limit);
}

function tidyPhrase(value: string | undefined): string {
    if (!value) return "";
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return "";
    const first = compact.charAt(0);
    if (first === first.toUpperCase()) {
        return compact;
    }
    return `${first.toUpperCase()}${compact.slice(1)}`;
}

function beautifyKeyword(token: string): string {
    const tidy = tidyPhrase(token);
    if (!tidy) return "";
    if (/^[a-z]{1,3}$/i.test(tidy)) {
        return tidy.toUpperCase();
    }
    return tidy;
}

function rewriteConstraintPhrase(value?: string): string | null {
    if (!value) return null;
    let phrase = tidyPhrase(value);
    if (!phrase) return null;
    phrase = phrase
        .replace(/\bmy\b/gi, "your")
        .replace(/\bI\b/g, "you")
        .replace(/\bI'm\b/gi, "you're")
        .replace(/\bI am\b/gi, "you are");
    if (!/^(Balancing|Managing|Keeping|Covering|Funding|Finding)/i.test(phrase)) {
        const lower = phrase.charAt(0).toLowerCase() + phrase.slice(1);
        phrase = `Balancing ${lower}`;
    }
    return phrase;
}

async function generateCanonicalTitleList({
    apiKey,
    model = OPENAI_TITLE_MODEL,
    summaryPayload,
    groupedInsights,
    transferable,
    dominantKeywords,
    motivationSummary,
    focusStatement,
    recentTurns,
    transcriptSummary,
    previousSuggestions,
    limit = 12,
}: {
    apiKey: string;
    model?: string;
    summaryPayload: SummaryRequestPayload;
    groupedInsights: Map<InsightKind, string[]>;
    transferable: TransferableAttributes;
    dominantKeywords: string[];
    motivationSummary: string | null;
    focusStatement?: string;
    recentTurns: Array<{ role: string; text: string }>;
    transcriptSummary?: string;
    previousSuggestions: Array<{ title: string; summary?: string; distance?: CardDistance }>;
    limit?: number;
}): Promise<string[]> {
    const openai = new OpenAI({ apiKey });

    const insightClusters: Record<string, string[]> = {};
    groupedInsights.forEach((values, kind) => {
        insightClusters[kind] = values.slice(0, 12);
    });

    const transferableSnapshot = {
        established: {
            skills: transferable.established.skills.slice(0, 8),
            aptitudes: transferable.established.aptitudes.slice(0, 8),
            work_styles: transferable.established.work_styles.slice(0, 8),
        },
        developing: {
            skills: transferable.developing.skills.slice(0, 8),
            aptitudes: transferable.developing.aptitudes.slice(0, 8),
            work_styles: transferable.developing.work_styles.slice(0, 8),
        },
        hobby: {
            skills: transferable.hobby.skills.slice(0, 8),
            aptitudes: transferable.hobby.aptitudes.slice(0, 8),
            work_styles: transferable.hobby.work_styles.slice(0, 8),
        },
    };

    const previousTitles = previousSuggestions
        .map((item) => item.title)
        .filter((title): title is string => typeof title === "string" && title.trim().length > 0)
        .map((title) => title.trim());

    const payload = {
        summary: summaryPayload,
        insight_clusters: insightClusters,
        transferable_attributes: transferableSnapshot,
        dominant_keywords: dominantKeywords.slice(0, 16),
        motivation_summary: motivationSummary,
        focus_statement: focusStatement ?? null,
        recent_turns: recentTurns.slice(-4),
        transcript_summary: transcriptSummary ?? null,
        previous_titles: previousTitles,
    };

    const systemPrompt = [
        "You are MirAI's role-family curator for UK & global teens exploring careers.",
        "Return JSON: { \"titles\": [ { \"title\": string, \"kind\": \"core|adjacent|experimental\", \"domain\": string } ] }.",
        "Titles must be recognisable on job boards (2-5 words max) and celebrate exploration over prescriptions.",
        "Blend proven anchors, stretch roles, and at least one experimental/entrepreneurial direction when the signals support it.",
        "Avoid reusing anything in previous_titles.",
    ].join("\n");

    const completion = await openai.chat.completions.create({
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(payload, null, 2) },
        ],
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
        throw new Error("title_generation_empty_response");
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error("title_generation_non_json_response");
    }

    const rawTitles: string[] = [];
    if (Array.isArray((parsed as { titles?: unknown }).titles)) {
        (parsed as { titles: unknown[] }).titles.forEach((entry) => {
            if (typeof entry === "string") {
                rawTitles.push(entry);
            } else if (
                entry &&
                typeof entry === "object" &&
                typeof (entry as { title?: unknown }).title === "string"
            ) {
                rawTitles.push((entry as { title: string }).title);
            }
        });
    } else if (Array.isArray(parsed)) {
        (parsed as unknown[]).forEach((entry) => {
            if (typeof entry === "string") {
                rawTitles.push(entry);
            } else if (
                entry &&
                typeof entry === "object" &&
                typeof (entry as { title?: unknown }).title === "string"
            ) {
                rawTitles.push((entry as { title: string }).title);
            }
        });
    }

    const filtered = filterAndNormaliseTitles(rawTitles, previousTitles, limit);
    if (filtered.length === 0) {
        throw new Error("title_generation_empty_list");
    }
    return filtered;
}

function filterAndNormaliseTitles(values: string[], previousTitles: string[], limit: number): string[] {
    const seen = new Set<string>();
    const previousKeys = new Set(previousTitles.map((title) => tokenKey(title)));
    const results: string[] = [];

    values.forEach((raw) => {
        if (typeof raw !== "string") return;
        const trimmed = raw.replace(/\s+/g, " ").trim();
        if (!trimmed) return;
        const key = tokenKey(trimmed);
        if (previousKeys.has(key) || seen.has(key)) return;
        seen.add(key);
        results.push(trimmed);
    });

    return results.slice(0, limit);
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