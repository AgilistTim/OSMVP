"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RealtimeSessionConfig {
  sessionId: string;
  instructions?: string;
  voice?: string;
  enableMicrophone?: boolean;
  enableAudioOutput?: boolean;
}

export type RealtimeStatus =
  | "idle"
  | "requesting-token"
  | "connecting"
  | "connected"
  | "error";

export interface RealtimeTranscriptItem {
  id: string;
  text: string;
  createdAt: number;
  isFinal: boolean;
  role: "user" | "assistant";
}

export interface RealtimeSessionState {
  status: RealtimeStatus;
  error?: string;
  transcripts: RealtimeTranscriptItem[];
  lastLatencyMs?: number;
}

export interface RealtimeSessionControls {
  connect: (config?: Partial<RealtimeSessionConfig>) => Promise<void>;
  disconnect: () => Promise<void>;
  sendEvent: (event: unknown) => void;
  setOnResponseCompleted: (handler: (() => void) | null) => void;
  waitForConversationItem: (id: string) => Promise<void>;
}

export function useRealtimeSession(baseConfig: RealtimeSessionConfig): [
  RealtimeSessionState,
  RealtimeSessionControls
] {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const [transcripts, setTranscripts] = useState<RealtimeTranscriptItem[]>([]);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | undefined>();

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const responseStartTimesRef = useRef<Map<string, number>>(new Map());
  const onResponseCompletedRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<RealtimeStatus>("idle");
  const pendingEventsRef = useRef<unknown[]>([]);
  const pendingItemResolversRef = useRef<
    Map<string, (status: "added" | "closed") => void>
  >(new Map());

  const enableMicrophoneDefault = baseConfig.enableMicrophone ?? true;
  const enableAudioOutputDefault = baseConfig.enableAudioOutput ?? true;

  const logEvent = useCallback((name: string, details?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[realtime]", name, details ?? {});
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
    pendingEventsRef.current = [];
    pendingItemResolversRef.current.forEach((resolve) => resolve("closed"));
    pendingItemResolversRef.current.clear();
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

      const extractTranscriptId = () =>
        (event.response_id as string | undefined) ||
        (event.item_id as string | undefined) ||
        (typeof event.item === "object" && event.item && "id" in event.item
          ? (event.item.id as string | undefined)
          : undefined);

      const coerceTranscriptText = (...candidates: unknown[]) => {
        for (const candidate of candidates) {
          if (typeof candidate === "string" && candidate.trim().length > 0) {
            return candidate;
          }
          if (candidate && typeof candidate === "object") {
            const textCandidate =
              typeof (candidate as { text?: unknown }).text === "string"
                ? ((candidate as { text: string }).text)
                : typeof (candidate as { transcript?: unknown }).transcript === "string"
                ? ((candidate as { transcript: string }).transcript)
                : undefined;
            if (textCandidate && textCandidate.trim().length > 0) {
              return textCandidate;
            }
          }
        }
        return undefined;
      };

      const handleTranscriptDelta = (
        id: string | undefined,
        delta: string | undefined,
        role: "user" | "assistant"
      ) => {
        if (!id || !delta) {
          return;
        }
        setTranscripts((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === id);
          if (existingIndex >= 0) {
            const existing = prev[existingIndex];
            const updated: RealtimeTranscriptItem = {
              ...existing,
              text: `${existing.text}${delta}`,
              isFinal: false,
              role: existing.role,
            };
            return [updated, ...prev.filter((_, index) => index !== existingIndex)];
          }

          return [
            {
              id,
              text: delta,
              createdAt: Date.now(),
              isFinal: false,
              role,
            },
            ...prev,
          ];
        });
      };

      const handleTranscriptFinal = (
        id: string | undefined,
        transcript: string | undefined,
        roleHint: "user" | "assistant"
      ) => {
        if (!id || !transcript) {
          return;
        }
        setTranscripts((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === id);
          const finalItem: RealtimeTranscriptItem = {
            id,
            text: transcript.trim(),
            createdAt: Date.now(),
            isFinal: true,
            role: existingIndex >= 0 ? prev[existingIndex].role : roleHint,
          };

          if (existingIndex >= 0) {
            return [finalItem, ...prev.filter((_, index) => index !== existingIndex)];
          }

          return [finalItem, ...prev];
        });
      };

      switch (type) {
        case "conversation.item.added": {
          const itemId: string | undefined = event.item?.id;
          if (itemId && pendingItemResolversRef.current.has(itemId)) {
            const resolver = pendingItemResolversRef.current.get(itemId);
            resolver?.("added");
            pendingItemResolversRef.current.delete(itemId);
          }
          break;
        }
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
        case "response.audio_transcript.delta":
        case "response.output_audio_transcript.delta":
        case "response.output_text.delta":
        case "response.delta": {
          const id = extractTranscriptId();
          const text = coerceTranscriptText(event.delta, event.text, event.transcript);
          handleTranscriptDelta(id, text, "assistant");
          break;
        }
        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done":
        case "response.output_text.done": {
          const id = extractTranscriptId();
          const text = coerceTranscriptText(event.transcript, event.text, event.delta);
          handleTranscriptFinal(id, text?.trim(), "assistant");
          break;
        }
        case "conversation.item.input_audio_transcription.delta": {
          const id = extractTranscriptId();
          const text = coerceTranscriptText(event.delta, event.text, event.transcript);
          handleTranscriptDelta(id, text, "user");
          break;
        }
        case "conversation.item.input_audio_transcription.completed":
        case "conversation.item.input_audio_transcription.done": {
          const id = extractTranscriptId();
          const text = coerceTranscriptText(event.transcript, event.text, event.delta);
          handleTranscriptFinal(id, text?.trim(), "user");
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("Failed to parse realtime event", err);
    }
  }, []);

  const flushPendingEvents = useCallback(() => {
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      return;
    }

    for (const event of pendingEventsRef.current) {
      channel.send(JSON.stringify(event));
    }
    pendingEventsRef.current = [];
  }, []);

  const sendEvent = useCallback(
    (event: unknown) => {
      const channel = dataChannelRef.current;
      if (channel?.readyState === "open") {
        channel.send(JSON.stringify(event));
        return;
      }

      pendingEventsRef.current = [...pendingEventsRef.current, event];
    },
    []
  );

  const connect = useCallback(
    async (overrideConfig?: Partial<RealtimeSessionConfig>) => {
      const effectiveSessionId = overrideConfig?.sessionId ?? baseConfig.sessionId;
      if (!effectiveSessionId) {
        setError("Session ID is required for realtime connection");
        setStatus("error");
        return;
      }

      setError(undefined);
      if (
        statusRef.current === "requesting-token" ||
        statusRef.current === "connecting" ||
        statusRef.current === "connected"
      ) {
        return;
      }

      setStatus("requesting-token");

      try {
        const response = await fetch("/api/realtime/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...baseConfig,
            ...overrideConfig,
            sessionId: effectiveSessionId,
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

        const enableAudioOutput =
          overrideConfig?.enableAudioOutput ?? enableAudioOutputDefault;
        const enableMicrophone =
          overrideConfig?.enableMicrophone ?? enableMicrophoneDefault;

        const audioDirection = enableMicrophone
          ? enableAudioOutput
            ? "sendrecv"
            : "sendonly"
          : "recvonly";

        pc.addTransceiver("audio", { direction: audioDirection });

        if (enableAudioOutput) {
          const audio = document.createElement("audio");
          audio.autoplay = true;
          audioRef.current = audio;
          pc.ontrack = (event) => {
            if (audioRef.current) {
              audioRef.current.srcObject = event.streams[0];
            }
          };
        }

        const dataChannel = pc.createDataChannel("oai-events");
        dataChannelRef.current = dataChannel;
        dataChannel.addEventListener("message", handleServerEvent);
        dataChannel.addEventListener("open", flushPendingEvents);

        if (enableMicrophone) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        }

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
        console.error("Realtime connection error", err);
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
    [baseConfig, enableAudioOutputDefault, enableMicrophoneDefault, cleanup, handleServerEvent, logEvent]
  );

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  const state = useMemo<RealtimeSessionState>(
    () => ({ status, error, transcripts, lastLatencyMs }),
    [status, error, transcripts, lastLatencyMs]
  );

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const waitForConversationItem = useCallback((id: string): Promise<void> => {
    if (!id) {
      return Promise.resolve();
    }

    if (pendingItemResolversRef.current.has(id)) {
      pendingItemResolversRef.current.delete(id);
    }

    return new Promise<void>((resolve, reject) => {
      pendingItemResolversRef.current.set(id, (status) => {
        if (status === "added") {
          resolve();
        } else {
          reject(new Error("Conversation item was not acknowledged"));
        }
      });
    });
  }, []);

  const controls = useMemo<RealtimeSessionControls>(
    () => ({
      connect,
      disconnect,
      sendEvent,
      setOnResponseCompleted: (handler) => {
        onResponseCompletedRef.current = handler;
      },
      waitForConversationItem,
    }),
    [connect, disconnect, sendEvent, waitForConversationItem]
  );

  return [state, controls];
}
