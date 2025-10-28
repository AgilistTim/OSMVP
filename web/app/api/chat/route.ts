import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSystemPrompt } from "@/lib/system-prompt";

interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

interface ChatRequestBody {
  turns: ConversationTurn[];
  profile?: Record<string, unknown>;
  suggestions?: Array<{ id: string; title: string }>;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as ChatRequestBody;
  const { turns, profile, suggestions } = body;

  if (!Array.isArray(turns) || turns.length === 0) {
    return NextResponse.json(
      { error: "Invalid request: turns array required" },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });
  const basePrompt = await getSystemPrompt();

  // Build context about the user's profile and suggestions
  let contextInfo = "";
  if (profile) {
    const insights = (profile.insights as Array<{ kind: string; value: string }>) || [];
    if (insights.length > 0) {
      contextInfo += "\n\nUser insights discovered so far:\n";
      contextInfo += insights.map((i) => `- ${i.kind}: ${i.value}`).join("\n");
    }
  }
  if (suggestions && suggestions.length > 0) {
    contextInfo += "\n\nCareer suggestions shown to user:\n";
    contextInfo += suggestions.map((s) => `- ${s.title}`).join("\n");
  }

  const systemMessage = `${basePrompt}${contextInfo}

## CRITICAL RULE: NO REPETITION
**NEVER repeat back what the user just said.** If they say "AI and LLMs", DO NOT respond with "Sounds like you're into AI and large language models." They know what they said. Skip the echo and ask a specific follow-up question immediately.

❌ BAD: "That's awesome! Sounds like you're really into collecting and trading Pokémon cards."
✅ GOOD: "Nice! How do you decide which ones to trade?"

You are having a casual, peer-level conversation with a Gen Z user about their career interests, strengths, and aspirations. Keep responses:
- Short and conversational (2-3 sentences max)
- Curious and engaging, not formal or therapy-like
- Focused on understanding what they're into, what they're good at, and what they hope for
- UK English spelling and casual tone
- **Never repeat back what they just said** - move the conversation forward

Ask follow-up questions naturally. Avoid motivational interviewing language or being overly supportive. Just be a curious peer helping them explore.

## When Career Cards Are About To Be Generated
If you notice the user has shared enough about their interests, strengths, and goals (typically after 3-5 exchanges), naturally transition by saying something like:
- "That triggers some thoughts - let me generate some idea cards and share them with you..."
- "Based on what you've shared, let me pull together some career ideas you might vibe with..."
- "I'm seeing some patterns here - give me a sec to surface some options for you..."

Then continue the conversation naturally after the cards appear.`;

  // Convert turns to OpenAI message format
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemMessage },
  ];

  for (const turn of turns) {
    messages.push({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.text,
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      messages,
      temperature: 0.7,
      max_tokens: 150,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "Sorry, I didn't catch that. Can you say more?";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}

