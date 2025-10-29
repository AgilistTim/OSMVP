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
  
  // Initialize last insight count from localStorage (only once on mount)
  const suggestionsLastInsightCountRef = useRef<number>(0);
  if (suggestionsLastInsightCountRef.current === 0 && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('osmvp_last_insight_count');
      if (stored) {
        suggestionsLastInsightCountRef.current = parseInt(stored, 10);
        console.log('[ChatIntegrated] Restored last insight count:', suggestionsLastInsightCountRef.current);
      }
    } catch (error) {
      console.error('[ChatIntegrated] Failed to restore last insight count:', error);
    }
  }
  
  // Initialize shown suggestion IDs from localStorage (only once on mount)
  const shownSuggestionIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedShownIds = useRef(false);
  if (!hasInitializedShownIds.current && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('osmvp_shown_suggestion_ids');
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
  
  // Track all suggestions that have ever been shown (for vote persistence) - only once on mount
  const allSuggestionsRef = useRef<Map<string, typeof suggestions[0]>>(new Map());
  const hasInitializedAllSuggestions = useRef(false);
  if (!hasInitializedAllSuggestions.current) {
    // Restore from current suggestions (which were loaded from localStorage)
    suggestions.forEach(s => allSuggestionsRef.current.set(s.id, s));
    console.log('[ChatIntegrated] Initialized allSuggestionsRef with', allSuggestionsRef.current.size, 'suggestions');
    hasInitializedAllSuggestions.current = true;
  }
  
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
      }
    }
    
    // Add any remaining cards that should appear after all turns
    const remainingCards = cardsByInsertPoint.get(textMessages.length);
    if (remainingCards) {
      combined.push(...remainingCards);
    }
    
    console.log('[ChatIntegrated] Combined messages:', {
      textCount: textMessages.length,
      cardCount: cardMessages.length,
      combinedCount: combined.length,
      cardMessageIds: cardMessages.filter(m => m.type === 'career-card').map(m => m.careerSuggestion?.id)
    });
    return combined;
  }, [textMessages, cardMessages]);
  
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
        localStorage.setItem('osmvp_shown_suggestion_ids', JSON.stringify(idsArray));
        console.log('[ChatIntegrated] Saved shown suggestion IDs to localStorage:', idsArray.length);
      } catch (error) {
        console.error('[ChatIntegrated] Failed to save shown suggestion IDs:', error);
      }
    }
    
    // Track current turn count for insertion point
    const currentTurnCount = turns.length;
    
    // Create intro message
    const introMessages = [
      "That triggers some ideas! Give me a moment to pull something together...",
      "Based on what you've shared, let me find some paths that might fit...",
      "This is giving me some ideas. Let me research a few options...",
      "I'm seeing some interesting directions. Let me build some cards for you...",
      "That's helpful context! Let me explore some career paths for you...",
    ];
    const introText = introMessages[currentTurnCount % introMessages.length];
    
    const introMessage: MessageType = {
      message: introText,
      sentTime: 'just now',
      sender: 'Guide',
      direction: 'incoming',
      type: 'text',
      insertAfterTurnIndex: currentTurnCount,
      revealIndex: 0, // Intro appears first
    };
    
    // Create all card messages with staggered reveal indices
    const newCardMessages: MessageType[] = newSuggestions.map((suggestion, index): MessageType => ({
      message: '',
      sentTime: 'just now',
      sender: 'Guide',
      direction: 'incoming',
      type: 'career-card',
      careerSuggestion: suggestion,
      insertAfterTurnIndex: currentTurnCount,
      revealIndex: index + 1, // Cards appear after intro with stagger
    }));
    
    // Add all messages in a single batch (CSS will handle staggered reveal)
    setCardMessages(prev => [...prev, introMessage, ...newCardMessages]);
    console.log('[ChatIntegrated] Added intro + ', newSuggestions.length, 'cards with staggered reveal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

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

  // Make AI speak first when voice mode connects
  const hasGreetedInVoiceRef = useRef(false);
  useEffect(() => {
    if (mode === 'voice' && realtimeState.status === 'connected' && !hasGreetedInVoiceRef.current) {
      console.log('[Voice Mode] Connected, triggering AI greeting');
      hasGreetedInVoiceRef.current = true;
      
      // Request AI to speak the greeting
      setTimeout(() => {
        realtimeControls.sendEvent({
          type: 'response.create',
          response: {
            output_modalities: ['audio', 'text'],
          },
        });
      }, 500); // Small delay to ensure connection is fully established
    }
    
    // Reset flag when leaving voice mode
    if (mode === 'text') {
      hasGreetedInVoiceRef.current = false;
    }
  }, [mode, realtimeState.status, realtimeControls]);

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

    console.log('[Suggestions Effect] Triggered:', {
      insightCount,
      lastCount,
      hasEnoughInsights,
      inFlight: suggestionsFetchInFlightRef.current,
      currentSuggestions: suggestions.length
    });

    const shouldFetch =
      hasEnoughInsights &&
      !suggestionsFetchInFlightRef.current &&
      (suggestions.length === 0 || insightCount > lastCount);

    console.log('[Suggestions Effect] Should fetch:', shouldFetch);

    if (!shouldFetch) {
      return;
    }

    suggestionsFetchInFlightRef.current = true;
    setLoadingSuggestions(true);
    
    // Update lastCount BEFORE fetch to prevent duplicate fetches while this one is in flight
    suggestionsLastInsightCountRef.current = insightCount;
    console.log('[Suggestions] Updated lastCount to', insightCount, 'before fetch');
    
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
            microExperiments?: string[];
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
              microExperiments: item.microExperiments ?? [],
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
          // Note: lastCount already updated before fetch to prevent duplicates
          
          // Persist last insight count to localStorage
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('osmvp_last_insight_count', insightCount.toString());
              console.log('[Suggestions] Saved last insight count to localStorage:', insightCount);
            } catch (error) {
              console.error('[Suggestions] Failed to save last insight count:', error);
            }
          }
          
          console.log('[Suggestions] Merged', normalized.length, 'new cards with', votedCardsNotInNewSet.length, 'existing voted cards');
        }
      } catch (error) {
        console.error('Failed to load suggestions', error);
      } finally {
        suggestionsFetchInFlightRef.current = false;
        setLoadingSuggestions(false);
      }
    })();
  }, [profile.insights.length, setSuggestions]);

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
                  <span>I'm finding some career paths for you based on what you've shared. Give me a moment to pull the details together...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Show career cards in voice mode */}
          {!loadingSuggestions && suggestions.length > 0 && (
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
                {suggestions.map((suggestion) => (
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
        </div>
      )}

      {/* Suggestion Basket Drawer removed - voted cards now shown on MY PAGE */}
    </div>
  );
}

