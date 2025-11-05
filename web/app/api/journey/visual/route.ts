import { NextRequest, NextResponse } from "next/server";
import { buildJourneyVisualPlan, type JourneyVisualContext } from "@/lib/journey-visual";

const DEFAULT_IMAGE_MODEL = process.env.JOURNEY_IMAGE_MODEL ?? "gpt-image-1";
const DEFAULT_IMAGE_SIZE = process.env.JOURNEY_IMAGE_SIZE ?? "1536x1024";

type OpenAIImageResponse = {
	created?: number;
	data?: Array<{ b64_json?: string; url?: string }>;
	usage?: unknown;
};

function validateContext(raw: unknown): JourneyVisualContext | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const ctx = raw as JourneyVisualContext;
	if (!ctx.sessionId || typeof ctx.sessionId !== "string") {
		return null;
	}
	if (!ctx.profile || !Array.isArray(ctx.profile.insights) || !ctx.profile.inferredAttributes) {
		return null;
	}
	if (!Array.isArray(ctx.suggestions) || !ctx.votes) {
		return null;
	}
	return ctx;
}

export async function POST(req: NextRequest) {
	try {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: "missing_api_key", message: "OPENAI_API_KEY is not configured." },
				{ status: 500 }
			);
		}

		const body = (await req.json()) as { context?: unknown; model?: string; size?: string; quality?: string };
		const context = validateContext(body?.context);
		if (!context) {
			return NextResponse.json(
				{ error: "invalid_context", message: "Supplied context is incomplete." },
				{ status: 400 }
			);
		}

		if (context.profile.insights.length < 2 && context.profile.interests.length === 0) {
			return NextResponse.json(
				{
					error: "insufficient_data",
					message: "We need a little more insight from the conversation before sketching the journey.",
				},
				{ status: 409 }
			);
		}

		const plan = buildJourneyVisualPlan(context);

		const model = typeof body?.model === "string" ? body.model : DEFAULT_IMAGE_MODEL;
		const size = typeof body?.size === "string" ? body.size : DEFAULT_IMAGE_SIZE;
		const quality = typeof body?.quality === "string" ? body.quality : undefined;

		const requestPayload: Record<string, unknown> = {
			model,
			prompt: plan.imagePrompt,
			size,
			user: context.sessionId.slice(0, 64),
		};
		if (quality) {
			requestPayload.quality = quality;
		}
		const usesGptImage = /^gpt-image/i.test(model);
		if (!usesGptImage) {
			requestPayload.response_format = "b64_json";
		}

		const response = await fetch("https://api.openai.com/v1/images/generations", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(requestPayload),
		});

		if (!response.ok) {
			const errorPayload = await response.text();
			console.error("[journey/visual] OpenAI image generation failed", response.status, errorPayload);
			return NextResponse.json(
				{
					error: "image_generation_failed",
					status: response.status,
					message: "Could not generate the journey visual.",
					details: errorPayload,
				},
				{ status: 502 }
			);
		}

		const payload = (await response.json()) as OpenAIImageResponse;
		const image = payload?.data?.[0]?.b64_json;
		if (!image) {
			return NextResponse.json(
				{ error: "missing_image_data", message: "Image generation completed without returning data." },
				{ status: 502 }
			);
		}
		const createdAt = typeof payload.created === "number" ? payload.created * 1000 : Date.now();

		return NextResponse.json({
			image,
			plan,
			created: createdAt,
			usage: payload.usage ?? null,
			model,
			mimeType: "image/png",
		});
	} catch (error) {
		console.error("[journey/visual] Unexpected error", error);
		return NextResponse.json(
			{ error: "unexpected_error", message: "Something went wrong while generating the journey visual." },
			{ status: 500 }
		);
	}
}
