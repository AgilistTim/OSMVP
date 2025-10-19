"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator,
} from '@chatscope/chat-ui-kit-react';
import './chat-integrated.css';
import { useSession } from '@/components/session-provider';
import type { ConversationTurn, InsightKind } from '@/components/session-provider';
import { SuggestionCards } from '@/components/suggestion-cards';
import { SuggestionBasket } from '@/components/suggestion-basket';
import { ProfileInsightsBar } from '@/components/profile-insights-bar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Archive, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

type MessageType = {
  message: string;
  sentTime: string;
  sender: string;
  direction: 'incoming' | 'outgoing';
};

const DEFAULT_OPENING =
  "Let's chat about what you're into and what you're working on. As we go, I'll suggest some ideas you can thumbs up or down, and build you a personal page you can share. To start, what should I call you?";

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
  } = useSession();

  // Compute suggestion groups from votes
  const suggestionGroups = useMemo(() => {
    const pending: typeof suggestions = [];
    const saved: typeof suggestions = [];
    const maybePile: typeof suggestions = [];
    const skipped: typeof suggestions = [];

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

  const savedSuggestions = suggestionGroups.saved;
  const maybeSuggestions = suggestionGroups.maybe;
  const skippedSuggestions = suggestionGroups.skipped;

  // Compute progress
  const userTurnsCount = useMemo(() => {
    return turns.filter((t) => t.role === 'user').length;
  }, [turns]);

  const progress = useMemo(() => {
    if (userTurnsCount === 0) return 20;
    return Math.min(100, 20 + userTurnsCount * 15);
  }, [userTurnsCount]);

  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  const [isBasketOpen, setIsBasketOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastInsightsTurnCountRef = useRef(0);
  const suggestionsFetchInFlightRef = useRef(false);
  const suggestionsLastInsightCountRef = useRef(0);

  // Convert turns to chat-ui-kit message format
  const messages: MessageType[] = useMemo(() => {
    if (turns.length === 0) {
      return [{
        message: DEFAULT_OPENING,
        sentTime: 'just now',
        sender: 'Guide',
        direction: 'incoming' as 'incoming' | 'outgoing',
      }];
    }

    return turns.map((turn): MessageType => {
      const isAssistant = turn.role === 'assistant';
      return {
        message: turn.text,
        sentTime: 'just now',
        sender: isAssistant ? 'Guide' : 'User',
        direction: isAssistant ? 'incoming' : 'outgoing',
      };
    });
  }, [turns]);

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

  // Send message to AI
  const handleSend = useCallback(async (message: string) => {
    if (!message.trim()) return;

    // Add user message immediately
    const userTurn: ConversationTurn = {
      role: 'user',
      text: message.trim(),
    };
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setIsTyping(true);

    try {
      // Call the chat API
      console.log('Sending to API:', { turns: [...turns, userTurn], profile, suggestions });
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns: [...turns, userTurn],
          profile,
          suggestions,
        }),
      });

      console.log('API response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', errorText);
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      console.log('API response data:', data);

      // Add assistant response
      if (data.reply) {
        const assistantTurn: ConversationTurn = {
          role: 'assistant',
          text: data.reply,
        };
        console.log('Adding assistant turn:', assistantTurn);
        const nextTurns = [...turns, userTurn, assistantTurn];
        setTurns(nextTurns);
        
        // Derive insights from the conversation
        void deriveInsights(nextTurns);
      } else {
        console.warn('No reply in API response:', data);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message
      const errorTurn: ConversationTurn = {
        role: 'assistant',
        text: "Sorry, I'm having trouble connecting right now. Can you try that again?",
      };
      setTurns((prev) => [...prev, errorTurn]);
    } finally {
      setIsTyping(false);
    }
  }, [turns, profile, suggestions, setTurns, deriveInsights]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Fetch career suggestions based on insights
  useEffect(() => {
    const insightCount = profile.insights.length;
    const lastCount = suggestionsLastInsightCountRef.current;
    const hasEnoughInsights = insightCount >= 3;

    const shouldFetch =
      hasEnoughInsights &&
      !suggestionsFetchInFlightRef.current &&
      (suggestions.length === 0 || insightCount > lastCount);

    if (!shouldFetch) {
      return;
    }

    suggestionsFetchInFlightRef.current = true;
    void (async () => {
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
          }),
        });
        if (!response.ok) {
          throw new Error(`Suggestions request failed: ${response.status}`);
        }
        const data = await response.json() as {
          suggestions?: Array<{
            id?: string;
            title?: string;
            summary?: string;
            careerAngles?: string[];
            nextSteps?: string[];
            whyItFits?: string[];
            confidence?: 'high' | 'medium' | 'low';
            score?: number;
            neighborTerritories?: string[];
            distance?: 'core' | 'adjacent' | 'unexpected';
          }>;
        };
        if (Array.isArray(data.suggestions)) {
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
              whyItFits: item.whyItFits ?? [],
              confidence: item.confidence ?? 'medium',
              score: item.score ?? 0,
              neighborTerritories: item.neighborTerritories ?? [],
              distance: item.distance === 'adjacent' || item.distance === 'unexpected' ? item.distance : 'core' as const,
            }))
            .sort((a, b) => b.score - a.score);

          // Preserve existing voted cards that aren't in the new suggestions
          const votedSuggestionIds = new Set(
            Object.keys(votesByCareerId).filter(id => votesByCareerId[id] !== undefined)
          );
          const existingVotedCards = suggestions.filter(s => votedSuggestionIds.has(s.id));
          const newSuggestionIds = new Set(normalized.map(s => s.id));
          const votedCardsNotInNewSet = existingVotedCards.filter(s => !newSuggestionIds.has(s.id));
          
          // Merge new suggestions with existing voted cards
          setSuggestions([...normalized, ...votedCardsNotInNewSet]);
          suggestionsLastInsightCountRef.current = insightCount;
          console.log('[Suggestions] Merged', normalized.length, 'new cards with', votedCardsNotInNewSet.length, 'existing voted cards');
        }
      } catch (error) {
        console.error('Failed to load suggestions', error);
      } finally {
        suggestionsFetchInFlightRef.current = false;
      }
    })();
  }, [profile.insights, setSuggestions, votesByCareerId, suggestions.length]);

  const totalBasketCount = savedSuggestions.length + maybeSuggestions.length + skippedSuggestions.length;
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
          <div className="progress-title">
            {progress < 100 ? "Let's keep it rolling." : "Ready to explore!"}
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
            className="btn-idea-stash"
            onClick={() => setIsBasketOpen(true)}
          >
            <Archive className="w-4 h-4" />
            IDEA STASH
            {totalBasketCount > 0 && <span className="badge">{totalBasketCount}</span>}
          </Button>
          <Button
            variant="outline"
            className="btn-personal-page"
            onClick={() => router.push('/exploration')}
          >
            <FileText className="w-4 h-4" />
            PERSONAL PAGE
          </Button>
          <Button
            className="btn-voice"
            onClick={() => {
              /* TODO: Switch to voice mode */
            }}
          >
            SWITCH TO VOICE
          </Button>
        </div>
      </div>

      {/* Suggestion Cards */}
      {suggestionGroups.pending.length > 0 && (
        <div className="suggestions-container">
          <SuggestionCards suggestions={suggestionGroups.pending} variant="inline" />
        </div>
      )}

      {/* Chat UI Kit Container */}
      <MainContainer>
        <ChatContainer>
          <MessageList
            typingIndicator={isTyping ? <TypingIndicator content="Guide is typing" /> : null}
          >
            {messages.map((msg, i) => (
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
            ))}
            <div ref={messagesEndRef} />
          </MessageList>
          <MessageInput
            placeholder="Type something you're into or curious about"
            value={input}
            onChange={(val) => setInput(val)}
            onSend={handleSend}
            attachButton={false}
          />
        </ChatContainer>
      </MainContainer>

      {/* Suggestion Basket Drawer */}
      <SuggestionBasket
        open={isBasketOpen}
        onOpenChange={setIsBasketOpen}
        saved={savedSuggestions}
        maybe={maybeSuggestions}
        skipped={skippedSuggestions}
        onCardReact={(payload) => {
          voteCareer(payload.suggestion.id, payload.nextValue);
        }}
      />
    </div>
  );
}

