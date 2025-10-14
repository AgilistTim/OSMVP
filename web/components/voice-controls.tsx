"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  RealtimeSessionControls,
  RealtimeSessionState,
} from "@/hooks/use-realtime-session";

interface VoiceControlsProps {
  state: RealtimeSessionState;
  controls: RealtimeSessionControls;
}

export function VoiceControls({ state, controls }: VoiceControlsProps) {
  const statusMessage = (() => {
    switch (state.status) {
      case "requesting-token":
        return "Requesting connection…";
      case "connecting":
        return "Connecting…";
      case "connected":
        return state.microphone === "paused" ? "Paused — we’re not listening right now." : "Listening";
      case "error":
        return state.error ?? "Connection error";
      default:
        return "Voice idle";
    }
  })();

  const canPause = state.status === "connected" && state.microphone === "active";
  const canResume = state.status === "connected" && state.microphone === "paused";

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm text-muted-foreground">{statusMessage}</div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={state.status === "connected" ? "secondary" : "default"}
          onClick={() => controls.connect()}
          disabled={state.status === "requesting-token" || state.status === "connecting"}
        >
          {state.status === "connected" ? "Reconnect" : "Start Voice"}
        </Button>
        <Button
          variant="outline"
          onClick={() => (canPause ? controls.pauseMicrophone() : controls.resumeMicrophone())}
          disabled={!canPause && !canResume}
        >
          {state.microphone === "paused" ? "Resume listening" : "Pause listening"}
        </Button>
        <Button variant="outline" onClick={() => controls.disconnect()}>
          Stop
        </Button>
      </div>
      {state.microphone === "paused" ? (
        <div className="text-xs font-medium text-muted-foreground">
          While paused, we’re not recording. Resume when you want to keep chatting.
        </div>
      ) : null}
      {state.lastLatencyMs !== undefined && (
        <div className="text-xs text-muted-foreground">
          Last response latency: {state.lastLatencyMs} ms
        </div>
      )}
    </Card>
  );
}
