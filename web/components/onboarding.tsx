"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/components/session-provider";
import { VoiceControls } from "@/components/voice-controls";

type Readiness = "G1" | "G2" | "G3" | "G4";

interface Turn { role: "user" | "assistant"; text: string }

const INTRO_MESSAGE = "Thanks for joining me to explore your future.";
const INITIAL_QUESTION = "Which best describes your current situation right now?";
const INTRO_PROMPT = `${INTRO_MESSAGE} ${INITIAL_QUESTION}`;

export function Onboarding() {
	const { mode, profile, setProfile, started, onboardingStep, setOnboardingStep } = useSession();
	const [turns, setTurns] = useState<Turn[]>([]);
	const [currentInput, setCurrentInput] = useState("");
	const [readiness, setReadiness] = useState<Readiness | null>(null);
	const lastVoiceTranscriptIdRef = useRef<string | undefined>(undefined);
	const lastAssistantTranscriptIdRef = useRef<string | undefined>(undefined);
	const [question, setQuestion] = useState<string>(INITIAL_QUESTION);
	const [step, setStep] = useState<number>(onboardingStep);
	const totalSteps = 5; // Q1–Q5 baseline
	const progress = Math.min(100, Math.round((step / totalSteps) * 100));

	useEffect(() => {
		setStep(onboardingStep);
	}, [onboardingStep]);

	const canSubmit = currentInput.trim().length > 0;
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, [question]);

	useEffect(() => {
		if (!started || turns.length > 0) return;
		setTurns([{ role: "assistant", text: INTRO_PROMPT }]);
	}, [started, turns.length]);

	useEffect(() => {
		if (mode !== "voice") {
			return;
		}
		const latestVoiceTranscript = profile.lastTranscript?.trim();
		const latestVoiceTranscriptId = profile.lastTranscriptId;
		if (!latestVoiceTranscript || !latestVoiceTranscriptId || latestVoiceTranscriptId === lastVoiceTranscriptIdRef.current) {
			return;
		}
		lastVoiceTranscriptIdRef.current = latestVoiceTranscriptId;
		setTurns((prev) => [...prev, { role: "user", text: latestVoiceTranscript }]);
	}, [mode, profile.lastTranscript, profile.lastTranscriptId]);

	useEffect(() => {
		if (mode !== "voice") {
			return;
		}
		const latestAssistantTranscript = profile.lastAssistantTranscript?.trim();
		const latestAssistantTranscriptId = profile.lastAssistantTranscriptId;
		if (
			!latestAssistantTranscript ||
			!latestAssistantTranscriptId ||
			latestAssistantTranscriptId === lastAssistantTranscriptIdRef.current
		) {
			return;
		}
		lastAssistantTranscriptIdRef.current = latestAssistantTranscriptId;
		setTurns((prev) => [...prev, { role: "assistant", text: latestAssistantTranscript }]);
		setQuestion(latestAssistantTranscript);
	}, [mode, profile.lastAssistantTranscript, profile.lastAssistantTranscriptId]);

	async function handleSubmit() {
		if (!canSubmit) return;
		const userText = currentInput.trim();
		setCurrentInput("");
		const nextTurns = [...turns, { role: "user", text: userText } as Turn];
		setTurns(nextTurns);

		const res = await fetch("/api/onboarding", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ turns: nextTurns }),
		});
		const data = await res.json();
		const nextQ: string = data.question ?? "What matters most to you at work?";
		setReadiness(data.readiness as Readiness);
		setQuestion(nextQ);
		setTurns((prev) => [...prev, { role: "assistant", text: nextQ }]);
		setOnboardingStep((prev) => Math.min(totalSteps, prev + 1));
		setProfile({ readiness: data.readiness as Readiness });
	}

	const header = useMemo(() => {
		if (!readiness) return "Let’s get a sense of where you are.";
		const map: Record<Readiness, string> = {
			G1: "Exploring where to start",
			G2: "Exploring options",
			G3: "Narrowing in",
			G4: "Clear and focused",
		};
		return map[readiness];
	}, [readiness]);

	return (
		<div className="w-full max-w-xl mx-auto flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-medium">{header}</h2>
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">{progress}%</span>
				</div>
			</div>
			<Progress value={progress} />

			<Card className="p-4">
				<div className="space-y-4">
					<div className="text-sm text-muted-foreground">
						{mode ? `Mode: ${mode === "voice" ? "Voice" : "Text"}` : ""}
					</div>
					<div className="text-base font-medium">{question}</div>
					<Input
						ref={inputRef}
						placeholder="Type a short answer"
						value={currentInput}
						onChange={(e) => setCurrentInput(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
					/>
					<div className="flex justify-end">
						<Button onClick={handleSubmit} disabled={!canSubmit}>
							Continue
						</Button>
					</div>
				</div>
			</Card>

			{mode === "voice" && (
				<VoiceControls />
			)}

			<div className="space-y-2">
				{turns.map((t, idx) => (
					<div key={idx} className="text-sm text-muted-foreground">
						<span className="font-medium">{t.role === "user" ? "You" : "Guide"}:</span> {t.text}
					</div>
				))}
			</div>
		</div>
	);
}

export default Onboarding;
