"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Play, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
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

type CardVariant = "panel" | "inline";

interface SuggestionCardsProps {
	suggestions: CareerSuggestion[];
	variant?: CardVariant;
	layout?: "carousel" | "grid";
	title?: string;
	description?: string;
	showHeader?: boolean;
	emptyState?: React.ReactNode;
	className?: string;
	onReaction?: (payload: {
		suggestion: CareerSuggestion;
		previousValue: ReactionValue | null | undefined;
		nextValue: ReactionValue | null;
	}) => void;
}

type ReactionValue = 1 | 0 | -1;

const CONFIDENCE_LABELS: Record<CareerSuggestion["confidence"], string> = {
	high: "Feels like you",
	medium: "Worth exploring",
	low: "Loose spark",
};

const FALLBACK_BADGES = ["Worth exploring", "Fresh spark", "Another angle"];

const REACTION_CHOICES: Array<{
	label: string;
	value: ReactionValue;
	icon: React.ComponentType<{ className?: string }>;
	description: string;
}> = [
	{
		value: 1,
		label: "Upvote",
		icon: ThumbsUp,
		description: "Lock it in as a favourite",
	},
	{
		value: 0,
		label: "Maybe",
		icon: MessageCircle,
		description: "Think on it later",
	},
	{
		value: -1,
		label: "Downvote",
		icon: ThumbsDown,
		description: "Doesn’t fit right now",
	},
];

type InlineCardState = "idle" | "entering" | "exiting";

interface DisplayCard {
	suggestion: CareerSuggestion;
	state: InlineCardState;
}

const ENTER_ANIMATION_MS = 220;
const EXIT_ANIMATION_MS = 420;

export function SuggestionCards({
	suggestions,
	variant = "panel",
	layout = "carousel",
	title,
	description,
	showHeader,
	emptyState = null,
	className,
	onReaction,
}: SuggestionCardsProps) {
	const { voteCareer, votesByCareerId } = useSession();
	const carouselRef = useRef<HTMLDivElement | null>(null);
	const [carouselFade, setCarouselFade] = useState<{ showStart: boolean; showEnd: boolean }>({
		showStart: false,
		showEnd: false,
	});
	const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
	const [displayCards, setDisplayCards] = useState<DisplayCard[]>(
		suggestions.map((suggestion) => ({ suggestion, state: "idle" }))
	);

	const isInline = variant === "inline";
	const shouldShowHeader = showHeader ?? variant !== "inline";
	const isGridLayout = layout === "grid";
	const isCarouselLayout = layout === "carousel";

	useEffect(() => {
		if (!isInline) {
			setDisplayCards(suggestions.map((suggestion) => ({ suggestion, state: "idle" })));
			return;
		}

		setDisplayCards((previous) => {
			const previousMap = new Map(previous.map((item) => [item.suggestion.id, item]));
			const nextIds = new Set(suggestions.map((item) => item.id));

			const nextCards: DisplayCard[] = suggestions.map((suggestion) => {
				const existing = previousMap.get(suggestion.id);
				if (existing) {
					return { suggestion, state: existing.state === "exiting" ? "exiting" : "idle" };
				}
				return { suggestion, state: "entering" };
			});

			previous.forEach((item) => {
				if (!nextIds.has(item.suggestion.id)) {
					nextCards.push(
						item.state === "exiting"
							? item
							: {
									suggestion: item.suggestion,
									state: "exiting",
								}
					);
				}
			});

			return nextCards;
		});
	}, [suggestions, isInline]);

	useEffect(() => {
		if (!isInline) return;
		if (!displayCards.some((card) => card.state === "entering")) return;
		const timeout = window.setTimeout(() => {
			setDisplayCards((prev) =>
				prev.map((card) => (card.state === "entering" ? { ...card, state: "idle" } : card))
			);
		}, ENTER_ANIMATION_MS);
		return () => window.clearTimeout(timeout);
	}, [displayCards, isInline]);

	useEffect(() => {
		if (!isCarouselLayout) {
			setCarouselFade((prev) =>
				prev.showStart || prev.showEnd ? { showStart: false, showEnd: false } : prev
			);
			return;
		}

		const container = carouselRef.current;
		if (!container) {
			return;
		}

		let rafId: number | null = null;

		const computeFadeState = () => {
			rafId = null;
			const { scrollLeft, scrollWidth, clientWidth } = container;
			const overflow = scrollWidth - clientWidth > 8;
			if (!overflow) {
				setCarouselFade((prev) => (prev.showStart || prev.showEnd ? { showStart: false, showEnd: false } : prev));
				return;
			}
			const maxScroll = scrollWidth - clientWidth;
			const atStart = scrollLeft <= 4;
			const atEnd = scrollLeft >= maxScroll - 4;
			setCarouselFade((prev) => {
				const next = { showStart: !atStart, showEnd: !atEnd };
				if (prev.showStart === next.showStart && prev.showEnd === next.showEnd) {
					return prev;
				}
				return next;
			});
		};

		const scheduleUpdate = () => {
			if (rafId !== null) return;
			rafId = window.requestAnimationFrame(computeFadeState);
		};

		scheduleUpdate();
		container.addEventListener("scroll", scheduleUpdate, { passive: true });

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver === "function") {
			resizeObserver = new ResizeObserver(() => scheduleUpdate());
			resizeObserver.observe(container);
		}

		return () => {
			container.removeEventListener("scroll", scheduleUpdate);
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
			}
			resizeObserver?.disconnect();
		};
	}, [suggestions, isInline, isCarouselLayout]);

	useEffect(() => {
		if (!isInline) return;
		if (!displayCards.some((card) => card.state === "exiting")) return;
		const timeout = window.setTimeout(() => {
			setDisplayCards((prev) => prev.filter((card) => card.state !== "exiting"));
		}, EXIT_ANIMATION_MS);
		return () => window.clearTimeout(timeout);
	}, [displayCards, isInline]);

	const cardsToRender = isInline
		? displayCards
		: suggestions.map((suggestion) => ({ suggestion, state: "idle" as InlineCardState }));

	const activeSuggestion = useMemo(
		() => suggestions.find((suggestion) => suggestion.id === activeSuggestionId) ?? null,
		[activeSuggestionId, suggestions]
	);

	const handleReaction = useCallback(
		(suggestion: CareerSuggestion, nextValue: ReactionValue) => {
			const suggestionId = suggestion.id;
			const current = votesByCareerId[suggestionId];
			if (current === nextValue) {
				voteCareer(suggestionId, null);
				onReaction?.({
					suggestion,
					previousValue: current ?? null,
					nextValue: null,
				});
			} else {
				voteCareer(suggestionId, nextValue);
				onReaction?.({
					suggestion,
					previousValue: current ?? null,
					nextValue,
				});
			}
		},
		[onReaction, voteCareer, votesByCareerId]
	);

	const handleOpenDetails = useCallback((suggestionId: string) => {
		setActiveSuggestionId(suggestionId);
	}, []);

	const handleDrawerChange = useCallback((isOpen: boolean) => {
		if (!isOpen) {
			setActiveSuggestionId(null);
		}
	}, []);

	const resolvedTitle =
		title ?? (variant === "panel" ? "Ideas people like you run with" : "Fresh sparks waiting for you");
	const resolvedDescription =
		description ??
		(variant === "panel"
			? "React fast, dive deeper when something sparks. You’re in control the whole time."
			: undefined);

	return (
		<section
			className={cn(
				"suggestion-cards-root",
				isInline ? "suggestion-cards-inline" : "suggestion-cards-panel",
				className
			)}
			aria-label="Career ideas you can explore"
		>
			{shouldShowHeader ? (
				<header className="space-y-1.5">
					<h3 className="text-base font-semibold">{resolvedTitle}</h3>
					{resolvedDescription ? (
						<p className="text-sm text-muted-foreground">{resolvedDescription}</p>
					) : null}
				</header>
			) : null}
			<div
				ref={carouselRef}
				className={cn(
					"suggestion-carousel",
					isInline ? "suggestion-carousel-inline" : "suggestion-carousel-panel",
					isGridLayout ? "suggestion-carousel-grid" : "",
					carouselFade.showStart ? "suggestion-carousel-fade-start" : "",
					carouselFade.showEnd ? "suggestion-carousel-fade-end" : ""
				)}
			>
				<div className={cn("suggestion-track", isGridLayout ? "suggestion-track-grid" : "")}>
					{cardsToRender.length === 0 ? (
						emptyState ? (
							<div className="w-full py-6 text-center text-sm text-muted-foreground">{emptyState}</div>
						) : null
					) : (
						cardsToRender.map(({ suggestion, state }, index) => {
							const currentVote = votesByCareerId[suggestion.id];
							const peekLabel =
								CONFIDENCE_LABELS[suggestion.confidence] ?? FALLBACK_BADGES[index] ?? "Worth exploring";
							const topReasons = suggestion.whyItFits.slice(0, 2);
							const neighborPreview = suggestion.neighborTerritories[0];

							return (
								<Card
									key={suggestion.id}
									className={cn(
										"suggestion-card group flex flex-col gap-3 rounded-2xl border-border/60 bg-card/70 p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg focus-within:-translate-y-1 focus-within:shadow-lg",
										isInline ? "backdrop-blur-sm" : "bg-card/60",
										state === "entering" ? "suggestion-card-enter" : "",
										state === "exiting" ? "suggestion-card-exit" : ""
									)}
								>
									<div className="suggestion-card-header">
										<Badge variant="secondary" className="suggestion-card-kicker">
											{peekLabel}
										</Badge>
										<h4 className="suggestion-card-title">{suggestion.title}</h4>
									</div>
									<p className="suggestion-card-summary">{suggestion.summary}</p>
									{topReasons.length > 0 ? (
										<ul className="suggestion-card-reasons" aria-label="Why it fits you">
											{topReasons.map((reason, reasonIndex) => (
												<li key={`${suggestion.id}-reason-${reasonIndex}`}>{reason}</li>
											))}
										</ul>
									) : null}
									{neighborPreview ? (
										<div className="flex items-center gap-2 rounded-lg bg-secondary/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-secondary-foreground/80">
											<Sparkles className="size-4 text-secondary-foreground" aria-hidden />
											<span>{neighborPreview}</span>
										</div>
									) : null}
									<div className="suggestion-card-footer">
										<div className="suggestion-card-actions">
											{REACTION_CHOICES.map((choice) => {
												const Icon = choice.icon;
												const isActive = currentVote === choice.value;
												return (
													<Button
														key={`${suggestion.id}-${choice.label}`}
														variant={isActive ? "default" : "outline"}
														size="sm"
														className={cn(
															"justify-center gap-1 text-sm",
															isActive ? "border-transparent" : "border-border/60"
														)}
														onClick={() => handleReaction(suggestion, choice.value)}
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
											className="suggestion-card-details"
											onClick={() => handleOpenDetails(suggestion.id)}
											type="button"
										>
											<Play className="size-4" aria-hidden />
											Explore pathway
										</Button>
									</div>
								</Card>
							);
						})
					)}
				</div>
			</div>

			<Drawer open={Boolean(activeSuggestion)} onOpenChange={handleDrawerChange}>
				<DrawerContent className="suggestion-detail-drawer gap-0 rounded-t-3xl border border-border bg-background/95 shadow-xl">
					<DrawerHeader className="suggestion-detail-header space-y-2">
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
						<div className="suggestion-detail-scroll space-y-6">
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
							{activeSuggestion.neighborTerritories.length > 0 ? (
								<section className="space-y-2">
									<h5 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
										Also nearby
									</h5>
									<ul className="flex flex-wrap gap-2">
										{activeSuggestion.neighborTerritories.map((neighbor, index) => (
											<li
												key={`${activeSuggestion.id}-neighbor-${index}`}
												className="rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
											>
												{neighbor}
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
					<DrawerFooter className="suggestion-detail-footer border-t border-border bg-muted/40">
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
											onClick={() => handleReaction(activeSuggestion, choice.value)}
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
