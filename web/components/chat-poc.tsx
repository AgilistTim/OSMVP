"use client";

import { useMemo, useState } from 'react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator,
} from '@chatscope/chat-ui-kit-react';
import './chat-poc.css'; // Custom Offscript styling

type MessageType = {
  message: string;
  sentTime: string;
  sender: string;
  direction: 'incoming' | 'outgoing';
};

type ProgressStage = {
  minTurns: number;
  progress: number;
  title: string;
  caption: string;
  promptHint: string;
};

const PROGRESS_STAGES: ProgressStage[] = [
  {
    minTurns: 0,
    progress: 12,
    title: "Let's keep it rolling.",
    caption: "I'm mapping your vibe before surfacing matches.",
    promptHint: 'Drop a curiosity to get me started.',
  },
  {
    minTurns: 1,
    progress: 38,
    title: 'Great spark.',
    caption: 'Every detail sharpens the cards I pull.',
    promptHint: "What's something you're great at?",
  },
  {
    minTurns: 2,
    progress: 68,
    title: 'Getting closer.',
    caption: 'Almost ready to pin tailored idea cards.',
    promptHint: "Paint a win you'd love to chase.",
  },
  {
    minTurns: 3,
    progress: 100,
    title: 'Ideas on deck.',
    caption: 'I can start pinning cards the moment you say so.',
    promptHint: 'Ask for ideas or keep riffing details.',
  },
];

export function ChatPOC() {
  const [messages, setMessages] = useState<MessageType[]>([
    {
      message: "Let's chat about what you're into and what you're working on. As we go, I'll suggest some ideas you can thumbs up or down, and build you a personal page you can share.",
      sentTime: "just now",
      sender: "Guide",
      direction: "incoming" as const,
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = (message: string) => {
    const newMessage = {
      message,
      sentTime: "just now",
      sender: "User",
      direction: "outgoing" as const,
    };

    setMessages([...messages, newMessage]);

    // Simulate AI response
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          message: "Great! Tell me more about what you're curious about...",
          sentTime: "just now",
          sender: "Guide",
          direction: "incoming" as const,
        },
      ]);
      setIsTyping(false);
    }, 1500);
  };

  const userTurnCount = useMemo(
    () => messages.filter((msg) => msg.direction === 'outgoing').length,
    [messages]
  );

  const { currentStage, nextStage, progress } = useMemo(() => {
    let stageIndex = 0;
    for (let i = 0; i < PROGRESS_STAGES.length; i += 1) {
      if (userTurnCount >= PROGRESS_STAGES[i].minTurns) {
        stageIndex = i;
      } else {
        break;
      }
    }

    const activeStage = PROGRESS_STAGES[stageIndex];
    const upcomingStage = PROGRESS_STAGES[stageIndex + 1];

    let computedProgress = activeStage.progress;
    if (upcomingStage) {
      const turnsIntoStage = userTurnCount - activeStage.minTurns;
      const stageSpan = Math.max(1, upcomingStage.minTurns - activeStage.minTurns);
      const progressDelta = upcomingStage.progress - activeStage.progress;
      const fractional = Math.min(1, turnsIntoStage / stageSpan);
      computedProgress = Math.round(activeStage.progress + progressDelta * fractional);
    }

    return {
      currentStage: activeStage,
      nextStage: upcomingStage ?? null,
      progress: Math.min(100, computedProgress),
    };
  }, [userTurnCount]);

  const ctaLabel = nextStage ? 'Next up' : 'Ready';
  const ctaText = (nextStage ?? currentStage).promptHint;

  return (
    <div className="chat-poc-wrapper">
      {/* Custom Offscript Header */}
      <div className="offscript-header">
        <div className="progress-section">
          <div className="progress-header">
            <div className="progress-title">{currentStage.title}</div>
            <div className="progress-percentage">{progress}%</div>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="progress-subtitle">{currentStage.caption}</div>
          <div className="progress-cta">
            <span className="cta-pill">{ctaLabel}</span>
            <span>{ctaText}</span>
          </div>
        </div>
        
        <div className="action-buttons">
          <button className="btn-idea-stash">
            <span>🗑️</span> IDEA STASH <span className="badge">0</span>
          </button>
          <button className="btn-personal-page">
            <span>📄</span> PERSONAL PAGE
          </button>
          <button className="btn-voice">
            SWITCH TO VOICE
          </button>
        </div>
      </div>

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
          </MessageList>
          <MessageInput
            placeholder="Type something you're into or curious about"
            onSend={handleSend}
            attachButton={false}
          />
        </ChatContainer>
      </MainContainer>
    </div>
  );
}
