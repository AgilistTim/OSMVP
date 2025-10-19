"use client";

import { useState } from 'react';
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

export function ChatPOC() {
  const [messages, setMessages] = useState([
    {
      message: "Let's chat about what you're into and what you're working on. As we go, I'll suggest some ideas you can thumbs up or down, and build you a personal page you can share. To start, what should I call you?",
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

  return (
    <div className="chat-poc-wrapper">
      {/* Custom Offscript Header */}
      <div className="offscript-header">
        <div className="progress-section">
          <div className="progress-title">Let's keep it rolling.</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '20%' }}></div>
          </div>
          <div className="progress-subtitle">
            Need a touch more on what you're into, what you're good at, and hopes before I pin fresh idea cards.
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

