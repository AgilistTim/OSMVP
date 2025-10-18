"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
	const canStop = state.status === "connected" || state.status === "error";

	return (
		<div className="voice-controls-card">
			<div className="voice-controls-status">{statusMessage}</div>
			<div className="voice-controls-actions">
				<Button
					variant={state.status === "connected" ? "outline" : "default"}
					size="lg"
					className={cn(
						"voice-control-button",
						state.status === "connected" ? "voice-control-button--outline" : "voice-control-button--primary"
					)}
					onClick={() => controls.connect()}
					disabled={state.status === "requesting-token" || state.status === "connecting"}
					type="button"
				>
					{state.status === "connected" ? "Reconnect" : "Start Voice"}
				</Button>
				<Button
					variant="outline"
					size="lg"
					className={cn(
						"voice-control-button voice-control-button--outline",
						state.microphone === "paused" ? "voice-control-button--active" : ""
					)}
					onClick={() => (canPause ? controls.pauseMicrophone() : controls.resumeMicrophone())}
					disabled={!canPause && !canResume}
					type="button"
				>
					{state.microphone === "paused" ? "Resume listening" : "Pause listening"}
				</Button>
				<Button
					variant="outline"
					size="lg"
					className="voice-control-button voice-control-button--outline voice-control-button--stop"
					onClick={() => controls.disconnect()}
					disabled={!canStop}
					type="button"
				>
					Stop
				</Button>
			</div>
			{state.microphone === "paused" ? (
				<div className="voice-controls-hint">While paused, we’re not recording. Resume when you want to keep chatting.</div>
			) : null}
			<div className="voice-controls-note">
				We’re keeping a transcript behind the scenes so you can stay focused on speaking. Let us know if something sounds
				off.
			</div>
			{state.lastLatencyMs !== undefined ? (
				<div className="voice-controls-meta">Last response latency: {state.lastLatencyMs} ms</div>
			) : null}
		</div>
	);
}
