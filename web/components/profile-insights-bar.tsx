"use client";

import { useId, useMemo, useState } from "react";
import { Sparkles, Trophy, Target, ChevronDown } from "lucide-react";
import type { ProfileInsight } from "@/components/session-provider";
import { cn } from "@/lib/utils";

type InsightSummary = {
	interests: string[];
	strengths: string[];
	goals: string[];
};

function dedupe(values: string[] = []): string[] {
	const set = new Set<string>();
	const result: string[] = [];
	values.forEach((value) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		const key = trimmed.toLowerCase();
		if (set.has(key)) return;
		set.add(key);
		result.push(trimmed);
	});
	return result;
}

const ICONS = {
	interests: Sparkles,
	strengths: Trophy,
	goals: Target,
};

const TITLES: Record<keyof InsightSummary, string> = {
	interests: "Interests",
	strengths: "Strengths",
	goals: "Goals",
};

export function ProfileInsightsBar({
	insights,
	actions,
}: {
	insights: ProfileInsight[];
	actions?: React.ReactNode;
}) {
	const summary = useMemo<InsightSummary>(() => {
		const interests = dedupe(insights.filter((item) => item.kind === "interest").map((item) => item.value));
		const strengths = dedupe(insights.filter((item) => item.kind === "strength").map((item) => item.value));
		const goals = dedupe(
			insights
				.filter((item) => item.kind === "goal" || item.kind === "hope")
				.map((item) => item.value)
		);
		return { interests, strengths, goals };
	}, [insights]);

	const hasAny = summary.interests.length + summary.strengths.length + summary.goals.length > 0;
	const [expanded, setExpanded] = useState(false);

	if (!hasAny && !actions) return null;

	const contentId = useId();

	return (
		<div className={cn("profile-insights-bar", expanded ? "profile-insights-bar--expanded" : "")}>
			{actions ? <div className="insights-actions">{actions}</div> : null}
			{hasAny ? (
				<>
					<button
						type="button"
						className="insights-trigger"
						onClick={() => setExpanded((prev) => !prev)}
						aria-expanded={expanded}
						aria-controls={contentId}
					>
						<div className="insights-trigger-content">
							{(Object.keys(summary) as Array<keyof InsightSummary>).map((key) => {
								const Icon = ICONS[key];
								const count = summary[key].length;
								const label = TITLES[key];
								return (
									<span key={key} className={cn("insights-chip", count === 0 ? "insights-chip--empty" : "")}>
										<Icon className="size-4" aria-hidden />
										<span>{label}</span>
										<span className="count">{count}</span>
									</span>
								);
							})}
						</div>
						<ChevronDown className={cn("size-5 transition", expanded ? "rotate-180" : "")} aria-hidden />
						<span className="visually-hidden">
							{expanded ? "Hide insight details" : "Show insight details"}
						</span>
					</button>
					{expanded ? (
						<div className="insights-expanded" id={contentId}>
							{(Object.keys(summary) as Array<keyof InsightSummary>).map((key) => {
								const items = summary[key];
								if (items.length === 0) return null;
								return (
									<section key={`expanded-${key}`} className="insight-expanded-section">
										<header className="insight-expanded-header">
											<span>{TITLES[key]}</span>
										</header>
										<ul>
											{items.map((item) => (
												<li key={`${key}-${item.toLowerCase()}`}>
													<span aria-hidden>○</span>
													{item}
												</li>
											))}
										</ul>
									</section>
								);
							})}
						</div>
					) : null}
				</>
			) : null}
		</div>
	);
}
