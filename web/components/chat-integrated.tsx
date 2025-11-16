"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  TypingIndicator,
} from '@chatscope/chat-ui-kit-react';
import './chat-integrated.css';
import { CustomMessageInput } from '@/components/custom-message-input';
import '@/components/custom-message-input.css';
import { useSession } from '@/components/session-provider';
import { buildRealtimeInstructions } from '@/lib/conversation-instructions';
import type { ConversationTurn, InsightKind, ActivitySignalCategory } from '@/components/session-provider';

import type { LucideIcon } from 'lucide-react';
import { BarChart3, CheckCircle2, ChevronDown, Sparkles, Target, Trophy, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRealtimeSession } from '@/hooks/use-realtime-session';
import { VoiceControls } from '@/components/voice-controls';
import { InlineCareerCard } from '@/components/inline-career-card-v2';
import type { CareerSuggestion } from '@/components/session-provider';
import '@/components/inline-career-card-v2.css';
import { REALTIME_VOICE_ID } from '@/lib/realtime-voice';
import { hasRequiredInsightMix, summarizeAttributeSignals } from '@/lib/suggestion-guards';
import { buildHobbyDeepeningPrompt } from '@/lib/hobby-prompts';
import { STORAGE_KEYS } from '@/lib/storage-keys';

type MessageType = {
  message: string;
  sentTime: string;
  sender: string;
  direction: 'incoming' | 'outgoing';
  type?: 'text' | 'career-card' | 'card-status';
  careerSuggestion?: CareerSuggestion;
  insertAfterTurnIndex?: number; // For card messages, indicates where to insert in timeline
  revealIndex?: number; // For staggered CSS animations (0 = intro, 1+ = cards)
  statusId?: string;
  status?: 'loading' | 'ready';
};

const DEFAULT_OPENING =
  "Let's chat about what you're into and what you're working on. As we go, I'll suggest some ideas you can thumbs up or down, and build you a personal page you can share.";

type CapturedItem = {
  id: string;
  text: string;
};

type CapturedInsights = {
  interests: CapturedItem[];
  strengths: CapturedItem[];
  goals: CapturedItem[];
};

type ProgressStage = {
  minPercent: number;
  title: string;
  caption: string;
  promptHint: string;
};

const PROGRESS_STAGES: ProgressStage[] = [
  {
    minPercent: 0,
    title: "Let's keep it rolling.",
    caption: "I'm mapping your vibe before surfacing matches.",
    promptHint: 'Drop a curiosity to get me started.',
  },
  {
    minPercent: 35,
    title: 'Great spark.',
    caption: 'Every detail sharpens the cards I pull.',
    promptHint: "What's something you're great at?",
  },
  {
    minPercent: 65,
    title: 'Getting closer.',
    caption: 'Almost ready to pin tailored idea cards.',
    promptHint: "Paint a win you'd love to chase.",
  },
  {
    minPercent: 90,
    title: 'Ideas on deck.',
    caption: 'I can start pinning cards the moment you say so.',
    promptHint: 'Ask for ideas or keep riffing details.',
  },
];

const PROGRESS_READY_MESSAGE =
  "Love what you've shared so far. I've drafted your first idea set—tap MY PAGE to peek, and keep riffing if you want me to sharpen it.";

const CARD_REVEAL_DELAY_MS = 3200;

const UNREVIEWED_CARD_THRESHOLD = 3;
const CARD_BACKLOG_TIMEOUT_MS = 90_000;
const CARD_BACKLOG_NUDGE =
  "I've resurfaced your current cards—give them a quick 👍 or 👎 and I'll pull fresh directions right after.";
const MIN_INSIGHTS_FOR_SUGGESTIONS = 4;
const MIN_USER_TURNS_FOR_SUGGESTIONS = 5;
const POSITIVE_RESPONSE_REGEX = /\b(yes|yeah|yep|sure|definitely|absolutely|of course|i guess|i suppose|sounds right|i think so)\b/i;
const NEGATIVE_RESPONSES = [
  'no',
  'nah',
  'nope',
  'not really',
  "don't think",
  'do not',
];
const NEGATIVE_RESPONSE_REGEX = new RegExp(
  `\\b(${NEGATIVE_RESPONSES.map((phrase) =>
    phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')
  ).join('|')})\\b`,
  'i'
);
const formatReadableList = (items: string[]): string => {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
};

export function ChatIntegrated() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    mode,
    setMode,
    profile,
    turns,
    setTurns,
    suggestions,
    votesByCareerId,
    voteCareer,
    appendProfileInsights,
    appendInferredAttributes,
    appendActivitySignals,
    setSuggestions,
    sessionId,
    conversationPhase,
    conversationRubric,
    shouldSeedTeaserCard,
    clearTeaserSeed,
    lastCardInteractionAt,
  } = useSession();

  const currentMode: 'text' | 'voice' = mode ?? 'voice';

  const capturedInsights = useMemo<CapturedInsights>(() => {
    const summary: CapturedInsights = {
      interests: [],
      strengths: [],
      goals: [],
    };
    const seen = {
      interests: new Set<string>(),
      strengths: new Set<string>(),
      goals: new Set<string>(),
    };

    profile.insights.forEach((insight) => {
      const trimmed = insight.value?.trim();
      if (!trimmed) {
        return;
      }

      let bucket: keyof CapturedInsights | null = null;
      if (insight.kind === 'interest') {
        bucket = 'interests';
      } else if (insight.kind === 'strength') {
        bucket = 'strengths';
      } else if (insight.kind === 'goal' || insight.kind === 'hope') {
        bucket = 'goals';
      }

      if (!bucket) {
        return;
      }

      const normalized = trimmed.toLowerCase();
      if (seen[bucket].has(normalized)) {
        return;
      }

      seen[bucket].add(normalized);
      summary[bucket].push({
        id: insight.id,
        text: trimmed,
      });
    });

    return summary;
  }, [profile.insights]);

  const attributeSignals = useMemo(
    () =>
      summarizeAttributeSignals({
        skills: profile.inferredAttributes.skills,
        aptitudes: profile.inferredAttributes.aptitudes,
        workStyles: profile.inferredAttributes.workStyles,
      }),
    [profile.inferredAttributes]
  );

  const unreviewedSuggestions = useMemo(
    () => suggestions.filter((card) => votesByCareerId[card.id] === undefined),
    [suggestions, votesByCareerId]
  );
  const unreviewedCount = unreviewedSuggestions.length;

  const [voiceCardList, setVoiceCardList] = useState<CareerSuggestion[]>([]);
  const voiceSuggestions = useMemo(() => {
    if (currentMode !== 'voice') {
      return suggestions;
    }
    return voiceCardList;
  }, [currentMode, suggestions, voiceCardList]);

  useEffect(() => {
    if (unreviewedCount < UNREVIEWED_CARD_THRESHOLD) {
      backlogNudgeSentRef.current = false;
    }
  }, [unreviewedCount]);

  const {
    percent: progressPercent,
    currentStage,
    nextStage,
  } = useMemo(() => {
    const status = conversationRubric?.cardReadiness?.status ?? 'blocked';
    const depthScore = Math.min((conversationRubric?.contextDepth ?? 0) / 3, 1);
    const statusScore = status === 'ready' ? 1 : status === 'context-light' ? 0.5 : 0;
    const rubricProgress = statusScore * 0.7 + depthScore * 0.3;

    const coverage = conversationRubric?.insightCoverage;
    const insightScores = [
      coverage?.interests ? 1 : Math.min(capturedInsights.interests.length / 4, 1),
      coverage?.aptitudes ? 1 : Math.min(capturedInsights.strengths.length / 3, 1),
      coverage?.goals ? 1 : Math.min(capturedInsights.goals.length / 3, 1),
    ];
    const insightProgress = insightScores.reduce((sum, score) => sum + score, 0) / insightScores.length;

    const rawScore = insightProgress * 0.6 + rubricProgress * 0.4;
    let percent = Math.round(Math.min(rawScore, 1) * 100);
    const rawDepth = conversationRubric?.contextDepth ?? 0;
    const voteValues = Object.values(votesByCareerId ?? {});
    const reviewedCardCount = voteValues.filter((value) => value !== undefined).length;
    const positiveVoteCount = voteValues.filter((value) => value === 1).length;
    const hasMeaningfulCardSignal = reviewedCardCount >= 3 || positiveVoteCount >= 1;
    const meetsInsightReady =
      status === 'ready' &&
      capturedInsights.interests.length >= 3 &&
      capturedInsights.strengths.length >= 2 &&
      capturedInsights.goals.length >= 2 &&
      rawDepth >= 2;
    const meetsCardReady =
      status === 'ready' &&
      rawDepth >= 2 &&
      suggestions.length >= 3 &&
      hasMeaningfulCardSignal;
    const meetsReadyCriteria = meetsInsightReady || meetsCardReady;

    if (!meetsReadyCriteria) {
      percent = Math.min(percent, 94);
    } else if (rubricProgress >= 0.95 && insightProgress >= 0.95) {
      percent = 100;
    } else {
      percent = Math.max(percent, 95);
    }

    let stageIndex = 0;
    for (let i = 0; i < PROGRESS_STAGES.length; i += 1) {
      if (percent >= PROGRESS_STAGES[i].minPercent) {
        stageIndex = i;
      } else {
        break;
      }
    }

    return {
      percent,
      currentStage: PROGRESS_STAGES[stageIndex],
      nextStage: PROGRESS_STAGES[stageIndex + 1] ?? null,
    };
  }, [capturedInsights, conversationRubric, suggestions.length, votesByCareerId]);

  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [voiceSessionStarted, setVoiceSessionStarted] = useState(false);
const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
const [readyToastVisible, setReadyToastVisible] = useState(false);
const [readyToastDismissed, setReadyToastDismissed] = useState(false);
  const [recentlyAddedItem, setRecentlyAddedItem] = useState<string | null>(null);
  const newItemTimerRef = useRef<number | null>(null);
  const previousInsightIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedInsightsRef = useRef(false);
  const hasAnnouncedReadinessRef = useRef(false);
const hasAutoCollapsedReadyRef = useRef(false);
  const voiceSuggestionBaselineRef = useRef<Set<string>>(new Set());
  const voiceBaselineCapturedRef = useRef(false);
  const cardStatusIdRef = useRef<string | null>(null);
  const cardRevealTimerRef = useRef<number | null>(null);
  const pendingVoiceCardQueueRef = useRef<Array<() => void>>([]);
  const cardStatusProgressStyle = useMemo(
    () =>
      ({
        ['--card-progress-duration' as string]: `${CARD_REVEAL_DELAY_MS}ms`,
      } as CSSProperties),
    []
  );
  // Basket drawer removed - voted cards now shown on MY PAGE

  const modeInitializedRef = useRef(false);

  useEffect(() => {
    if (modeInitializedRef.current) {
      return;
    }

    let initialMode: 'text' | 'voice' = mode ?? 'voice';
    const queryMode = searchParams?.get('mode')?.toLowerCase();
    if (queryMode === 'text' || queryMode === 'voice') {
      initialMode = queryMode;
    }

    setMode(initialMode);
    modeInitializedRef.current = true;
  }, [mode, searchParams, setMode]);

  const insightCategories = useMemo(() => {
    const categories: Array<{
      key: keyof CapturedInsights;
      label: string;
      icon: LucideIcon;
      count: number;
      items: CapturedItem[];
    }> = [
      {
        key: 'interests',
        label: 'Interests',
        icon: Sparkles,
        count: capturedInsights.interests.length,
        items: capturedInsights.interests,
      },
      {
        key: 'strengths',
        label: 'Strengths',
        icon: Trophy,
        count: capturedInsights.strengths.length,
        items: capturedInsights.strengths,
      },
      {
        key: 'goals',
        label: 'Goals',
        icon: Target,
        count: capturedInsights.goals.length,
        items: capturedInsights.goals,
      },
    ];

    return categories;
  }, [capturedInsights]);

  const totalInsights = useMemo(
    () => insightCategories.reduce((acc, category) => acc + category.count, 0),
    [insightCategories]
  );
  const canExpandInsights = useMemo(
    () => insightCategories.some((category) => category.count > 0),
    [insightCategories]
  );

  useEffect(() => {
    const currentIds = new Set(profile.insights.map((insight) => insight.id));

    if (!hasInitializedInsightsRef.current) {
      previousInsightIdsRef.current = currentIds;
      hasInitializedInsightsRef.current = true;
      return;
    }

    let newestInsight: { id: string; text: string } | null = null;
    for (const insight of profile.insights) {
      if (previousInsightIdsRef.current.has(insight.id)) {
        continue;
      }

      const trimmed = insight.value?.trim();
      if (!trimmed) {
        continue;
      }

      if (
        insight.kind === 'interest' ||
        insight.kind === 'strength' ||
        insight.kind === 'goal' ||
        insight.kind === 'hope'
      ) {
        newestInsight = { id: insight.id, text: trimmed };
        break;
      }
    }

    previousInsightIdsRef.current = currentIds;

    if (!newestInsight) {
      return;
    }

    if (newItemTimerRef.current !== null) {
      window.clearTimeout(newItemTimerRef.current);
      newItemTimerRef.current = null;
    }

    setRecentlyAddedItem(newestInsight.text);
    newItemTimerRef.current = window.setTimeout(() => {
      setRecentlyAddedItem(null);
      newItemTimerRef.current = null;
    }, 2800);

    return () => {
      if (newItemTimerRef.current !== null) {
        window.clearTimeout(newItemTimerRef.current);
        newItemTimerRef.current = null;
      }
    };
  }, [profile.insights]);

  useEffect(() => {
    return () => {
      if (newItemTimerRef.current !== null) {
        window.clearTimeout(newItemTimerRef.current);
        newItemTimerRef.current = null;
      }
    };
  }, []);

  const ctaLabel = nextStage ? 'Next up' : 'Ready';
  const ctaText = (nextStage ?? currentStage).promptHint;
  const chipText = useMemo(() => {
    if (!recentlyAddedItem) {
      return null;
    }
    return recentlyAddedItem.length > 36
      ? `${recentlyAddedItem.slice(0, 33)}…`
      : recentlyAddedItem;
  }, [recentlyAddedItem]);
  const toggleHeader = () => {
    setIsHeaderExpanded((prev) => !prev);
  };

  useEffect(() => {
    if (attributeSignals.careerSignalCount + attributeSignals.developingSignalCount > 0) {
      lastHobbyPromptRef.current = null;
      pendingHobbyPromptRef.current = null;
    }
  }, [attributeSignals.careerSignalCount, attributeSignals.developingSignalCount]);

  useEffect(() => {
    const suggestionsReady =
      currentMode === 'voice' ? voiceCardList.length > 0 : suggestions.length > 0;

    if (progressPercent < 100 || !suggestionsReady) {
      hasAutoCollapsedReadyRef.current = false;
      setReadyToastVisible(false);
      if (readyToastDismissed) {
        setReadyToastDismissed(false);
      }
      return;
    }

    if (!readyToastDismissed) {
      setReadyToastVisible(true);
    }

    if (!hasAutoCollapsedReadyRef.current && isHeaderExpanded) {
      setIsHeaderExpanded(false);
      hasAutoCollapsedReadyRef.current = true;
    } else if (!hasAutoCollapsedReadyRef.current) {
      hasAutoCollapsedReadyRef.current = true;
    }
    if (!hasAutoCollapsedReadyRef.current && isHeaderExpanded) {
      setIsHeaderExpanded(false);
      hasAutoCollapsedReadyRef.current = true;
    } else if (!hasAutoCollapsedReadyRef.current) {
      hasAutoCollapsedReadyRef.current = true;
    }
  }, [progressPercent, currentMode, voiceCardList.length, suggestions.length, isHeaderExpanded, readyToastDismissed]);

  useEffect(() => {
    const suggestionsReady =
      currentMode === 'voice' ? voiceCardList.length > 0 : suggestions.length > 0;

    if (progressPercent < 100 || !suggestionsReady) {
      hasAnnouncedReadinessRef.current = false;
      return;
    }

    if (progressPercent >= 100 && !hasAnnouncedReadinessRef.current) {
      hasAnnouncedReadinessRef.current = true;
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: PROGRESS_READY_MESSAGE,
        },
      ]);
    }
  }, [progressPercent, currentMode, voiceCardList.length, suggestions.length, setTurns]);

  // Realtime API session
  const [realtimeState, realtimeControls] = useRealtimeSession({
    sessionId,
    enableMicrophone: currentMode === 'voice',
    enableAudioOutput: true,
    voice: REALTIME_VOICE_ID,
  });

  const handleModeToggle = useCallback(() => {
    if (currentMode === 'text') {
      // Switch to voice UI, do not auto-connect or resume mic yet.
      // VoiceControls will connect/resume mic on Start Voice.
      setVoiceSessionStarted(false);
      modeInitializedRef.current = true;
      setMode('voice');
    } else {
      // Switch to text: pause mic if connected, keep session alive.
      try { realtimeControls.pauseMicrophone(); } catch { /* noop */ }
      setVoiceSessionStarted(false);
      setVoiceCardList([]);
      modeInitializedRef.current = true;
      setMode('text');
    }
  }, [currentMode, realtimeControls, setMode]);

  const handleReadyToastOpenInsights = useCallback(() => {
    setReadyToastVisible(false);
    setReadyToastDismissed(true);

    if (canExpandInsights) {
      setIsHeaderExpanded(true);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          const insightsButton = document.querySelector<HTMLButtonElement>('.consolidated-badge');
          insightsButton?.focus();
        });
      }
    }
  }, [canExpandInsights]);

  const handleReadyToastDismiss = useCallback(() => {
    setReadyToastVisible(false);
    setReadyToastDismissed(true);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastInsightsTurnCountRef = useRef(0);
  const suggestionsFetchInFlightRef = useRef(false);
  const lastSuggestionsFetchAtRef = useRef<number>(0);
  const lastSuggestionRequestRef = useRef<string | null>(null);
  const skipAssistantRefetchRef = useRef(false);
  const lastSuggestionModeRef = useRef<'normal' | 'fallback'>('normal');
  const lastCardAnnouncementTurnRef = useRef<number | null>(null);
  const lastSuggestionTurnRef = useRef<number>(0);
  const blockedStreakRef = useRef(0);
  const pendingReadyRubricChangeRef = useRef(false);
  const lastReadySignatureRef = useRef<string | null>(null);
  const userTurnsSinceLastSuggestionRef = useRef(0);
  const lastProcessedTurnCountRef = useRef(turns.length);
  const lastRubricUpdateAtRef = useRef<number>(0);
  const lastRubricTurnCountRef = useRef<number>(0);
  const backlogNudgeSentRef = useRef(false);

  useEffect(() => {
    if (suggestions.length > 0 && lastSuggestionsFetchAtRef.current === 0) {
      lastSuggestionsFetchAtRef.current = Date.now();
    }
  }, [suggestions.length]);
  
  // Initialize last insight count from sessionStorage (only once on mount)
  const suggestionsLastInsightCountRef = useRef<number>(0);
  if (suggestionsLastInsightCountRef.current === 0 && typeof window !== 'undefined') {
    try {
      // Clean up any legacy localStorage entry
      localStorage.removeItem(STORAGE_KEYS.lastInsightCount);
    } catch {
      // ignore
    }
    try {
      const stored = sessionStorage.getItem(STORAGE_KEYS.lastInsightCount);
      if (stored) {
        suggestionsLastInsightCountRef.current = parseInt(stored, 10);
        console.log('[ChatIntegrated] Restored last insight count:', suggestionsLastInsightCountRef.current);
      }
    } catch (error) {
      console.error('[ChatIntegrated] Failed to restore last insight count:', error);
    }
  }
  
  // Initialize shown suggestion IDs from sessionStorage (only once on mount)
  const shownSuggestionIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedShownIds = useRef(false);
  if (!hasInitializedShownIds.current && typeof window !== 'undefined') {
    try {
      // Clean up any legacy localStorage entry
      localStorage.removeItem(STORAGE_KEYS.shownSuggestionIds);
    } catch {
      // ignore
    }
    try {
      const stored = sessionStorage.getItem(STORAGE_KEYS.shownSuggestionIds);
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        shownSuggestionIdsRef.current = new Set(ids);
        console.log('[ChatIntegrated] Restored shown suggestion IDs:', ids.length);
      }
    } catch (error) {
      console.error('[ChatIntegrated] Failed to restore shown suggestion IDs:', error);
    }
    hasInitializedShownIds.current = true;
  }
  
  // Store card messages separately (not persisted to avoid infinite loop issues)
  const [cardMessages, setCardMessages] = useState<MessageType[]>([]);
  const requeueUnreviewedCards = useCallback(() => {
    if (unreviewedSuggestions.length === 0) {
      return;
    }

    const insertAfterTurnIndex = turns.length;

    setCardMessages((prev) => {
      const unreviewedIds = new Set(unreviewedSuggestions.map((card) => card.id));
      const kept = prev.filter(
        (msg) => !(msg.type === 'career-card' && msg.careerSuggestion && unreviewedIds.has(msg.careerSuggestion.id))
      );

      const replayMessages: MessageType[] = unreviewedSuggestions.map((suggestion, index) => ({
        message: '',
        sentTime: 'just now',
        sender: 'Guide',
        direction: 'incoming',
        type: 'career-card',
        careerSuggestion: suggestion,
        insertAfterTurnIndex,
        revealIndex: index,
      }));

      console.info('[Suggestions] Re-presenting existing cards', {
        count: replayMessages.length,
        insertAfterTurnIndex,
      });

      return [...kept, ...replayMessages];
    });

    if (currentMode === 'voice') {
      setVoiceCardList((prev) => {
        const merged = new Map<string, CareerSuggestion>();
        unreviewedSuggestions.forEach((card) => merged.set(card.id, card));
        prev.forEach((card) => {
          if (!merged.has(card.id)) {
            merged.set(card.id, card);
          }
        });
        return Array.from(merged.values());
      });
    }
  }, [currentMode, setCardMessages, setVoiceCardList, turns.length, unreviewedSuggestions]);

  const CARD_FETCH_ANNOUNCEMENT = useMemo(
    () =>
      "That sparks a few possibilities. These aren't recommendations yet—vote them up or down so I can narrow in. Give me a second to line them up.",
    []
  );

  useEffect(() => {
    return () => {
      if (cardRevealTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(cardRevealTimerRef.current);
        cardRevealTimerRef.current = null;
      }
    };
  }, []);
  
  // Track all suggestions that have ever been shown (for vote persistence) - only once on mount
const allSuggestionsRef = useRef<Map<string, typeof suggestions[0]>>(new Map());
const sessionInitializedRef = useRef(false);
const hasInitializedAllSuggestions = useRef(false);
const lastHobbyPromptRef = useRef<string | null>(null);
const pendingHobbyPromptRef = useRef<{ label: string; skills: string[]; fields: string[] } | null>(null);
const lastProcessedTurnRef = useRef<number>(turns.length);
  if (!hasInitializedAllSuggestions.current) {
    // Restore from current suggestions persisted during this session
    suggestions.forEach(s => allSuggestionsRef.current.set(s.id, s));
    console.log('[ChatIntegrated] Initialized allSuggestionsRef with', allSuggestionsRef.current.size, 'suggestions');
    hasInitializedAllSuggestions.current = true;
  }

  useEffect(() => {
    if (!conversationRubric) {
      return;
    }

    if (conversationRubric.lastUpdatedAt === lastRubricUpdateAtRef.current) {
      return;
    }

    lastRubricUpdateAtRef.current = conversationRubric.lastUpdatedAt;

    const status = conversationRubric.cardReadiness.status;
    const currentTurnCount = turns.length;
    const lastTurn = turns[turns.length - 1];

    if (status === 'blocked' && lastRubricTurnCountRef.current !== currentTurnCount && lastTurn?.role === 'user') {
      blockedStreakRef.current += 1;
    }

    if (status !== 'blocked') {
      blockedStreakRef.current = 0;
    }

    if (status === 'ready') {
      const signature = JSON.stringify({
        contextDepth: conversationRubric.contextDepth,
        readinessBias: conversationRubric.readinessBias,
        insightCoverage: conversationRubric.insightCoverage,
        insightGaps: [...(conversationRubric.insightGaps ?? [])].sort(),
      });

      if (signature !== lastReadySignatureRef.current) {
        pendingReadyRubricChangeRef.current = true;
        lastReadySignatureRef.current = signature;
      }
    }

    lastRubricTurnCountRef.current = currentTurnCount;
  }, [conversationRubric, turns]);

  const removeCardAnnouncement = useCallback(() => {
    if (lastCardAnnouncementTurnRef.current === null) {
      return;
    }

    const announcementIndex = lastCardAnnouncementTurnRef.current - 1;
    lastCardAnnouncementTurnRef.current = null;

    setTurns((prev) => {
      if (announcementIndex < 0 || announcementIndex >= prev.length) {
        return prev;
      }
      if (prev[announcementIndex]?.role === 'assistant' && prev[announcementIndex]?.text === CARD_FETCH_ANNOUNCEMENT) {
        return [...prev.slice(0, announcementIndex), ...prev.slice(announcementIndex + 1)];
      }
      return prev;
    });
  }, [CARD_FETCH_ANNOUNCEMENT, setTurns]);

  const announceCardFetch = useCallback(() => {
    if (lastCardAnnouncementTurnRef.current !== null) {
      return;
    }

    const announcementInsertIndex = turns.length + 1;

    setTurns((prev) => {
      const next = [
        ...prev,
        {
          role: 'assistant' as const,
          text: CARD_FETCH_ANNOUNCEMENT,
        },
      ];
      lastCardAnnouncementTurnRef.current = next.length;
      return next;
    });

    const statusId = `card-status-${Date.now()}`;
    cardStatusIdRef.current = statusId;
    setCardMessages((prev) => [
      ...prev.filter((msg) => msg.type !== 'card-status'),
      {
        message: '',
        sentTime: 'just now',
        sender: 'Guide',
        direction: 'incoming',
        type: 'card-status',
        insertAfterTurnIndex: announcementInsertIndex,
        statusId,
        status: 'loading' as const,
      },
    ]);
  }, [CARD_FETCH_ANNOUNCEMENT, setTurns, setCardMessages, turns.length]);

  useEffect(() => {
    if (currentMode !== 'voice') {
      voiceSuggestionBaselineRef.current = new Set();
      voiceBaselineCapturedRef.current = false;
      setVoiceSessionStarted(false);
      setVoiceCardList([]);
    }
  }, [currentMode]);

  useEffect(() => {
    if (currentMode === 'voice' && (realtimeState.status === 'idle' || realtimeState.status === 'error')) {
      setVoiceSessionStarted(false);
      voiceBaselineCapturedRef.current = false;
      voiceSuggestionBaselineRef.current = new Set(suggestions.map((s) => s.id));
      setVoiceCardList([]);
    }
  }, [currentMode, realtimeState.status, suggestions]);
  
  // Initialize allSuggestionsRef with existing suggestions from session
  useEffect(() => {
    if (!sessionInitializedRef.current) {
      sessionInitializedRef.current = true;
    }
    suggestions.forEach((s) => {
      if (!allSuggestionsRef.current.has(s.id)) {
        allSuggestionsRef.current.set(s.id, s);
      }
    });
  }, [suggestions]);

  useEffect(() => {
    allSuggestionsRef.current.clear();
    sessionInitializedRef.current = false;
    suggestionsLastInsightCountRef.current = 0;
    pendingHobbyPromptRef.current = null;
    lastProcessedTurnRef.current = turns.length;
    lastHobbyPromptRef.current = null;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEYS.suggestions);
        sessionStorage.removeItem(STORAGE_KEYS.lastInsightCount);
      } catch {
        // ignore
      }
    }
  }, [sessionId]);

  const turnCount = turns.length;

  useEffect(() => {
    const pending = pendingHobbyPromptRef.current;
    if (!pending) {
      return;
    }
    if (turnCount === 0) {
      return;
    }
    const lastTurn = turns[turnCount - 1];
    if (!lastTurn || lastTurn.role !== 'user') {
      return;
    }
    if (lastProcessedTurnRef.current === turnCount) {
      return;
    }
    lastProcessedTurnRef.current = turnCount;

    const response = lastTurn.text.toLowerCase();

    if (NEGATIVE_RESPONSE_REGEX.test(response)) {
      pendingHobbyPromptRef.current = null;
      return;
    }

    if (POSITIVE_RESPONSE_REGEX.test(response) || pending.skills.some((skill) => response.includes(skill.toLowerCase()))) {
      appendInferredAttributes({
        skills: pending.skills.map((label) => ({
          label,
          stage: 'developing',
          confidence: 'medium',
        })),
        aptitudes: [],
        workStyles: [],
      });
      appendProfileInsights(
        pending.skills.map((label) => ({
          kind: 'strength' as InsightKind,
          value: label,
          confidence: 'medium',
          source: 'assistant',
          evidence: 'Mapped from hobby conversation',
        }))
      );

      const fieldOptions = pending.fields.length > 0 ? formatReadableList(pending.fields.slice(0, 3)) : '';
      const followUp = fieldOptions
        ? `Brilliant—that gives us something real to note. Those strengths show up loads in ${fieldOptions}. Fancy unpacking one of those, or is there another lane you want to size up?`
        : "Brilliant—that gives us something real to note. Fancy unpacking where you'd like to apply those strengths?";

      pendingHobbyPromptRef.current = null;
      lastHobbyPromptRef.current = null;
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: followUp,
        },
      ]);
    }
  }, [appendInferredAttributes, appendProfileInsights, setTurns, turnCount, turns]);

  // Ensure initial message is added to turns on mount
  useEffect(() => {
    if (currentMode !== 'text') {
      return;
    }
    if (turns.length === 0) {
      const initialTurn: ConversationTurn = {
        role: 'assistant',
        text: DEFAULT_OPENING,
      };
      setTurns([initialTurn]);
    }
  }, [currentMode, setTurns, turns.length]);

  // Convert turns to chat-ui-kit message format
  const textMessages: MessageType[] = useMemo(() => {
    return turns.map((turn): MessageType => {
      const isAssistant = turn.role === 'assistant';
      return {
        message: turn.text,
        sentTime: 'just now',
        sender: isAssistant ? 'Guide' : 'User',
        direction: isAssistant ? 'incoming' : 'outgoing',
        type: 'text',
      };
    });
  }, [turns]);
  
  // Combine text messages and card messages in chronological order
  // Card messages are inserted after the turn count at which they were generated
  const messages: MessageType[] = useMemo(() => {
    const combined: MessageType[] = [];
    
    // Group card messages by their insertion point
    const cardsByInsertPoint = new Map<number, MessageType[]>();
    for (const cardMsg of cardMessages) {
      const insertPoint = cardMsg.insertAfterTurnIndex ?? textMessages.length;
      if (!cardsByInsertPoint.has(insertPoint)) {
        cardsByInsertPoint.set(insertPoint, []);
      }
      cardsByInsertPoint.get(insertPoint)!.push(cardMsg);
    }
    console.log('[ChatIntegrated] Cards by insertion point:', Array.from(cardsByInsertPoint.entries()).map(([point, cards]) => ({ point, count: cards.length })));
    
    // Interleave text messages and cards
    for (let i = 0; i < textMessages.length; i++) {
      combined.push(textMessages[i]);
      
      // Insert any cards that should appear after this turn
      const cardsAtThisPoint = cardsByInsertPoint.get(i + 1);
      if (cardsAtThisPoint) {
        combined.push(...cardsAtThisPoint);
        console.log('[ChatIntegrated] Inserted', cardsAtThisPoint.length, 'cards after turn', i + 1);
      }
    }
    
    console.log('[ChatIntegrated] Combined messages:', {
      textCount: textMessages.length,
      cardCount: cardMessages.length,
      combinedCount: combined.length,
      cardMessageIds: cardMessages.filter(m => m.type === 'career-card').map(m => m.careerSuggestion?.id)
    });
    return combined;
  }, [textMessages, cardMessages]);


  useEffect(() => {
    if (turns.length > lastProcessedTurnCountRef.current) {
      for (let index = lastProcessedTurnCountRef.current; index < turns.length; index += 1) {
        if (turns[index]?.role === 'user') {
          userTurnsSinceLastSuggestionRef.current += 1;
        }
      }
      lastProcessedTurnCountRef.current = turns.length;
    }
  }, [turns]);
  
  // Add new card messages when new suggestions appear
  useEffect(() => {
    console.log('[ChatIntegrated] Suggestions changed:', {
      totalSuggestions: suggestions.length,
      suggestionIds: suggestions.map(s => s.id),
      alreadyShown: Array.from(shownSuggestionIdsRef.current)
    });
    
    const newSuggestions = suggestions.filter(s => !shownSuggestionIdsRef.current.has(s.id));
    if (newSuggestions.length === 0) {
      console.log('[ChatIntegrated] No new suggestions to reveal (all already shown)');
      return;
    }

    console.log('[ChatIntegrated] Found', newSuggestions.length, 'new suggestions to reveal:', newSuggestions.map(s => s.id));
    
    // Mark these suggestions as shown FIRST to prevent re-triggering
    newSuggestions.forEach(s => shownSuggestionIdsRef.current.add(s.id));
    
    // Persist shown suggestion IDs to localStorage
    if (typeof window !== 'undefined') {
      try {
        const idsArray = Array.from(shownSuggestionIdsRef.current);
        sessionStorage.setItem(STORAGE_KEYS.shownSuggestionIds, JSON.stringify(idsArray));
        console.log('[ChatIntegrated] Saved shown suggestion IDs to sessionStorage:', idsArray.length);
      } catch (error) {
        console.error('[ChatIntegrated] Failed to save shown suggestion IDs to sessionStorage:', error);
      }
    }
    
    // Track current turn count for insertion point
    const currentTurnCount = turns.length;
    // Prevent re-injecting another intro+cards for the same insertion point
    const alreadyInjectedHere = cardMessages.some(m => (m.insertAfterTurnIndex ?? -1) === currentTurnCount);
    if (alreadyInjectedHere) {
      console.log('[ChatIntegrated] Skipping injection; already injected at this turn index', currentTurnCount);
      return;
    }
    
    const statusId = cardStatusIdRef.current;

    const newCardMessages: MessageType[] = newSuggestions.map((suggestion, index): MessageType => ({
      message: '',
      sentTime: 'just now',
      sender: 'Guide',
      direction: 'incoming',
      type: 'career-card',
      careerSuggestion: suggestion,
      insertAfterTurnIndex: currentTurnCount,
      revealIndex: index,
    }));

    const runCardInjection = () => {
      setCardMessages(prev => {
        const withUpdatedStatus = prev.map((msg) =>
          msg.type === 'card-status' && msg.statusId === statusId
            ? { ...msg, status: 'ready' as const }
            : msg
        );

        const existingIds = new Set(
          withUpdatedStatus
            .filter(m => m.type === 'career-card' && m.careerSuggestion)
            .map(m => m.careerSuggestion!.id)
        );

        const filteredCards = newCardMessages.filter(msg => {
          const id = msg.careerSuggestion?.id;
          if (!id) return false;
          if (existingIds.has(id)) {
            return false;
          }
          existingIds.add(id);
          return true;
        });

        if (filteredCards.length === 0) {
          console.log('[ChatIntegrated] Skipping card injection; all suggestions already shown.');
          return withUpdatedStatus;
        }

        console.log('[ChatIntegrated] Added', filteredCards.length, 'cards with staggered reveal');
        return [...withUpdatedStatus, ...filteredCards];
      });

      if (statusId && typeof window !== 'undefined') {
        window.setTimeout(() => {
          setCardMessages((prev) => {
            const next = prev.filter(
              (msg) => !(msg.type === 'card-status' && msg.statusId === statusId)
            );
            if (cardStatusIdRef.current === statusId) {
              cardStatusIdRef.current = null;
            }
            return next;
          });
        }, 1200);
      }

      lastCardAnnouncementTurnRef.current = null;
      userTurnsSinceLastSuggestionRef.current = 0;
      lastSuggestionTurnRef.current = currentTurnCount;

      if (currentMode === 'voice') {
        setVoiceCardList((prev) => {
          const merged = new Map<string, CareerSuggestion>();
          newSuggestions.forEach((suggestion) => {
            merged.set(suggestion.id, suggestion);
          });
          prev.forEach((card) => {
            if (!merged.has(card.id)) {
              merged.set(card.id, card);
            }
          });
          return Array.from(merged.values());
        });
      }
    };

    const flushPendingVoiceQueue = () => {
      if (pendingVoiceCardQueueRef.current.length === 0) {
        return;
      }
      const queue = pendingVoiceCardQueueRef.current.splice(0);
      realtimeControls.setOnResponseCompleted(null);
      queue.forEach((fn) => fn());
    };

    if (currentMode === 'voice' && !realtimeState.activeResponseId) {
      flushPendingVoiceQueue();
    }

    const scheduleCardInjection = () => {
      if (currentMode === 'voice' && realtimeState.activeResponseId) {
        console.log('[ChatIntegrated] Deferring card injection until current response finishes', {
          activeResponseId: realtimeState.activeResponseId,
          pendingCount: pendingVoiceCardQueueRef.current.length,
        });
        pendingVoiceCardQueueRef.current.push(() => {
          console.log('[ChatIntegrated] Running deferred card injection');
          runCardInjection();
        });
        if (pendingVoiceCardQueueRef.current.length === 1) {
          realtimeControls.setOnResponseCompleted(() => {
            flushPendingVoiceQueue();
          });
        }
        return;
      }

      runCardInjection();
    };

    if (typeof window !== 'undefined' && CARD_REVEAL_DELAY_MS > 0) {
      if (cardRevealTimerRef.current !== null) {
        window.clearTimeout(cardRevealTimerRef.current);
      }
      cardRevealTimerRef.current = window.setTimeout(() => {
        cardRevealTimerRef.current = null;
        scheduleCardInjection();
      }, CARD_REVEAL_DELAY_MS);
    } else {
      scheduleCardInjection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, currentMode, realtimeState.activeResponseId, realtimeControls]);

  // Derive insights from conversation
const deriveInsights = useCallback(async (turnsSnapshot: ConversationTurn[]) => {
  if (turnsSnapshot.length === 0) return;
  if (turnsSnapshot.length === lastInsightsTurnCountRef.current) return;
  lastInsightsTurnCountRef.current = turnsSnapshot.length;

    console.log('deriveInsights called with', turnsSnapshot.length, 'turns');

    try {
      const response = await fetch('/api/profile/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          turns: turnsSnapshot,
          existingInsights: (profile.insights ?? []).map((insight) => ({
            kind: insight.kind,
            value: insight.value,
          })),
          existingActivitySignals: (profile.activitySignals ?? []).map((signal) => ({
            category: signal.category,
            statement: signal.statement,
          })),
        }),
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json() as {
        insights?: Array<{
          kind: string;
          value: string;
          confidence?: 'low' | 'medium' | 'high';
          evidence?: string;
          source?: 'assistant' | 'user' | 'system';
        }>;
        inferredAttributes?: {
          skills?: Array<{ label?: string; confidence?: 'low' | 'medium' | 'high'; evidence?: string }>;
          aptitudes?: Array<{ label?: string; confidence?: 'low' | 'medium' | 'high'; evidence?: string }>;
          workStyles?: Array<{ label?: string; confidence?: 'low' | 'medium' | 'high'; evidence?: string }>;
        } | null;
        activitySignals?: Array<{
          statement?: string;
          category?: ActivitySignalCategory | string;
          supportingSkills?: unknown;
          inferredGoals?: unknown;
          confidence?: 'low' | 'medium' | 'high';
          evidence?: string;
        }>;
      };
      console.log('Insights API returned:', data.insights);
      if (Array.isArray(data.insights)) {
        appendProfileInsights(
          data.insights
            .filter(
              (item) => typeof item?.kind === 'string' && typeof item?.value === 'string'
            )
            .map((item) => ({
              kind: item.kind as InsightKind,
              value: item.value,
              confidence: item.confidence,
              evidence: item.evidence,
              source: item.source ?? 'assistant',
            }))
        );
        console.log('Called appendProfileInsights with', data.insights.length, 'insights');
      }
      if (data.inferredAttributes) {
        appendInferredAttributes({
          skills: (Array.isArray(data.inferredAttributes.skills)
            ? data.inferredAttributes.skills
            : []
          ).filter((item): item is { label: string; confidence?: 'low' | 'medium' | 'high'; evidence?: string; stage?: string } => typeof item?.label === 'string').map((item) => ({
            label: item.label,
            confidence: item.confidence,
            evidence: item.evidence,
            stage: item.stage === 'established' || item.stage === 'developing' || item.stage === 'hobby' ? item.stage : undefined,
          })),
          aptitudes: (Array.isArray(data.inferredAttributes.aptitudes)
            ? data.inferredAttributes.aptitudes
            : []
          ).filter((item): item is { label: string; confidence?: 'low' | 'medium' | 'high'; evidence?: string; stage?: string } => typeof item?.label === 'string').map((item) => ({
            label: item.label,
            confidence: item.confidence,
            evidence: item.evidence,
            stage: item.stage === 'established' || item.stage === 'developing' || item.stage === 'hobby' ? item.stage : undefined,
          })),
          workStyles: (Array.isArray(data.inferredAttributes.workStyles)
            ? data.inferredAttributes.workStyles
            : []
          ).filter((item): item is { label: string; confidence?: 'low' | 'medium' | 'high'; evidence?: string; stage?: string } => typeof item?.label === 'string').map((item) => ({
            label: item.label,
            confidence: item.confidence,
            evidence: item.evidence,
            stage: item.stage === 'established' || item.stage === 'developing' || item.stage === 'hobby' ? item.stage : undefined,
          })),
        });
      }
      if (Array.isArray(data.activitySignals) && data.activitySignals.length > 0) {
        const sanitizeStringList = (value: unknown): string[] => {
          if (!Array.isArray(value)) {
            return [];
          }
          return value
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
        };

        appendActivitySignals(
          data.activitySignals
            .filter((item): item is {
              statement: string;
              category?: ActivitySignalCategory | string;
              supportingSkills?: unknown;
              inferredGoals?: unknown;
              confidence?: 'low' | 'medium' | 'high';
              evidence?: string;
            } => typeof item?.statement === 'string')
            .map((item) => ({
              statement: item.statement.trim(),
              category:
                item.category === 'hobby' || item.category === 'side_hustle' || item.category === 'career_intent'
                  ? (item.category as ActivitySignalCategory)
                  : 'hobby',
              supportingSkills: sanitizeStringList(item.supportingSkills),
              inferredGoals: sanitizeStringList(item.inferredGoals),
              confidence:
                item.confidence === 'low' || item.confidence === 'medium' || item.confidence === 'high'
                  ? item.confidence
                  : undefined,
              evidence: typeof item.evidence === 'string' ? item.evidence : undefined,
            }))
        );
      }
    } catch (err) {
      console.error('Failed to derive profile insights', err);
  }
}, [appendProfileInsights, appendInferredAttributes, appendActivitySignals, profile.activitySignals, profile.insights, sessionId]);

  const evaluateSuggestionFetch = useCallback(
    (
      {
        force = false,
        turnSnapshot,
        triggerText,
      }: { force?: boolean; turnSnapshot?: ConversationTurn[]; triggerText?: string } = {}
    ) => {
      const insightCount = profile.insights.length;
      const turnList = turnSnapshot ?? turns;
      const turnCount = turnList.length;
      const userTurnCount = turnList.filter((turn) => turn.role === 'user').length;
      const status = conversationRubric?.cardReadiness?.status ?? 'blocked';
      const depthScore = conversationRubric?.contextDepth ?? 0;
      const explicitIdeas = Boolean(conversationRubric?.explicitIdeasRequest);

      const focusText = triggerText?.trim();
      const now = Date.now();
      const lastDeliveryAt = lastSuggestionsFetchAtRef.current;
      const lastEngagementAt =
        lastCardInteractionAt ?? (lastDeliveryAt > 0 ? lastDeliveryAt : null);
      const backlogAge = lastEngagementAt ? now - lastEngagementAt : 0;
      const backlogActive =
        !force &&
        lastDeliveryAt > 0 &&
        unreviewedCount >= UNREVIEWED_CARD_THRESHOLD &&
        backlogAge >= CARD_BACKLOG_TIMEOUT_MS;

      if (backlogActive) {
        if (!backlogNudgeSentRef.current && unreviewedCount > 0) {
          backlogNudgeSentRef.current = true;
          requeueUnreviewedCards();
          console.info('[Suggestions] Pausing new cards due to backlog', {
            unreviewedCount,
            backlogAgeMs: backlogAge,
          });
          setTurns((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: CARD_BACKLOG_NUDGE,
            },
          ]);
        }

        return {
          shouldFetch: false,
          fetchMode: 'normal' as const,
          allowCardPrompt: false,
          insightCount,
          turnCount,
          focusText,
        } as const;
      }

      if (force) {
        const fetchMode = status === 'ready' ? 'normal' : 'fallback';
        return {
          shouldFetch: true,
          fetchMode,
          allowCardPrompt: fetchMode === 'normal',
          insightCount,
          turnCount,
          focusText,
        } as const;
      }

      const meetsInsightContext =
        insightCount >= MIN_INSIGHTS_FOR_SUGGESTIONS && hasRequiredInsightMix(profile.insights);
      const meetsTurnContext = userTurnCount >= MIN_USER_TURNS_FOR_SUGGESTIONS;
      const meetsDepthContext = depthScore >= 1;
      const hasCareerAttributes =
        attributeSignals.careerSignalCount + attributeSignals.developingSignalCount > 0;

      if (
        !force &&
        !explicitIdeas &&
        (!meetsInsightContext || !meetsTurnContext || !meetsDepthContext || !hasCareerAttributes)
      ) {
        if (
          !hasCareerAttributes &&
          attributeSignals.primaryHobbyLabel &&
          lastHobbyPromptRef.current !== attributeSignals.primaryHobbyLabel
        ) {
          lastHobbyPromptRef.current = attributeSignals.primaryHobbyLabel;
          const { prompt, skills, fields } = buildHobbyDeepeningPrompt(attributeSignals.primaryHobbyLabel);
          pendingHobbyPromptRef.current = {
            label: attributeSignals.primaryHobbyLabel,
            skills,
            fields,
          };
          setTurns((prev) => [
            ...prev,
            {
              role: 'assistant' as const,
              text: prompt,
            },
          ]);
        }

        return {
          shouldFetch: false,
          fetchMode: 'normal' as const,
          allowCardPrompt: false,
          insightCount,
          turnCount,
          focusText,
        } as const;
      }

      const fallbackActive = status === 'blocked' && blockedStreakRef.current >= 6;
      if (fallbackActive) {
        return {
          shouldFetch: true,
          fetchMode: 'fallback' as const,
          allowCardPrompt: false,
          insightCount,
          turnCount,
          focusText,
        } as const;
      }

      const contextLightEscalation = status === 'context-light' && explicitIdeas;
      if (contextLightEscalation) {
        return {
          shouldFetch: true,
          fetchMode: 'fallback' as const,
          allowCardPrompt: false,
          insightCount,
          turnCount,
          focusText,
        } as const;
      }

      if (status === 'ready') {
        const readyTrigger =
          pendingReadyRubricChangeRef.current ||
          explicitIdeas ||
          userTurnsSinceLastSuggestionRef.current >= 4;

        if (readyTrigger) {
          return {
            shouldFetch: true,
            fetchMode: 'normal' as const,
            allowCardPrompt: true,
            insightCount,
            turnCount,
            focusText,
          } as const;
        }
      }

      return {
        shouldFetch: false,
        fetchMode: 'normal' as const,
        allowCardPrompt: false,
        insightCount,
        turnCount,
        focusText,
      } as const;
    },
    [
      profile.insights,
      conversationRubric,
      turns,
      unreviewedCount,
      lastCardInteractionAt,
      requeueUnreviewedCards,
      setTurns,
      attributeSignals,
    ]
  );

  const fetchSuggestions = useCallback(
    async (
      {
        force = false,
        reason,
        suppressFollowupMessage = false,
        evaluation,
      }: {
        force?: boolean;
        reason?: string;
        suppressFollowupMessage?: boolean;
        evaluation?: ReturnType<typeof evaluateSuggestionFetch>;
      } = {}
    ) => {
      if (suggestionsFetchInFlightRef.current) {
        return false;
      }

      const evalResult = evaluation ?? evaluateSuggestionFetch({ force });
      if (!evalResult.shouldFetch) {
        return false;
      }

      suggestionsFetchInFlightRef.current = true;
      setLoadingSuggestions(true);

      if (
        currentMode === 'text' &&
        reason === 'pre-response' &&
        evalResult.fetchMode === 'normal' &&
        lastCardAnnouncementTurnRef.current === null
      ) {
        announceCardFetch();
      }

      if (reason === 'pre-response' || reason === 'voice-pre-response') {
        skipAssistantRefetchRef.current = true;
      }

      const insightCount = evalResult.insightCount;
      let producedCards = false;

      const recentTurns = turns
          .slice(-10)
          .filter((turn) => turn.role === 'user')
          .map((turn) => ({
            role: turn.role,
            text: turn.text,
          }));
      const focusStatement = evalResult.focusText ?? undefined;

      const previousSuggestions = suggestions.map((s) => ({
        title: s.title,
        summary: s.summary,
        distance: s.distance,
      }));

      try {
        const response = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            insights: profile.insights.map((insight) => ({
              kind: insight.kind,
              value: insight.value,
            })),
            limit: 3,
            votes: votesByCareerId,
            transcript: recentTurns,
            focusStatement,
            previousSuggestions,
            attributes: {
              skills: profile.inferredAttributes.skills.map((item) => ({
                label: item.label,
                confidence: item.confidence,
                stage: item.stage,
              })),
              aptitudes: profile.inferredAttributes.aptitudes.map((item) => ({
                label: item.label,
                confidence: item.confidence,
                stage: item.stage,
              })),
              workStyles: profile.inferredAttributes.workStyles.map((item) => ({
                label: item.label,
                confidence: item.confidence,
                stage: item.stage,
              })),
            },
          }),
        });

        if (!response.ok) {
          const errorClone = response.clone();
          let message = `Suggestions request failed: ${response.status}`;
          try {
            const payload = await errorClone.json();
            if (payload?.details) {
              message = `Suggestions request failed: ${payload.details}`;
            } else if (payload?.error) {
              message = `Suggestions request failed: ${payload.error}`;
            }
          } catch {
            try {
              const text = await response.text();
              if (text.trim().length > 0) {
                message = `Suggestions request failed: ${text}`;
              }
            } catch {
              // ignore parsing failure
            }
          }
          throw new Error(message);
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
            confidence?: 'high' | 'medium' | 'low';
            score?: number;
            neighborTerritories?: string[];
            distance?: 'core' | 'adjacent' | 'unexpected';
          }>;
        };

        if (Array.isArray(data.suggestions)) {
          const normalizeTitle = (s: string) =>
            s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const existingTitleKeys = new Set(
            suggestions.map((s) => normalizeTitle(s.title))
          );
          const normalized = data.suggestions
            .filter(
              (item) =>
                typeof item?.id === 'string' &&
                typeof item?.title === 'string' &&
                typeof item?.summary === 'string'
            )
            .map((item) => ({
              id: item.id!,
              title: item.title!,
              summary: item.summary!,
              careerAngles: item.careerAngles ?? [],
              nextSteps: item.nextSteps ?? [],
              microExperiments: item.microExperiments ?? [],
              whyItFits: item.whyItFits ?? [],
              confidence: item.confidence ?? 'medium',
              score: item.score ?? 0,
              neighborTerritories: item.neighborTerritories ?? [],
              distance:
                item.distance === 'adjacent' || item.distance === 'unexpected'
                  ? item.distance
                  : ('core' as const),
            }))
            .filter((s) => !existingTitleKeys.has(normalizeTitle(s.title)))
            .sort((a, b) => b.score - a.score);

          normalized.forEach((s) => {
            allSuggestionsRef.current.set(s.id, s);
          });

          const votedSuggestionIds = new Set(
            Object.keys(votesByCareerId).filter((id) => votesByCareerId[id] !== undefined)
          );
          const newSuggestionIds = new Set(normalized.map((s) => s.id));
          const votedCardsNotInNewSet: typeof normalized = [];
          votedSuggestionIds.forEach((id) => {
            if (!newSuggestionIds.has(id) && allSuggestionsRef.current.has(id)) {
              votedCardsNotInNewSet.push(allSuggestionsRef.current.get(id)!);
            }
          });

          const titleSeen = new Set<string>();
          const merged: typeof normalized = [];
          const addUniqueByTitle = (arr: ReadonlyArray<CareerSuggestion>) => {
            for (const s of arr) {
              const key = normalizeTitle(s.title);
              if (titleSeen.has(key)) continue;
              titleSeen.add(key);
              merged.push(s);
            }
          };
          addUniqueByTitle(suggestions);
          addUniqueByTitle(normalized);
          addUniqueByTitle(votedCardsNotInNewSet);

          setSuggestions(merged);
          lastSuggestionTurnRef.current = evalResult.turnCount;

          if (typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(STORAGE_KEYS.lastInsightCount, insightCount.toString());
              console.log('[Suggestions] Saved last insight count to sessionStorage:', insightCount);
            } catch (error) {
              console.error('[Suggestions] Failed to save last insight count to sessionStorage:', error);
            }
          }

          suggestionsLastInsightCountRef.current = insightCount;
          lastSuggestionsFetchAtRef.current = Date.now();

          if (normalized.length > 0) {
            producedCards = true;
            lastSuggestionModeRef.current = evalResult.fetchMode;
            userTurnsSinceLastSuggestionRef.current = 0;
            if (evalResult.fetchMode === 'normal') {
              pendingReadyRubricChangeRef.current = false;
            } else {
              blockedStreakRef.current = 0;
            }
          }

          console.log(
            '[Suggestions] Merged',
            normalized.length,
            'new cards with',
            votedCardsNotInNewSet.length,
            'existing voted cards',
            reason ?? '',
            'mode:',
            evalResult.fetchMode
          );

          if (
            !suppressFollowupMessage &&
            normalized.length > 0 &&
            reason &&
            reason !== 'initial-auto'
          ) {
            setTurns((prev) => [
              ...prev,
              {
                role: 'assistant',
                text: "If none of those land, just say the word and I'll pull a fresh batch of idea cards.",
              },
            ]);
          }

          if (reason) {
            lastSuggestionRequestRef.current = null;
          }

          return normalized.length > 0;
        }
      } catch (error) {
        console.error('Failed to load suggestions', error);
      } finally {
        suggestionsFetchInFlightRef.current = false;
        setLoadingSuggestions(false);
        if (!producedCards && cardStatusIdRef.current) {
          const statusId = cardStatusIdRef.current;
          setCardMessages((prev) =>
            prev.filter((msg) => !(msg.type === 'card-status' && msg.statusId === statusId))
          );
          cardStatusIdRef.current = null;
        }
        if (reason === 'pre-response' || reason === 'voice-pre-response') {
          skipAssistantRefetchRef.current = false;
        }
        if (!producedCards) {
          if (reason === 'pre-response') {
            removeCardAnnouncement();
          }
          lastSuggestionModeRef.current = 'normal';
        }
      }

      return false;
    },
    [
      evaluateSuggestionFetch,
      profile.insights,
      profile.inferredAttributes,
      currentMode,
      suggestions,
      turns,
      votesByCareerId,
      setSuggestions,
      setTurns,
      setLoadingSuggestions,
      announceCardFetch,
      removeCardAnnouncement,
    ]
  );

  // Send message to AI
  const handleSend = useCallback(async (message: string) => {
    if (!message.trim()) return;

    const trimmed = message.trim();
    const userTurn: ConversationTurn = {
      role: 'user',
      text: trimmed,
    };
    
    // Add user message to UI immediately
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput('');
    setIsTyping(true);

    // Derive insights from the updated conversation
    void deriveInsights(nextTurns);

    const evalResult = evaluateSuggestionFetch({ turnSnapshot: nextTurns, triggerText: trimmed });
    if (evalResult.shouldFetch) {
      if (currentMode === 'text') {
        announceCardFetch();
      }
      void fetchSuggestions({
        reason: 'pre-response',
        suppressFollowupMessage: true,
        evaluation: evalResult,
      });
    }

    const allowCardPrompt =
      (evalResult.shouldFetch && evalResult.allowCardPrompt) ||
      (conversationRubric?.cardReadiness?.status === 'ready' && suggestions.length > 0);
    const cardPromptTone =
      evalResult.shouldFetch && evalResult.fetchMode === 'fallback'
        ? 'fallback'
        : lastSuggestionModeRef.current === 'fallback'
        ? 'fallback'
        : 'normal';

    if (currentMode === 'text') {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turns: nextTurns,
            profile: { insights: profile.insights },
            suggestions: suggestions.map((card) => ({ id: card.id, title: card.title })),
            votes: votesByCareerId,
            phase: conversationPhase,
            allowCardPrompt,
            cardPromptTone,
            seedTeaserCard: shouldSeedTeaserCard,
            mode: currentMode,
          }),
        });

        const responseText = await response.text();
        let parsed: { reply?: string; error?: string } | undefined;
        try {
          parsed = responseText ? (JSON.parse(responseText) as { reply?: string; error?: string }) : undefined;
        } catch {
          parsed = undefined;
        }

        if (!response.ok) {
          throw new Error(
            `[chat] request failed (${response.status}) ${parsed?.error ?? response.statusText}`.trim()
          );
        }

        const data = parsed ?? {};
        const replyText =
          typeof data.reply === 'string' && data.reply.trim().length > 0
            ? data.reply.trim()
            : "I'm thinking through that—mind sharing a tiny detail while I queue ideas?";

        setTurns((prev) => [...prev, { role: 'assistant', text: replyText }]);
      } catch (error) {
        console.error('[ChatIntegrated] Text chat error', error);
        setTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: "Sorry, I'm having trouble staying online. Give it another go in a moment?",
          },
        ]);
      } finally {
        setIsTyping(false);
        if (shouldSeedTeaserCard) {
          clearTeaserSeed();
        }
      }
      return;
    }

    try {
      // Ensure Realtime connection is active
      if (realtimeState.status !== 'connected') {
        console.log('[Realtime] Connection not active, connecting...', { status: realtimeState.status });
        await realtimeControls.connect({
          // Text mode connects without mic but with audio sink so we keep one session
          enableMicrophone: currentMode === 'voice',
          enableAudioOutput: true,
          voice: REALTIME_VOICE_ID,
          phase: conversationPhase,
        });
        
        // Wait a bit for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[Realtime] Connection established, status:', realtimeState.status);
      }

      // Generate unique ID for this message
      const transcriptId = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
      
      console.log('[Realtime] Sending text message:', { transcriptId, text: trimmed });

      // Send text message via Realtime API
      realtimeControls.sendEvent({
        type: 'conversation.item.create',
        item: {
          id: transcriptId,
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: trimmed,
            },
          ],
        },
      });

      // Wait for the server to acknowledge the message
      try {
        await realtimeControls.waitForConversationItem(transcriptId);
        console.log('[Realtime] Message acknowledged');
      } catch (err) {
        console.warn('[Realtime] Message acknowledgment timeout:', err);
      }

      // Request a response from the model
      const guidanceText = buildRealtimeInstructions({
        phase: conversationPhase,
        rubric: conversationRubric,
        seedTeaserCard: shouldSeedTeaserCard,
        allowCardPrompt,
        cardPromptTone,
      });

      realtimeControls.cancelActiveResponse();

      if (currentMode === 'voice') {
        if (shouldSeedTeaserCard) {
          clearTeaserSeed();
        }
        if (process.env.NODE_ENV !== 'production') {
          console.info('[chat-integrated] Voice turn relying on auto response', {
            phase: conversationPhase,
            guidanceLength: guidanceText?.length ?? 0,
          });
        }
        return;
      }

      const responsePayload: Record<string, unknown> = {
        output_modalities: ['text'],
      };
      if (guidanceText) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[chat-integrated] Sending phase instructions', {
            phase: conversationPhase,
            length: guidanceText.length,
            preview: guidanceText.slice(0, 160),
          });
        }
        responsePayload.instructions = guidanceText;
      }
      if (shouldSeedTeaserCard) {
        clearTeaserSeed();
      }

      realtimeControls.sendEvent({
        type: 'response.create',
        response: responsePayload,
      });

      console.log('[Realtime] Response requested');
    } catch (error) {
      console.error('[Realtime] Error sending message:', error);
      setIsTyping(false);
      
      // Add error message
      const errorTurn: ConversationTurn = {
        role: 'assistant',
        text: "Sorry, I'm having trouble connecting right now. Can you try that again?",
      };
      setTurns((prev) => [...prev, errorTurn]);
    }
  }, [
    turns,
    setTurns,
    deriveInsights,
    realtimeState.status,
    realtimeControls,
    currentMode,
    conversationPhase,
    conversationRubric,
    shouldSeedTeaserCard,
    clearTeaserSeed,
    fetchSuggestions,
    evaluateSuggestionFetch,
    announceCardFetch,
    suggestions,
    profile.insights,
    votesByCareerId,
  ]);

  useEffect(() => {
    if (suggestionsFetchInFlightRef.current) {
      return;
    }

    if (suggestions.length === 0) {
      const evalResult = evaluateSuggestionFetch();
      if (evalResult.shouldFetch) {
        void fetchSuggestions({ reason: 'initial-auto', evaluation: evalResult });
      }
    }
  }, [suggestions.length, evaluateSuggestionFetch, fetchSuggestions]);

  useEffect(() => {
    const latestTranscript = realtimeState.transcripts[0];
    
    if (!latestTranscript || !latestTranscript.isFinal) {
      return;
    }

    // In voice mode, add final user voice to transcript so history stays complete
    if (currentMode === 'voice' && voiceSessionStarted && latestTranscript.role === 'user') {
      const transcriptId = latestTranscript.id;
      const userText = latestTranscript.text.trim();
      if (!userText) {
        return;
      }

      let updatedTurns: ConversationTurn[] | null = null;
      let inserted = false;

      setTurns((prev) => {
        const existingIndex =
          transcriptId !== undefined
            ? prev.findIndex(
                (turn) => turn.role === 'user' && turn.transcriptId === transcriptId
              )
            : -1;

        if (existingIndex >= 0) {
          if (prev[existingIndex].text === userText) {
            return prev;
          }
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], text: userText };
          updatedTurns = next;
          return next;
        }

        if (prev.some((t) => t.role === 'user' && t.text === userText)) {
          return prev;
        }

        const next = [
          ...prev,
          {
            role: 'user' as const,
            text: userText,
            transcriptId,
          },
        ];
        updatedTurns = next;
        inserted = true;
        return next;
      });

      if (!updatedTurns) {
        return;
      }

      void deriveInsights(updatedTurns);

      if (inserted) {
        const evalResult = evaluateSuggestionFetch({ turnSnapshot: updatedTurns });
        if (evalResult.shouldFetch) {
          void fetchSuggestions({
            reason: 'voice-pre-response',
            suppressFollowupMessage: true,
            evaluation: evalResult,
          });
        }
      }
      return;
    }

    if (latestTranscript.role === 'assistant') {
      const transcriptId = latestTranscript.id;
      const assistantText = latestTranscript.text.trim();
      if (!assistantText) {
        return;
      }

      let updatedTurns: ConversationTurn[] | null = null;
      let inserted = false;
      let previousText: string | undefined;

      setTurns((prev) => {
        const existingIndex =
          transcriptId !== undefined
            ? prev.findIndex(
                (turn) => turn.role === 'assistant' && turn.transcriptId === transcriptId
              )
            : -1;

        if (existingIndex >= 0) {
          if (prev[existingIndex].text === assistantText) {
            return prev;
          }
          const next = [...prev];
          previousText = prev[existingIndex].text;
          next[existingIndex] = { ...next[existingIndex], text: assistantText };
          updatedTurns = next;
          return next;
        }

        const next = [
          ...prev,
          {
            role: 'assistant' as const,
            text: assistantText,
            transcriptId,
          },
        ];
        updatedTurns = next;
        inserted = true;
        return next;
      });

      if (!updatedTurns) {
        return;
      }

      if (inserted) {
        console.log('[Realtime] Adding assistant response:', assistantText);
      } else if (previousText !== assistantText) {
        console.log('[Realtime] Updating assistant response:', assistantText);
      }

      setIsTyping(false);
      void deriveInsights(updatedTurns);

      if (inserted) {
        const lower = assistantText.toLowerCase();
        const requestedCards =
          lower.includes('let me build some cards') ||
          lower.includes('cards just popped') ||
          lower.includes('check out these cards') ||
          lower.includes('three quick ideas') ||
          lower.includes('let me pull them together');
        if (requestedCards) {
          if (skipAssistantRefetchRef.current) {
            skipAssistantRefetchRef.current = false;
          } else if (lastSuggestionRequestRef.current !== lower) {
            lastSuggestionRequestRef.current = lower;
            void fetchSuggestions({ force: true, reason: 'assistant-request' });
          }
        }
      }
    }
  }, [realtimeState.transcripts, turns, setTurns, deriveInsights, currentMode, voiceSessionStarted, fetchSuggestions, evaluateSuggestionFetch]);

  // Do not auto-connect in text mode; connect on-demand in handleSend, and via Start Voice.

  // Make AI speak first when voice mode connects
  const hasGreetedInVoiceRef = useRef(false);
  useEffect(() => {
    if (currentMode !== 'voice') {
      hasGreetedInVoiceRef.current = false;
      return;
    }
    if (!voiceSessionStarted) {
      hasGreetedInVoiceRef.current = false;
      return;
    }
    if (realtimeState.status !== 'connected') {
      return;
    }
    if (hasGreetedInVoiceRef.current) {
      return;
    }

    hasGreetedInVoiceRef.current = true;
    console.log('[Voice Mode] Connected, triggering AI greeting');

    const runGreeting = async () => {
      realtimeControls.cancelActiveResponse();

      const evalResult = evaluateSuggestionFetch();
      if (evalResult.shouldFetch) {
        void fetchSuggestions({
          reason: 'voice-pre-response',
          suppressFollowupMessage: true,
          evaluation: evalResult,
        });
      }
      const allowCardPrompt =
        (evalResult.shouldFetch && evalResult.allowCardPrompt) ||
        (conversationRubric?.cardReadiness?.status === 'ready' && suggestions.length > 0);
      const cardPromptTone =
        evalResult.shouldFetch && evalResult.fetchMode === 'fallback'
          ? 'fallback'
          : lastSuggestionModeRef.current === 'fallback'
          ? 'fallback'
          : 'normal';

      const guidanceText = buildRealtimeInstructions({
        phase: conversationPhase,
        rubric: conversationRubric,
        seedTeaserCard: shouldSeedTeaserCard,
        allowCardPrompt,
        cardPromptTone,
      });
      const responsePayload: Record<string, unknown> = {
        output_modalities: ['audio'],
        voice: REALTIME_VOICE_ID,
      };
      if (guidanceText) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[chat-integrated] Voice greet instructions', {
            phase: conversationPhase,
            length: guidanceText.length,
            preview: guidanceText.slice(0, 160),
          });
        }
        responsePayload.instructions = guidanceText;
      }
      if (shouldSeedTeaserCard) {
        clearTeaserSeed();
      }
      realtimeControls.sendEvent({
        type: 'response.create',
        response: responsePayload,
      });
    };

    void runGreeting();
  }, [
    currentMode,
    voiceSessionStarted,
    realtimeState.status,
    realtimeControls,
    conversationPhase,
    conversationRubric,
    shouldSeedTeaserCard,
    clearTeaserSeed,
    fetchSuggestions,
    evaluateSuggestionFetch,
    suggestions,
  ]);

  // Handle typing indicator based on Realtime state
  useEffect(() => {
    // Show typing when we have a non-final assistant transcript
    const hasActiveResponse = realtimeState.transcripts.some(
      (t) => t.role === 'assistant' && !t.isFinal
    );
    
    if (hasActiveResponse && !isTyping) {
      setIsTyping(true);
    }
  }, [realtimeState.transcripts, isTyping]);

  // Auto-scroll to bottom when new messages arrive
  // But when cards are added, only scroll to show the intro message
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isCardMessage = lastMessage?.type === 'career-card';
    
    if (isCardMessage) {
      // Cards were just added - don't auto-scroll to bottom
      // User should scroll down naturally to see cards
      console.log('[ChatIntegrated] Cards added, skipping auto-scroll to bottom');
      return;
    }
    
    // Normal text message - scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const headerState = progressPercent >= 100 ? 'ready' : isHeaderExpanded ? 'expanded' : 'collapsed';

  return (
    <div className="chat-integrated-wrapper">
      <div className={`offscript-header ${headerState}`}>
        <div className="header-collapsed-view">
          <div className={`progress-section-minimal${progressPercent >= 100 ? ' progress-section-minimal--ready' : ''}`}>
            <div className="progress-header-minimal">
              <button
                type="button"
                className="consolidated-badge"
                onClick={canExpandInsights ? toggleHeader : undefined}
                aria-expanded={isHeaderExpanded}
                aria-label={
                  isHeaderExpanded
                    ? 'Collapse insight summary'
                    : 'Expand insight summary'
                }
                disabled={!canExpandInsights}
              >
                {progressPercent >= 100 ? (
                  <CheckCircle2 className="badge-icon" aria-hidden />
                ) : (
                  <BarChart3 className="badge-icon" aria-hidden />
                )}
                <span className="badge-text">Insights: {totalInsights}</span>
                {canExpandInsights ? (
                  <ChevronDown className={`chevron ${isHeaderExpanded ? 'up' : ''}`} aria-hidden />
                ) : null}
              </button>
              {progressPercent < 100 ? (
                <div className="progress-percentage-minimal">{progressPercent}%</div>
              ) : (
                <div className="progress-ready-label">Ready</div>
              )}
            </div>
            {progressPercent < 100 ? (
              <div className="progress-bar-minimal">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
              </div>
            ) : null}
          </div>
          {chipText ? <div className="new-item-chip">+ {chipText}</div> : null}
        </div>

        {progressPercent < 100 ? (
          <div className="header-status-row" role="status" aria-live="polite">
            <div className="progress-hint">Keep talking and I&apos;ll keep shaping your page in real time.</div>
          </div>
        ) : null}

        {isHeaderExpanded && canExpandInsights ? (
          <div className="header-expanded-view">
            <div className="insight-pills">
              {insightCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <div key={category.key} className="insight-pill">
                    <Icon className="pill-icon" aria-hidden />
                    <span className="pill-label">{category.label}</span>
                    <span className="pill-count">{category.count}</span>
                  </div>
                );
              })}
            </div>

            <div className="expanded-details">
              {insightCategories.map((category) =>
                category.items.length > 0 ? (
                  <div key={category.key} className="detail-category">
                    <h4 className="detail-category-title">{category.label.toUpperCase()}</h4>
                    <ul className="detail-items">
                      {category.items.map((item) => (
                        <li key={item.id} className="detail-item">
                          <span className="item-bullet" aria-hidden>
                            ○
                          </span>
                          <span className="item-text">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              )}
            </div>

            {progressPercent < 100 ? (
              <div className="progress-section-expanded">
                <div className="progress-title-expanded">{currentStage.title}</div>
                <div className="progress-subtitle-expanded">{currentStage.caption}</div>
                <div className="progress-cta">
                  <span className="cta-pill">{ctaLabel}</span>
                  <span>{ctaText}</span>
                </div>
              </div>
            ) : (
              <div className="progress-section-expanded ready-expanded-note">
                <div className="progress-title-expanded">Ideas unlocked</div>
                <div className="progress-subtitle-expanded">Keep riffing if you want me to fine-tune or chase new angles.</div>
                <div className="progress-subtitle-expanded secondary">Everything new feeds your page live — MY PAGE is good to go.</div>
              </div>
            )}
          </div>
        ) : null}

        <div className="action-buttons">
          <Button
            variant="outline"
            className="btn-my-page"
            onClick={() => router.push('/exploration')}
          >
            <FileText className="w-4 h-4" />
            MY PAGE
          </Button>
        </div>
      </div>

      {readyToastVisible ? (
        <div className="ready-toast" role="status" aria-live="polite" aria-atomic="true">
          <div className="ready-toast-surface">
            <div className="ready-toast-copy">
              <p className="ready-toast-title">MirAI is ready.</p>
              <p className="ready-toast-message">
                Your starter page&apos;s live. Open the insights to see what I&apos;ve packed in and tweak anything before you share it.
              </p>
            </div>
            <div className="ready-toast-actions">
              <Button
                type="button"
                size="sm"
                className="ready-toast-primary"
                onClick={handleReadyToastOpenInsights}
              >
                Open insights
              </Button>
              <button type="button" className="ready-toast-dismiss" onClick={handleReadyToastDismiss}>
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Chat Interface */}
      {currentMode === 'text' ? (
        <>
          <MainContainer>
            <ChatContainer>
              <MessageList
                typingIndicator={isTyping ? <TypingIndicator content="Guide is typing" /> : null}
              >
            {messages.map((msg, i) => {
              if (msg.type === 'card-status') {
                const statusKey = msg.statusId ?? `card-status-${i}`;
                return (
                  <div
                    key={statusKey}
                    className={`card-status-message ${msg.status === 'ready' ? 'ready' : 'loading'}`}
                  >
                    {msg.status === 'ready' ? (
                      <div className="card-status-content">
                        <span className="card-status-dot card-status-dot--ready" />
                        <span className="card-status-text">
                          Cards are ready—these are exploratory. React with 👍 or 👎 so I can sharpen what comes next.
                        </span>
                      </div>
                    ) : (
                      <div className="card-status-content">
                        <span className="card-status-spinner" aria-hidden />
                        <span className="card-status-text">
                          Lining up a first batch of idea cards so you can vote them in or out.
                        </span>
                        <div className="card-status-progress" style={cardStatusProgressStyle} aria-hidden />
                      </div>
                    )}
                  </div>
                );
              }
              if (msg.type === 'career-card' && msg.careerSuggestion) {
                    const revealDelay = msg.revealIndex !== undefined ? msg.revealIndex * 1 : 0;
                    const cardKey = msg.careerSuggestion.id ?? `career-card-${i}`;
                    return (
                      <div 
                        key={cardKey} 
                        className="card-reveal-container"
                        style={{ 
                          padding: '0.5rem 1rem',
                          animationDelay: `${revealDelay}s`
                        }}
                      >
                        <InlineCareerCard
                          suggestion={msg.careerSuggestion}
                          voteStatus={votesByCareerId[msg.careerSuggestion.id] ?? null}
                          onVote={(value) => {
                            const current = votesByCareerId[msg.careerSuggestion!.id];
                            const cardTitle = msg.careerSuggestion!.title;
                            
                            // Toggle vote: if clicking same value, remove vote
                            if (current === value) {
                              voteCareer(msg.careerSuggestion!.id, null);
                            } else {
                              voteCareer(msg.careerSuggestion!.id, value);
                              
                              // Add contextual follow-up message after voting
                              setTimeout(() => {
                                let followUpText = '';
                                if (value === 1) {
                                  followUpText = `I see you saved "${cardTitle}"! What excited you most about this path?`;
                                } else if (value === 0) {
                                  followUpText = `You marked "${cardTitle}" as maybe. What makes you hesitant about it?`;
                                } else if (value === -1) {
                                  followUpText = `You skipped "${cardTitle}". What about it didn't work well for you?`;
                                }
                                
                                if (followUpText) {
                                  const followUpTurn: ConversationTurn = {
                                    role: 'assistant',
                                    text: followUpText,
                                  };
                                  setTurns((prev) => [...prev, followUpTurn]);
                                }
                              }, 500); // Small delay so vote status updates first
                            }
                          }}
                        />
                      </div>
                    );
                  }
                  
                  return (
                    <Message
                      key={i}
                      model={{
                        message: msg.message,
                        sentTime: msg.sentTime,
                        sender: msg.sender,
                        direction: msg.direction,
                        position: 'single',
                      }}
                    />
                  );
                })}
                <div ref={messagesEndRef} />
              </MessageList>
            </ChatContainer>
          </MainContainer>
          <div className="custom-input-wrapper">
            <CustomMessageInput
              placeholder="Type something you're into or curious about"
              value={input}
              onChange={setInput}
              onSend={handleSend}
              mode={currentMode}
              onModeToggle={handleModeToggle}
            />
          </div>
        </>
      ) : (
        <div className="voice-mode-container">
          <header className="voice-mode-header">
            <div className="voice-mode-intro">
              <p className="voice-mode-eyebrow">MirAI voice</p>
              <h2 className="voice-mode-title">Talk to MirAI</h2>
              <p className="voice-mode-description">
                Share what you&apos;re into and hear real ideas for what to do next—jobs, side hustles, or sparks you&apos;ve never considered.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="voice-mode-text-toggle"
              onClick={handleModeToggle}
            >
              <FileText className="w-4 h-4" aria-hidden />
              <span>Switch to text</span>
            </Button>
          </header>

          <VoiceControls
            state={realtimeState}
            controls={realtimeControls}
            phase={conversationPhase}
            onStart={() => {
              if (!voiceBaselineCapturedRef.current) {
                voiceSuggestionBaselineRef.current = new Set(suggestions.map((s) => s.id));
                voiceBaselineCapturedRef.current = true;
              }
              suggestionsLastInsightCountRef.current = 0;
              suggestionsFetchInFlightRef.current = false;
              setVoiceSessionStarted(true);
              setVoiceCardList((prev) => {
                if (prev.length === 0) {
                  return suggestions;
                }
                const merged = new Map<string, CareerSuggestion>();
                suggestions.forEach((card) => {
                  merged.set(card.id, card);
                });
                prev.forEach((card) => {
                  if (!merged.has(card.id)) {
                    merged.set(card.id, card);
                  }
                });
                return Array.from(merged.values());
              });
            }}
            onStop={() => {
              setVoiceSessionStarted(false);
              setVoiceCardList([]);
            }}
          />

          <section className="voice-mode-feedback" aria-live="polite">
            {voiceSessionStarted ? (() => {
              const lastAssistantTurn = turns.filter((turn) => turn.role === 'assistant').slice(-1)[0];
              if (!lastAssistantTurn) {
                return (
                  <p className="voice-mode-placeholder">
                    MirAI will speak back and show the transcript here once the conversation starts.
                  </p>
                );
              }
              return <div className="voice-mode-reply">{lastAssistantTurn.text}</div>;
            })() : (
              <p className="voice-mode-placeholder">
                Start the chat to hear MirAI and see your live transcript.
              </p>
            )}
          </section>

          {loadingSuggestions ? (
            <section className="voice-mode-panel voice-mode-panel--loading" aria-live="polite">
              <div className="voice-mode-spinner" aria-hidden />
              <p>I&apos;m lining up tailored paths based on what you&apos;re sharing…</p>
            </section>
          ) : null}

          {voiceSessionStarted && voiceSuggestions.length > 0 ? (
            <section className="voice-mode-suggestions" aria-live="polite">
              <h3 className="voice-mode-suggestions-title">Career paths to explore</h3>
              <div className="voice-mode-suggestions-list">
                {voiceSuggestions.map((suggestion) => (
                  <InlineCareerCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    voteStatus={votesByCareerId[suggestion.id] ?? null}
                    onVote={(value) => {
                      const current = votesByCareerId[suggestion.id];
                      const cardTitle = suggestion.title;

                      if (current === value) {
                        voteCareer(suggestion.id, null);
                        return;
                      }

                      voteCareer(suggestion.id, value);

                      window.setTimeout(() => {
                        let followUpText = "";
                        if (value === 1) {
                          followUpText = `I see you saved "${cardTitle}"! What excited you most about this path?`;
                        } else if (value === 0) {
                          followUpText = `You marked "${cardTitle}" as maybe. What makes you hesitant about it?`;
                        } else if (value === -1) {
                          followUpText = `You skipped "${cardTitle}". What about it didn't work well for you?`;
                        }

                        if (followUpText) {
                          const followUpTurn: ConversationTurn = {
                            role: "assistant",
                            text: followUpText,
                          };
                          setTurns((prev) => [...prev, followUpTurn]);
                        }
                      }, 500);
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {voiceSessionStarted && !loadingSuggestions && voiceSuggestions.length === 0 ? (
            <section className="voice-mode-panel voice-mode-panel--hint">
              <p>Keep talking and I&apos;ll surface live ideas you can save or skip.</p>
            </section>
          ) : null}
        </div>
      )}

      {/* Suggestion Basket Drawer removed - voted cards now shown on MY PAGE */}
    </div>
  );
}
