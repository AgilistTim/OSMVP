import { NextRequest, NextResponse } from "next/server";
import { matchCareerVibes } from "@/lib/vibe-matcher";
import type { MatchCareerVibesInput } from "@/lib/vibe-matcher";

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as {
			insights?: Array<{ kind?: string; value?: string }>;
			limit?: number;
		};

		const insights = Array.isArray(body.insights)
			? body.insights
					.filter(
						(item): item is { kind: string; value: string } =>
							typeof item?.kind === "string" && typeof item?.value === "string"
					)
			: [];

		const suggestions = matchCareerVibes({
			insights: insights.map((item) => ({
				kind: item.kind as MatchCareerVibesInput["insights"][number]["kind"],
				value: item.value,
			})),
			limit: typeof body.limit === "number" ? body.limit : undefined,
		});

		return NextResponse.json({ suggestions });
	} catch (error) {
		console.error("Failed to build suggestions", error);
		return NextResponse.json(
			{ suggestions: [], error: "failed_to_build_suggestions" },
			{ status: 500 }
		);
	}
}
