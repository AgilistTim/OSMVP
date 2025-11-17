"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
	RealtimeSessionControls,
	RealtimeSessionState,
} from "@/hooks/use-realtime-session";
import type { ConversationPhase } from "@/lib/conversation-phases";
import { REALTIME_VOICE_ID } from "@/lib/realtime-voice";

interface VoiceControlsProps {
	state: RealtimeSessionState;
	controls: RealtimeSessionControls;
	onStart?: () => void;
	onStop?: () => void;
	phase?: ConversationPhase;
}

export function VoiceControls({ state, controls, onStart, onStop, phase }: VoiceControlsProps) {
	const [transcriptOpen, setTranscriptOpen] = useState(false);

	const isConnected = state.status === "connected";
	const isBusy = state.status === "requesting-token" || state.status === "connecting";

	const statusMessage = (() => {
		if (state.status === "error") {
			return state.error ?? "Connection error";
		}
		if (isBusy) {
			return "Connecting…";
		}
		if (isConnected) {
			return "Voice chat live";
		}
		return null;
	})();

	const transcriptItems = useMemo(
		() =>
			state.transcripts.filter(
				(item) => item.isFinal && typeof item.text === "string" && item.text.trim().length > 0
			),
		[state.transcripts]
	);
	const hasTranscript = transcriptItems.length > 0;

	useEffect(() => {
		if (!isConnected && transcriptOpen) {
			setTranscriptOpen(false);
		}
	}, [isConnected, transcriptOpen]);

	const handlePrimaryClick = async () => {
		if (isConnected) {
			await controls.disconnect();
			onStop?.();
			return;
		}
		if (isBusy) {
			return;
		}
		onStart?.();
		await controls.connect({
			enableMicrophone: true,
			enableAudioOutput: true,
			voice: REALTIME_VOICE_ID,
			phase,
		});
	};

	const primaryLabel = isConnected ? "Stop Voice Chat" : "Start Voice Chat";

	return (
		<div className="voice-controls-card">
			{statusMessage ? (
				<p className="voice-controls-status" role="status" aria-live="polite">
					{statusMessage}
				</p>
			) : null}

			<div className="voice-controls-primary">
				<Button
					type="button"
					size="lg"
					variant="default"
					className={cn(
						"voice-control-button",
						isConnected ? "voice-control-button--stop" : "voice-control-button--start"
					)}
					disabled={isBusy}
					onClick={handlePrimaryClick}
				>
					{isBusy ? "Starting…" : primaryLabel}
				</Button>
				<p className="voice-controls-tagline">Tap to start.</p>
			</div>

			<button
				type="button"
				className="voice-transcript-toggle"
				onClick={() => setTranscriptOpen((open) => !open)}
				disabled={!hasTranscript}
				aria-expanded={transcriptOpen}
			>
				{transcriptOpen ? "Hide transcript" : "Show transcript"}
			</button>

			{transcriptOpen ? (
				<div className="voice-transcript" role="log" aria-live="polite">
					{hasTranscript ? (
						<ul className="voice-transcript-list">
							{transcriptItems.map((item) => (
								<li key={item.id} className="voice-transcript-line">
									<span className="voice-transcript-role">
										{item.role === "user" ? "You" : "MirAI"}
									</span>
									<span className="voice-transcript-text">{item.text}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="voice-transcript-placeholder">We’ll surface the transcript once you start chatting.</p>
					)}
				</div>
			) : null}

			<p className="voice-controls-note">
				We keep a transcript so you can stay present in the conversation and review it later.
			</p>

			{state.lastLatencyMs !== undefined ? (
				<p className="voice-controls-meta">Last response latency: {state.lastLatencyMs} ms</p>
			) : null}
		</div>
	);
}
