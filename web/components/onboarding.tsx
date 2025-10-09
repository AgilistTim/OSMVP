"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useSession, InsightKind } from "@/components/session-provider";
import { VoiceControls } from "@/components/voice-controls";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import { SuggestionCards } from "@/components/suggestion-cards";

type Readiness = "G1" | "G2" | "G3" | "G4";

interface Turn {
	role: "user" | "assistant";
	text: string;
}

const MUTUAL_EXPRESSION_REGEX = /\b(i['’]m|i am|i've|i was|my\s|i also|same here|me too)/i;

function looksLikeMutualMoment(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 18) return false;
	return MUTUAL_EXPRESSION_REGEX.test(trimmed.toLowerCase());
}

export function Onboarding() {
	const {
		mode,
		setMode,
		profile,
		setProfile,
		appendProfileInsights,
		addMutualMoment,
		setSummary,
		setVoice,
		started,
		setOnboardingStep,
		suggestions,
		setSuggestions,
		sessionId,
	} = useSession();

	const [turns, setTurns] = useState<Turn[]>([]);
	const [question, setQuestion] = useState<string>("");
	const [currentInput, setCurrentInput] = useState<string>("");
	const [readiness, setReadiness] = useState<Readiness | null>(profile.readiness ?? null);

	const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const lastUserTranscriptIdRef = useRef<string | undefined>(undefined);
	const lastUserTranscriptTextRef = useRef<string | undefined>(undefined);
	const lastAssistantTranscriptIdRef = useRef<string | undefined>(undefined);
	const lastAssistantTranscriptTextRef = useRef<string | undefined>(undefined);
	const lastInsightsTurnCountRef = useRef<number>(0);
	const initialResponseRequestedRef = useRef<boolean>(false);
	const previousModeRef = useRef<typeof mode>(mode);
	const suggestionsFetchInFlightRef = useRef<boolean>(false);
	const suggestionsLastInsightCountRef = useRef<number>(0);

	const [realtimeState, realtimeControls] = useRealtimeSession({
		sessionId,
		enableMicrophone: mode === "voice",
		enableAudioOutput: mode === "voice",
	});

	const userTurnsCount = useMemo(
		() => turns.filter((turn) => turn.role === "user").length,
		[turns]
	);

	const progress = useMemo(() => {
		if (userTurnsCount === 0) return 20;
		return Math.min(100, 20 + userTurnsCount * 15);
	}, [userTurnsCount]);

	const header = useMemo(() => {
		if (!readiness) {
			return turns.length > 0 ? "Let’s keep it rolling." : "Let’s get a feel for where you’re at.";
		}
		const map: Record<Readiness, string> = {
			G1: "Figuring out the starting point",
			G2: "Poking around different routes",
			G3: "Zeroing in on a vibe",
			G4: "Dialled in, still exploring edges",
		};
		return map[readiness];
	}, [readiness, turns.length]);

	const canSubmitText = mode === "text" && currentInput.trim().length > 0;
	const displayedQuestion =
		question.trim().length > 0 ? question : "Give me a sec while I line things up…";

	const deriveInsights = useCallback(
		async (turnsSnapshot: Turn[]) => {
			const lastTurn = turnsSnapshot.at(-1);
			if (!lastTurn || lastTurn.role !== "user") return;
			if (turnsSnapshot.length === lastInsightsTurnCountRef.current) return;
			lastInsightsTurnCountRef.current = turnsSnapshot.length;

			try {
				const response = await fetch("/api/profile/insights", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						sessionId,
						turns: turnsSnapshot,
						existingInsights: (profile.insights ?? []).map((insight) => ({
							kind: insight.kind,
							value: insight.value,
						})),
					}),
				});
				if (!response.ok) {
					return;
				}
				const data = (await response.json()) as {
					insights?: Array<{
						kind: InsightKind;
						value: string;
						confidence?: "low" | "medium" | "high";
						evidence?: string;
						source?: "assistant" | "user" | "system";
					}>;
					summary?: string;
					readiness?: Readiness;
				};
				if (Array.isArray(data.insights)) {
					appendProfileInsights(
						data.insights
							.filter(
								(item) => typeof item?.kind === "string" && typeof item?.value === "string"
							)
							.map((item) => ({
								kind: item.kind as InsightKind,
								value: item.value,
								confidence: item.confidence,
								evidence: item.evidence,
								source: item.source ?? "assistant",
							}))
					);
				}
				if (typeof data.summary === "string" && data.summary.trim().length > 0) {
					setSummary(data.summary.trim());
				}
				if (typeof data.readiness === "string") {
					setReadiness(data.readiness as Readiness);
					setProfile({ readiness: data.readiness as Readiness });
				}
			} catch (err) {
				console.error("Failed to derive profile insights", err);
			}
		},
		[appendProfileInsights, profile.insights, sessionId, setProfile, setSummary]
	);

	const ensureRealtimeConnected = useCallback(async () => {
		if (
			realtimeState.status === "connected" ||
			realtimeState.status === "connecting" ||
			realtimeState.status === "requesting-token"
		) {
			return;
		}

		await realtimeControls.connect({
			enableMicrophone: mode === "voice",
			enableAudioOutput: mode === "voice",
		});
	}, [mode, realtimeControls, realtimeState.status]);

	const createRealtimeId = useCallback(() => crypto.randomUUID().replace(/-/g, "").slice(0, 32), []);

	const sendUserMessage = useCallback(
		async (userText: string) => {
			const trimmed = userText.trim();
			if (!trimmed) return;

			const transcriptId = createRealtimeId();
			if (process.env.NODE_ENV !== "production") {
				console.info("[conversation:text-submit]", {
					transcriptId,
					userText: trimmed,
					mode,
				});
			}
			setProfile({ lastTranscript: trimmed, lastTranscriptId: transcriptId });
			const textTurn: Turn = { role: "user", text: trimmed };
			const nextTurns = [...turns, textTurn];
			setTurns(nextTurns);
			void deriveInsights(nextTurns);

			await ensureRealtimeConnected();

			realtimeControls.sendEvent({
				type: "conversation.item.create",
				item: {
					id: transcriptId,
					type: "message",
					role: "user",
					content: [
						{
							type: "input_text",
							text: trimmed,
						},
					],
				},
			});

			let acknowledged = false;
			try {
				await realtimeControls.waitForConversationItem(transcriptId);
				acknowledged = true;
			} catch (err) {
				console.error("Failed to confirm conversation item", err);
			}

			realtimeControls.sendEvent({
				type: "response.create",
				response: {
					output_modalities: mode === "voice" ? ["audio", "text"] : ["text"],
				},
			});

			if (!acknowledged) {
				await ensureRealtimeConnected();
			}
		},
		[
			createRealtimeId,
			deriveInsights,
			ensureRealtimeConnected,
			mode,
			realtimeControls,
			setProfile,
			turns,
		]
	);

	const handleSubmit = useCallback(async () => {
		if (!canSubmitText) return;
		const userText = currentInput.trim();
		setCurrentInput("");
		await sendUserMessage(userText);
	}, [canSubmitText, currentInput, sendUserMessage]);

	useEffect(() => {
		if (!started) {
			initialResponseRequestedRef.current = false;
			return;
		}

		if (turns.length > 0 || initialResponseRequestedRef.current) {
			return;
		}

		initialResponseRequestedRef.current = true;

		void (async () => {
			await ensureRealtimeConnected();
			realtimeControls.sendEvent({
				type: "response.create",
				response: {
					output_modalities: mode === "voice" ? ["audio", "text"] : ["text"],
				},
			});
		})();
	}, [ensureRealtimeConnected, mode, realtimeControls, started, turns.length]);

	useEffect(() => {
		if (!transcriptContainerRef.current) return;
		transcriptContainerRef.current.scrollTo({
			top: transcriptContainerRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [turns.length]);

	useEffect(() => {
		setVoice({
			status: realtimeState.status,
			error: realtimeState.error,
			lastLatencyMs: realtimeState.lastLatencyMs,
		});
	}, [realtimeState.status, realtimeState.error, realtimeState.lastLatencyMs, setVoice]);

	useEffect(() => {
		if (mode !== "voice") {
			return;
		}

		const latestUser = realtimeState.transcripts.find(
			(item) => item.isFinal && item.role === "user"
		);

		if (
			!latestUser ||
			latestUser.id === lastUserTranscriptIdRef.current ||
			latestUser.text === lastUserTranscriptTextRef.current
		) {
			return;
		}

		lastUserTranscriptIdRef.current = latestUser.id;
		lastUserTranscriptTextRef.current = latestUser.text;
		setProfile({ lastTranscript: latestUser.text, lastTranscriptId: latestUser.id });
		setTurns((prev) => {
			const newTurn: Turn = { role: "user", text: latestUser.text };
			const next = [...prev, newTurn];
			void deriveInsights(next);
			return next;
		});
	}, [deriveInsights, mode, realtimeState.transcripts, setProfile]);

	useEffect(() => {
		const latestAssistant = realtimeState.transcripts.find(
			(item) => item.isFinal && item.role === "assistant"
		);

		if (
			!latestAssistant ||
			latestAssistant.id === lastAssistantTranscriptIdRef.current ||
			latestAssistant.text === lastAssistantTranscriptTextRef.current
		) {
			return;
		}

		lastAssistantTranscriptIdRef.current = latestAssistant.id;
		lastAssistantTranscriptTextRef.current = latestAssistant.text;
	const assistantText = latestAssistant.text;
	const shouldAddMutual = looksLikeMutualMoment(assistantText);
	setProfile({
		lastAssistantTranscript: assistantText,
		lastAssistantTranscriptId: latestAssistant.id,
	});
	setQuestion(assistantText);
	setTurns((prev) => [...prev, { role: "assistant", text: assistantText }]);
	if (shouldAddMutual) {
		addMutualMoment(assistantText);
	}
}, [addMutualMoment, realtimeState.transcripts, setProfile]);

	useEffect(() => {
		if (previousModeRef.current && mode && previousModeRef.current !== mode) {
			void realtimeControls.disconnect();
		}
		previousModeRef.current = mode;
	}, [mode, realtimeControls]);

	useEffect(() => {
		if (mode !== "text") return;
		inputRef.current?.focus();
	}, [mode, question]);

	useEffect(() => {
		setOnboardingStep(Math.min(5, Math.max(1, userTurnsCount + 1)));
	}, [setOnboardingStep, userTurnsCount]);

	useEffect(() => {
		if (profile.readiness && profile.readiness !== readiness) {
			setReadiness(profile.readiness);
		}
	}, [profile.readiness, readiness]);

	useEffect(() => {
		if (profile.insights.length === 0) {
			suggestionsLastInsightCountRef.current = 0;
		}
	}, [profile.insights.length]);

	useEffect(() => {
		if (suggestions.length === 0) {
			suggestionsLastInsightCountRef.current = 0;
		}
	}, [suggestions.length]);

	useEffect(() => {
		if (userTurnsCount < 3) {
			return;
		}
		const signalInsights = profile.insights.filter((insight) =>
			["interest", "goal", "hope", "strength"].includes(insight.kind)
		);
		if (signalInsights.length < 2) {
			return;
		}

		const insightCount = profile.insights.length;
		const lastCount = suggestionsLastInsightCountRef.current;
		const shouldFetch =
			!suggestionsFetchInFlightRef.current &&
			(suggestions.length === 0 || insightCount > lastCount);

		if (!shouldFetch) {
			return;
		}

		suggestionsFetchInFlightRef.current = true;
		void (async () => {
			try {
				const response = await fetch("/api/suggestions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						insights: profile.insights.map((insight) => ({
							kind: insight.kind,
							value: insight.value,
						})),
						limit: 3,
					}),
				});
				if (!response.ok) {
					throw new Error(`Suggestions request failed: ${response.status}`);
				}
				const data = (await response.json()) as {
					suggestions?: Array<{
						id?: string;
						title?: string;
						summary?: string;
						careerAngles?: string[];
						nextSteps?: string[];
						whyItFits?: string[];
						confidence?: "high" | "medium" | "low";
						score?: number;
					}>;
				};
				if (Array.isArray(data.suggestions)) {
					setSuggestions(
						data.suggestions
							.filter(
								(item) =>
									typeof item?.id === "string" &&
									typeof item?.title === "string" &&
									typeof item?.summary === "string"
							)
							.map((item) => ({
								id: item.id!,
								title: item.title!,
								summary: item.summary!,
								careerAngles: item.careerAngles ?? [],
								nextSteps: item.nextSteps ?? [],
								whyItFits: item.whyItFits ?? [],
								confidence: item.confidence ?? "medium",
								score: item.score ?? 0,
							}))
							.sort((a, b) => b.score - a.score)
					);
					suggestionsLastInsightCountRef.current = insightCount;
				}
			} catch (error) {
				console.error("Failed to load suggestions", error);
			} finally {
				suggestionsFetchInFlightRef.current = false;
			}
		})();
	}, [profile.insights, setSuggestions, suggestions.length, userTurnsCount]);

useEffect(() => {
		if (!mode) {
			setMode("text");
		}
	}, [mode, setMode]);

	return (
		<div className="w-full max-w-xl mx-auto flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-medium">{header}</h2>
				<span className="text-sm text-muted-foreground">{progress}%</span>
			</div>
			<Progress value={progress} />

			<Card className="p-4 space-y-4">
				<div className="flex items-center justify-between text-sm text-muted-foreground">
					<span>{mode ? `Mode: ${mode === "voice" ? "Voice" : "Text"}` : ""}</span>
					{mode === "voice" ? (
						<Button variant="link" className="px-0 text-sm" onClick={() => setMode("text")}>
							Switch to text
						</Button>
					) : (
						<Button variant="link" className="px-0 text-sm" onClick={() => setMode("voice")}>
							Switch to voice
						</Button>
					)}
				</div>
				<div className="text-base font-medium whitespace-pre-line">{displayedQuestion}</div>
				<Input
					ref={inputRef}
					placeholder={
						mode === "voice"
							? "Text entry is disabled while voice is active"
							: "Type something you’re into or curious about"
					}
					value={currentInput}
					onChange={(event) => setCurrentInput(event.target.value)}
					onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
					disabled={mode === "voice"}
				/>
				<div className="flex justify-end">
					<Button onClick={handleSubmit} disabled={!canSubmitText}>
						Send
					</Button>
				</div>
				{mode === "voice" ? (
					<p className="text-sm text-muted-foreground">
						Answer out loud, or switch to text if you’d rather type this turn.
					</p>
				) : null}
			</Card>

			{mode === "voice" && <VoiceControls state={realtimeState} controls={realtimeControls} />}

			{mode === "voice" ? (
				<div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
					We’re keeping a transcript behind the scenes so you can stay focused on speaking. Let us
					know if something sounds off.
				</div>
			) : (
				<div
					ref={transcriptContainerRef}
					className="max-h-80 overflow-y-auto space-y-3 rounded-lg border border-border bg-muted/20 p-4"
				>
					{turns.map((turn, index) => {
						const isUser = turn.role === "user";
						return (
							<div
								key={`${turn.role}-${index}-${turn.text.slice(0, 8)}`}
								className={cn("flex", isUser ? "justify-end" : "justify-start")}
							>
								<div
									className={cn(
										"max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm whitespace-pre-line",
										isUser
											? "bg-primary text-primary-foreground"
											: "bg-card text-card-foreground border border-border"
									)}
								>
									<div className="text-xs font-semibold uppercase tracking-wide opacity-80">
										{isUser ? "You" : "Guide"}
									</div>
									<div className="mt-1 leading-relaxed">{turn.text}</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
			{suggestions.length > 0 ? (
				<SuggestionCards suggestions={suggestions} />
			) : null}
		</div>
	);
}

export default Onboarding;
