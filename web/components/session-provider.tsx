"use client";

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";

export type SessionMode = "text" | "voice" | null;

export type InsightKind = "interest" | "strength" | "constraint" | "goal" | "value";

export type InsightSource = "user" | "assistant" | "system";

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

export interface ProfileAggregates {
	interests: string[];
	strengths: string[];
	constraints: string[];
	goals: string[];
	values: string[];
}

export interface Profile {
	readiness?: "G1" | "G2" | "G3" | "G4";
	demographics?: Record<string, unknown>;
	insights: ProfileInsight[];
	interests: string[];
	strengths: string[];
	constraints: string[];
	goals: string[];
	values: string[];
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

interface SessionState {
	mode: SessionMode;
	profile: Profile;
	candidates: CareerCardCandidate[];
	votesByCareerId: Record<string, 1 | -1 | 0>;
	summary?: string;
	started: boolean;
	sessionId: string;
	voice: {
		status: "idle" | "requesting-token" | "connecting" | "connected" | "error";
		error?: string;
		lastLatencyMs?: number;
	};
	onboardingStep: number;
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
	resetProfile: () => void;
	setCandidates: (candidates: CareerCardCandidate[]) => void;
	voteCareer: (careerId: string, value: 1 | -1 | 0) => void;
	setSummary: (summary: string) => void;
	beginSession: () => void;
	setVoice: (voice: SessionState["voice"]) => void;
	setOnboardingStep: (value: number | ((current: number) => number)) => void;
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
	const [mode, setMode] = useState<SessionMode>(null);
	const [profile, updateProfile] = useState<Profile>(() => createEmptyProfile());
	const [candidates, setCandidates] = useState<CareerCardCandidate[]>([]);
	const [votesByCareerId, setVotes] = useState<Record<string, 1 | -1 | 0>>({});
	const [summary, setSummary] = useState<string | undefined>(undefined);
	const [started, setStarted] = useState<boolean>(false);
	const [sessionId] = useState(() => crypto.randomUUID());
	const [voice, setVoice] = useState<SessionState["voice"]>({ status: "idle" });
	const [onboardingStep, updateOnboardingStep] = useState<number>(0);

	const setProfile = useCallback((partial: Partial<Profile>) => {
		updateProfile((prev) => {
			const merged: Profile = {
				...prev,
				...partial,
				insights: partial.insights ?? prev.insights,
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

	const resetProfile = useCallback(() => {
		updateProfile(createEmptyProfile());
	}, []);

	const value = useMemo<SessionState & SessionActions>(
		() => ({
			mode,
			profile,
			candidates,
			votesByCareerId,
			summary,
			started,
			sessionId,
			voice,
			onboardingStep,
			setMode: (m) => setMode(m),
			setProfile,
			appendProfileInsights,
			resetProfile,
			setCandidates,
			voteCareer: (careerId, value) =>
				setVotes((prev) => ({ ...prev, [careerId]: value })),
			setSummary: (s) => setSummary(s),
			beginSession: () => setStarted(true),
			setVoice,
			setOnboardingStep: (value) =>
				updateOnboardingStep((prev) =>
					typeof value === "function" ? (value as (current: number) => number)(prev) : value
				),
		}),
		[mode, profile, candidates, votesByCareerId, summary, started, sessionId, voice, onboardingStep, setProfile, appendProfileInsights, resetProfile]
	);

	useEffect(() => {
		if (process.env.NODE_ENV === "production") {
			return;
		}
		// eslint-disable-next-line no-console
		console.groupCollapsed(`[profile] session ${sessionId}`);
		// eslint-disable-next-line no-console
		console.log("Readiness", profile.readiness);
		// eslint-disable-next-line no-console
		console.log("Interests", profile.interests);
		// eslint-disable-next-line no-console
		console.log("Strengths", profile.strengths);
		// eslint-disable-next-line no-console
		console.log("Constraints", profile.constraints);
		// eslint-disable-next-line no-console
		console.log("Goals", profile.goals);
		// eslint-disable-next-line no-console
		console.log("Values", profile.values);
		// eslint-disable-next-line no-console
		console.log("Insights", profile.insights);
		// eslint-disable-next-line no-console
		console.groupEnd();
	}, [profile, sessionId]);

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function createEmptyProfile(): Profile {
	return {
		insights: [],
		interests: [],
		strengths: [],
		constraints: [],
		goals: [],
		values: [],
	};
}

function summariseInsights(insights: ProfileInsight[]): ProfileAggregates {
	const interests = new Map<string, string>();
	const strengths = new Map<string, string>();
	const constraints = new Map<string, string>();
	const goals = new Map<string, string>();
	const values = new Map<string, string>();

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
				constraints.set(key, insight.value);
				break;
			case "goal":
				goals.set(key, insight.value);
				break;
			case "value":
				values.set(key, insight.value);
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
		values: Array.from(values.values()),
	};
}
