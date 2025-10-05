"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

export type SessionMode = "text" | "voice" | null;

export interface Profile {
	readiness?: "G1" | "G2" | "G3" | "G4";
	demographics?: Record<string, unknown>;
	interests?: string[];
	strengths?: string[];
	constraints?: string[];
	lastTranscript?: string;
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
	const [profile, updateProfile] = useState<Profile>({});
	const [candidates, setCandidates] = useState<CareerCardCandidate[]>([]);
	const [votesByCareerId, setVotes] = useState<Record<string, 1 | -1 | 0>>({});
	const [summary, setSummary] = useState<string | undefined>(undefined);
	const [started, setStarted] = useState<boolean>(false);
	const [sessionId] = useState(() => crypto.randomUUID());
	const [voice, setVoice] = useState<SessionState["voice"]>({ status: "idle" });
	const [onboardingStep, updateOnboardingStep] = useState<number>(0);

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
			setProfile: (partial) => updateProfile((prev) => ({ ...prev, ...partial })),
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
		[mode, profile, candidates, votesByCareerId, summary, started, sessionId, voice, onboardingStep]
	);

	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
