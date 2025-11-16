import { NextRequest, NextResponse } from "next/server";
import type { ConversationPhase } from "@/lib/conversation-phases";
import { getSystemPrompt } from "@/lib/system-prompt";
import { REALTIME_VOICE_ID } from "@/lib/realtime-voice";

type TokenRequestBody = {
  sessionId?: string;
  voice?: string;
  instructions?: string;
  phase?: ConversationPhase;
};

interface OpenAIRealtimeResponse {
  client_secret?: {
    value: string;
    expires_at?: number;
  };
  value?: string;
  expires_at?: number;
  session?: Record<string, unknown>;
  [key: string]: unknown;
}

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY on server" },
      { status: 500 }
    );
  }

  let body: TokenRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const sessionId = body.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  const voice =
    typeof body.voice === "string" && body.voice.length > 0 ? body.voice : REALTIME_VOICE_ID;
  let instructions: string | undefined;
  const phase =
    typeof body.phase === "string" &&
    (body.phase === "warmup" ||
      body.phase === "story-mining" ||
      body.phase === "pattern-mapping" ||
      body.phase === "option-seeding" ||
      body.phase === "commitment")
      ? (body.phase as ConversationPhase)
      : undefined;

  if (typeof body.instructions === "string" && body.instructions.trim().length > 0) {
    instructions = body.instructions.trim();
  } else {
    instructions = await getSystemPrompt({ phase });
  }

  const sessionConfig: Record<string, unknown> = {
    type: "realtime",
    model: REALTIME_MODEL,
    audio: {
      output: {
        voice,
      },
      input: {
        transcription: {
          model: "whisper-1",
        },
      },
    },
  };

  if (instructions) {
    sessionConfig.instructions = instructions;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[realtime-token] issuing session", sessionId, "voice", voice);
    if (instructions) {
      console.info("[realtime-token] instructions snippet", instructions.slice(0, 240));
    }
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session: sessionConfig }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: "Failed to create realtime client secret",
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = (await response.json()) as OpenAIRealtimeResponse;

    if (!data.client_secret && data.value) {
      data.client_secret = {
        value: data.value,
        expires_at: typeof data.expires_at === "number" ? data.expires_at : undefined,
      };
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected error requesting realtime client secret",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
