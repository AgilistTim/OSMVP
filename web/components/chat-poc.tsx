"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator,
} from '@chatscope/chat-ui-kit-react';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, ChevronDown, Sparkles, Target, Trophy } from 'lucide-react';
import { useSession } from '@/components/session-provider';
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

type CapturedItem = {
  id: string;
  text: string;
};

type CapturedInsights = {
  interests: CapturedItem[];
  strengths: CapturedItem[];
  goals: CapturedItem[];
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
  const { profile } = useSession();
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [recentlyAddedItem, setRecentlyAddedItem] = useState<string | null>(null);
  const newItemTimerRef = useRef<number | null>(null);
  const previousInsightIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedInsightsRef = useRef(false);

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

  useEffect(() => {
    const currentIds = new Set(profile.insights.map((insight) => insight.id));
    const previousIds = previousInsightIdsRef.current;

    if (!hasInitializedInsightsRef.current) {
      previousInsightIdsRef.current = currentIds;
      hasInitializedInsightsRef.current = true;
      return;
    }

    let newestInsight: { id: string; text: string } | null = null;
    for (const insight of profile.insights) {
      if (previousIds.has(insight.id)) {
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

  return (
    <div className="chat-poc-wrapper">
      {/* Smart Offscript Header */}
      <div className={`offscript-header ${isHeaderExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="header-collapsed-view">
          <div className="progress-section-minimal">
            <div className="progress-header-minimal">
              <button
                type="button"
                className="consolidated-badge"
                onClick={toggleHeader}
                aria-expanded={isHeaderExpanded}
                aria-label={isHeaderExpanded ? 'Collapse insights panel' : 'Expand insights panel'}
              >
                <BarChart3 className="badge-icon" aria-hidden />
                <span className="badge-text">Insights: {totalInsights}</span>
                <ChevronDown
                  className={`chevron ${isHeaderExpanded ? 'up' : ''}`}
                  aria-hidden
                />
              </button>
              <div className="progress-percentage-minimal">{progress}%</div>
            </div>
            <div className="progress-bar-minimal">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
          {chipText ? <div className="new-item-chip">+ {chipText}</div> : null}
        </div>

        {isHeaderExpanded ? (
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

            <div className="progress-section-expanded">
              <div className="progress-title-expanded">{currentStage.title}</div>
              <div className="progress-subtitle-expanded">{currentStage.caption}</div>
              <div className="progress-cta">
                <span className="cta-pill">{ctaLabel}</span>
                <span>{ctaText}</span>
              </div>
            </div>
          </div>
        ) : null}

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
