import { NextRequest, NextResponse } from "next/server";
import { generateDynamicSuggestions } from "@/lib/dynamic-suggestions";
import type { CardDistance } from "@/lib/dynamic-suggestions";
import type { InsightKind } from "@/components/session-provider";

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as {
			insights?: Array<{ kind?: string; value?: string }>;
			limit?: number;
			votes?: Record<string, number>;
			transcript?: Array<{ role?: string; text?: string }>;
			previousSuggestions?: Array<{ id?: string; title?: string; summary?: string; distance?: string }>;
			focusStatement?: string;
			attributes?: {
				skills?: unknown;
				aptitudes?: unknown;
				workStyles?: unknown;
			};
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

        const transcript = Array.isArray(body.transcript)
            ? body.transcript
                .filter((item): item is { role: string; text: string } =>
                    typeof item?.role === "string" && typeof item?.text === "string")
            : [];

        const transcriptSummary = transcript
            .filter((item) => item.text.trim().length > 0)
            .map((item) => `${item.role}: ${item.text.trim()}`)
            .join(" \n ");

        const focusStatement = typeof body.focusStatement === "string" && body.focusStatement.trim().length > 0
            ? body.focusStatement.trim()
            : undefined;

        const previousSuggestions = Array.isArray(body.previousSuggestions)
            ? body.previousSuggestions
                .filter((item): item is { id?: string; title: string; summary?: string; distance?: string } =>
                    typeof item?.title === "string")
                .map((item) => {
                    const distance: CardDistance | undefined =
                        item.distance === "core" || item.distance === "adjacent" || item.distance === "unexpected"
                            ? item.distance
                            : undefined;
                    return {
                        title: item.title,
                        summary: typeof item.summary === "string" ? item.summary : undefined,
                        distance,
                    };
                })
            : [];

		type AttributeInput = {
			label: string;
			confidence?: "low" | "medium" | "high";
			stage?: "established" | "developing" | "hobby";
		};

		const attributes = (() => {
			const raw = body.attributes;
			if (!raw || typeof raw !== "object") {
				return undefined;
			}
			const toList = (value: unknown): AttributeInput[] => {
				if (!Array.isArray(value)) {
					return [];
				}
				const result: AttributeInput[] = [];
				for (const item of value) {
					if (typeof item !== "object" || item === null) {
						continue;
					}
					const labelValue = (item as { label?: unknown }).label;
					if (typeof labelValue !== "string") {
						continue;
					}
					const label = labelValue.trim();
					if (!label) {
						continue;
					}
					const confidenceValue = (item as { confidence?: unknown }).confidence;
					const confidence =
						confidenceValue === "low" || confidenceValue === "medium" || confidenceValue === "high"
							? confidenceValue
							: undefined;
					const stageValue = (item as { stage?: unknown }).stage;
					const stage =
						stageValue === "established" || stageValue === "developing" || stageValue === "hobby"
							? stageValue
							: undefined;
					result.push({ label, confidence, stage });
				}
				return result;
			};
			const skills = toList((raw as { skills?: unknown }).skills);
			const aptitudes = toList((raw as { aptitudes?: unknown }).aptitudes);
			const workStyles = toList((raw as { workStyles?: unknown }).workStyles);
			if (skills.length === 0 && aptitudes.length === 0 && workStyles.length === 0) {
				return undefined;
			}
			return { skills, aptitudes, workStyles };
		})();

		const dynamic = await generateDynamicSuggestions({
			insights: insights.map((item) => ({
				kind: item.kind as InsightKind,
				value: item.value,
			})),
			votes,
			limit: typeof body.limit === "number" ? body.limit : undefined,
			recentTurns: transcript,
            transcriptSummary: transcriptSummary.length > 0 ? transcriptSummary : undefined,
            focusStatement,
			previousSuggestions,
            attributes,
		});

		if (dynamic.length === 0 && process.env.NODE_ENV !== "production") {
			console.warn("[suggestions] dynamic generator returned no cards", {
				insightCount: insights.length,
				voteCount: Object.keys(votes).length,
			});
		}

		return NextResponse.json({ suggestions: dynamic });
	} catch (error) {
		console.error("[suggestions] Failed to build suggestions:", error);
		if (error instanceof Error) {
			console.error("[suggestions] Error message:", error.message);
			console.error("[suggestions] Error stack:", error.stack);
		}
		return NextResponse.json(
			{ suggestions: [], error: "failed_to_build_suggestions", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}
