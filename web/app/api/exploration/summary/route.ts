import { NextResponse } from "next/server";
import { generateExplorationSummary, type SummaryRequestPayload } from "@/lib/exploration-summary-engine";

export async function POST(req: Request) {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		return NextResponse.json(
			{ error: "OPENAI_API_KEY is not configured" },
			{ status: 500 }
		);
	}

	let payload: SummaryRequestPayload;
	try {
		payload = (await req.json()) as SummaryRequestPayload;
	} catch {
		return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
	}

	try {
		const summary = await generateExplorationSummary(payload, {
			apiKey,
			model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
		});
		return NextResponse.json({ summary });
	} catch (error) {
		console.error("[exploration/summary] failed", error);
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 502 });
	}
}

