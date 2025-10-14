"use client";

import { Bookmark, Clock3, Trash2 } from "lucide-react";
import { Fragment, useMemo, type ComponentType } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuggestionCards } from "@/components/suggestion-cards";
import type { CareerSuggestion } from "@/components/session-provider";
import { cn } from "@/lib/utils";

interface SuggestionBasketProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	saved: CareerSuggestion[];
	maybe: CareerSuggestion[];
	skipped: CareerSuggestion[];
	onClearSkipped?: () => void;
	onCardReact?: (payload: {
		suggestion: CareerSuggestion;
		previousValue: 1 | 0 | -1 | null | undefined;
		nextValue: 1 | 0 | -1 | null;
	}) => void;
}

export function SuggestionBasket({
	open,
	onOpenChange,
	saved,
	maybe,
	skipped,
	onClearSkipped,
	onCardReact,
}: SuggestionBasketProps) {
	const hasContent = saved.length + maybe.length + skipped.length > 0;

	const sectionOrder = useMemo(
		() =>
			[
				{
					key: "saved",
					title: "Saved sparks",
					icon: Bookmark,
					items: saved,
					description: "Cards you’ve bookmarked to keep nearby.",
				},
				{
					key: "maybe",
					title: "Maybe pile",
					icon: Clock3,
					items: maybe,
					description: "Ideas you’re sitting with. Tap a reaction to decide.",
				},
				{
					key: "skipped",
					title: "Passed on",
					icon: Trash2,
					items: skipped,
					description: "Not your vibe—for now. Tap Skip again to restore it.",
				},
			] as const,
		[saved, maybe, skipped]
	);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="idea-basket-drawer gap-0 rounded-t-3xl border border-border bg-background/96 shadow-xl">
				<DrawerHeader className="space-y-2 px-6 pt-6">
					<DrawerTitle className="text-left text-2xl font-semibold leading-tight">Idea Stash</DrawerTitle>
					<DrawerDescription className="text-left text-base text-muted-foreground">
						Every reaction lands here. Tap a reaction again to send the card back into the chat.
					</DrawerDescription>
					<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
						<span>Total saved</span>
						<Badge variant="secondary">{saved.length}</Badge>
						<span className="opacity-60">Maybe</span>
						<Badge variant="secondary">{maybe.length}</Badge>
						<span className="opacity-60">Skipped</span>
						<Badge variant="secondary">{skipped.length}</Badge>
					</div>
				</DrawerHeader>

				<div className="idea-basket-body space-y-10 overflow-y-auto px-6 pb-8 pt-2">
					{hasContent ? (
						sectionOrder.map(({ key, title, icon: Icon, items, description }) => (
							<Fragment key={key}>
								<BasketSectionHeader title={title} icon={Icon} count={items.length} description={description} />
								{items.length > 0 ? (
									<SuggestionCards
										suggestions={items}
										variant="panel"
										showHeader={false}
										emptyState={<span className="text-muted-foreground">Nothing here yet.</span>}
										className="idea-basket-section"
										onReaction={onCardReact}
									/>
								) : (
									<p className="rounded-2xl border border-dashed border-border/60 bg-muted/50 p-4 text-sm text-muted-foreground">
										Nothing here yet.
									</p>
								)}
							</Fragment>
						))
					) : (
						<div className="rounded-3xl border border-dashed border-border/70 bg-muted/40 p-6 text-center text-base text-muted-foreground">
							<p className="font-medium text-foreground">No cards tucked away yet.</p>
							<p className="mt-2 text-sm text-muted-foreground">
								Save, maybe, or skip something to see it appear here. Skipped cards can be restored anytime.
							</p>
						</div>
					)}
				</div>

				{skipped.length > 0 ? (
					<div className="flex items-center justify-end gap-2 border-t border-border/70 bg-muted/30 px-6 py-4">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								if (!onClearSkipped) return;
								onClearSkipped();
							}}
							type="button"
							className="text-sm"
						>
							Clear skipped
						</Button>
					</div>
				) : null}
			</DrawerContent>
		</Drawer>
	);
}

interface BasketSectionHeaderProps {
	title: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
	count: number;
}

function BasketSectionHeader({ title, description, icon: Icon, count }: BasketSectionHeaderProps) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex items-center gap-2">
				<div className="flex size-8 items-center justify-center rounded-full bg-muted">
					<Icon className="size-4 text-muted-foreground" aria-hidden />
				</div>
				<div>
					<h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
					<p className="text-xs text-muted-foreground/80">{description}</p>
				</div>
			</div>
			<Badge variant="secondary" className={cn("px-2 py-1 text-xs", count === 0 ? "opacity-60" : "")}>
				{count}
			</Badge>
		</div>
	);
}
