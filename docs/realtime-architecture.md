# Realtime Architecture (Draft)

## Objectives

- Support both text and voice interactions in the onboarding flow through OpenAI Realtime models.
- Preserve existing readiness/profile logic even when the user speaks instead of typing.
- Shield OpenAI standard API keys from browsers and mobile clients.
- Keep the door open for non-browser clients (admin console, analytics workers) that may prefer WebSockets.

## Models & Features

| Capability | Model | Notes |
| --- | --- | --- |
| Conversation turns, text responses | `gpt-realtime` | Ally with the new unified WebRTC interface. |
| Voice rendering | Same session; configure `audio.output.voice` (start with `coral`). |
| Transcription | `input_audio_transcription: { model: "whisper-1", format: "text" }` to capture transcripts only. |
| Text-only fallback | Existing `/api/onboarding` endpoint (`gpt-4o-mini` or fallback logic). |

## Connection Options

### 1. Unified Interface (`/v1/realtime/calls`)

1. Browser gathers local SDP and posts it to our backend (`/api/realtime/session`).
2. Backend adds session configuration (model, voice, transcription settings) and forwards the SDP to OpenAI using the standard API key.
3. OpenAI returns the remote SDP answer. Backend relays it to the browser.

**Pros:** Simple client code; backend enforces configuration; no short-lived key minting.  
**Cons:** Our server sits in the critical path for every WebRTC negotiation. Need to scale for session churn.

### 2. Ephemeral Token (`/v1/realtime/client_secrets`)

1. Browser requests an ephemeral token from `/api/realtime/token`.
2. Backend mints the token via the OpenAI REST API. Tokens expire (~1 minute) and scope to a single session.
3. Browser posts its SDP directly to `https://api.openai.com/v1/realtime/calls` using that token.

**Pros:** Backend work is light; negotiation happens directly with OpenAI; tokens reduce risk if intercepted.  
**Cons:** Browser holds temporary credential; session config must be encoded server-side when token is issued.

### Decision

We will adopt **ephemeral tokens** for the onboarding voice experience:

- Negotiation latency stays low because the browser speaks directly to OpenAI once it has a token.
- Our backend remains responsible only for minting tokens, logging usage, and applying per-user/session policy.
- Short-lived credentials minimize exposure while avoiding long-lived API keys in the browser.

We will still implement a thin `/api/realtime/session` endpoint later if we need unified sessions for staff tooling or analytics playback.

## High-Level Flow (Voice Mode)

```
User mic -> WebRTC PeerConnection (browser)
           | audio track + data channel
           v
OpenAI Realtime session (via ephemeral token)
           | server-sent data-channel events + audio track
           v
Browser playback + UI state update (progress, transcripts)
```

### Sequence (Text + Voice Shared State)

```
Participant selects "Voice" mode
   -> App requests token (/api/realtime/token)
   -> Backend validates session, calls /v1/realtime/client_secrets, returns token
   -> Browser creates RTCPeerConnection, adds mic track, data channel "oai-events"
           -> Browser posts SDP offer to /v1/realtime/calls (model `gpt-realtime`) with ephemeral token
   -> OpenAI returns SDP answer; browser sets remote description
   -> Audio track from model auto-plays (remote stream)
   -> Data channel conveys conversation events (e.g. transcripts, item updates)
   -> Client adapts to events:
        - `response.audio_transcript.done`: update transcript log, set profile highlights (no raw audio persisted)
        - `response.completed`: increment question step, update progress bar
        - `error`: display fallback prompt to continue in text mode
   -> When user finishes, browser closes peer connection; backend records session for analytics
```

### Turn Detection & Controls

- Default to **server VAD** (`turn_detection: { type: "server_vad" }`) for hands-free flow.
- Provide manual push-to-talk button; toggling back to manual pauses audio capture and disables automatic turn detection via data channel event.
- We will surface connection state (connecting, listening, speaking) via the session provider so text UI shows consistent progress percentage.

## Backend Components

| Component | Endpoint | Responsibility |
| --- | --- | --- |
| Token issuer | `POST /api/realtime/token` | Authenticates the onboarding session, requests ephemeral key from OpenAI, returns `{ value, expires_at }`. Logs session metadata for analytics. |
| Session store (existing) | — | Stores readiness, profile, votes. Reused for both text and voice. |
| Optional relay (later) | `POST /api/realtime/session` | Implements unified-interface fallback (not in first release). |

### Auth & Rate Limiting

- Require an active onboarding session ID (UUID) in the token request body.  
- Rate-limit token issuance per session (e.g. one active voice connection at a time).  
- Expire tokens server-side if the user abandons the flow (cleanup task).

## Frontend Integration

1. **Session Provider**
   - Add `voiceConnection` state: `{ status: 'idle'|'connecting'|'active'|'error', peer?: RTCPeerConnection }`.
   - Store transcripts, last latency measurement, and error message.
   - Share readiness/progress state with text mode (increment step when either voice or text turn completes).

2. **Voice Controls**
   - `useVoiceSession` hook wraps token fetch, RTCPeerConnection creation, and event listeners.  
   - Hook emits events to UI components (e.g. show `Listening…`, `Processing…`).

3. **Progress Display**
   - When receiving `response.audio_transcript.done`, append transcript to the conversation log.  
   - When receiving `response.completed`, call existing progress increment logic.

4. **Fallback Handling**
   - If WebRTC fails (ICE failure, token expired, permission denied), surface a toast and offer to continue via text (auto-focus text input).  
   - Log failures with reason codes for analytics.

## Fallback & Offline Scenarios

- Browser denies microphone -> keep user in text mode, record "voice_denied" telemetry.  
- Token request fails (network/API) -> show retry; after two failures, fall back to text (`/api/onboarding`).  
- Connection drops mid-turn -> attempt reconnect (new token). If repeated, switch to text.

## Telemetry & Analytics

- Token issuance log: session ID, user agent, timestamp, expiry.  
- Connection lifecycle: `connecting`, `connected`, `disconnected`, `error`.  
- Latency metrics: time from `response.create` event to first audio frame; track distribution.

## Implementation Tasks

| Task ID | Summary |
| --- | --- |
| `dca40575-0134-484a-a816-9efe0d3e69e9` | Finalize this architecture document (move to confluence/notion if needed) and create sequence diagrams. |
| `16731eca-f2c5-444e-9aeb-9a58924727af` | Implement `/api/realtime/token` endpoint and supporting client-secret call. |
| `6f731ec7-7080-4f46-9947-cba9e2019e76` | Build voice UI integration (hook + components) atop WebRTC. |
| TBD | (Optional) unified interface relay for non-browser clients.

## Open Questions

- Which Realtime voice best matches brand tone? (Start with `coral`, test others.)
- Do we need to store raw audio for analytics/compliance? If so, consider server-side recording of outbound/inbound streams.
- Should voice and text share a conversation history for reporting? Consider storing Realtime transcripts alongside text turns.
