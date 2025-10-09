"use client";

import { useCallback, useMemo, useState } from "react";
import { Bookmark, MessageCircle, XIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { CareerSuggestion } from "@/components/session-provider";
import { useSession } from "@/components/session-provider";

interface SuggestionCardsProps {
	suggestions: CareerSuggestion[];
}

type ReactionValue = 1 | 0 | -1;

const PEEK_LABELS = ["Sounds fun", "Worth a peek", "Pass for now"];

const REACTION_CHOICES: Array<{
	label: string;
	value: ReactionValue;
	icon: React.ComponentType<{ className?: string }>;
	description: string;
}> = [
	{
		value: 1,
		label: "Save it",
		icon: Bookmark,
		description: "Keep this vibe handy",
	},
	{
		value: 0,
		label: "Maybe",
		icon: MessageCircle,
		description: "Think on it later",
	},
	{
		value: -1,
		label: "Skip",
		icon: XIcon,
		description: "Not your vibe",
	},
];

export function SuggestionCards({ suggestions }: SuggestionCardsProps) {
	const { voteCareer, votesByCareerId } = useSession();
	const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);

	const activeSuggestion = useMemo(
		() => suggestions.find((suggestion) => suggestion.id === activeSuggestionId) ?? null,
		[activeSuggestionId, suggestions]
	);

	const handleReaction = useCallback(
		(suggestionId: string, nextValue: ReactionValue) => {
			const current = votesByCareerId[suggestionId];
			if (current === nextValue) {
				voteCareer(suggestionId, null);
			} else {
				voteCareer(suggestionId, nextValue);
			}
		},
		[voteCareer, votesByCareerId]
	);

	const handleOpenDetails = useCallback((suggestionId: string) => {
		setActiveSuggestionId(suggestionId);
	}, []);

	const handleDrawerChange = useCallback((isOpen: boolean) => {
		if (!isOpen) {
			setActiveSuggestionId(null);
		}
	}, []);

	return (
		<section className="space-y-3">
			<header className="space-y-1.5">
				<h3 className="text-base font-semibold">Ideas people like you run with</h3>
				<p className="text-sm text-muted-foreground">
					React fast, dive deeper when something sparks. You’re in control the whole time.
				</p>
			</header>
			<div className="grid gap-3 sm:grid-cols-2">
				{suggestions.map((suggestion, index) => {
					const currentVote = votesByCareerId[suggestion.id];
					const peekLabel = PEEK_LABELS[index] ?? "Worth a peek";
					const headline = suggestion.whyItFits[0] ?? suggestion.summary;

					return (
						<Card
							key={suggestion.id}
							className="flex flex-col gap-3 rounded-2xl border-border/60 bg-card/60 p-4 shadow-sm transition hover:shadow-md"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="space-y-1">
									<Badge variant="secondary" className="text-xs tracking-wide">
										{peekLabel}
									</Badge>
									<h4 className="text-lg font-semibold leading-tight">{suggestion.title}</h4>
								</div>
							</div>
							<p className="text-sm leading-relaxed text-muted-foreground">{suggestion.summary}</p>
							{headline ? (
								<p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-muted-foreground">
									{headline}
								</p>
							) : null}
							<div className="flex flex-wrap gap-2">
								{REACTION_CHOICES.map((choice) => {
									const Icon = choice.icon;
									const isActive = currentVote === choice.value;
									return (
										<Button
											key={`${suggestion.id}-${choice.label}`}
											variant={isActive ? "default" : "outline"}
											size="sm"
											className={cn(
												"flex-1 min-w-[96px] justify-center gap-1 text-sm",
												isActive ? "border-transparent" : "border-border/60"
											)}
											onClick={() => handleReaction(suggestion.id, choice.value)}
											title={choice.description}
											type="button"
											aria-pressed={isActive}
										>
											<Icon className="size-4" aria-hidden />
											{choice.label}
										</Button>
									);
								})}
							</div>
							<Button
								variant="ghost"
								size="sm"
								className="self-start px-0 text-sm font-medium"
								onClick={() => handleOpenDetails(suggestion.id)}
								type="button"
							>
								See details
							</Button>
						</Card>
					);
				})}
			</div>

			<Drawer open={Boolean(activeSuggestion)} onOpenChange={handleDrawerChange}>
				<DrawerContent className="gap-0 rounded-t-3xl border border-border bg-background/95 shadow-xl">
					<DrawerHeader className="space-y-2">
						{activeSuggestion ? (
							<>
								<Badge variant="secondary" className="w-fit text-xs uppercase tracking-[0.12em]">
									{activeSuggestion.confidence === "high"
										? "Solid match"
										: activeSuggestion.confidence === "low"
										? "Loose spark"
										: "Worth exploring"}
								</Badge>
								<DrawerTitle className="text-left text-2xl font-semibold leading-tight">
									{activeSuggestion.title}
								</DrawerTitle>
								<DrawerDescription className="text-left text-base leading-relaxed text-muted-foreground">
									{activeSuggestion.summary}
								</DrawerDescription>
							</>
						) : null}
					</DrawerHeader>
					{activeSuggestion ? (
						<div className="space-y-6 px-4 pb-4">
							{activeSuggestion.whyItFits.length > 0 ? (
								<section className="space-y-2">
									<h5 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
										Why this feels like you
									</h5>
									<ul className="space-y-2 text-sm leading-relaxed">
										{activeSuggestion.whyItFits.map((reason, index) => (
											<li key={`${activeSuggestion.id}-reason-${index}`} className="rounded-lg bg-muted/50 p-3">
												{reason}
											</li>
										))}
									</ul>
								</section>
							) : null}
							{activeSuggestion.careerAngles.length > 0 ? (
								<section className="space-y-2">
									<h5 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
										If you ran with it
									</h5>
									<ul className="space-y-1 text-sm leading-relaxed">
										{activeSuggestion.careerAngles.map((angle, index) => (
											<li key={`${activeSuggestion.id}-angle-${index}`} className="flex items-start gap-2">
												<span className="mt-1 size-1.5 rounded-full bg-primary" aria-hidden />
												<span>{angle}</span>
											</li>
										))}
									</ul>
								</section>
							) : null}
							{activeSuggestion.nextSteps.length > 0 ? (
								<section className="space-y-2">
									<h5 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
										Tiny experiments to try
									</h5>
									<ul className="space-y-1 text-sm leading-relaxed">
										{activeSuggestion.nextSteps.map((step, index) => (
											<li key={`${activeSuggestion.id}-step-${index}`} className="flex items-start gap-2">
												<span className="mt-1 size-1.5 rounded-full bg-secondary" aria-hidden />
												<span>{step}</span>
											</li>
										))}
									</ul>
								</section>
							) : null}
						</div>
					) : null}
					<DrawerFooter className="border-t border-border bg-muted/40">
						{activeSuggestion ? (
							<div className="flex flex-wrap items-center gap-2">
								{REACTION_CHOICES.map((choice) => {
									const Icon = choice.icon;
									const current = votesByCareerId[activeSuggestion.id];
									const isActive = current === choice.value;
									return (
										<Button
											key={`drawer-${activeSuggestion.id}-${choice.label}`}
											variant={isActive ? "default" : "outline"}
											size="sm"
											className={cn("flex-1 min-w-[96px] justify-center gap-1 text-sm", isActive ? "border-transparent" : "")}
											onClick={() => handleReaction(activeSuggestion.id, choice.value)}
											type="button"
											aria-pressed={isActive}
										>
											<Icon className="size-4" aria-hidden />
											{choice.label}
										</Button>
									);
								})}
								<Button
									variant="ghost"
									size="sm"
									className="flex-1 min-w-[96px]"
									onClick={() => setActiveSuggestionId(null)}
									type="button"
								>
									Close
								</Button>
							</div>
						) : null}
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</section>
	);
}
