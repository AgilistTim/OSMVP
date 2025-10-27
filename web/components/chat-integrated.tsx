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
import { CustomMessageInput } from '@/components/custom-message-input';
import '@/components/custom-message-input.css';
import { useSession } from '@/components/session-provider';
import type { ConversationTurn, InsightKind } from '@/components/session-provider';
import { SuggestionCards } from '@/components/suggestion-cards';
import { ProfileInsightsBar } from '@/components/profile-insights-bar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRealtimeSession } from '@/hooks/use-realtime-session';
import { VoiceControls } from '@/components/voice-controls';

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

  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  // Basket drawer removed - voted cards now shown on MY PAGE

  // Realtime API session
  const [realtimeState, realtimeControls] = useRealtimeSession({
    sessionId,
    enableMicrophone: mode === 'voice',
    enableAudioOutput: mode === 'voice',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastInsightsTurnCountRef = useRef(0);
  const suggestionsFetchInFlightRef = useRef(false);
  const suggestionsLastInsightCountRef = useRef(0);
  
  // Track all suggestions that have ever been shown (for vote persistence)
  const allSuggestionsRef = useRef<Map<string, typeof suggestions[0]>>(new Map());
  
  // Initialize allSuggestionsRef with existing suggestions from session
  useEffect(() => {
    suggestions.forEach(s => {
      if (!allSuggestionsRef.current.has(s.id)) {
        allSuggestionsRef.current.set(s.id, s);
      }
    });
  }, [suggestions]);

  // Ensure initial message is added to turns on mount
  useEffect(() => {
    if (turns.length === 0) {
      const initialTurn: ConversationTurn = {
        role: 'assistant',
        text: DEFAULT_OPENING,
      };
      setTurns([initialTurn]);
    }
  }, []); // Only run once on mount

  // Convert turns to chat-ui-kit message format
  const messages: MessageType[] = useMemo(() => {
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
          enableMicrophone: mode === 'voice',
          enableAudioOutput: mode === 'voice',
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
      realtimeControls.sendEvent({
        type: 'response.create',
        response: {
          output_modalities: mode === 'voice' ? ['audio', 'text'] : ['text'],
        },
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
  }, [turns, setTurns, deriveInsights, realtimeState.status, realtimeControls, mode]);

  // Listen for assistant responses from Realtime API
  useEffect(() => {
    const latestTranscript = realtimeState.transcripts[0];
    
    if (!latestTranscript || !latestTranscript.isFinal) {
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
      }
    }
  }, [realtimeState.transcripts, turns, setTurns, deriveInsights]);

  // Auto-connect Realtime session for text mode only
  // Voice mode requires explicit user action (START VOICE button)
  useEffect(() => {
    if (realtimeState.status === 'idle' && mode === 'text') {
      console.log('[Realtime] Auto-connecting session for text mode');
      realtimeControls.connect({
        enableMicrophone: false,
        enableAudioOutput: false,
      }).catch((err) => {
        console.error('[Realtime] Connection error:', err);
      });
    }
  }, [realtimeState.status, realtimeControls, mode]);

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

          // Store all new suggestions in our persistent map
          normalized.forEach(s => {
            allSuggestionsRef.current.set(s.id, s);
          });
          
          // Preserve existing voted cards that aren't in the new suggestions
          const votedSuggestionIds = new Set(
            Object.keys(votesByCareerId).filter(id => votesByCareerId[id] !== undefined)
          );
          const newSuggestionIds = new Set(normalized.map(s => s.id));
          
          // Get voted cards from our persistent map (not from current suggestions)
          const votedCardsNotInNewSet: typeof normalized = [];
          votedSuggestionIds.forEach(id => {
            if (!newSuggestionIds.has(id) && allSuggestionsRef.current.has(id)) {
              votedCardsNotInNewSet.push(allSuggestionsRef.current.get(id)!);
            }
          });
          
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

      {/* Suggestion Cards */}
      {suggestionGroups.pending.length > 0 && (
        <div className="suggestions-container">
          <SuggestionCards suggestions={suggestionGroups.pending} variant="inline" />
        </div>
      )}

       {/* Chat Interface */}
      {mode === 'text' ? (
        <>
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
            </ChatContainer>
          </MainContainer>
          <div className="custom-input-wrapper">
            <CustomMessageInput
              placeholder="Type something you're into or curious about"
              value={input}
              onChange={setInput}
              onSend={handleSend}
              mode={mode}
              onModeToggle={() => setMode(mode === 'text' ? 'voice' : 'text')}
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
                onClick={() => setMode('text')}
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
            />
          </div>
          
          {/* Show only last assistant message in voice mode */}
          {(() => {
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
        </div>
      )}

      {/* Suggestion Basket Drawer removed - voted cards now shown on MY PAGE */}
    </div>
  );
}

