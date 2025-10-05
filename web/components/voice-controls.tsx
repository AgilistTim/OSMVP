"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { useVoiceSession } from "@/hooks/use-voice-session";

export function VoiceControls() {
  const { sessionId, setOnboardingStep, setProfile, setVoice } = useSession();

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
    if (state.transcripts.length > 0) {
      const latest = state.transcripts[0];
      setProfile({ lastTranscript: latest.text });
    }
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
      {state.transcripts.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Recent transcripts
          </div>
          <ul className="space-y-1 text-sm">
            {state.transcripts.slice(0, 5).map((item) => (
              <li key={item.id} className="truncate text-muted-foreground">
                {new Date(item.createdAt).toLocaleTimeString()} · {item.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
