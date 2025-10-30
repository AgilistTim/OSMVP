"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSession, InsightKind } from "@/components/session-provider";
import { buildRealtimeInstructions } from "@/lib/conversation-instructions";
import type { CardDistance } from "@/lib/dynamic-suggestions";
import type { CareerSuggestion, ConversationTurn } from "@/components/session-provider";
import { VoiceControls } from "@/components/voice-controls";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import { SuggestionCards } from "@/components/suggestion-cards";
import { SuggestionBasket } from "@/components/suggestion-basket";
import { ArrowUpRight, Archive, FileText } from "lucide-react";
import { ProfileInsightsBar } from "@/components/profile-insights-bar";

type Readiness = "G1" | "G2" | "G3" | "G4";

type Turn = ConversationTurn;

const MUTUAL_EXPRESSION_REGEX = /\b(i['’]m|i am|i've|i was|my\s|i also|same here|me too)/i;

const DEFAULT_OPENING =
	"Let's chat about what you're into and what you're working on. As we go, I'll suggest some ideas you can thumbs up or down, and build you a personal page you can share.";

const REQUIRED_INSIGHT_KINDS: InsightKind[] = ["interest", "strength", "hope"];
const FALLBACK_MIN_TURNS = 6;

const INSIGHT_KIND_LABELS: Record<InsightKind, string> = {
	interest: "what you're into",
	strength: "what you’re good at",
	constraint: "constraints",
	goal: "goals",
	frustration: "frustrations",
	hope: "hopes",
	boundary: "boundaries",
	highlight: "highlights",
};

const INSIGHT_KIND_COACHING: Partial<Record<InsightKind, string>> = {
	interest: "Ask what they're into right now or what they've been working on.",
	strength:
		"Point out what they're good at using their own words (e.g. 'Sounds like you're really good at noticing details') and ask how they use that skill.",
	hope:
		"If they seem unsure, suggest what it sounds like they want ('Sounds like you want people to feel something from your photos') and ask if that's right.",
};

function looksLikeMutualMoment(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 18) return false;
	return MUTUAL_EXPRESSION_REGEX.test(trimmed.toLowerCase());
}

const REACTION_RETENTION_MS = 2 * 60 * 1000;

type ReactionSnapshot = {
	id: string;
	title: string;
	value: 1 | 0 | -1;
	timestamp: number;
};

function formatList(items: string[]): string {
	if (items.length === 0) {
		return "";
	}
	if (items.length === 1) {
		return items[0];
	}
	if (items.length === 2) {
		return `${items[0]} and ${items[1]}`;
	}
	const head = items.slice(0, -1).join(", ");
	return `${head}, and ${items.at(-1)}`;
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
		conversationPhase,
		conversationRubric,
		shouldSeedTeaserCard,
		clearTeaserSeed,
	sessionId,
	turns,
	setTurns,
} = useSession();
const [question, setQuestion] = useState<string>(DEFAULT_OPENING);
	const [currentInput, setCurrentInput] = useState<string>("");
	const [readiness, setReadiness] = useState<Readiness | null>(profile.readiness ?? null);
	const [isBasketOpen, setIsBasketOpen] = useState<boolean>(false);
	const [recentReactions, setRecentReactions] = useState<ReactionSnapshot[]>([]);
	const router = useRouter();
	const [suggestionRevealState, setSuggestionRevealState] = useState<"collecting" | "priming" | "ready">("collecting");
	const suggestionRevealStateRef = useRef<"collecting" | "priming" | "ready">("collecting");
	const setSuggestionReveal = useCallback((nextState: "collecting" | "priming" | "ready") => {
		setSuggestionRevealState(nextState);
		suggestionRevealStateRef.current = nextState;
	}, []);

	const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);

	const lastUserTranscriptIdRef = useRef<string | undefined>(undefined);
	const lastUserTranscriptTextRef = useRef<string | undefined>(undefined);
	const lastAssistantTranscriptIdRef = useRef<string | undefined>(undefined);
	const lastAssistantTranscriptTextRef = useRef<string | undefined>(undefined);
	const lastInsightsTurnCountRef = useRef<number>(0);
	const initialResponseRequestedRef = useRef<boolean>(false);
	const previousModeRef = useRef<typeof mode>(mode);
const suggestionsFetchInFlightRef = useRef<boolean>(false);
const suggestionsLastInsightCountRef = useRef<number>(0);
const lastScrolledTurnCountRef = useRef<number>(0);
const suggestionRevealTimeoutRef = useRef<number | null>(null);
const lastSuggestionKeyRef = useRef<string>("");
const initialAssistantHandledRef = useRef<boolean>(false);

	const [realtimeState, realtimeControls] = useRealtimeSession({
		sessionId,
		enableMicrophone: mode === "voice",
		enableAudioOutput: mode === "voice",
	});

	const userTurnsCount = useMemo(
		() => turns.filter((turn) => turn.role === "user").length,
		[turns]
	);

useEffect(() => {
	if (turns.length === 0) {
		initialAssistantHandledRef.current = false;
	}
}, [turns.length]);

	const insightCoverage = useMemo(() => {
		const presentKinds = new Set(profile.insights.map((insight) => insight.kind));
		if (presentKinds.has("goal") && !presentKinds.has("hope")) {
			presentKinds.add("hope");
		}
		const missingKinds = REQUIRED_INSIGHT_KINDS.filter((kind) => presentKinds.has(kind) === false);
		const missingLabels = missingKinds.map((kind) => INSIGHT_KIND_LABELS[kind] ?? kind);
		const hasMinimumTurns = userTurnsCount >= 4;
		const distinctInsightKinds = new Set(profile.insights.map((insight) => insight.kind)).size;
		const fallbackReady =
			userTurnsCount >= FALLBACK_MIN_TURNS &&
			distinctInsightKinds >= 2 &&
			presentKinds.size >= 2;
		return {
			missingKinds,
			missingLabels,
			hasMinimumTurns,
			fallbackReady,
			isReady: (missingKinds.length === 0 && hasMinimumTurns) || fallbackReady,
		};
	}, [profile.insights, userTurnsCount]);

	const suggestionGuidance = useMemo(() => {
		if (suggestions.length === 0) {
			return null;
		}
		const formatted = suggestions
			.map((suggestion, index) => {
				const parts: string[] = [`${index + 1}. ${suggestion.title}: ${suggestion.summary}`];
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

		const guidanceLines = [
			"Suggestion cards currently pinned:",
			formatted,
			"Reference them casually by title when it helps the user connect dots.",
		];

		if (recentReactions.length > 0) {
			const now = Date.now();
			const freshReactions = recentReactions.filter((reaction) => now - reaction.timestamp <= REACTION_RETENTION_MS);
			if (freshReactions.length > 0) {
				const savedTitles = freshReactions.filter((reaction) => reaction.value === 1).map((reaction) => reaction.title);
				const maybeTitles = freshReactions.filter((reaction) => reaction.value === 0).map((reaction) => reaction.title);
				const skippedTitles = freshReactions.filter((reaction) => reaction.value === -1).map((reaction) => reaction.title);

				const reactionParts: string[] = [];
				if (savedTitles.length > 0) {
					reactionParts.push(`saved ${formatList(savedTitles)}`);
				}
				if (maybeTitles.length > 0) {
					reactionParts.push(`parked ${formatList(maybeTitles)} as a maybe`);
				}
				if (skippedTitles.length > 0) {
					reactionParts.push(`passed on ${formatList(skippedTitles)}`);
				}

				if (reactionParts.length > 0) {
					guidanceLines.push(
						`They just ${reactionParts.join("; ")}. Mirror this back naturally so they feel heard.`
					);
				}
				if (skippedTitles.length > 0) {
					const savedClause = savedTitles.length > 0 ? `saved ${formatList(savedTitles)} and ` : "";
					const skipPrompt = formatList(skippedTitles);
					guidanceLines.push(
						`Follow up with a gentle question about what didn’t quite land with ${skipPrompt} and what would make it feel closer to their mission. Feel free to say something like “I see you ${savedClause}passed on ${skipPrompt}. What isn’t quite right about ${skipPrompt}?”`
					);
				}
			}
		}

		return guidanceLines.join("\n");
	}, [recentReactions, suggestions]);

	const insightGuidance = useMemo(() => {
		if (insightCoverage.isReady && !insightCoverage.fallbackReady) {
			return null;
		}
		if (insightCoverage.missingKinds.length === 0) {
			return null;
		}

		const missingLabels = insightCoverage.missingKinds
			.map((kind) => INSIGHT_KIND_LABELS[kind] ?? kind)
			.filter(Boolean);

		const coachingPrompts = insightCoverage.missingKinds
			.map((kind) => INSIGHT_KIND_COACHING[kind])
			.filter((prompt): prompt is string => typeof prompt === "string" && prompt.length > 0);

		const lines = [
			`We still need more colour around ${formatList(missingLabels)} before surfacing idea cards.`,
		];

		if (coachingPrompts.length > 0) {
			lines.push(`Steer the conversation there with prompts like: ${formatList(coachingPrompts)}.`);
		}

		lines.push("Keep the tone upbeat and affirm the user when they share specifics.");

		return lines.join(" ");
	}, [insightCoverage]);

	const insightStatusMessage = useMemo(() => {
		if (insightCoverage.isReady) {
			return insightCoverage.fallbackReady
				? "Lining up the first ideas now—keep sharing detail so we can sharpen them."
				: null;
		}
		if (insightCoverage.missingLabels.length === 0) {
			return "Give me another beat or two and I’ll bring ideas to react to.";
		}
		const labelList = formatList(insightCoverage.missingLabels);
		return `Need a touch more on ${labelList} before I pin fresh idea cards.`;
	}, [insightCoverage]);

	const initialGuidance = useMemo(() => {
		if (turns.length > 0) {
			return null;
		}
		const lines = [
			"Opening move: greet them warmly in British English, then ask what they’d like to be called before any other question.",
			"Use this exact opener straight after that: “What’s been keeping you busy when you’re not dealing with school or work?”",
			"Keep the opener short (≤2 sentences) and avoid piling on extra questions until they reply.",
		];
		return lines.join(" ");
	}, [turns.length]);

	const suggestionsKey = useMemo(() => suggestions.map((item) => item.id).join("|"), [suggestions]);

	const handleSuggestionReaction = useCallback(
		({
			suggestion,
			nextValue,
		}: {
			suggestion: CareerSuggestion;
			nextValue: 1 | 0 | -1 | null;
			previousValue?: 1 | 0 | -1 | null;
		}) => {
			const now = Date.now();
			setRecentReactions((prev) => {
				const filtered = prev.filter(
					(item) => item.id !== suggestion.id && now - item.timestamp <= REACTION_RETENTION_MS
				);
				if (nextValue === null) {
					return filtered;
				}
				const nextSnapshot: ReactionSnapshot = {
					id: suggestion.id,
					title: suggestion.title,
					value: nextValue,
					timestamp: now,
				};
				return [nextSnapshot, ...filtered].slice(0, 6);
			});
		},
		[]
	);

	const profileInsights = useMemo(() => profile.insights ?? [], [profile.insights]);

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
	const pendingSuggestionsCount = pendingSuggestions.length;
const canShowSuggestionCards =
	pendingSuggestionsCount > 0 && suggestionRevealState === "ready";
const showSuggestionPriming = insightCoverage.isReady && suggestionRevealState === "priming";
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
				output_modalities: mode === "voice" ? ["audio"] : ["text"],
			};
			const guidanceSegments: string[] = [];
			if (initialGuidance) {
				guidanceSegments.push(initialGuidance);
			}
			if (insightGuidance) {
				guidanceSegments.push(insightGuidance);
			}
			if (suggestionGuidance) {
				guidanceSegments.push(suggestionGuidance);
			}

			const instructionText = buildRealtimeInstructions({
				phase: conversationPhase,
				rubric: conversationRubric,
				baseGuidance: guidanceSegments,
				seedTeaserCard: shouldSeedTeaserCard,
			});
			if (instructionText) {
				if (process.env.NODE_ENV !== "production") {
					console.info("[onboarding] Sending phase instructions", {
						phase: conversationPhase,
						length: instructionText.length,
						preview: instructionText.slice(0, 160),
					});
				}
				responsePayload.instructions = instructionText;
			}
			if (shouldSeedTeaserCard) {
				clearTeaserSeed();
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
			initialGuidance,
			mode,
			realtimeControls,
			suggestionGuidance,
			insightGuidance,
			conversationPhase,
			conversationRubric,
			shouldSeedTeaserCard,
			clearTeaserSeed,
			setProfile,
			setTurns,
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
			output_modalities: mode === "voice" ? ["audio"] : ["text"],
		};
		const guidanceSegments: string[] = [];
		if (initialGuidance) {
			guidanceSegments.push(initialGuidance);
		}
		if (insightGuidance) {
			guidanceSegments.push(insightGuidance);
		}
		if (suggestionGuidance) {
			guidanceSegments.push(suggestionGuidance);
		}
		const instructionText = buildRealtimeInstructions({
			phase: conversationPhase,
			rubric: conversationRubric,
			baseGuidance: guidanceSegments,
			seedTeaserCard: shouldSeedTeaserCard,
		});
		if (instructionText) {
			if (process.env.NODE_ENV !== "production") {
				console.info("[onboarding] Bootstrapping phase instructions", {
					phase: conversationPhase,
					length: instructionText.length,
					preview: instructionText.slice(0, 160),
				});
			}
			responsePayload.instructions = instructionText;
		}
		if (shouldSeedTeaserCard) {
			clearTeaserSeed();
		}
		realtimeControls.sendEvent({
			type: "response.create",
			response: responsePayload,
		});
	})();
}, [
	clearTeaserSeed,
	conversationPhase,
	conversationRubric,
	ensureRealtimeConnected,
	initialGuidance,
	insightGuidance,
	mode,
	realtimeControls,
	shouldSeedTeaserCard,
	started,
	suggestionGuidance,
	turns.length,
]);

useEffect(() => {
	const behavior: ScrollBehavior = lastScrolledTurnCountRef.current > 0 ? "smooth" : "auto";
	messagesEndRef.current?.scrollIntoView({ behavior });
	lastScrolledTurnCountRef.current = turns.length;
}, [turns.length, suggestionRevealState, displayedQuestion, pendingSuggestions.length, mode]);

	useEffect(() => {
		return () => {
			if (suggestionRevealTimeoutRef.current) {
				window.clearTimeout(suggestionRevealTimeoutRef.current);
				suggestionRevealTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		setVoice({
			status: realtimeState.status,
			error: realtimeState.error,
			lastLatencyMs: realtimeState.lastLatencyMs,
			microphone: realtimeState.microphone,
		});
	}, [realtimeState.error, realtimeState.lastLatencyMs, realtimeState.microphone, realtimeState.status, setVoice]);

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
		}, [deriveInsights, mode, realtimeState.transcripts, setProfile, setTurns]);

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
	let assistantText = latestAssistant.text;
	if (!initialAssistantHandledRef.current && turns.length === 0) {
		assistantText = DEFAULT_OPENING;
		initialAssistantHandledRef.current = true;
	}
	const shouldAddMutual = assistantText !== DEFAULT_OPENING && looksLikeMutualMoment(assistantText);
	setProfile({
		lastAssistantTranscript: assistantText,
		lastAssistantTranscriptId: latestAssistant.id,
	});
	setQuestion(assistantText);
	setTurns((prev) => [...prev, { role: "assistant", text: assistantText }]);
	if (shouldAddMutual) {
		addMutualMoment(assistantText);
	}
	}, [addMutualMoment, realtimeState.transcripts, setProfile, setTurns, turns.length]);

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
		if (!insightCoverage.isReady) {
			return;
		}

		const insightCount = profile.insights.length;
		const lastCount = suggestionsLastInsightCountRef.current;
		const shouldFetch =
			!suggestionsFetchInFlightRef.current &&
			(conversationPhase === "option-seeding" || conversationPhase === "commitment") &&
			(suggestions.length === 0 || insightCount > lastCount);

		if (!shouldFetch) {
			return;
		}

		suggestionsFetchInFlightRef.current = true;
	void (async () => {
		try {
			if (process.env.NODE_ENV !== "production") {
				console.info("[suggestions] Fetch triggered", {
					phase: conversationPhase,
					insightCount,
					lastCount,
					hasSuggestions: suggestions.length > 0,
				});
			}
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
							microExperiments?: string[];
							whyItFits?: string[];
							confidence?: "high" | "medium" | "low";
							score?: number;
							neighborTerritories?: string[];
							distance?: "core" | "adjacent" | "unexpected";
						}>;
					};
					if (Array.isArray(data.suggestions)) {
						const seenIds = new Set<string>();
						const normalized = data.suggestions
							.filter(
								(item) =>
									typeof item?.id === "string" &&
									typeof item?.title === "string" &&
									typeof item?.summary === "string"
							)
							.map((item) => {
								const distance: CardDistance =
									item.distance === "adjacent" || item.distance === "unexpected"
										? item.distance
										: "core";
								return {
									id: item.id!,
									title: item.title!,
									summary: item.summary!,
									careerAngles: item.careerAngles ?? [],
									nextSteps: item.nextSteps ?? [],
									microExperiments: item.microExperiments ?? [],
									whyItFits: item.whyItFits ?? [],
									confidence: item.confidence ?? "medium",
									score: item.score ?? 0,
									neighborTerritories: item.neighborTerritories ?? [],
									distance,
								};
							})
							.filter((item) => {
								if (seenIds.has(item.id)) {
									return false;
								}
								seenIds.add(item.id);
								return true;
							})
							.sort((a, b) => b.score - a.score);

						setSuggestions(normalized);
						suggestionsLastInsightCountRef.current = insightCount;
					}
			} catch (error) {
				console.error("Failed to load suggestions", error);
			} finally {
				suggestionsFetchInFlightRef.current = false;
			}
		})();
	}, [conversationPhase, insightCoverage.isReady, profile.insights, setSuggestions, suggestions, votesByCareerId]);

	useEffect(() => {
		if (!insightCoverage.isReady) {
			setSuggestionReveal("collecting");
			lastSuggestionKeyRef.current = "";
			if (suggestionRevealTimeoutRef.current) {
				window.clearTimeout(suggestionRevealTimeoutRef.current);
				suggestionRevealTimeoutRef.current = null;
			}
			return;
		}

		if (suggestions.length === 0) {
			setSuggestionReveal("priming");
			if (suggestionRevealTimeoutRef.current) {
				window.clearTimeout(suggestionRevealTimeoutRef.current);
				suggestionRevealTimeoutRef.current = null;
			}
			return;
		}

		const currentKey = suggestionsKey;
		if (lastSuggestionKeyRef.current === currentKey && suggestionRevealStateRef.current === "ready") {
			return;
		}

		lastSuggestionKeyRef.current = currentKey;
		setSuggestionReveal("priming");
		if (suggestionRevealTimeoutRef.current) {
			window.clearTimeout(suggestionRevealTimeoutRef.current);
		}
		suggestionRevealTimeoutRef.current = window.setTimeout(() => {
			setSuggestionReveal("ready");
			suggestionRevealTimeoutRef.current = null;
		}, 1300);

		return () => {
			if (suggestionRevealTimeoutRef.current) {
				window.clearTimeout(suggestionRevealTimeoutRef.current);
				suggestionRevealTimeoutRef.current = null;
			}
		};
	}, [insightCoverage.isReady, setSuggestionReveal, suggestions.length, suggestionsKey]);

	useEffect(() => {
		if (!mode) {
			setMode("text");
		}
	}, [mode, setMode]);

	// Auto-scroll to top when entering voice mode (voice greeting handled in chat-integrated)
	useEffect(() => {
		if (mode === 'voice') {
			window.scrollTo({ top: 0, behavior: 'smooth' });
			if (transcriptContainerRef.current) {
				transcriptContainerRef.current.scrollTop = 0;
			}
		}
	}, [mode]);

	// Simple auto-scroll to bottom when new messages arrive
	useEffect(() => {
		if (messagesEndRef.current) {
			messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [turns.length]);

	// iOS keyboard handling - adjust container height when keyboard opens
	useEffect(() => {
		if (typeof window === 'undefined' || !window.visualViewport) return;

		const handleResize = () => {
			const shell = document.querySelector('.chat-app-shell') as HTMLElement;
			if (shell && window.visualViewport) {
				const viewportHeight = window.visualViewport.height;
				// Only apply if viewport height is reasonable (not too small)
				if (viewportHeight > 200) {
					shell.style.height = `${viewportHeight}px`;
				} else {
					// Fallback to window.innerHeight if visualViewport seems wrong
					shell.style.height = `${window.innerHeight}px`;
				}
			}
		};

		window.visualViewport.addEventListener('resize', handleResize);
		// Run once on mount
		handleResize();

		return () => {
			window.visualViewport?.removeEventListener('resize', handleResize);
		};
	}, []);

	const isVoice = mode === "voice";
	const showProgressBar = progress < 100;
	const totalBasketCount = savedSuggestions.length + maybeSuggestions.length + skippedSuggestions.length;

	const profileActions = (
		<div className="profile-actions-cluster">
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="profile-action-button idea-basket-trigger inline-flex items-center gap-2 rounded-full border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground transition hover:bg-background"
				onClick={() => setIsBasketOpen(true)}
				aria-label="Open idea stash"
			>
				<Archive className="size-3.5" aria-hidden />
				<span>Idea stash</span>
				<span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">{totalBasketCount}</span>
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="profile-action-button inline-flex items-center gap-2 rounded-full border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground transition hover:bg-background"
				onClick={() => router.push("/exploration")}
				aria-label="See personal exploration page"
			>
				<FileText className="size-3.5" aria-hidden />
				<span>Personal page</span>
			</Button>
			<Button
				variant="default"
				size="lg"
				className="profile-action-button chat-mode-button"
				onClick={() => setMode(isVoice ? "text" : "voice")}
			>
				{isVoice ? "Switch to text" : "Switch to voice"}
			</Button>
		</div>
	);

	const voiceSuggestionsSection =
		!isVoice || (!showSuggestionPriming && !canShowSuggestionCards)
			? null
			: (
				<section className="voice-suggestions" aria-label="Suggested directions">
					{showSuggestionPriming ? (
						<div className="suggestion-priming">
							<div className="suggestion-priming__pulse" />
							<div>
								<p>That sparks a few ideas…</p>
								<p>I’m lining them up now.</p>
							</div>
						</div>
					) : null}
					{canShowSuggestionCards ? (
						<>
							<div className="message ai-message suggestion-preface">
								<div className="message-label">GUIDE</div>
								<div className="message-content suggestion-preface-content">
									That triggers some thoughts — do any of these look like your sort of thing?
								</div>
							</div>
							<SuggestionCards
								suggestions={pendingSuggestions}
								variant="panel"
								layout="grid"
								title="Ideas to react to"
								description="Give each a quick reaction. Saved, maybe, or skipped cards head to your stash."
								onReaction={handleSuggestionReaction}
							/>
						</>
					) : null}
				</section>
			);

	const voiceGuidanceStack = !isVoice
		? null
		: (
			<div className="voice-mode-stack">
				<VoiceControls state={realtimeState} controls={realtimeControls} />
				<Card className="voice-mode-panel">
					<div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">Voice mode</div>
					<div className="text-base font-medium whitespace-pre-line">{displayedQuestion}</div>
					<p className="text-sm text-muted-foreground">
						Answer out loud, or use the header toggle if you’d rather type this turn.
					</p>
				</Card>
				{voiceSuggestionsSection}
			</div>
		);

	let conversationMessages: ReactNode = null;
	if (!isVoice) {
		if (turns.length === 0) {
			const { lengthClass, isLongText } = classifyMessageLength(displayedQuestion);
			conversationMessages = (
				<div className={cn("message ai-message", isLongText ? "long-text" : "")}>
					<div className="message-label">GUIDE</div>
					<div className={cn("message-content", lengthClass, isLongText ? "long-text" : "")}>
						{renderMessageContent(displayedQuestion)}
					</div>
				</div>
			);
		} else {
			conversationMessages = (
				<>
					{turns.map((turn, index) => {
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
					})}
				</>
			);
		}
	}

	let textSuggestionContent: ReactNode = null;
	if (!isVoice) {
		if (showSuggestionPriming) {
			textSuggestionContent = (
				<div className="message ai-message suggestion-preface">
					<div className="message-label">GUIDE</div>
					<div className="message-content suggestion-preface-content">
						That makes me think of a few things… give me a moment.
					</div>
				</div>
			);
		} else if (canShowSuggestionCards) {
			textSuggestionContent = (
				<>
					<div className="message ai-message suggestion-preface">
						<div className="message-label">GUIDE</div>
						<div className="message-content suggestion-preface-content">
							That triggers some thoughts — do any of these look like your sort of thing?
						</div>
					</div>
					<div className="message ai-message suggestion-message">
						<div className="message-label">CARDS</div>
						<div className="message-content">
							<SuggestionCards
								suggestions={pendingSuggestions}
								variant="inline"
								layout="carousel"
								showHeader={false}
								emptyState={<span>No cards right now. We’ll bring new ones shortly.</span>}
								onReaction={handleSuggestionReaction}
							/>
						</div>
					</div>
				</>
			);
		}
	}

	const conversationContent = (
		<>
			{voiceGuidanceStack}
			{conversationMessages}
			{textSuggestionContent}
		</>
	);

	const textInputPanel = (
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
	);

	const conversationFooter = isVoice ? null : textInputPanel;

	return (
		<div className="chat-app-shell">
			<header className="chat-header">
				<div className="chat-header-top">
					<h2 className="text-lg font-medium">{header}</h2>
					<span className="text-sm text-muted-foreground">{progress}%</span>
				</div>
				{showProgressBar ? <Progress value={progress} /> : null}
				{insightStatusMessage ? (
					<p className="text-xs text-muted-foreground">{insightStatusMessage}</p>
				) : null}
				<ProfileInsightsBar insights={profileInsights} actions={profileActions} />
			</header>

			<main className={cn("chat-panel", isVoice ? "chat-panel--voice" : "")}>
				<div className="chat-track">
					<div ref={transcriptContainerRef} className={cn("chat-messages", isVoice ? "voice-messages" : "")}>
						{conversationContent}
						{!isVoice ? <div className="chat-input-spacer" aria-hidden /> : null}
						<div ref={messagesEndRef} />
					</div>
				</div>
			</main>

			{!isVoice ? (
				<footer className="chat-footer chat-footer--text">
					<div className="chat-input-dock">{conversationFooter}</div>
				</footer>
			) : null}

			<SuggestionBasket
				open={isBasketOpen}
				onOpenChange={setIsBasketOpen}
				saved={savedSuggestions}
				maybe={maybeSuggestions}
				skipped={skippedSuggestions}
				onClearSkipped={handleClearSkipped}
				onCardReact={handleSuggestionReaction}
			/>
		</div>
	);
}

export default Onboarding;
