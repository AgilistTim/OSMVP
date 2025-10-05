"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface VoiceSessionConfig {
  sessionId: string;
  instructions?: string;
  voice?: string;
}

export type VoiceStatus =
  | "idle"
  | "requesting-token"
  | "connecting"
  | "connected"
  | "error";

export interface VoiceTranscriptItem {
  id: string;
  text: string;
  createdAt: number;
}

interface VoiceSessionState {
  status: VoiceStatus;
  error?: string;
  transcripts: VoiceTranscriptItem[];
  lastLatencyMs?: number;
}

interface VoiceSessionControls {
  connect: (config?: Partial<VoiceSessionConfig>) => Promise<void>;
  disconnect: () => Promise<void>;
  sendEvent: (event: unknown) => void;
  setOnResponseCompleted: (handler: (() => void) | null) => void;
}

export function useVoiceSession(baseConfig: VoiceSessionConfig): [
  VoiceSessionState,
  VoiceSessionControls
] {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [transcripts, setTranscripts] = useState<VoiceTranscriptItem[]>([]);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | undefined>(undefined);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const responseStartTimesRef = useRef<Map<string, number>>(new Map());
  const onResponseCompletedRef = useRef<(() => void) | null>(null);

  const logEvent = useCallback((name: string, details?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[voice]", name, details ?? {});
    }
  }, []);

  const cleanup = useCallback(async () => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }

    responseStartTimesRef.current.clear();
  }, []);

  const disconnect = useCallback(async () => {
    await cleanup();
    setStatus("idle");
  }, [cleanup]);

  const handleServerEvent = useCallback((raw: MessageEvent<string>) => {
    try {
      const event = JSON.parse(raw.data);
      const type: string | undefined = event.type;

      if (!type) return;

      switch (type) {
        case "response.created": {
          if (event.response?.id) {
            responseStartTimesRef.current.set(event.response.id, Date.now());
          }
          break;
        }
        case "response.completed": {
          const responseId = event.response?.id;
          if (responseId && responseStartTimesRef.current.has(responseId)) {
            const start = responseStartTimesRef.current.get(responseId)!;
            setLastLatencyMs(Date.now() - start);
            responseStartTimesRef.current.delete(responseId);
          }

          onResponseCompletedRef.current?.();
          break;
        }
        case "response.audio_transcript.delta": {
          const text: string | undefined = event.delta;
          if (text) {
            setTranscripts((prev) => {
              const last = prev[0];
              if (last && last.id === event.response_id) {
                const updated = { ...last, text: `${last.text}${text}` };
                return [updated, ...prev.slice(1)];
              }
              return prev;
            });
          }
          break;
        }
        case "response.audio_transcript.done": {
          const text: string | undefined = event.transcript;
          if (text && event.response_id) {
            setTranscripts((prev) => [
              {
                id: event.response_id,
                text,
                createdAt: Date.now(),
              },
              ...prev,
            ]);
          }
          break;
        }
        case "error": {
          setError(event.error?.message ?? "Realtime session error");
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("Failed to parse realtime event", err);
    }
  }, []);

  const sendEvent = useCallback((event: unknown) => {
    const channel = dataChannelRef.current;
    if (channel?.readyState === "open") {
      channel.send(JSON.stringify(event));
    }
  }, []);

  const connect = useCallback(
    async (overrideConfig?: Partial<VoiceSessionConfig>) => {
      if (!baseConfig.sessionId && !overrideConfig?.sessionId) {
        setError("Session ID is required for voice connection");
        setStatus("error");
        return;
      }

      setError(undefined);
      setStatus("requesting-token");

      try {
        const response = await fetch("/api/realtime/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...baseConfig,
            ...overrideConfig,
          }),
        });

        if (!response.ok) {
          const details = await response.text();
          throw new Error(details || `Token request failed with ${response.status}`);
        }

        const data = (await response.json()) as {
          client_secret?: { value: string };
        };

        const ephemeral = data.client_secret?.value;
        if (!ephemeral) {
          throw new Error("Missing client secret in response");
        }

        setStatus("connecting");

        const pc = new RTCPeerConnection();
        peerRef.current = pc;

        const audio = document.createElement("audio");
        audio.autoplay = true;
        audioRef.current = audio;

        pc.ontrack = (event) => {
          if (audioRef.current) {
            audioRef.current.srcObject = event.streams[0];
          }
        };

        const dataChannel = pc.createDataChannel("oai-events");
        dataChannelRef.current = dataChannel;
        dataChannel.addEventListener("message", handleServerEvent);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeral}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp ?? "",
        });

        if (!sdpResponse.ok) {
          const details = await sdpResponse.text();
          throw new Error(details || `SDP exchange failed with ${sdpResponse.status}`);
        }

        const answer = {
          type: "answer" as const,
          sdp: await sdpResponse.text(),
        };
        await pc.setRemoteDescription(answer);

        pc.onconnectionstatechange = () => {
          if (!peerRef.current) return;
          const state = peerRef.current.connectionState;
          if (state === "connected") {
            setStatus("connected");
          } else if (state === "failed" || state === "disconnected") {
            setStatus("error");
            setError(`Connection ${state}`);
          }
        };

        setStatus("connected");
        logEvent("connected");
      } catch (err) {
        console.error("Voice connection error", err);
        let errorMessage = err instanceof Error ? err.message : "Unknown error";

        if (err instanceof DOMException && err.name === "NotAllowedError") {
          errorMessage = "Microphone permission denied. Please enable access or continue in text mode.";
        }

        setError(errorMessage);
        setStatus("error");
        logEvent("error", { message: errorMessage });
        await cleanup();
      }
    },
    [baseConfig, cleanup, handleServerEvent, logEvent]
  );

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  const state = useMemo<VoiceSessionState>(
    () => ({ status, error, transcripts, lastLatencyMs }),
    [status, error, transcripts, lastLatencyMs]
  );

  const controls = useMemo<VoiceSessionControls>(
    () => ({
      connect,
      disconnect,
      sendEvent,
      setOnResponseCompleted: (handler) => {
        onResponseCompletedRef.current = handler;
      },
    }),
    [connect, disconnect, sendEvent]
  );

  return [state, controls];
}
