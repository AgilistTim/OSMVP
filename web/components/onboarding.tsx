"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useSession, InsightKind } from "@/components/session-provider";
import { VoiceControls } from "@/components/voice-controls";
import { useRealtimeSession } from "@/hooks/use-realtime-session";

type Readiness = "G1" | "G2" | "G3" | "G4";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

const TOTAL_STEPS = 5;

export function Onboarding() {
  const {
    mode,
    setMode,
    profile,
    setProfile,
    appendProfileInsights,
    setSummary,
    setVoice,
    started,
    onboardingStep,
    setOnboardingStep,
    sessionId,
  } = useSession();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [question, setQuestion] = useState<string>("");
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lastUserTranscriptIdRef = useRef<string | undefined>(undefined);
  const lastUserTranscriptTextRef = useRef<string | undefined>(undefined);
  const lastAssistantTranscriptIdRef = useRef<string | undefined>(undefined);
  const lastAssistantTranscriptTextRef = useRef<string | undefined>(undefined);
  const lastInsightsTurnCountRef = useRef<number>(0);
  const initialResponseRequestedRef = useRef<boolean>(false);

  const [realtimeState, realtimeControls] = useRealtimeSession({
    sessionId,
    enableMicrophone: mode === "voice",
    enableAudioOutput: mode === "voice",
  });

  const previousModeRef = useRef<typeof mode>(mode);
  useEffect(() => {
    if (previousModeRef.current && mode && previousModeRef.current !== mode) {
      void realtimeControls.disconnect();
    }
    previousModeRef.current = mode;
  }, [mode, realtimeControls]);

  const progress = useMemo(
    () => Math.min(100, Math.round((onboardingStep / TOTAL_STEPS) * 100)),
    [onboardingStep]
  );

  useEffect(() => {
    realtimeControls.setOnResponseCompleted(() => {
      setOnboardingStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
    });
    return () => {
      realtimeControls.setOnResponseCompleted(null);
    };
  }, [realtimeControls, setOnboardingStep]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [question, mode]);

  useEffect(() => {
    if (!transcriptContainerRef.current) return;
    transcriptContainerRef.current.scrollTo({
      top: transcriptContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns.length]);

  useEffect(() => {
    setVoice({
      status: realtimeState.status,
      error: realtimeState.error,
      lastLatencyMs: realtimeState.lastLatencyMs,
    });
  }, [realtimeState.status, realtimeState.error, realtimeState.lastLatencyMs, setVoice]);

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
    setTurns((prev) => [...prev, { role: "user", text: latestUser.text }]);
  }, [mode, realtimeState.transcripts, setProfile]);

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
    setProfile({
      lastAssistantTranscript: latestAssistant.text,
      lastAssistantTranscriptId: latestAssistant.id,
    });
    setQuestion(latestAssistant.text);
    setTurns((prev) => [...prev, { role: "assistant", text: latestAssistant.text }]);
  }, [realtimeState.transcripts, setProfile]);

  useEffect(() => {
    const latestAssistant = realtimeState.transcripts.find(
      (item) => item.isFinal && item.role === "assistant"
    );

    if (!latestAssistant) {
      return;
    }

    if (turns.length === lastInsightsTurnCountRef.current) {
      return;
    }

    lastInsightsTurnCountRef.current = turns.length;

    void (async () => {
      try {
        const response = await fetch("/api/profile/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            turns,
            existingInsights: (profile.insights ?? []).map((insight) => ({
              kind: insight.kind,
              value: insight.value,
            })),
          }),
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (Array.isArray(data.insights)) {
          appendProfileInsights(
            data.insights
              .filter((item: { kind?: string; value?: string }) => typeof item?.kind === "string" && typeof item?.value === "string")
              .map((item: { kind: string; value: string; confidence?: string; evidence?: string; source?: string }) => ({
                kind: item.kind as InsightKind,
                value: item.value,
                confidence: item.confidence,
                evidence: item.evidence,
                source: (item.source as "assistant" | "user" | undefined) ?? "assistant",
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
    })();
  }, [appendProfileInsights, profile.insights, realtimeState.transcripts, sessionId, setProfile, setSummary, turns]);

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
      realtimeControls.sendEvent({
        type: "response.create",
        response: mode === "text" ? { output_modalities: ["text"] } : undefined,
      });
    })();
  }, [ensureRealtimeConnected, mode, realtimeControls, started, turns.length]);

  const handleSubmit = useCallback(async () => {
    if (!currentInput.trim()) return;
    const userText = currentInput.trim();
    setCurrentInput("");

    const transcriptId = crypto.randomUUID();
    setProfile({ lastTranscript: userText, lastTranscriptId: transcriptId });
    setTurns((prev) => [...prev, { role: "user", text: userText }]);

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
            text: userText,
          },
        ],
      },
    });

    try {
      await realtimeControls.waitForConversationItem(transcriptId);
    } catch (err) {
      console.error("Failed to confirm conversation item", err);
      return;
    }

    realtimeControls.sendEvent({
      type: "response.create",
      response: mode === "text" ? { output_modalities: ["text"] } : undefined,
    });
  }, [currentInput, ensureRealtimeConnected, mode, realtimeControls, setProfile]);

  const header = useMemo(() => {
    if (!readiness) return "Let’s get a sense of where you are.";
    const map: Record<Readiness, string> = {
      G1: "Exploring where to start",
      G2: "Exploring options",
      G3: "Narrowing in",
      G4: "Clear and focused",
    };
    return map[readiness];
  }, [readiness]);

  const canSubmit = currentInput.trim().length > 0;
  const displayedQuestion = question || "Give me a moment while I get set up…";

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{header}</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{progress}%</span>
        </div>
      </div>
      <Progress value={progress} />

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{mode ? `Mode: ${mode === "voice" ? "Voice" : "Text"}` : ""}</span>
          {mode === "voice" ? (
            <Button variant="link" className="px-0 text-sm" onClick={() => setMode("text")}>Switch to text</Button>
          ) : (
            <Button variant="link" className="px-0 text-sm" onClick={() => setMode("voice")}>Switch to voice</Button>
          )}
       </div>
        <div className="text-base font-medium whitespace-pre-line">{displayedQuestion}</div>
        {mode === "text" ? (
          <>
            <Input
              ref={inputRef}
              placeholder="Type a short answer"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                Continue
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Answer out loud, or switch to text if you&apos;d rather type this turn.
          </p>
        )}
      </Card>

      {mode === "voice" && (
        <VoiceControls state={realtimeState} controls={realtimeControls} />
      )}

      <div
        ref={transcriptContainerRef}
        className="max-h-80 overflow-y-auto space-y-3 rounded-lg border border-border bg-muted/20 p-4"
      >
        {turns.map((t, idx) => {
          const isUser = t.role === "user";
          return (
            <div key={`${t.role}-${idx}-${t.text.slice(0, 8)}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm whitespace-pre-line ${
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-card-foreground border border-border"
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  {isUser ? "You" : "Guide"}
                </div>
                <div className="mt-1 leading-relaxed">{t.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Onboarding;
