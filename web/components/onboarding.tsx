"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSession, InsightKind } from "@/components/session-provider";
import type { CareerSuggestion } from "@/components/session-provider";
import { VoiceControls } from "@/components/voice-controls";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import { SuggestionCards } from "@/components/suggestion-cards";
import { SuggestionBasket } from "@/components/suggestion-basket";
import { ArrowUpRight, Archive } from "lucide-react";

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

function classifyMessageLength(text: string): { lengthClass: "short" | "medium" | "long" | "very-long"; isLongText: boolean } {
	const length = text.trim().length;
	if (length > 500) {
		return { lengthClass: "very-long", isLongText: true };
	}
	if (length > 200) {
		return { lengthClass: "long", isLongText: true };
	}
	if (length > 50) {
		return { lengthClass: "medium", isLongText: false };
	}
	return { lengthClass: "short", isLongText: false };
}

function renderMessageContent(text: string) {
	const trimmed = text.trim();
	if (!trimmed) {
		return <p>&nbsp;</p>;
	}

	const paragraphs = trimmed.split(/\n{2,}/);
	return paragraphs.map((paragraph, index) => {
		const lines = paragraph.split(/\n/);
		return (
			<p key={`para-${index}`}>
				{lines.map((line, lineIndex) => (
					<Fragment key={`line-${lineIndex}`}>
						{line}
						{lineIndex < lines.length - 1 ? <br /> : null}
					</Fragment>
				))}
			</p>
		);
	});
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
		voteCareer,
		votesByCareerId,
		sessionId,
	} = useSession();

	const [turns, setTurns] = useState<Turn[]>([]);
	const [question, setQuestion] = useState<string>("");
	const [currentInput, setCurrentInput] = useState<string>("");
	const [readiness, setReadiness] = useState<Readiness | null>(profile.readiness ?? null);
	const [isBasketOpen, setIsBasketOpen] = useState<boolean>(false);

	const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

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

	const suggestionGuidance = useMemo(() => {
		if (suggestions.length === 0) {
			return null;
		}
		const formatted = suggestions
			.map((suggestion, index) => {
				const parts: string[] = [
					`${index + 1}. ${suggestion.title}: ${suggestion.summary}`,
				];
				if (suggestion.whyItFits.length > 0) {
					parts.push(`Why it fits: ${suggestion.whyItFits.join("; ")}`);
				}
				if (suggestion.nextSteps.length > 0) {
					parts.push(`Tiny experiments: ${suggestion.nextSteps.join("; ")}`);
				}
				if (suggestion.neighborTerritories.length > 0) {
					parts.push(`Nearby vibes: ${suggestion.neighborTerritories.join(", ")}`);
				}
				return parts.join("\n");
			})
			.join("\n\n");
		return `Suggestion cards currently pinned:\n${formatted}\nReference them casually by title when it helps the user connect dots.`;
	}, [suggestions]);

	const progress = useMemo(() => {
		if (userTurnsCount === 0) return 20;
		return Math.min(100, 20 + userTurnsCount * 15);
	}, [userTurnsCount]);

	const suggestionGroups = useMemo(() => {
		const pending: CareerSuggestion[] = [];
		const saved: CareerSuggestion[] = [];
		const maybePile: CareerSuggestion[] = [];
		const skipped: CareerSuggestion[] = [];

		for (const suggestion of suggestions) {
			const vote = votesByCareerId[suggestion.id];
			if (vote === 1) {
				saved.push(suggestion);
			} else if (vote === 0) {
				maybePile.push(suggestion);
			} else if (vote === -1) {
				skipped.push(suggestion);
			} else {
				pending.push(suggestion);
			}
		}

		return { pending, saved, maybe: maybePile, skipped };
	}, [suggestions, votesByCareerId]);

	const pendingSuggestions = suggestionGroups.pending;
	const savedSuggestions = suggestionGroups.saved;
	const maybeSuggestions = suggestionGroups.maybe;
	const skippedSuggestions = suggestionGroups.skipped;

	const handleClearSkipped = useCallback(() => {
		if (skippedSuggestions.length === 0) return;
		skippedSuggestions.forEach((item) => {
			voteCareer(item.id, null);
		});
	}, [skippedSuggestions, voteCareer]);

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

			const responsePayload: Record<string, unknown> = {
				output_modalities: mode === "voice" ? ["audio", "text"] : ["text"],
			};
			if (suggestionGuidance) {
				responsePayload.instructions = suggestionGuidance;
			}

			realtimeControls.sendEvent({
				type: "response.create",
				response: responsePayload,
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
			suggestionGuidance,
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
		const responsePayload: Record<string, unknown> = {
			output_modalities: mode === "voice" ? ["audio", "text"] : ["text"],
		};
		if (suggestionGuidance) {
			responsePayload.instructions = suggestionGuidance;
		}
		realtimeControls.sendEvent({
			type: "response.create",
			response: responsePayload,
		});
	})();
}, [ensureRealtimeConnected, mode, realtimeControls, started, suggestionGuidance, turns.length]);

	useEffect(() => {
		if (mode !== "text" || !transcriptContainerRef.current) return;
		const container = transcriptContainerRef.current;
		requestAnimationFrame(() => {
			container.scrollTo({
				top: container.scrollHeight,
				behavior: "smooth",
			});
		});
	}, [mode, turns.length, displayedQuestion, pendingSuggestions.length]);

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
		if (!inputRef.current) {
			return;
		}
		const element = inputRef.current;
		element.style.height = "auto";
		const nextHeight = Math.min(element.scrollHeight, 180);
		element.style.height = `${nextHeight}px`;
	}, [currentInput, mode]);

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
						votes: votesByCareerId,
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
						neighborTerritories?: string[];
					}>;
				};
					if (Array.isArray(data.suggestions)) {
						const normalized = data.suggestions
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
								neighborTerritories: item.neighborTerritories ?? [],
							}))
							.sort((a, b) => b.score - a.score);

						const incomingIds = new Set(normalized.map((item) => item.id));
						const merged = [
							...normalized,
							...suggestions.filter((existing) => !incomingIds.has(existing.id)),
						];

						setSuggestions(merged);
						suggestionsLastInsightCountRef.current = insightCount;
					}
			} catch (error) {
				console.error("Failed to load suggestions", error);
			} finally {
				suggestionsFetchInFlightRef.current = false;
			}
		})();
	}, [profile.insights, setSuggestions, suggestions, userTurnsCount, votesByCareerId]);

	useEffect(() => {
		if (!mode) {
			setMode("text");
		}
	}, [mode, setMode]);

	const isVoice = mode === "voice";
	const showProgressBar = progress < 100;
	const totalBasketCount = savedSuggestions.length + maybeSuggestions.length + skippedSuggestions.length;
	return (
		<div className="chat-app-shell">
			<header className="chat-header">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-[200px] flex-1 space-y-2">
						<div className="flex items-center justify-between gap-3">
							<h2 className="text-lg font-medium">{header}</h2>
							<span className="text-sm text-muted-foreground">{progress}%</span>
						</div>
						{showProgressBar ? <Progress value={progress} /> : null}
					</div>
					<div className="flex flex-wrap items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="idea-basket-trigger inline-flex items-center gap-2 rounded-full border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground transition hover:bg-background"
							onClick={() => setIsBasketOpen(true)}
							aria-label="Open idea stash"
						>
							<Archive className="size-3.5" aria-hidden />
							<span>Idea stash</span>
							<span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">
								{totalBasketCount}
							</span>
						</Button>
						{!isVoice ? (
							<Button
								variant="default"
								size="lg"
								className="chat-mode-button"
								onClick={() => setMode("voice")}
							>
								Switch to voice
							</Button>
						) : null}
					</div>
				</div>
			</header>

			{isVoice ? (
				<Card className="voice-mode-panel">
					<div className="flex items-center justify-end">
						<Button
							variant="default"
							size="lg"
							className="chat-mode-button"
							onClick={() => setMode("text")}
						>
							Switch to text
						</Button>
					</div>
					<div className="text-base font-medium whitespace-pre-line">{displayedQuestion}</div>
					<p className="text-sm text-muted-foreground">
						Answer out loud, or switch to text if you’d rather type this turn.
					</p>
				</Card>
			) : (
				<main className="chat-panel">
					<div ref={transcriptContainerRef} className="chat-messages">
						{turns.length === 0 ? (
							(() => {
								const { lengthClass, isLongText } = classifyMessageLength(displayedQuestion);
								return (
									<div className={cn("message ai-message", isLongText ? "long-text" : "")}>
										<div className="message-label">GUIDE</div>
										<div className={cn("message-content", lengthClass, isLongText ? "long-text" : "")}>
											{renderMessageContent(displayedQuestion)}
										</div>
									</div>
								);
							})()
						) : (
							turns.map((turn, index) => {
								const isUser = turn.role === "user";
								const { lengthClass, isLongText } = classifyMessageLength(turn.text);
								const messageClasses = cn(
									"message",
									isUser ? "user-message" : "ai-message",
									isLongText ? "long-text" : ""
								);
								const contentClasses = cn(
									"message-content",
									lengthClass,
									isLongText ? "long-text" : ""
								);

								return (
									<div
										key={`${turn.role}-${index}-${turn.text.slice(0, 8)}`}
										className={messageClasses}
									>
										<div className="message-label">{isUser ? "YOU" : "GUIDE"}</div>
										<div className={contentClasses}>{renderMessageContent(turn.text)}</div>
									</div>
								);
							})
						)}
						{pendingSuggestions.length > 0 ? (
							<div className="message ai-message suggestion-message">
								<div className="message-label">CARDS</div>
								<div className="message-content">
									<SuggestionCards
										suggestions={pendingSuggestions}
										variant="inline"
										showHeader={false}
										emptyState={<span>No cards right now. We’ll bring new ones shortly.</span>}
									/>
								</div>
							</div>
						) : null}
					</div>
					<div className="chat-input-panel">
						<div className="message-input-wrapper">
							<Textarea
								ref={inputRef}
								placeholder="Type something you’re into or curious about"
								value={currentInput}
								onChange={(event) => setCurrentInput(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.shiftKey) {
										event.preventDefault();
										handleSubmit();
									}
								}}
								className="message-input"
								rows={1}
								style={{ maxHeight: 180 }}
							/>
							<Button
								type="button"
								variant="default"
								size="icon"
								className="send-button"
								onClick={handleSubmit}
								disabled={!canSubmitText}
								aria-label="Send message"
							>
								<ArrowUpRight aria-hidden />
							</Button>
						</div>
						<div className="chat-input-meta">
							<span
								className={cn(
									"char-counter",
									currentInput.length > 100 ? "char-counter-visible" : "",
									currentInput.length > 500
										? "char-counter-highlight"
										: currentInput.length > 200
											? "char-counter-accent"
										: ""
								)}
								aria-live="polite"
							>
								{currentInput.length > 100
									? currentInput.length > 500
										? `${currentInput.length} characters (long message)`
										: `${currentInput.length} characters`
									: "\u00A0"}
							</span>
						</div>
					</div>
				</main>
			)}

			{isVoice && <VoiceControls state={realtimeState} controls={realtimeControls} />}

			{isVoice ? (
				<>
					<div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
						We’re keeping a transcript behind the scenes so you can stay focused on speaking. Let us
						know if something sounds off.
					</div>
					{pendingSuggestions.length > 0 ? (
						<SuggestionCards
							suggestions={pendingSuggestions}
							variant="panel"
							title="Ideas to react to"
							description="Give each a quick reaction. Saved, maybe, or skipped cards head to your stash."
						/>
					) : null}
				</>
			) : null}

			<SuggestionBasket
				open={isBasketOpen}
				onOpenChange={setIsBasketOpen}
				saved={savedSuggestions}
				maybe={maybeSuggestions}
				skipped={skippedSuggestions}
				onClearSkipped={handleClearSkipped}
			/>
		</div>
	);
}

export default Onboarding;
