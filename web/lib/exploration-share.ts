import type { CareerSuggestion, JourneyVisualAsset } from "@/components/session-provider";
import type { ExplorationSnapshot, LearningPathwayGroup } from "@/lib/exploration";

export const SHARE_PAYLOAD_VERSION = 1;
export const MAX_SHARE_PAYLOAD_BYTES = 60 * 1024; // 60 KB
export const MAX_SHARE_SUGGESTIONS = 12;

export interface SharedJourneyStats {
	insightsUnlocked: number;
	pathwaysExplored: number;
	pathsAmpedAbout: number;
	boldMovesMade: number;
}

export interface SharedTopPathway {
	id: string;
	title: string;
	summary: string;
	nextStep?: string | null;
}

export interface SharedSignalItem {
	label: string;
	evidence?: string | null;
}

export interface SharedSignalBuckets {
	strengths: SharedSignalItem[];
	interests: SharedSignalItem[];
	goals: SharedSignalItem[];
}

export interface SharedGeneratedSummary {
	themes: string[];
	strengths: string[];
	constraint: string | null;
	whyItMatters: string;
	callToAction?: string | null;
	closing: string;
}

export type ShareableSuggestion = Pick<
	CareerSuggestion,
	| "id"
	| "title"
	| "summary"
	| "confidence"
	| "distance"
	| "score"
	| "whyItFits"
	| "nextSteps"
	| "microExperiments"
	| "careerAngles"
	| "neighborTerritories"
	| "externalLinks"
>;

export type ShareableVotes = Record<string, 1 | 0 | -1>;

export interface SharedExplorationPayload {
	version: number;
	generatedAt: string;
	userName: string;
	heroSummary: string;
	discoveryDate: string;
	sessionId?: string | null;
	expiresAt?: string;
	createdAt?: string;
	slug?: string;
	snapshot: ExplorationSnapshot;
	stats: SharedJourneyStats;
	topPathways: SharedTopPathway[];
	signalBuckets: SharedSignalBuckets;
	summary: SharedGeneratedSummary | null;
	learningResources: LearningPathwayGroup[];
	suggestions: ShareableSuggestion[];
	votesByCareerId: ShareableVotes;
	journeyVisual?: JourneyVisualAsset | null;
}

export interface BuildSharedExplorationPayloadInput {
	userName: string;
	heroSummary: string;
	discoveryDate: string;
	sessionId?: string;
	snapshot: ExplorationSnapshot;
	stats: SharedJourneyStats;
	topPathways: SharedTopPathway[];
	signalBuckets: SharedSignalBuckets;
	summary: SharedGeneratedSummary | null;
	learningResources: LearningPathwayGroup[];
	suggestions: CareerSuggestion[];
	votesByCareerId: Record<string, 1 | 0 | -1 | undefined>;
	journeyVisual?: JourneyVisualAsset | null;
	generatedAt?: string;
}

export function buildSharedExplorationPayload(input: BuildSharedExplorationPayloadInput): SharedExplorationPayload {
	const {
		userName,
		heroSummary,
		discoveryDate,
		sessionId,
		snapshot,
		stats,
		topPathways,
		signalBuckets,
		summary,
		learningResources,
		suggestions,
		votesByCareerId,
		journeyVisual,
		generatedAt,
	} = input;

	const payload: SharedExplorationPayload = {
		version: SHARE_PAYLOAD_VERSION,
		generatedAt: generatedAt ?? new Date().toISOString(),
		userName: userName.trim() || "Your",
		heroSummary: heroSummary.trim(),
		discoveryDate,
		sessionId: sessionId ?? null,
		snapshot,
		stats,
		topPathways: sanitizeTopPathways(topPathways),
		signalBuckets: sanitizeSignalBuckets(signalBuckets),
		summary: summary ? sanitizeSummary(summary) : null,
		learningResources: Array.isArray(learningResources) ? learningResources : [],
		suggestions: pruneSuggestions(suggestions),
		votesByCareerId: normalizeVotes(votesByCareerId),
		journeyVisual: sanitizeJourneyVisual(journeyVisual),
	};

	assertPayloadSize(payload);
	return payload;
}

export function validateSharedExplorationPayload(value: unknown): SharedExplorationPayload {
	if (!value || typeof value !== "object") {
		throw new Error("Share payload must be an object");
	}
	const payload = value as Partial<SharedExplorationPayload>;
	if (payload.version !== SHARE_PAYLOAD_VERSION) {
		throw new Error("Unsupported share payload version");
	}
	const requiredStrings: Array<keyof SharedExplorationPayload> = ["userName", "heroSummary", "discoveryDate", "generatedAt"];
	requiredStrings.forEach((field) => {
		if (typeof payload[field] !== "string" || !(payload[field] as string).trim()) {
			throw new Error(`Share payload missing ${String(field)}`);
		}
	});
	if (!payload.snapshot || typeof payload.snapshot !== "object") {
		throw new Error("Share payload missing snapshot");
	}
	if (!payload.stats || typeof payload.stats !== "object") {
		throw new Error("Share payload missing stats");
	}
	if (!Array.isArray(payload.suggestions)) {
		throw new Error("Share payload missing suggestions");
	}
	if (!payload.votesByCareerId || typeof payload.votesByCareerId !== "object") {
		throw new Error("Share payload missing votes");
	}
	assertPayloadSize(payload as SharedExplorationPayload);
	return payload as SharedExplorationPayload;
}

function sanitizeTopPathways(pathways: SharedTopPathway[]): SharedTopPathway[] {
	return (Array.isArray(pathways) ? pathways : []).slice(0, 3).map((path) => ({
		id: path.id,
		title: path.title,
		summary: path.summary,
		nextStep: path.nextStep ?? null,
	}));
}

function sanitizeSignalBuckets(buckets: SharedSignalBuckets): SharedSignalBuckets {
	const sanitizeItems = (items: SharedSignalItem[] = []) =>
		items
			.filter((item) => typeof item?.label === "string" && item.label.trim().length > 0)
			.slice(0, 5)
			.map((item) => ({
				label: item.label.trim(),
				evidence: typeof item.evidence === "string" && item.evidence.trim().length > 0 ? item.evidence.trim() : null,
			}));
	return {
		strengths: sanitizeItems(buckets?.strengths),
		interests: sanitizeItems(buckets?.interests),
		goals: sanitizeItems(buckets?.goals),
	};
}

function sanitizeSummary(summary: SharedGeneratedSummary): SharedGeneratedSummary {
	return {
		themes: (summary.themes ?? []).slice(0, 5),
		strengths: (summary.strengths ?? []).slice(0, 5),
		constraint: summary.constraint ?? null,
		whyItMatters: summary.whyItMatters ?? "",
		callToAction: summary.callToAction ?? null,
		closing: summary.closing ?? "",
	};
}

function sanitizeJourneyVisual(visual?: JourneyVisualAsset | null): JourneyVisualAsset | null | undefined {
	if (!visual) return visual ?? null;
	const { imageBase64, plan, model, createdAt, mimeType } = visual;
	if (typeof imageBase64 !== "string" || typeof plan !== "object") {
		return null;
	}
	return {
		imageBase64,
		plan,
		model,
		createdAt,
		mimeType,
	};
}

function pruneSuggestions(suggestions: CareerSuggestion[]): ShareableSuggestion[] {
	if (!Array.isArray(suggestions)) {
		return [];
	}
	return suggestions
		.slice(0, MAX_SHARE_SUGGESTIONS)
		.map((suggestion) => {
			const {
				id,
				title,
				summary,
				confidence,
				score,
				distance,
				whyItFits = [],
				nextSteps = [],
				microExperiments = [],
				careerAngles = [],
				neighborTerritories = [],
				externalLinks = [],
			} = suggestion;
			return {
				id,
				title,
				summary,
				confidence,
				score,
				distance,
				whyItFits: [...whyItFits],
				nextSteps: [...nextSteps],
				microExperiments: [...microExperiments],
				careerAngles: [...careerAngles],
				neighborTerritories: [...neighborTerritories],
				externalLinks: externalLinks ? [...externalLinks] : [],
			};
		})
		.filter((item) => typeof item.id === "string" && item.id.length > 0);
}

function normalizeVotes(votes: Record<string, 1 | 0 | -1 | undefined>): ShareableVotes {
	return Object.entries(votes ?? {}).reduce<ShareableVotes>((acc, [careerId, value]) => {
		if (value === 1 || value === 0 || value === -1) {
			acc[careerId] = value;
		}
		return acc;
	}, {});
}

function assertPayloadSize(payload: SharedExplorationPayload) {
	const encoder = new TextEncoder();
	const size = encoder.encode(JSON.stringify(payload)).byteLength;
	if (size > MAX_SHARE_PAYLOAD_BYTES) {
		throw new Error("Share payload exceeds maximum size");
	}
}

