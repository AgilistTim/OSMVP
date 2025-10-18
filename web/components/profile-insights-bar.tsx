"use client";

import { useMemo, useState } from "react";
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

	return (
		<div className={cn("profile-insights-bar", expanded ? "profile-insights-bar--expanded" : "")}>
			{actions ? <div className="insights-actions">{actions}</div> : null}
			{hasAny ? (
				<>
					<div className="insights-summary">
						{(Object.keys(summary) as Array<keyof InsightSummary>).map((key) => {
							const Icon = ICONS[key];
							const count = summary[key].length;
							const label = TITLES[key];
							return (
								<button
									key={key}
									type="button"
									className="insight-badge"
									onClick={() => setExpanded((prev) => (count === 0 ? prev : !prev))}
									disabled={count === 0}
								>
									<Icon className="size-4" aria-hidden />
									<span>{label}</span>
									<span className="count">{count}</span>
								</button>
							);
						})}
						<button
							type="button"
							className="insight-toggle"
							onClick={() => setExpanded((prev) => !prev)}
							aria-label={expanded ? "Hide insight details" : "Show insight details"}
						>
							<ChevronDown className={cn("size-4 transition", expanded ? "rotate-180" : "")} aria-hidden />
						</button>
					</div>
					{expanded ? (
						<div className="insights-expanded">
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
