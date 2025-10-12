import { NextRequest, NextResponse } from "next/server";
import { generateDynamicSuggestions } from "@/lib/dynamic-suggestions";
import type { InsightKind } from "@/components/session-provider";

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as {
			insights?: Array<{ kind?: string; value?: string }>;
			limit?: number;
			votes?: Record<string, number>;
		};

		const insights = Array.isArray(body.insights)
			? body.insights
					.filter(
						(item): item is { kind: string; value: string } =>
							typeof item?.kind === "string" && typeof item?.value === "string"
					)
			: [];

		const votes: Record<string, 1 | 0 | -1> = {};
		if (body.votes && typeof body.votes === "object") {
			for (const [key, value] of Object.entries(body.votes)) {
				if (value === 1 || value === 0 || value === -1) {
					votes[key] = value;
				}
			}
		}

		const dynamic = await generateDynamicSuggestions({
			insights: insights.map((item) => ({
				kind: item.kind as InsightKind,
				value: item.value,
			})),
			votes,
			limit: typeof body.limit === "number" ? body.limit : undefined,
		});

		if (dynamic.length === 0 && process.env.NODE_ENV !== "production") {
			console.warn("[suggestions] dynamic generator returned no cards", {
				insightCount: insights.length,
				voteCount: Object.keys(votes).length,
			});
		}

		return NextResponse.json({ suggestions: dynamic });
	} catch (error) {
		console.error("Failed to build suggestions", error);
		return NextResponse.json(
			{ suggestions: [], error: "failed_to_build_suggestions" },
			{ status: 500 }
		);
	}
}
