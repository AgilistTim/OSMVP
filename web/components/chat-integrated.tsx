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
import type { ConversationTurn } from '@/components/session-provider';
import { SuggestionCards } from '@/components/suggestion-cards';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      // Call the onboarding API
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns: [...turns, userTurn],
          profile,
          suggestions,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      // Add assistant response
      if (data.reply) {
        const assistantTurn: ConversationTurn = {
          role: 'assistant',
          text: data.reply,
        };
        setTurns((prev) => [...prev, assistantTurn]);
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
  }, [turns, profile, suggestions, setTurns]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
              {progress < 100 ? "Let&apos;s keep it rolling." : "Ready to explore!"}
            </div>
            <Progress value={progress} className="progress-bar" />
            <div className="progress-subtitle">
              {progress < 100
                ? "Need a touch more on what you&apos;re into, what you&apos;re good at, and hopes before I pin fresh idea cards."
                : "You&apos;ve shared enough to start exploring ideas!"}
            </div>
          </div>
        )}

        <div className="action-buttons">
          <Button
            variant="outline"
            className="btn-idea-stash"
            onClick={() => router.push('/exploration')}
          >
            <Archive className="w-4 h-4" />
            IDEA STASH
            {totalBasketCount > 0 && <span className="badge">{totalBasketCount}</span>}
          </Button>
          <Button
            variant="outline"
            className="btn-personal-page"
            onClick={() => {
              /* TODO: Navigate to personal page */
            }}
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
            placeholder="Type something you&apos;re into or curious about"
            value={input}
            onChange={(val) => setInput(val)}
            onSend={handleSend}
            attachButton={false}
          />
        </ChatContainer>
      </MainContainer>
    </div>
  );
}

