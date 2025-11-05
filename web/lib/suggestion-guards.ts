import type { InsightKind } from "@/components/session-provider";

export function hasRequiredInsightMix(
	insights: Array<{ kind: InsightKind }>
): boolean {
	const kinds = new Set(insights.map((item) => item.kind));
	const hasInterest = kinds.has("interest");
	const hasStrength = kinds.has("strength");
	const hasGoalOrHope = kinds.has("goal") || kinds.has("hope");
	return hasInterest && hasStrength && hasGoalOrHope;
}

export type AttributeStage = "established" | "developing" | "hobby";

export interface AttributeEntry {
	label: string;
	stage?: AttributeStage;
}

export interface AttributeSnapshotInput {
	skills: AttributeEntry[];
	aptitudes: AttributeEntry[];
	workStyles: AttributeEntry[];
}

export interface AttributeSignalSummary {
	careerSignalCount: number;
	developingSignalCount: number;
	hobbySignalCount: number;
	primaryHobbyLabel?: string;
}

const CATEGORY_KEYS: Array<keyof AttributeSnapshotInput> = ["skills", "aptitudes", "workStyles"];

export function summarizeAttributeSignals(input: AttributeSnapshotInput): AttributeSignalSummary {
	let careerSignalCount = 0;
	let developingSignalCount = 0;
	let hobbySignalCount = 0;
	let primaryHobbyLabel: string | undefined;

	for (const category of CATEGORY_KEYS) {
		for (const entry of input[category]) {
			const label = entry.label?.trim();
			if (!label) {
				continue;
			}
			if (entry.stage === "established") {
				careerSignalCount += 1;
			} else if (entry.stage === "developing") {
				developingSignalCount += 1;
			} else {
				hobbySignalCount += 1;
				if (!primaryHobbyLabel) {
					primaryHobbyLabel = label;
				}
			}
		}
	}

	return {
		careerSignalCount,
		developingSignalCount,
		hobbySignalCount,
		primaryHobbyLabel,
	};
}
