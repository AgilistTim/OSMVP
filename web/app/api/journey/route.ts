import { NextResponse } from "next/server";
import { buildJourneyPageData, type JourneyInput } from "@/lib/journey-page";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as unknown;
		if (!isJourneyInput(body)) {
			return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
		}

		const data = await buildJourneyPageData(body);
		return NextResponse.json({ data });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

function isJourneyInput(value: unknown): value is JourneyInput {
	if (!value || typeof value !== "object") {
		return false;
	}
	const input = value as JourneyInput;
	return (
		typeof input.user_name === "string" &&
		input.conversation_data !== undefined &&
		Array.isArray(input.voting_data?.saved)
	);
}
