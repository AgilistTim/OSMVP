"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { ConversationTurn, InsightKind } from '@/components/session-provider';

import { ProfileInsightsBar } from '@/components/profile-insights-bar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRealtimeSession } from '@/hooks/use-realtime-session';
import { VoiceControls } from '@/components/voice-controls';
import { InlineCareerCard } from '@/components/inline-career-card-v2';
import type { CareerSuggestion } from '@/components/session-provider';
import '@/components/inline-career-card-v2.css';
import { REALTIME_VOICE_ID } from '@/lib/realtime-voice';

type MessageType = {
  message: string;
  sentTime: string;
  sender: string;
  direction: 'incoming' | 'outgoing';
  type?: 'text' | 'career-card';
  careerSuggestion?: CareerSuggestion;
  insertAfterTurnIndex?: number; // For card messages, indicates where to insert in timeline
  revealIndex?: number; // For staggered CSS animations (0 = intro, 1+ = cards)
};

const DEFAULT_OPENING =
  "Let's chat about what you're into and what you're working on. As we go, I'll suggest some ideas you can thumbs up or down, and build you a personal page you can share.";

export function ChatIntegrated() {
  const router = useRouter();
  const {
    profile,
    turns,
    setTurns,
    suggestions,
    votesByCareerId,
    voteCareer,
    appendProfileInsights,
    setSuggestions,
    sessionId,
    conversationPhase,
    conversationRubric,
    shouldSeedTeaserCard,
    clearTeaserSeed,
  } = useSession();

  // Compute progress
  const userTurnsCount = useMemo(() => {
    return turns.filter((t) => t.role === 'user').length;
  }, [turns]);

  const progress = useMemo(() => {
    if (userTurnsCount === 0) return 20;
    return Math.min(100, 20 + userTurnsCount * 15);
  }, [userTurnsCount]);

  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [voiceSessionStarted, setVoiceSessionStarted] = useState(false);
  const voiceSuggestionBaselineRef = useRef<Set<string>>(new Set());
  const voiceBaselineCapturedRef = useRef(false);
  // Basket drawer removed - voted cards now shown on MY PAGE

  // Realtime API session
  const [realtimeState, realtimeControls] = useRealtimeSession({
    sessionId,
    enableMicrophone: mode === 'voice',
    enableAudioOutput: true,
    voice: REALTIME_VOICE_ID,
  });

  const handleModeToggle = useCallback(() => {
    if (mode === 'text') {
      // Switch to voice UI, do not auto-connect or resume mic yet.
      // VoiceControls will connect/resume mic on Start Voice.
      setVoiceSessionStarted(false);
      setMode('voice');
    } else {
      // Switch to text: pause mic if connected, keep session alive.
      try { realtimeControls.pauseMicrophone(); } catch { /* noop */ }
      setVoiceSessionStarted(false);
      setMode('text');
    }
  }, [mode, realtimeControls]);

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
  
  // Initialize last insight count from sessionStorage (only once on mount)
  const suggestionsLastInsightCountRef = useRef<number>(0);
  if (suggestionsLastInsightCountRef.current === 0 && typeof window !== 'undefined') {
    try {
      // Clean up any legacy localStorage entry
      localStorage.removeItem('osmvp_last_insight_count');
    } catch {
      // ignore
    }
    try {
      const stored = sessionStorage.getItem('osmvp_last_insight_count');
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
      localStorage.removeItem('osmvp_shown_suggestion_ids');
    } catch {
      // ignore
    }
    try {
      const stored = sessionStorage.getItem('osmvp_shown_suggestion_ids');
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
  const [voiceCardList, setVoiceCardList] = useState<CareerSuggestion[]>([]);

  const CARD_FETCH_ANNOUNCEMENT = useMemo(
    () =>
      'Oh, that triggers some ideas. Let me pull them together and share them—hold on one second.',
    []
  );
  
  // Track all suggestions that have ever been shown (for vote persistence) - only once on mount
  const allSuggestionsRef = useRef<Map<string, typeof suggestions[0]>>(new Map());
  const hasInitializedAllSuggestions = useRef(false);
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
  }, [CARD_FETCH_ANNOUNCEMENT, setTurns]);

  useEffect(() => {
    if (mode !== 'voice') {
      voiceSuggestionBaselineRef.current = new Set();
      voiceBaselineCapturedRef.current = false;
      setVoiceSessionStarted(false);
      setVoiceCardList([]);
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'voice' && (realtimeState.status === 'idle' || realtimeState.status === 'error')) {
      setVoiceSessionStarted(false);
      voiceBaselineCapturedRef.current = false;
      voiceSuggestionBaselineRef.current = new Set(suggestions.map((s) => s.id));
      setVoiceCardList([]);
    }
  }, [mode, realtimeState.status, suggestions]);
  
  // Initialize allSuggestionsRef with existing suggestions from session
  useEffect(() => {
    suggestions.forEach(s => {
      if (!allSuggestionsRef.current.has(s.id)) {
        allSuggestionsRef.current.set(s.id, s);
      }
    });
  }, [suggestions, removeCardAnnouncement]);

  // Ensure initial message is added to turns on mount
  useEffect(() => {
    if (mode !== 'text') {
      return;
    }
    if (turns.length === 0) {
      const initialTurn: ConversationTurn = {
        role: 'assistant',
        text: DEFAULT_OPENING,
      };
      setTurns([initialTurn]);
    }
  }, [mode, setTurns, turns.length]);

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

  const voiceSuggestions = useMemo(() => {
    if (mode !== 'voice') {
      return suggestions;
    }
    return voiceCardList;
  }, [mode, suggestions, voiceCardList]);

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

    removeCardAnnouncement();

    console.log('[ChatIntegrated] Found', newSuggestions.length, 'new suggestions to reveal:', newSuggestions.map(s => s.id));
    
    // Mark these suggestions as shown FIRST to prevent re-triggering
    newSuggestions.forEach(s => shownSuggestionIdsRef.current.add(s.id));
    
    // Persist shown suggestion IDs to localStorage
    if (typeof window !== 'undefined') {
      try {
        const idsArray = Array.from(shownSuggestionIdsRef.current);
        sessionStorage.setItem('osmvp_shown_suggestion_ids', JSON.stringify(idsArray));
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
    
    // Add all messages in a single batch (CSS will handle staggered reveal)
    setCardMessages(prev => {
      const existingIds = new Set(
        prev
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
        return prev;
      }

      console.log('[ChatIntegrated] Added', filteredCards.length, 'cards with staggered reveal');
      return [...prev, ...filteredCards];
    });

    lastCardAnnouncementTurnRef.current = null;
    userTurnsSinceLastSuggestionRef.current = 0;
    lastSuggestionTurnRef.current = currentTurnCount;

    if (mode === 'voice') {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, mode]);

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
    } catch (err) {
      console.error('Failed to derive profile insights', err);
  }
}, [appendProfileInsights, profile.insights, sessionId]);

  const evaluateSuggestionFetch = useCallback(
    (
      {
        force = false,
        turnSnapshot,
      }: { force?: boolean; turnSnapshot?: ConversationTurn[] } = {}
    ) => {
      const insightCount = profile.insights.length;
      const turnList = turnSnapshot ?? turns;
      const turnCount = turnList.length;
      const status = conversationRubric?.cardReadiness?.status ?? 'blocked';
      const explicitIdeas = Boolean(conversationRubric?.explicitIdeasRequest);

      if (force) {
        const fetchMode = status === 'ready' ? 'normal' : 'fallback';
        return {
          shouldFetch: true,
          fetchMode,
          allowCardPrompt: fetchMode === 'normal',
          insightCount,
          turnCount,
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
          } as const;
        }
      }

      return {
        shouldFetch: false,
        fetchMode: 'normal' as const,
        allowCardPrompt: false,
        insightCount,
        turnCount,
      } as const;
    },
    [
      profile.insights,
      conversationRubric,
      turns,
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
        mode === 'text' &&
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

      const recentTurns = turns.slice(-10).map((turn) => ({
        role: turn.role,
        text: turn.text,
      }));

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
            previousSuggestions,
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
              sessionStorage.setItem('osmvp_last_insight_count', insightCount.toString());
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
      mode,
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

    try {
      // Ensure Realtime connection is active
      if (realtimeState.status !== 'connected') {
        console.log('[Realtime] Connection not active, connecting...', { status: realtimeState.status });
        await realtimeControls.connect({
          // Text mode connects without mic but with audio sink so we keep one session
          enableMicrophone: mode === 'voice',
          enableAudioOutput: true,
          voice: REALTIME_VOICE_ID,
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

      const evalResult = evaluateSuggestionFetch({ turnSnapshot: nextTurns });
      if (evalResult.shouldFetch) {
        if (mode === 'text') {
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

      // Request a response from the model
      const guidanceText = buildRealtimeInstructions({
        phase: conversationPhase,
        rubric: conversationRubric,
        seedTeaserCard: shouldSeedTeaserCard,
        allowCardPrompt,
        cardPromptTone,
      });

      realtimeControls.cancelActiveResponse();

      const responseModalities = mode === 'voice' ? ['audio'] : ['text'];
      const responsePayload: Record<string, unknown> = {
        output_modalities: responseModalities,
      };
      if (responseModalities.includes('audio')) {
        responsePayload.voice = REALTIME_VOICE_ID;
      }
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
    mode,
    conversationPhase,
    conversationRubric,
    shouldSeedTeaserCard,
    clearTeaserSeed,
    fetchSuggestions,
    evaluateSuggestionFetch,
    announceCardFetch,
    suggestions,
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
    if (mode === 'voice' && voiceSessionStarted && latestTranscript.role === 'user') {
      const userText = latestTranscript.text.trim();
      if (!userText) {
        return;
      }

      const exists = turns.some((t) => t.role === 'user' && t.text === userText);
      if (exists) {
        return;
      }

      const userVoiceTurn: ConversationTurn = {
        role: 'user',
        text: userText,
      };
      const updatedTurns = [...turns, userVoiceTurn];

      setTurns(updatedTurns);
      void deriveInsights(updatedTurns);

      const evalResult = evaluateSuggestionFetch({ turnSnapshot: updatedTurns });
      if (evalResult.shouldFetch) {
        void fetchSuggestions({
          reason: 'voice-pre-response',
          suppressFollowupMessage: true,
          evaluation: evalResult,
        });
      }
      return;
    }

    if (latestTranscript.role === 'assistant') {
      // Check if we already have this message in our turns
      const alreadyExists = turns.some(
        (t) => t.role === 'assistant' && t.text === latestTranscript.text
      );

      if (!alreadyExists && latestTranscript.text.trim()) {
        console.log('[Realtime] Adding assistant response:', latestTranscript.text);

        const assistantTurn: ConversationTurn = {
          role: 'assistant',
          text: latestTranscript.text,
        };

        setTurns((prev) => [...prev, assistantTurn]);
        setIsTyping(false);

        // Derive insights after assistant responds
        void deriveInsights([...turns, assistantTurn]);

        const lower = latestTranscript.text.toLowerCase();
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
  }, [realtimeState.transcripts, turns, setTurns, deriveInsights, mode, voiceSessionStarted, fetchSuggestions, evaluateSuggestionFetch]);

  // Do not auto-connect in text mode; connect on-demand in handleSend, and via Start Voice.

  // Make AI speak first when voice mode connects
  const hasGreetedInVoiceRef = useRef(false);
  useEffect(() => {
    if (mode !== 'voice') {
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
    mode,
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

  const showProgressBar = progress < 100;

  return (
    <div className="chat-integrated-wrapper">
      {/* Profile Insights Bar */}
      {profile.insights.length > 0 && (
        <div className="profile-insights-container">
          <ProfileInsightsBar insights={profile.insights} />
        </div>
      )}

      {/* Custom Offscript Header */}
      <div className="offscript-header">
        {showProgressBar && (
        <div className="progress-section">
          <div className="progress-header">
            <div className="progress-title">
              {progress < 100 ? "Let's keep it rolling." : "Ready to explore!"}
            </div>
            <div className="progress-percentage">{progress}%</div>
          </div>
          <Progress value={progress} className="progress-bar" />
          <div className="progress-subtitle">
            {progress < 100
              ? "Need a touch more on what you're into, what you're good at, and hopes before I pin fresh idea cards."
              : "You've shared enough to start exploring ideas!"}
          </div>
        </div>
        )}

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

      {/* Chat Interface */}
      {mode === 'text' ? (
        <>
          <MainContainer>
            <ChatContainer>
              <MessageList
                typingIndicator={isTyping ? <TypingIndicator content="Guide is typing" /> : null}
              >
                {messages.map((msg, i) => {
                  if (msg.type === 'career-card' && msg.careerSuggestion) {
                    const revealDelay = msg.revealIndex !== undefined ? msg.revealIndex * 0.8 : 0;
                    return (
                      <div 
                        key={i} 
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
              mode={mode}
              onModeToggle={handleModeToggle}
            />
          </div>
        </>
      ) : (
        <div className="voice-mode-container" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>
                Voice Mode
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleModeToggle}
                style={{ gap: '0.5rem' }}
              >
                <FileText className="w-4 h-4" />
                Switch to Text
              </Button>
            </div>
            <p style={{ color: '#666', marginBottom: '2rem' }}>
              Click Start Voice to begin speaking with the AI assistant.
            </p>
            <VoiceControls
              state={realtimeState}
              controls={realtimeControls}
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
            />
          </div>
          
          {/* Show only last assistant message in voice mode */}
          {(() => {
            if (!voiceSessionStarted) {
              return null;
            }
            const lastAssistantTurn = turns.filter(t => t.role === 'assistant').slice(-1)[0];
            return lastAssistantTurn ? (
              <div style={{ marginTop: '2rem', textAlign: 'center', maxWidth: '600px', margin: '2rem auto 0' }}>
                <div
                  style={{
                    padding: '1.5rem',
                    backgroundColor: '#d8fdf0',
                    borderRadius: '12px',
                    fontSize: '1.1rem',
                    lineHeight: '1.6',
                  }}
                >
                  {lastAssistantTurn.text}
                </div>
              </div>
            ) : null;
          })()}
          
          {/* Loading indicator for suggestions */}
          {loadingSuggestions && (
            <div style={{ marginTop: '2rem', padding: '0 1rem' }}>
              <div
                style={{
                  padding: '1.5rem',
                  backgroundColor: '#d8fdf0',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  lineHeight: '1.6',
                  textAlign: 'center',
                  maxWidth: '600px',
                  margin: '0 auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      border: '3px solid #10b981',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <span>I&apos;m finding some career paths for you based on what you&apos;ve shared. Give me a moment to pull the details together...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Show career cards in voice mode (keep visible while new ones load) */}
          {voiceSessionStarted && voiceSuggestions.length > 0 && (
            <div style={{ marginTop: '2rem', padding: '0 1rem' }}>
              <h4
                style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  marginBottom: '1.5rem',
                  textAlign: 'center',
                  color: '#111827',
                }}
              >
                Career Paths to Explore
              </h4>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  maxWidth: '800px',
                  margin: '0 auto',
                }}
              >
                {voiceSuggestions.map((suggestion) => (
                  <InlineCareerCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    voteStatus={votesByCareerId[suggestion.id] ?? null}
                    onVote={(value) => {
                      const current = votesByCareerId[suggestion.id];
                      const cardTitle = suggestion.title;
                      
                      // Toggle vote: if clicking same value, remove vote
                      if (current === value) {
                        voteCareer(suggestion.id, null);
                      } else {
                        voteCareer(suggestion.id, value);
                        
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
                        }, 500);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {!loadingSuggestions && voiceSessionStarted && voiceSuggestions.length === 0 && (
            <div style={{ marginTop: '2rem', padding: '0 1rem' }}>
              <div
                style={{
                  padding: '1.5rem',
                  backgroundColor: '#eef2ff',
                  borderRadius: '12px',
                  fontSize: '1rem',
                  lineHeight: '1.6',
                  textAlign: 'center',
                  maxWidth: '600px',
                  margin: '0 auto',
                }}
              >
                I’m still listening and gathering more of your story—keep talking and I’ll surface fresh cards as soon as they’re ready.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggestion Basket Drawer removed - voted cards now shown on MY PAGE */}
    </div>
  );
}
