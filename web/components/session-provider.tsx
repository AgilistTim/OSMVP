"use client";

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { CardDistance } from "@/lib/dynamic-suggestions";
import {
	recommendConversationPhase,
	type ConversationPhase,
	type ConversationRubric,
} from "@/lib/conversation-phases";
import { computeRubricScores } from "@/lib/conversation-phases";
import { extractConversationInsights } from "@/lib/conversation-engagement";
import type { JourneyVisualPlan } from "@/lib/journey-visual";
import { buildConversationSummary, type ConversationSummary } from "@/lib/conversation-summary";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { DEFAULT_CHAT_MODE, type ChatMode } from "@/lib/chat-mode";

const isDevEnvironment = process.env.NODE_ENV !== "production";

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
	transcriptId?: string;
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

export interface ProfileAttribute {
	label: string;
	evidence?: string;
	confidence?: "low" | "medium" | "high";
	stage?: "established" | "developing" | "hobby";
}

export interface ProfileAttributeSnapshot {
	skills: ProfileAttribute[];
	aptitudes: ProfileAttribute[];
	workStyles: ProfileAttribute[];
}

export type ActivitySignalCategory = "hobby" | "side_hustle" | "career_intent";

export interface ActivitySignal {
	id: string;
	statement: string;
	category: ActivitySignalCategory;
	supportingSkills: string[];
	inferredGoals: string[];
	confidence?: "low" | "medium" | "high";
	evidence?: string;
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
	inferredAttributes: ProfileAttributeSnapshot;
	mutualMoments: MutualMoment[];
	lastTranscript?: string;
	lastTranscriptId?: string;
	lastAssistantTranscript?: string;
	lastAssistantTranscriptId?: string;
	activitySignals: ActivitySignal[];
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

export interface JourneyVisualAsset {
	imageBase64: string;
	plan: JourneyVisualPlan;
	model: string;
	createdAt: number;
	mimeType?: string;
}

interface SessionState {
	mode: SessionMode;
	profile: Profile;
	candidates: CareerCardCandidate[];
	votesByCareerId: Record<string, 1 | -1 | 0>;
	suggestions: CareerSuggestion[];
	summary?: string;
	conversationSummary: ConversationSummary | null;
	started: boolean;
	sessionId: string;
	lastCardInteractionAt: number | null;
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
	journeyVisual: JourneyVisualAsset | null;
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
	appendInferredAttributes: (attributes: Partial<ProfileAttributeSnapshot> | null | undefined) => void;
	appendActivitySignals: (
		signals: Array<{
			id?: string;
			statement: string;
			category: ActivitySignalCategory;
			supportingSkills?: string[];
			inferredGoals?: string[];
			confidence?: "low" | "medium" | "high";
			evidence?: string;
		}>
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
	setLastCardInteractionAt: (timestamp: number | null) => void;
	setTurns: React.Dispatch<React.SetStateAction<ConversationTurn[]>>;
	overrideConversationPhase: (phase: ConversationPhase, rationale?: string[]) => void;
	clearTeaserSeed: () => void;
	setJourneyVisual: (visual: JourneyVisualAsset | null) => void;
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
	const [mode, setModeState] = useState<SessionMode>(() => {
		if (typeof window === "undefined") {
			return null;
		}

		try {
			const stored = sessionStorage.getItem(STORAGE_KEYS.chatMode);
			if (stored === "text" || stored === "voice") {
				return stored;
			}
		} catch {
			// ignore
		}

		return DEFAULT_CHAT_MODE;
	});
	const [profile, updateProfile] = useState<Profile>(() => createEmptyProfile());
	const [candidates, setCandidates] = useState<CareerCardCandidate[]>([]);
	const [votesByCareerId, setVotes] = useState<Record<string, 1 | -1 | 0>>(() => {
		if (isDevEnvironment) {
			console.log("[SessionProvider] Initializing votesByCareerId");
		}
		if (typeof window === 'undefined') return {};
		try {
			// Clean up any legacy localStorage entries
			localStorage.removeItem(STORAGE_KEYS.votes);
		} catch {
			// ignore
		}
		try {
			const stored = sessionStorage.getItem(STORAGE_KEYS.votes);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (isDevEnvironment) {
					console.log("[SessionProvider] Restored votes from sessionStorage:", parsed);
				}
				return parsed;
			}
		} catch (error) {
			if (isDevEnvironment) {
				console.error("[SessionProvider] Failed to restore votes:", error);
			}
		}
		return {};
	});
	const [suggestions, updateSuggestions] = useState<CareerSuggestion[]>(() => {
		if (isDevEnvironment) {
			console.log("[SessionProvider] Initializing suggestions");
		}
		if (typeof window === 'undefined') return [];
		try {
			// Clean up any legacy localStorage entries
			localStorage.removeItem(STORAGE_KEYS.suggestions);
		} catch {
			// ignore
		}
		try {
			const stored = sessionStorage.getItem(STORAGE_KEYS.suggestions);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (isDevEnvironment) {
					console.log("[SessionProvider] Restored suggestions from sessionStorage:", parsed.length, "cards");
				}
				return parsed;
			}
		} catch (error) {
			if (isDevEnvironment) {
				console.error("[SessionProvider] Failed to restore suggestions:", error);
			}
		}
		return [];
	});
	const [summary, setSummaryState] = useState<string | undefined>(undefined);
	const [conversationSummary, setConversationSummary] = useState<ConversationSummary | null>(() => {
		if (typeof window === "undefined") return null;
		try {
			const stored = sessionStorage.getItem(STORAGE_KEYS.conversationSummary);
			if (stored) {
				return JSON.parse(stored) as ConversationSummary;
			}
		} catch (error) {
			if (isDevEnvironment) {
				console.error("[SessionProvider] Failed to restore conversation summary:", error);
			}
		}
		return null;
	});
	const [started, setStarted] = useState<boolean>(false);
	const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
	const [lastCardInteractionAt, setLastCardInteractionAt] = useState<number | null>(null);
	const [voice, setVoiceState] = useState<SessionState["voice"]>({ status: "idle", microphone: "inactive" });
	const [onboardingStep, updateOnboardingStep] = useState<number>(0);
	const [turns, setTurnsState] = useState<ConversationTurn[]>([]);
	const [conversationPhase, setConversationPhase] = useState<ConversationPhase>("warmup");
	const [conversationPhaseRationale, setConversationPhaseRationale] = useState<string[]>([]);
	const [conversationRubric, setConversationRubric] = useState<ConversationRubric | null>(null);
	const [shouldSeedTeaserCard, setShouldSeedTeaserCard] = useState(false);
	const [journeyVisual, setJourneyVisualState] = useState<JourneyVisualAsset | null>(null);

	const turnCount = turns.length;

  useEffect(() => {
    if (started) {
      return;
    }

    const hasExplicitSession = turnCount > 0;
    if (!hasExplicitSession) {
      return;
    }

    const storedStarted = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEYS.sessionStarted) : null;
    if (storedStarted === 'true') {
      setStarted(true);
    }
  }, [started, turnCount]);

	const persistChatMode = useCallback((nextMode: SessionMode) => {
		if (typeof window === "undefined") return;
		if (!nextMode) {
			sessionStorage.removeItem(STORAGE_KEYS.chatMode);
			return;
		}
		sessionStorage.setItem(STORAGE_KEYS.chatMode, nextMode);
	}, []);

	const setSessionMode = useCallback(
		(nextMode: SessionMode) => {
			setModeState((prev) => {
				if (prev === nextMode) {
					return prev;
				}
				return nextMode;
			});
			persistChatMode(nextMode);
		},
		[persistChatMode]
	);

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
			const mergedAttributes = mergeAttributeSnapshots(
				prev.inferredAttributes,
				partial.inferredAttributes
			);
				const merged: Profile = {
					...prev,
					...partial,
					insights: partial.insights ?? prev.insights,
					onboardingResponses: partial.onboardingResponses ?? prev.onboardingResponses,
					mutualMoments: partial.mutualMoments ?? prev.mutualMoments,
					inferredAttributes: mergedAttributes,
					activitySignals: partial.activitySignals ?? prev.activitySignals,
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

	const appendInferredAttributes = useCallback<SessionActions["appendInferredAttributes"]>((incoming) => {
		if (!incoming) {
			return;
		}
		updateProfile((prev) => ({
			...prev,
			inferredAttributes: mergeAttributeSnapshots(prev.inferredAttributes, incoming),
		}));
	}, []);

	const appendActivitySignals = useCallback<SessionActions["appendActivitySignals"]>((incoming) => {
		if (!incoming || incoming.length === 0) {
			return;
		}

		type SanitizedSignal = {
			id?: string;
			statement: string;
			category: ActivitySignalCategory;
			supportingSkills: string[];
			inferredGoals: string[];
			confidence?: "low" | "medium" | "high";
			evidence?: string;
		};

		const sanitizedEntries: Array<SanitizedSignal | null> = incoming
			.map((item) => {
				if (!item || typeof item.statement !== "string") {
					return null;
				}
				const statement = item.statement.trim();
				if (!statement) {
					return null;
				}
				const category =
					item.category === "hobby" || item.category === "side_hustle" || item.category === "career_intent"
						? item.category
						: null;
				if (!category) {
					return null;
				}
				const supportingSkills = dedupeStringsCaseInsensitive(
					Array.isArray(item.supportingSkills) ? item.supportingSkills : []
				);
				const inferredGoals = dedupeStringsCaseInsensitive(
					Array.isArray(item.inferredGoals) ? item.inferredGoals : []
				);
				const confidence =
					item.confidence === "low" || item.confidence === "medium" || item.confidence === "high"
						? item.confidence
						: undefined;
				const evidence =
					typeof item.evidence === "string" && item.evidence.trim().length > 0
						? item.evidence.trim()
						: undefined;
				return {
					id: item.id,
					statement,
					category,
					supportingSkills,
					inferredGoals,
					confidence,
					evidence,
				};
			});

		const sanitized = sanitizedEntries.filter((item): item is SanitizedSignal => item !== null);

		if (sanitized.length === 0) {
			return;
		}

		updateProfile((prev) => {
			const now = Date.now();
			const nextSignals = [...prev.activitySignals];
			sanitized.forEach((signal) => {
				const key = `${signal.category}:${signal.statement.toLowerCase()}`;
				const existingIndex = nextSignals.findIndex(
					(existing) => `${existing.category}:${existing.statement.toLowerCase()}` === key
				);
				if (existingIndex >= 0) {
					const existing = nextSignals[existingIndex];
					nextSignals[existingIndex] = {
						...existing,
						supportingSkills: dedupeStringsCaseInsensitive([
							...existing.supportingSkills,
							...signal.supportingSkills,
						]),
						inferredGoals: dedupeStringsCaseInsensitive([
							...existing.inferredGoals,
							...signal.inferredGoals,
						]),
						confidence: signal.confidence ?? existing.confidence,
						evidence: signal.evidence ?? existing.evidence,
						updatedAt: now,
					};
				} else {
					nextSignals.push({
						id: signal.id ?? crypto.randomUUID(),
						statement: signal.statement,
						category: signal.category,
						supportingSkills: signal.supportingSkills,
						inferredGoals: signal.inferredGoals,
						confidence: signal.confidence,
						evidence: signal.evidence,
						createdAt: now,
						updatedAt: now,
					});
				}
			});

			return {
				...prev,
				activitySignals: nextSignals,
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

	const setJourneyVisual = useCallback<SessionActions["setJourneyVisual"]>((visual) => {
		setJourneyVisualState(visual);
	}, []);

  const resetProfile = useCallback(() => {
    setProfile(createEmptyProfile());
    setCandidates([]);
    setVotes({});
    updateSuggestions([]);
    setSummaryState(undefined);
		setConversationSummary(null);
		updateOnboardingStep(0);
		setVoiceState({ status: "idle", microphone: "inactive" });
		setTurnsState([]);
		setConversationPhase("warmup");
		setConversationPhaseRationale([]);
		setConversationRubric(null);
    setShouldSeedTeaserCard(false);
		setJourneyVisualState(null);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEYS.sessionStarted);
        sessionStorage.removeItem(STORAGE_KEYS.suggestions);
        sessionStorage.removeItem(STORAGE_KEYS.lastInsightCount);
        sessionStorage.removeItem(STORAGE_KEYS.votes);
      } catch {
        // ignore
      }
    }
  }, [
    setProfile,
    setCandidates,
    setVotes,
		updateSuggestions,
		setSummaryState,
		updateOnboardingStep,
		setVoiceState,
		setTurnsState,
		setJourneyVisualState,
	]);

  const beginSession = useCallback(() => {
    setSessionId(crypto.randomUUID());
    resetProfile();
    setSessionMode(null);
    setStarted(true);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(STORAGE_KEYS.sessionStarted, 'true');
      } catch {
        // ignore
      }
    }
  }, [resetProfile, setSessionMode, setSessionId, setStarted]);

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
			if (conversationRubric !== null) {
				setConversationRubric(null);
			}
			return;
		}

		const insightSnapshots = profile.insights.map((i) => ({ kind: i.kind, value: i.value }));
		const nextRubric = computeRubricScores({
			turns: turns.slice(-12),
			insights: insightSnapshots,
			votes: votesByCareerId,
			suggestionCount: suggestions.length,
			prevRubric: conversationRubric,
		});

		if (conversationRubric) {
			const prevRest = { ...conversationRubric, lastUpdatedAt: 0 };
			const nextRest = { ...nextRubric, lastUpdatedAt: 0 };
			if (JSON.stringify(prevRest) === JSON.stringify(nextRest)) {
				return;
			}
		}

		setConversationRubric(nextRubric);
		if (isDevEnvironment) {
			console.info("[SessionProvider] Local rubric", {
				engagementStyle: nextRubric.engagementStyle,
				contextDepth: nextRubric.contextDepth,
				readinessBias: nextRubric.readinessBias,
				cardStatus: nextRubric.cardReadiness.status,
				gaps: nextRubric.insightGaps,
				recommendedFocus: nextRubric.recommendedFocus,
			});
		}
	}, [turns, profile.insights, votesByCareerId, suggestions.length, conversationRubric]);

	useEffect(() => {
		if (turns.length === 0) {
			return;
		}
		const heuristicInsights = extractConversationInsights(turns);
		if (heuristicInsights.length === 0) {
			return;
		}
		const missing = heuristicInsights.filter((candidate) =>
			!profile.insights.some(
				(existing) =>
					existing.kind === candidate.kind &&
					existing.value.toLowerCase() === candidate.value.toLowerCase()
			)
		);
		if (missing.length > 0) {
			appendProfileInsights(
				missing.map((candidate) => ({
					kind: candidate.kind,
					value: candidate.value,
					source: "assistant" as const,
				}))
			);
		}
	}, [turns, profile.insights, appendProfileInsights]);

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
			lastCardInteractionAt,
			voice,
			onboardingStep,
			conversationPhase,
			conversationPhaseRationale,
			conversationRubric,
			shouldSeedTeaserCard,
			journeyVisual,
			setMode: setSessionMode,
			setProfile,
			appendProfileInsights,
			appendInferredAttributes,
			appendActivitySignals,
			updateProfileInsight,
			removeProfileInsight,
			resetProfile,
			setCandidates,
			voteCareer: (careerId, value) => {
				if (isDevEnvironment) {
					console.log("[voteCareer] Called with:", { careerId, value });
				}
				setVotes((prev) => {
					if (isDevEnvironment) {
						console.log("[voteCareer] Previous votes:", prev);
					}
					if (value === null) {
						const updated = { ...prev };
						delete updated[careerId];
						if (isDevEnvironment) {
							console.log("[voteCareer] Clearing vote, new votes:", updated);
						}
						return updated;
					}
					const newVotes = { ...prev, [careerId]: value };
					if (isDevEnvironment) {
						console.log("[voteCareer] Setting vote, new votes:", newVotes);
					}
					return newVotes;
				});
				setLastCardInteractionAt(Date.now());
			},
			setSummary: (s) => setSummaryState(s),
			conversationSummary,
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
			setLastCardInteractionAt,
			turns,
			setTurns: (updater) => setTurnsState(updater),
			overrideConversationPhase,
			clearTeaserSeed,
			setJourneyVisual,
		}),
	[
		mode,
		profile,
		candidates,
		votesByCareerId,
		suggestions,
		summary,
		conversationSummary,
		started,
		sessionId,
		voice,
		onboardingStep,
		conversationPhase,
		conversationPhaseRationale,
		conversationRubric,
		shouldSeedTeaserCard,
		journeyVisual,
		setSessionMode,
		setProfile,
		appendProfileInsights,
		appendInferredAttributes,
		appendActivitySignals,
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
		lastCardInteractionAt,
		setLastCardInteractionAt,
		turns,
		setTurnsState,
		overrideConversationPhase,
		clearTeaserSeed,
		setJourneyVisual,
	]
);

	// Persist votes to sessionStorage
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			sessionStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(votesByCareerId));
			if (isDevEnvironment) {
				console.log(
					"[SessionProvider] Saved votes to sessionStorage:",
					Object.keys(votesByCareerId).length,
					"votes"
				);
			}
		} catch (error) {
			if (isDevEnvironment) {
				console.error("[SessionProvider] Failed to save votes to sessionStorage:", error);
			}
		}
	}, [votesByCareerId]);

	// Persist suggestions to sessionStorage (with deduplication)
	const lastSavedSuggestionsRef = useRef<string>('');
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const serialized = JSON.stringify(suggestions);
			// Only save if actually changed
			if (serialized !== lastSavedSuggestionsRef.current) {
				sessionStorage.setItem(STORAGE_KEYS.suggestions, serialized);
				lastSavedSuggestionsRef.current = serialized;
				if (isDevEnvironment) {
					console.log(
						"[SessionProvider] Saved suggestions to sessionStorage:",
						suggestions.length,
						"cards"
					);
				}
			}
		} catch (error) {
			if (isDevEnvironment) {
				console.error("[SessionProvider] Failed to save suggestions to sessionStorage:", error);
			}
		}
	}, [suggestions]);

	useEffect(() => {
		if (!isDevEnvironment) {
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
		console.log("Inferred attributes", profile.inferredAttributes);
		console.log("Onboarding responses", profile.onboardingResponses);
		console.log("Mutual moments", profile.mutualMoments);
		console.log("Activity signals", profile.activitySignals);
		console.log("Insights", profile.insights);
		console.log("Suggestions", suggestions);
		console.log("Turns", turns);
		console.groupEnd();
	}, [profile, sessionId, suggestions, turns]);

	// Persist conversation summary to sessionStorage
	useEffect(() => {
		if (typeof window === "undefined") return;
		if (!conversationSummary) {
			try {
				sessionStorage.removeItem(STORAGE_KEYS.conversationSummary);
			} catch (error) {
				if (isDevEnvironment) {
					console.error("[SessionProvider] Failed to remove conversation summary:", error);
				}
			}
			return;
		}
		try {
			sessionStorage.setItem(
				STORAGE_KEYS.conversationSummary,
				JSON.stringify(conversationSummary)
			);
		} catch (error) {
			if (isDevEnvironment) {
				console.error("[SessionProvider] Failed to persist conversation summary:", error);
			}
		}
	}, [conversationSummary]);

	// Derive conversation summary when turns or insights change
	useEffect(() => {
		if (turns.length === 0) {
			return;
		}
		const hasSignal =
			profile.insights.length > 0 ||
			profile.strengths.length > 0 ||
			profile.interests.length > 0 ||
			profile.goals.length > 0 ||
			profile.hopes.length > 0;
		if (!hasSignal) {
			return;
		}
		const nextSummary = buildConversationSummary(profile, turns);
		setConversationSummary(nextSummary);
	}, [profile, turns]);

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
		inferredAttributes: {
			skills: [],
			aptitudes: [],
			workStyles: [],
		},
		mutualMoments: [],
		activitySignals: [],
	};
}

const ATTRIBUTE_CATEGORIES: Array<keyof ProfileAttributeSnapshot> = ["skills", "aptitudes", "workStyles"];
const ATTRIBUTE_STAGE_PRIORITY: Record<"hobby" | "developing" | "established", number> = {
	hobby: 0,
	developing: 1,
	established: 2,
};

function sanitizeAttributeEntry(entry: unknown): ProfileAttribute | null {
	if (!entry || typeof entry !== "object") {
		return null;
	}
	const candidate = entry as Partial<ProfileAttribute>;
	if (typeof candidate.label !== "string") {
		return null;
	}
	const label = candidate.label.trim();
	if (label.length === 0) {
		return null;
	}
	const confidence =
		candidate.confidence === "low" || candidate.confidence === "medium" || candidate.confidence === "high"
			? candidate.confidence
			: undefined;
	const evidence = typeof candidate.evidence === "string" ? candidate.evidence.trim() : undefined;
	const stage =
		candidate.stage === "established" || candidate.stage === "developing" || candidate.stage === "hobby"
			? candidate.stage
			: undefined;
	return {
		label,
		confidence,
		evidence: evidence && evidence.length > 0 ? evidence : undefined,
		stage,
	};
}

function mergeAttributeSnapshots(
	current: ProfileAttributeSnapshot,
	incoming?: Partial<ProfileAttributeSnapshot> | null
): ProfileAttributeSnapshot {
	if (!incoming) {
		return current;
	}

	const cloneCategory = (entries: ProfileAttribute[]) => entries.map((item) => ({ ...item }));

	const next: ProfileAttributeSnapshot = {
		skills: cloneCategory(current.skills),
		aptitudes: cloneCategory(current.aptitudes),
		workStyles: cloneCategory(current.workStyles),
	};

		ATTRIBUTE_CATEGORIES.forEach((category) => {
			const incomingEntries = incoming[category];
			if (!Array.isArray(incomingEntries)) {
				return;
			}

		const indexMap = new Map<string, number>();
		next[category].forEach((item, index) => {
			indexMap.set(item.label.toLowerCase(), index);
		});

			incomingEntries
				.map(sanitizeAttributeEntry)
				.filter((item): item is ProfileAttribute => item !== null)
				.forEach((entry) => {
					const key = entry.label.toLowerCase();
					if (indexMap.has(key)) {
						const existingIndex = indexMap.get(key)!;
						const existing = next[category][existingIndex];
					const existingStageRank = existing.stage ? ATTRIBUTE_STAGE_PRIORITY[existing.stage] : -1;
					const incomingStageRank = entry.stage ? ATTRIBUTE_STAGE_PRIORITY[entry.stage] : -1;
						next[category][existingIndex] = {
							label: existing.label,
							confidence: entry.confidence ?? existing.confidence,
							evidence: entry.evidence ?? existing.evidence,
							stage:
								incomingStageRank > existingStageRank
									? entry.stage ?? existing.stage
									: existing.stage ?? entry.stage,
						};
					} else {
						indexMap.set(key, next[category].length);
						next[category].push(entry);
					}
				});
		});

	return next;
}

function dedupeStringsCaseInsensitive(values: string[] = []): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	values.forEach((value) => {
		const trimmed = typeof value === "string" ? value.trim() : "";
		if (!trimmed) return;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		result.push(trimmed);
	});
	return result;
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
