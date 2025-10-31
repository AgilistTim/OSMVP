"use client";

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { CardDistance } from "@/lib/dynamic-suggestions";
import {
	recommendConversationPhase,
	type ConversationPhase,
	type ConversationRubric,
} from "@/lib/conversation-phases";
import { computeRubricScores } from "@/lib/conversation-phases";
import type { RubricEvaluationResponseBody } from "@/lib/conversation-rubric";

export type SessionMode = "text" | "voice" | null;

export type InsightKind =
	| "interest"
	| "strength"
	| "constraint"
	| "goal"
	| "frustration"
	| "hope"
	| "boundary"
	| "highlight";

export type InsightSource = "user" | "assistant" | "system";

export interface ConversationTurn {
	role: "user" | "assistant";
	text: string;
}

export interface ProfileInsight {
	id: string;
	kind: InsightKind;
	value: string;
	source: InsightSource;
	confidence?: "low" | "medium" | "high";
	evidence?: string;
	turnId?: string;
	createdAt: number;
	updatedAt: number;
}

export interface MutualMoment {
	id: string;
	text: string;
	createdAt: number;
	updatedAt: number;
	source: "assistant";
}

export interface OnboardingResponse {
	id: string;
	questionId: string;
	question: string;
	selectedOptionId: string;
	selectedOptionTitle: string;
	selectedOptionDescription?: string;
	freeText?: string;
	createdAt: number;
}

export interface ProfileAggregates {
	interests: string[];
	strengths: string[];
	constraints: string[];
	goals: string[];
	frustrations: string[];
	hopes: string[];
	boundaries: string[];
	highlights: string[];
}

export interface Profile {
	readiness?: "G1" | "G2" | "G3" | "G4";
	demographics?: Record<string, unknown>;
	insights: ProfileInsight[];
	onboardingResponses: OnboardingResponse[];
	interests: string[];
	strengths: string[];
	constraints: string[];
	goals: string[];
	frustrations: string[];
	hopes: string[];
	boundaries: string[];
	highlights: string[];
	mutualMoments: MutualMoment[];
	lastTranscript?: string;
	lastTranscriptId?: string;
	lastAssistantTranscript?: string;
	lastAssistantTranscriptId?: string;
}

export interface CareerCardCandidate {
	id: string;
	title: string;
	summary?: string;
	score?: number;
}

export interface CareerSuggestion {
	id: string;
	title: string;
	summary: string;
	careerAngles: string[];
	nextSteps: string[];
	microExperiments: string[];
	whyItFits: string[];
	confidence: "high" | "medium" | "low";
	score: number;
	neighborTerritories: string[];
	distance: CardDistance;
	externalLinks?: {
		label: string;
		url: string;
		type: "course" | "volunteering" | "resource" | "other";
	}[];
}

interface SessionState {
	mode: SessionMode;
	profile: Profile;
	candidates: CareerCardCandidate[];
	votesByCareerId: Record<string, 1 | -1 | 0>;
	suggestions: CareerSuggestion[];
	summary?: string;
	started: boolean;
	sessionId: string;
	voice: {
		status: "idle" | "requesting-token" | "connecting" | "connected" | "error";
		error?: string;
		lastLatencyMs?: number;
		microphone: "inactive" | "active" | "paused";
	};
	onboardingStep: number;
	turns: ConversationTurn[];
	conversationPhase: ConversationPhase;
	conversationPhaseRationale: string[];
	conversationRubric: ConversationRubric | null;
	shouldSeedTeaserCard: boolean;
}

interface SessionActions {
	setMode: (mode: SessionMode) => void;
	setProfile: (profile: Partial<Profile>) => void;
	appendProfileInsights: (
		insights: Array<
			Omit<ProfileInsight, "id" | "createdAt" | "updatedAt"> & {
				id?: string;
			}
		>
	) => void;
	updateProfileInsight: (id: string, updates: Partial<Pick<ProfileInsight, "value" | "kind" | "source">>) => void;
	removeProfileInsight: (id: string) => void;
	resetProfile: () => void;
	setCandidates: (candidates: CareerCardCandidate[]) => void;
	voteCareer: (careerId: string, value: 1 | -1 | 0 | null) => void;
	setSummary: (summary: string) => void;
	beginSession: () => void;
	setVoice: (voice: SessionState["voice"]) => void;
	setOnboardingStep: (value: number | ((current: number) => number)) => void;
	addMutualMoment: (text: string) => MutualMoment | null;
	removeMutualMoment: (id: string) => void;
	clearMutualMoments: () => void;
	setSuggestions: (suggestions: CareerSuggestion[]) => void;
	clearSuggestions: () => void;
	setTurns: React.Dispatch<React.SetStateAction<ConversationTurn[]>>;
	overrideConversationPhase: (phase: ConversationPhase, rationale?: string[]) => void;
	clearTeaserSeed: () => void;
}

const SessionContext = createContext<(SessionState & SessionActions) | null>(null);

export function useSession(): SessionState & SessionActions {
	const ctx = useContext(SessionContext);
	if (!ctx) {
		throw new Error("useSession must be used within SessionProvider");
	}
	return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [mode, setModeState] = useState<SessionMode>(null);
	const [profile, updateProfile] = useState<Profile>(() => createEmptyProfile());
	const [candidates, setCandidates] = useState<CareerCardCandidate[]>([]);
	const [votesByCareerId, setVotes] = useState<Record<string, 1 | -1 | 0>>(() => {
		console.log('[SessionProvider] Initializing votesByCareerId');
		if (typeof window === 'undefined') return {};
		try {
			const stored = localStorage.getItem('osmvp_votes');
			if (stored) {
				const parsed = JSON.parse(stored);
				console.log('[SessionProvider] Restored votes from localStorage:', parsed);
				return parsed;
			}
		} catch (error) {
			console.error('[SessionProvider] Failed to restore votes:', error);
		}
		return {};
	});
	const [suggestions, updateSuggestions] = useState<CareerSuggestion[]>(() => {
		console.log('[SessionProvider] Initializing suggestions');
		if (typeof window === 'undefined') return [];
		try {
			const stored = localStorage.getItem('osmvp_suggestions');
			if (stored) {
				const parsed = JSON.parse(stored);
				console.log('[SessionProvider] Restored suggestions from localStorage:', parsed.length, 'cards');
				return parsed;
			}
		} catch (error) {
			console.error('[SessionProvider] Failed to restore suggestions:', error);
		}
		return [];
	});
	const [summary, setSummaryState] = useState<string | undefined>(undefined);
	const [started, setStarted] = useState<boolean>(false);
	const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
	const [voice, setVoiceState] = useState<SessionState["voice"]>({ status: "idle", microphone: "inactive" });
	const [onboardingStep, updateOnboardingStep] = useState<number>(0);
	const [turns, setTurnsState] = useState<ConversationTurn[]>([]);
	const [conversationPhase, setConversationPhase] = useState<ConversationPhase>("warmup");
	const [conversationPhaseRationale, setConversationPhaseRationale] = useState<string[]>([]);
	const [conversationRubric, setConversationRubric] = useState<ConversationRubric | null>(null);
	const [shouldSeedTeaserCard, setShouldSeedTeaserCard] = useState(false);
	const rubricRequestIdRef = useRef(0);

	const setVoice = useCallback(
		(nextVoice: SessionState["voice"]) => {
			setVoiceState((prev) => {
				if (
					prev.status === nextVoice.status &&
					prev.error === nextVoice.error &&
					prev.lastLatencyMs === nextVoice.lastLatencyMs &&
					prev.microphone === nextVoice.microphone
				) {
					return prev;
				}
				return nextVoice;
			});
		},
		[setVoiceState]
	);

	const setProfile = useCallback((partial: Partial<Profile>) => {
		updateProfile((prev) => {
			const merged: Profile = {
				...prev,
				...partial,
				insights: partial.insights ?? prev.insights,
				onboardingResponses: partial.onboardingResponses ?? prev.onboardingResponses,
				mutualMoments: partial.mutualMoments ?? prev.mutualMoments,
			};
			return {
				...merged,
				...summariseInsights(merged.insights),
			};
		});
	}, []);

	const appendProfileInsights: SessionActions["appendProfileInsights"] = useCallback((incoming) => {
		const sanitized = incoming.map((item) => ({
			...item,
			value: item.value.trim(),
		}))
		.filter((item) => item.value.length > 0);

		if (sanitized.length === 0) {
			return;
		}

		updateProfile((prev) => {
			const now = Date.now();
			const existing = [...prev.insights];
			sanitized.forEach((item) => {
				const key = `${item.kind}:${item.value.toLowerCase()}`;
				const foundIndex = existing.findIndex(
					(insight) => `${insight.kind}:${insight.value.toLowerCase()}` === key
				);
				if (foundIndex >= 0) {
					existing[foundIndex] = {
						...existing[foundIndex],
						source: item.source ?? existing[foundIndex].source,
						evidence: item.evidence ?? existing[foundIndex].evidence,
						confidence: item.confidence ?? existing[foundIndex].confidence,
						turnId: item.turnId ?? existing[foundIndex].turnId,
						updatedAt: now,
					};
					return;
				}
				existing.push({
					id: item.id ?? crypto.randomUUID(),
					kind: item.kind,
					value: item.value,
					source: item.source ?? "assistant",
					confidence: item.confidence,
					evidence: item.evidence,
					turnId: item.turnId,
					createdAt: now,
					updatedAt: now,
				});
			});

			return {
				...prev,
				insights: existing,
				...summariseInsights(existing),
			};
		});
	}, []);

	const updateProfileInsight = useCallback<SessionActions["updateProfileInsight"]>((id, updates) => {
		updateProfile((prev) => {
			const nextInsights = prev.insights.map((insight) =>
				insight.id === id
					? {
							...insight,
							...updates,
							value:
								typeof updates.value === "string" && updates.value.trim().length > 0
									? updates.value.trim()
									: insight.value,
							kind: updates.kind ?? insight.kind,
							source: updates.source ?? insight.source,
							updatedAt: Date.now(),
					  }
					: insight
			);

			return {
				...prev,
				insights: nextInsights,
				...summariseInsights(nextInsights),
			};
		});
	}, []);

	const removeProfileInsight = useCallback<SessionActions["removeProfileInsight"]>((id) => {
		updateProfile((prev) => {
			const nextInsights = prev.insights.filter((insight) => insight.id !== id);
			return {
				...prev,
				insights: nextInsights,
				...summariseInsights(nextInsights),
			};
		});
	}, []);

	const addMutualMoment = useCallback<SessionActions["addMutualMoment"]>((text) => {
		const trimmed = text.trim();
		if (!trimmed) {
			return null;
		}
		const now = Date.now();
		const moment: MutualMoment = {
			id: crypto.randomUUID(),
			text: trimmed,
			createdAt: now,
			updatedAt: now,
			source: "assistant",
		};

		updateProfile((prev) => {
			const exists = prev.mutualMoments.some(
				(item) => item.text.toLowerCase() === trimmed.toLowerCase()
			);
			if (exists) {
				return prev;
			}
			return {
				...prev,
				mutualMoments: [...prev.mutualMoments, moment],
			};
		});

		return moment;
	}, []);

	const removeMutualMoment = useCallback<SessionActions["removeMutualMoment"]>((id) => {
		updateProfile((prev) => ({
			...prev,
			mutualMoments: prev.mutualMoments.filter((moment) => moment.id !== id),
		}));
	}, []);

	const clearMutualMoments = useCallback(() => {
		updateProfile((prev) => ({
			...prev,
			mutualMoments: [],
		}));
	}, []);

	const setSuggestions = useCallback<SessionActions["setSuggestions"]>((incoming) => {
		updateSuggestions(incoming);
	}, []);

	const clearSuggestions = useCallback(() => {
		updateSuggestions([]);
	}, []);

	const overrideConversationPhase = useCallback<SessionActions["overrideConversationPhase"]>((phase, rationale) => {
		setConversationPhase(phase);
		if (Array.isArray(rationale)) {
			setConversationPhaseRationale(rationale);
		}
		setShouldSeedTeaserCard(false);
	}, []);

	const clearTeaserSeed = useCallback(() => {
		setShouldSeedTeaserCard(false);
	}, []);

	const resetProfile = useCallback(() => {
		setProfile(createEmptyProfile());
		setCandidates([]);
		setVotes({});
		updateSuggestions([]);
		setSummaryState(undefined);
		updateOnboardingStep(0);
		setVoiceState({ status: "idle", microphone: "inactive" });
		setTurnsState([]);
		setConversationPhase("warmup");
		setConversationPhaseRationale([]);
		setConversationRubric(null);
		setShouldSeedTeaserCard(false);
	}, [
		setProfile,
		setCandidates,
		setVotes,
		updateSuggestions,
		setSummaryState,
		updateOnboardingStep,
		setVoiceState,
		setTurnsState,
	]);

	const beginSession = useCallback(() => {
		setSessionId(crypto.randomUUID());
		resetProfile();
		setModeState(null);
		setStarted(true);
	}, [resetProfile, setModeState, setSessionId, setStarted]);

	useEffect(() => {
		if (turns.length === 0) {
			setConversationRubric(null);
			setConversationPhase("warmup");
			setConversationPhaseRationale([]);
			setShouldSeedTeaserCard(false);
			return;
		}

		const insightSnapshots = profile.insights.map((insight) => ({
			kind: insight.kind,
			value: insight.value,
		}));

		const voteCount = Object.values(votesByCareerId).filter((value) => value === 1 || value === -1).length;

		const decision = recommendConversationPhase({
			currentPhase: conversationPhase,
			turns,
			insights: insightSnapshots,
			suggestionCount: suggestions.length,
			voteCount,
			rubric: conversationRubric,
		});

		if (decision.nextPhase !== conversationPhase) {
			setConversationPhase(decision.nextPhase);
		}

		setConversationPhaseRationale(decision.rationale);
		setShouldSeedTeaserCard(decision.shouldSeedTeaserCard);
	}, [turns, profile.insights, votesByCareerId, suggestions.length, conversationRubric, conversationPhase]);

	// Local rubric scoring (static dimensions + dynamic scores) — no network
	useEffect(() => {
		if (turns.length === 0) {
			setConversationRubric(null);
			return;
		}
		const insightSnapshots = profile.insights.map((i) => ({ kind: i.kind, value: i.value }));
		const rubric = computeRubricScores({
			turns: turns.slice(-12),
			insights: insightSnapshots,
			votes: votesByCareerId,
			suggestionCount: suggestions.length,
			prevRubric: conversationRubric,
		});
		setConversationRubric(rubric);
		if (process.env.NODE_ENV !== 'production') {
			console.info('[SessionProvider] Local rubric', {
				engagementStyle: rubric.engagementStyle,
				contextDepth: rubric.contextDepth,
				readinessBias: rubric.readinessBias,
				cardStatus: rubric.cardReadiness.status,
				gaps: rubric.insightGaps,
				recommendedFocus: rubric.recommendedFocus,
			});
		}
	}, [turns, profile.insights, votesByCareerId, suggestions.length]);

	const value = useMemo<SessionState & SessionActions>(
		() => ({
			mode,
			profile,
			candidates,
			votesByCareerId,
			suggestions,
			summary,
			started,
			sessionId,
			voice,
			onboardingStep,
			conversationPhase,
			conversationPhaseRationale,
			conversationRubric,
			shouldSeedTeaserCard,
			setMode: (m) => setModeState(m),
			setProfile,
			appendProfileInsights,
			updateProfileInsight,
			removeProfileInsight,
			resetProfile,
			setCandidates,
			voteCareer: (careerId, value) => {
				console.log('[voteCareer] Called with:', { careerId, value });
				setVotes((prev) => {
					console.log('[voteCareer] Previous votes:', prev);
					if (value === null) {
						const updated = { ...prev };
						delete updated[careerId];
						console.log('[voteCareer] Clearing vote, new votes:', updated);
						return updated;
					}
					const newVotes = { ...prev, [careerId]: value };
					console.log('[voteCareer] Setting vote, new votes:', newVotes);
					return newVotes;
				});
			},
			setSummary: (s) => setSummaryState(s),
			beginSession,
			setVoice,
			setOnboardingStep: (value) =>
				updateOnboardingStep((prev) =>
					typeof value === "function" ? (value as (current: number) => number)(prev) : value
				),
			addMutualMoment,
			removeMutualMoment,
			clearMutualMoments,
			setSuggestions,
			clearSuggestions,
			turns,
			setTurns: (updater) => setTurnsState(updater),
			overrideConversationPhase,
			clearTeaserSeed,
		}),
	[
		mode,
		profile,
		candidates,
		votesByCareerId,
		suggestions,
		summary,
		started,
		sessionId,
		voice,
		onboardingStep,
		conversationPhase,
		conversationPhaseRationale,
		conversationRubric,
		shouldSeedTeaserCard,
		setModeState,
		setProfile,
		appendProfileInsights,
		updateProfileInsight,
		removeProfileInsight,
		resetProfile,
		setCandidates,
		setVotes,
		setSummaryState,
		beginSession,
		setVoice,
		updateOnboardingStep,
		addMutualMoment,
		removeMutualMoment,
		clearMutualMoments,
		setSuggestions,
		clearSuggestions,
		turns,
		setTurnsState,
		overrideConversationPhase,
		clearTeaserSeed,
	]
);

	// Persist votes to localStorage
	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem('osmvp_votes', JSON.stringify(votesByCareerId));
			console.log('[SessionProvider] Saved votes to localStorage:', Object.keys(votesByCareerId).length, 'votes');
		} catch (error) {
			console.error('[SessionProvider] Failed to save votes:', error);
		}
	}, [votesByCareerId]);

	// Persist suggestions to localStorage (with deduplication)
	const lastSavedSuggestionsRef = useRef<string>('');
	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			const serialized = JSON.stringify(suggestions);
			// Only save if actually changed
			if (serialized !== lastSavedSuggestionsRef.current) {
				localStorage.setItem('osmvp_suggestions', serialized);
				lastSavedSuggestionsRef.current = serialized;
				console.log('[SessionProvider] Saved suggestions to localStorage:', suggestions.length, 'cards');
			}
		} catch (error) {
			console.error('[SessionProvider] Failed to save suggestions:', error);
		}
	}, [suggestions]);

	useEffect(() => {
		if (process.env.NODE_ENV === "production") {
			return;
		}
		console.groupCollapsed(`[profile] session ${sessionId}`);
		console.log("Readiness", profile.readiness);
		console.log("Interests", profile.interests);
		console.log("Strengths", profile.strengths);
		console.log("Constraints", profile.constraints);
		console.log("Goals", profile.goals);
		console.log("Frustrations", profile.frustrations);
		console.log("Hopes", profile.hopes);
		console.log("Boundaries", profile.boundaries);
		console.log("Highlights", profile.highlights);
		console.log("Onboarding responses", profile.onboardingResponses);
		console.log("Mutual moments", profile.mutualMoments);
		console.log("Insights", profile.insights);
		console.log("Suggestions", suggestions);
		console.log("Turns", turns);
		console.groupEnd();
	}, [profile, sessionId, suggestions, turns]);

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function createEmptyProfile(): Profile {
	return {
		insights: [],
		onboardingResponses: [],
		interests: [],
		strengths: [],
		constraints: [],
		goals: [],
		frustrations: [],
		hopes: [],
		boundaries: [],
		highlights: [],
		mutualMoments: [],
	};
}

function summariseInsights(insights: ProfileInsight[]): ProfileAggregates {
	const interests = new Map<string, string>();
	const strengths = new Map<string, string>();
	const constraints = new Map<string, string>();
	const goals = new Map<string, string>();
	const frustrations = new Map<string, string>();
	const hopes = new Map<string, string>();
	const boundaries = new Map<string, string>();
	const highlights = new Map<string, string>();

	insights.forEach((insight) => {
		const key = insight.value.toLowerCase();
		switch (insight.kind) {
			case "interest":
				interests.set(key, insight.value);
				break;
			case "strength":
				strengths.set(key, insight.value);
				break;
			case "constraint":
			case "boundary":
				constraints.set(key, insight.value);
				boundaries.set(key, insight.value);
				break;
			case "goal":
				goals.set(key, insight.value);
				break;
			case "frustration":
				frustrations.set(key, insight.value);
				break;
			case "hope":
				hopes.set(key, insight.value);
				break;
			case "highlight":
				highlights.set(key, insight.value);
				break;
			default:
				break;
		}
	});

	return {
		interests: Array.from(interests.values()),
		strengths: Array.from(strengths.values()),
		constraints: Array.from(constraints.values()),
		goals: Array.from(goals.values()),
		frustrations: Array.from(frustrations.values()),
		hopes: Array.from(hopes.values()),
		boundaries: Array.from(boundaries.values()),
		highlights: Array.from(highlights.values()),
	};
}
