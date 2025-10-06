"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { useVoiceSession } from "@/hooks/use-voice-session";

export function VoiceControls() {
  const { sessionId, setOnboardingStep, setProfile, setVoice } = useSession();

  const lastUserTranscriptIdRef = useRef<string | undefined>(undefined);
  const lastAssistantTranscriptIdRef = useRef<string | undefined>(undefined);

  const [state, controls] = useVoiceSession({ sessionId });

  useEffect(() => {
    controls.setOnResponseCompleted(() => {
      setOnboardingStep((prev) => prev + 1);
    });

    return () => {
      controls.setOnResponseCompleted(null);
    };
  }, [controls, setOnboardingStep]);

  useEffect(() => {
    const latestUser = state.transcripts.find(
      (item) => item.isFinal && item.role === "user"
    );

    if (!latestUser || latestUser.id === lastUserTranscriptIdRef.current) {
      return;
    }

    lastUserTranscriptIdRef.current = latestUser.id;
    setProfile({ lastTranscript: latestUser.text, lastTranscriptId: latestUser.id });
  }, [state.transcripts, setProfile]);

  useEffect(() => {
    const latestAssistant = state.transcripts.find(
      (item) => item.isFinal && item.role === "assistant"
    );

    if (!latestAssistant || latestAssistant.id === lastAssistantTranscriptIdRef.current) {
      return;
    }

    lastAssistantTranscriptIdRef.current = latestAssistant.id;
    setProfile({
      lastAssistantTranscript: latestAssistant.text,
      lastAssistantTranscriptId: latestAssistant.id,
    });
  }, [state.transcripts, setProfile]);

  useEffect(() => {
    setVoice({
      status: state.status,
      error: state.error,
      lastLatencyMs: state.lastLatencyMs,
    });
  }, [state.status, state.error, state.lastLatencyMs, setVoice]);

  const statusMessage = (() => {
    switch (state.status) {
      case "requesting-token":
        return "Requesting connection…";
      case "connecting":
        return "Connecting…";
      case "connected":
        return "Listening";
      case "error":
        return state.error ?? "Connection error";
      default:
        return "Voice idle";
    }
  })();

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground">{statusMessage}</div>
      <div className="flex gap-2">
        <Button
          variant={state.status === "connected" ? "secondary" : "default"}
          onClick={() => controls.connect()}
          disabled={state.status === "requesting-token" || state.status === "connecting"}
        >
          {state.status === "connected" ? "Reconnect" : "Start Voice"}
        </Button>
        <Button variant="outline" onClick={() => controls.disconnect()}>
          Stop
        </Button>
      </div>
      {state.lastLatencyMs !== undefined && (
        <div className="text-xs text-muted-foreground">
          Last response latency: {state.lastLatencyMs} ms
        </div>
      )}
      {state.transcripts.some((item) => item.isFinal) && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Recent transcripts
          </div>
          <ul className="space-y-1 text-sm">
            {state.transcripts
              .filter((item) => item.isFinal)
              .slice(0, 5)
              .map((item) => (
                <li key={item.id} className="truncate text-muted-foreground">
                  {new Date(item.createdAt).toLocaleTimeString()} · {" "}
                  {item.role === "assistant" ? "Guide" : "You"}: {item.text}
                </li>
              ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
