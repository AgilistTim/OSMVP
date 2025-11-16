"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
	ArrowLeft,
	ArrowUpRight,
	ChevronDown,
	Copy,
	Download,
	Map as MapIcon,
	RefreshCw,
	Share2,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import {
	buildExplorationSnapshot,
	type ExplorationSnapshot,
	type OpportunityLane,
	type OpportunityMap,
	type LearningPathwayGroup,
} from "@/lib/exploration";
import {
	formatGoalLabel,
	formatHeroSummary,
	formatInterestLabel,
	formatStrengthLabel,
	humaniseTheme,
} from "@/lib/exploration-language";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
	CareerSuggestion,
	ConversationTurn,
	JourneyVisualAsset,
	Profile,
	ProfileInsight,
} from "@/components/session-provider";
import { InlineCareerCard } from "@/components/inline-career-card-v2";
import "@/components/inline-career-card-v2.css";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { JourneyVisualContext } from "@/lib/journey-visual";
import type { ConversationSummary } from "@/lib/conversation-summary";

function formatDisplayDate(date: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(date);
}

function getUserName(demographics?: Record<string, unknown>): string {
	const maybeName = typeof demographics?.name === "string" ? demographics?.name : undefined;
	if (maybeName && maybeName.trim().length > 0) {
		return maybeName.trim();
	}
	return "Your";
}

function SectionHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
	return (
		<header className="exploration-section-header">
			{eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
			<h2>{title}</h2>
			{description ? <p>{description}</p> : null}
		</header>
	);
}

function OpportunitySummaryGroupCard({ group }: { group: OpportunitySummaryGroup }) {
	if (group.items.length === 0) return null;
	return (
		<article className="opportunity-summary-card">
			<header className="opportunity-summary-header">
				<h3>{group.title}</h3>
				<p>{group.description}</p>
			</header>
			<ul className="opportunity-summary-list">
				{group.items.map((item) => (
					<li key={item.id}>
						<div className="opportunity-summary-item">
							<span className="opportunity-summary-title">{item.title}</span>
							{item.context ? <p className="opportunity-summary-context">{item.context}</p> : null}
							{item.action ? (
								<p className="opportunity-summary-action">
									<span>Next:</span> {item.action}
								</p>
							) : null}
						</div>
					</li>
				))}
			</ul>
		</article>
	);
}

function LearningPathway({ group }: { group: LearningPathwayGroup }) {
	return (
		<div className="learning-card tilted-card">
			<h3>{group.title}</h3>
			<ul>
				{group.resources.map((resource) => (
					<li key={resource.url}>
						<a href={resource.url} target="_blank" rel="noreferrer" className="resource-link">
							<span className="resource-source">{resource.source}</span>
							<div>
								<strong>{resource.label}</strong>
								<p>{resource.description}</p>
							</div>
							<ArrowUpRight className="resource-icon" aria-hidden />
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}

function ShareControls({ shareUrl, userName, summary }: { shareUrl: string; userName: string; summary: string }) {
	const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

	const handleShare = async () => {
		const payload = {
			title: `${userName}’s Exploration Journey`,
			text: summary || "Discovering the pathways I’m shaping with MirAI.",
			url: shareUrl,
		};

		try {
			if (navigator.share) {
				await navigator.share(payload);
				setStatus("idle");
				return;
			}
			await navigator.clipboard.writeText(payload.url);
			setStatus("copied");
			setTimeout(() => setStatus("idle"), 2000);
		} catch {
			setStatus("error");
			setTimeout(() => setStatus("idle"), 2000);
		}
	};

	return (
		<div className="share-controls">
			<Button type="button" className="share-primary" onClick={handleShare}>
				<Share2 className="share-icon" aria-hidden />
				Share this journey
			</Button>
			<button
				type="button"
				className={cn("share-fallback", status === "copied" ? "copied" : "", status === "error" ? "error" : "")}
				onClick={handleShare}
			>
				<Copy className="share-icon" aria-hidden />
				<span>{status === "copied" ? "Link copied" : status === "error" ? "Could not copy" : "Copy link"}</span>
			</button>
		</div>
	);
}

interface JourneyStats {
	insightsUnlocked: number;
	pathwaysExplored: number;
	pathsAmpedAbout: number;
	boldMovesMade: number;
}

interface TopPathway {
	id: string;
	title: string;
	summary: string;
	nextStep?: string;
}

interface SignalItem {
	label: string;
	evidence?: string | null;
}

interface SignalBuckets {
	strengths: SignalItem[];
	interests: SignalItem[];
	goals: SignalItem[];
}

interface TimelineItem {
	action: string;
	condition?: string | null;
}

interface OpportunitySummaryItem {
	id: string;
	title: string;
	context?: string | null;
	action?: string | null;
}

interface OpportunitySummaryGroup {
	id: string;
	title: string;
	description: string;
	items: OpportunitySummaryItem[];
}

type SummaryStatus = "loading" | "ready" | "error";

interface GeneratedSummary {
	themes: string[];
	strengths: string[];
	constraint: string | null;
	whyItMatters: string;
	callToAction?: string | null;
	closing: string;
}

interface ExplorationBodyProps {
	snapshot: ExplorationSnapshot;
	userName: string;
	discoveryDate: string;
	sessionId: string;
	shareUrl: string;
	stats: JourneyStats;
	topPathways: TopPathway[];
	signalBuckets: SignalBuckets;
	summaryStatus: SummaryStatus;
	summaryData: GeneratedSummary | null;
	summaryError: string | null;
	onSummaryRetry: () => void;
	suggestions: CareerSuggestion[];
	votesByCareerId: Record<string, 1 | 0 | -1>;
	voteCareer: (careerId: string, value: 1 | -1 | 0 | null) => void;
	journeyVisual: JourneyVisualAsset | null;
	onVisualiseMap: () => void;
}

function ExplorationBody({
	snapshot,
	userName,
	discoveryDate,
	sessionId,
	shareUrl,
	stats,
	topPathways,
	signalBuckets,
	summaryStatus,
	summaryData,
	summaryError,
	onSummaryRetry,
	suggestions,
	votesByCareerId,
	voteCareer,
	journeyVisual,
	onVisualiseMap,
}: ExplorationBodyProps) {
	const router = useRouter();
	const handleBack = () => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			router.back();
			return;
		}
		router.push("/");
	};

	const ideaStashRef = useRef<HTMLDivElement | null>(null);
	const primaryThemeLabel = useMemo(
		() => formatPrimaryThemeLabel(snapshot.themes, topPathways),
		[snapshot.themes, topPathways]
	);
	const heroSummary = useMemo(
		() => formatHeroSummary(signalBuckets.strengths, signalBuckets.goals, snapshot.themes),
		[signalBuckets.strengths, signalBuckets.goals, snapshot.themes]
	);
	const opportunityGroups = useMemo(
		() => buildOpportunitySummary(snapshot.opportunities),
		[snapshot.opportunities]
	);
	const timelineItems = useMemo(
		() => ({
			immediate: formatTimelineEntries(snapshot.nextSteps.immediate),
			shortTerm: formatTimelineEntries(snapshot.nextSteps.shortTerm),
			mediumTerm: formatTimelineEntries(snapshot.nextSteps.mediumTerm),
		}),
		[
			snapshot.nextSteps.immediate,
			snapshot.nextSteps.shortTerm,
			snapshot.nextSteps.mediumTerm,
		]
	);
	const salaryHighlights = useMemo(
		() => snapshot.marketReality.salaryData.slice(0, 3),
		[snapshot.marketReality.salaryData]
	);
	const demandHighlights = useMemo(
		() => snapshot.marketReality.marketDemand.slice(0, 3),
		[snapshot.marketReality.marketDemand]
	);
	const successHighlights = useMemo(
		() => snapshot.marketReality.successStories.slice(0, 2),
		[snapshot.marketReality.successStories]
	);
	const craftFocus = useMemo(() => {
		const strength = signalBuckets.strengths[0]?.label;
		if (strength) {
			return formatStrengthLabel(strength);
		}
		const goal = signalBuckets.goals[0]?.label;
		if (goal) {
			return formatGoalLabel(goal);
		}
		const theme = snapshot.themes[0]?.label ?? primaryThemeLabel;
		return formatInterestLabel(theme);
	}, [signalBuckets.strengths, signalBuckets.goals, snapshot.themes, primaryThemeLabel]);

	return (
		<div className="exploration-container">
			<div className="exploration-nav">
				<Button type="button" variant="outline" size="sm" className="exploration-back-button" onClick={handleBack}>
					<ArrowLeft className="size-4" aria-hidden />
					<span>Back to chat</span>
				</Button>
			</div>

			<JourneyHeader
				userName={userName}
				discoveryDate={discoveryDate}
				heroSummary={heroSummary}
				shareUrl={shareUrl}
				sessionId={sessionId}
				onVisualiseMap={onVisualiseMap}
			/>

			<ConversationSummarySection
				status={summaryStatus}
				summary={summaryData}
				error={summaryError}
				onRetry={onSummaryRetry}
			/>

			<section className="next-steps">
				<SectionHeader
					eyebrow="Stay in motion"
					title="What to do this week, this month, and next"
					description="Use the quick experiments up top to keep momentum while bigger plays take shape."
				/>
				<div className="timeline-grid">
					<TimelineColumn title="This week" items={timelineItems.immediate} emptyMessage="Complete a card reaction to unlock quick experiments." />
					<TimelineColumn title="This month" items={timelineItems.shortTerm} emptyMessage="We’ll add deeper projects once a few directions stand out." />
					<TimelineColumn title="Next quarter" items={timelineItems.mediumTerm} emptyMessage="Big plays appear here once we’ve stress-tested a few sparks." />
				</div>
			</section>

			{journeyVisual ? (
				<JourneyVisualSection visual={journeyVisual} onVisualiseMap={onVisualiseMap} />
			) : null}

			<TopPathwaysSection
				pathways={topPathways}
				onExploreIdeas={() => {
					if (ideaStashRef.current) {
						ideaStashRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
					}
				}}
			/>

			<IdeaStashSection
				suggestions={suggestions}
				votesByCareerId={votesByCareerId}
				voteCareer={voteCareer}
				ref={ideaStashRef}
			/>

			<section className="signals-section">
				<SectionHeader
					eyebrow="Your core strengths"
					title="Signals MirAI noticed"
					description="These are the strengths, sparks, and edges you surfaced while we talked."
				/>
				<div className="signals-grid">
					<SignalGroup
						title="Strengths you keep returning to"
						items={signalBuckets.strengths}
						variant="strength"
					/>
					<SignalGroup
						title="Signals from the conversation"
						items={signalBuckets.interests}
						variant="interest"
					/>
					<SignalGroup
						title="What you’re hungry to change"
						items={signalBuckets.goals}
						variant="goal"
					/>
				</div>
			</section>

			<section className="opportunity-mapping">
				<SectionHeader
					eyebrow="Opportunities from today’s chat"
					title="Where your strengths can take you next"
					description="Clusters blend your saved cards with nearby plays—pick one to pressure-test next."
				/>
				{opportunityGroups.length > 0 ? (
					<div className="opportunity-summary-grid">
						{opportunityGroups.map((group) => (
							<OpportunitySummaryGroupCard key={group.id} group={group} />
						))}
					</div>
				) : (
					<p className="empty-state">We’ll surface opportunity clusters once you react to a few cards.</p>
				)}
			</section>

			<section className="market-reality">
				<SectionHeader
					eyebrow="Evidence to back you up"
					title="Proof points for your shortlist"
					description="Use these benchmarks and live searches when you brief mentors or sponsors."
				/>
				{salaryHighlights.length + demandHighlights.length + successHighlights.length > 0 ? (
					<div className="market-summary-grid">
						{salaryHighlights.length > 0 ? (
							<article className="market-summary-card">
								<h3>Salary benchmarks</h3>
								<ul className="market-summary-list">
									{salaryHighlights.map((item) => (
										<li key={`salary-${item.title}`}>
											<div className="market-summary-item">
												<span className="market-summary-title">{item.title}</span>
												<p className="market-summary-range">{item.salaryRange}</p>
												<p className="market-summary-note">{item.opportunitySignal}</p>
												<div className="market-summary-links">
													{item.sources.map((source) => (
														<a key={source.url} href={source.url} target="_blank" rel="noreferrer">
															{source.label} <ArrowUpRight className="resource-icon" aria-hidden />
														</a>
													))}
												</div>
											</div>
										</li>
									))}
								</ul>
							</article>
						) : null}
						{demandHighlights.length > 0 ? (
							<article className="market-summary-card">
								<h3>Live demand checks</h3>
								<ul className="market-summary-list">
									{demandHighlights.map((item) => (
										<li key={`demand-${item.title}`}>
											<div className="market-summary-item">
												<span className="market-summary-title">{item.title}</span>
												<p className="market-summary-note">{item.opportunitySignal}</p>
												<div className="market-summary-links">
													{item.sources.map((source) => (
														<a key={source.url} href={source.url} target="_blank" rel="noreferrer">
															{source.label} <ArrowUpRight className="resource-icon" aria-hidden />
														</a>
													))}
												</div>
											</div>
										</li>
									))}
								</ul>
							</article>
						) : null}
						{successHighlights.length > 0 ? (
							<article className="market-summary-card">
								<h3>Signals worth bookmarking</h3>
								<ul className="market-summary-list">
									{successHighlights.map((item) => (
										<li key={`story-${item.title}`}>
											<div className="market-summary-item">
												<span className="market-summary-title">{item.title}</span>
												<p className="market-summary-note">{item.opportunitySignal}</p>
												<div className="market-summary-links">
													{item.sources.map((source) => (
														<a key={source.url} href={source.url} target="_blank" rel="noreferrer">
															{source.label} <ArrowUpRight className="resource-icon" aria-hidden />
														</a>
													))}
												</div>
											</div>
										</li>
									))}
								</ul>
							</article>
						) : null}
					</div>
				) : (
					<p className="empty-state">Add a few saves to unlock market benchmarks and live demand scans.</p>
				)}
			</section>

			<section className="learning-pathways">
				<SectionHeader
					eyebrow="Build your craft"
					title={`Build your craft around ${craftFocus}`}
					description="Mix formal, community, and experimental routes pulled from your saved ideas."
				/>
				<div className="learning-grid">
					{snapshot.learningPathways.map((group) => (
						<LearningPathway key={group.title} group={group} />
					))}
				</div>
			</section>
		</div>
	);
}
function JourneyHeader({
	userName,
	discoveryDate,
	heroSummary,
	shareUrl,
	sessionId,
	onVisualiseMap,
}: {
	userName: string;
	discoveryDate: string;
	heroSummary: string;
	shareUrl: string;
	sessionId: string;
	onVisualiseMap: () => void;
}) {
	return (
		<section className="discovery-header journey-header">
			<div className="journey-header-main">
				<h1>{`${userName}’s Exploration Journey`}</h1>
				<p className="exploration-date">Discovered: {discoveryDate}</p>
				<div className="passion-summary">
					<p>{heroSummary}</p>
				</div>
			</div>
			<div className="journey-header-sidebar">
				<ShareControls shareUrl={shareUrl} userName={userName} summary={heroSummary} />
				<div className="journey-header-actions">
					<Button type="button" className="visualise-button" onClick={onVisualiseMap}>
						<MapIcon className="size-4" aria-hidden />
							<MapIcon className="size-4" aria-hidden />
						<span>Visualise your map</span>
					</Button>
					<p className="session-id">Journey ID: {sessionId.slice(0, 8).toUpperCase()}</p>
				</div>
			</div>
		</section>
	);
}

function ConversationSummarySection({
	summary,
	status,
	error,
	onRetry,
}: {
	summary: GeneratedSummary | null;
	status: SummaryStatus;
	error: string | null;
	onRetry: () => void;
}) {
	const baseHeader = (
		<SectionHeader
			eyebrow="What this really means"
			title="MirAI’s take on your session"
			description="Short, grounded reflections you can hand to a mentor, teacher, or mate."
		/>
	);

	if (status === "loading") {
		return (
			<section className="conversation-summary-section">
				{baseHeader}
				<div className="conversation-summary-card conversation-summary-card--loading">
					<p className="conversation-summary-message">Crafting your recap…</p>
				</div>
			</section>
		);
	}

	if (status === "error") {
		return (
			<section className="conversation-summary-section">
				{baseHeader}
				<div className="conversation-summary-card conversation-summary-card--error">
					<p className="conversation-summary-message">
						{error ?? "We couldn’t generate your summary just now."}
					</p>
					<Button type="button" variant="outline" size="sm" onClick={onRetry}>
						Try again
					</Button>
				</div>
			</section>
		);
	}

	if (!summary) {
		return null;
	}

	return (
		<section className="conversation-summary-section">
			{baseHeader}
			<div className="conversation-summary-card">
				<div className="conversation-summary-copy">
					<p>Here’s what I’m holding onto from today’s chat.</p>
					<p>{summary.whyItMatters}</p>
					{summary.callToAction ? (
						<p className="conversation-summary-cta">{summary.callToAction}</p>
					) : null}
				</div>
				<div className="conversation-summary-highlights">
					{summary.themes.length > 0 ? (
						<div>
							<h3>Core sparks</h3>
							<ul>
								{summary.themes.map((theme) => (
									<li key={`theme-${theme.toLowerCase()}`}>{theme}</li>
								))}
							</ul>
						</div>
					) : null}
					{summary.strengths.length > 0 ? (
						<div>
							<h3>Strengths in play</h3>
							<ul>
								{summary.strengths.map((strength) => (
									<li key={`strength-${strength.toLowerCase()}`}>{strength}</li>
								))}
							</ul>
						</div>
					) : null}
					{summary.constraint ? (
						<div>
							<h3>Reality check</h3>
							<p>{summary.constraint}</p>
						</div>
					) : null}
				</div>
				<p className="conversation-summary-closing">{summary.closing}</p>
			</div>
		</section>
	);
}

function JourneyVisualSection({
	visual,
	onVisualiseMap,
}: {
	visual: JourneyVisualAsset;
	onVisualiseMap: () => void;
}) {
	const dataUrl = `data:${visual.mimeType ?? "image/png"};base64,${visual.imageBase64}`;
	return (
		<section className="journey-visual-section">
			<SectionHeader
				eyebrow="Journey snapshot"
				title="How your conversation maps out"
				description="A shareable visual that maps the sparks, strengths, and directions you explored."
			/>
			<div className="journey-visual-grid">
				<figure className="journey-visual-card tilted-card">
					<img
						src={dataUrl}
						alt={`Journey visual in a ${visual.plan.themeLabel}`}
						className="w-full rounded-md border bg-background"
					/>
				</figure>
				<div className="journey-visual-meta tilted-card">
					<h3 className="text-base font-semibold">Story beats</h3>
					<p className="text-sm text-muted-foreground mt-1">{visual.plan.caption}</p>
					<ul className="mt-3 space-y-1 text-sm">
						{visual.plan.highlights.map((highlight) => (
							<li key={highlight}>• {highlight}</li>
						))}
					</ul>
					<p className="mt-3 text-xs text-muted-foreground">
						Model: {visual.model} • Generated {new Date(visual.createdAt).toLocaleString()}
					</p>
					<div className="mt-4">
						<Button type="button" variant="outline" onClick={onVisualiseMap}>
							<RefreshCw className="mr-2 size-4" aria-hidden />
							Regenerate visual
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}

const IdeaStashSection = forwardRef<HTMLDivElement, {
	suggestions: CareerSuggestion[];
	votesByCareerId: Record<string, 1 | 0 | -1>;
	voteCareer: (careerId: string, value: 1 | -1 | 0 | null) => void;
}>(
({ suggestions, votesByCareerId, voteCareer }, ref) => {
	const [isOpen, setIsOpen] = useState(false);
	const savedCards = suggestions.filter((s) => votesByCareerId[s.id] === 1);
	const maybeCards = suggestions.filter((s) => votesByCareerId[s.id] === 0);
	const skippedCards = suggestions.filter((s) => votesByCareerId[s.id] === -1);
	const hasVotedCards = savedCards.length > 0 || maybeCards.length > 0 || skippedCards.length > 0;
	const summaryParts = [
		{ label: "Saved", count: savedCards.length },
		{ label: "Maybe", count: maybeCards.length },
		{ label: "Parked", count: skippedCards.length },
	]
		.filter((item) => item.count > 0)
		.map((item) => `${item.label} ${item.count}`);
	const summaryText = summaryParts.length > 0 ? summaryParts.join(" · ") : "No reactions logged yet";
	const highlightTitles = savedCards.slice(0, 2).map((card) => card.title);

	return (
		<section className="voted-cards-section" ref={ref}>
			<SectionHeader
				eyebrow="Ideas to explore"
				title="Bookmark queue from the chat"
				description="Your reactions feed this list. Expand when you’re ready to revisit the full cards."
			/>
			<div className="idea-stash-toggle">
				<button
					type="button"
					className="idea-stash-toggle-button"
					onClick={() => setIsOpen((open) => !open)}
					aria-expanded={isOpen}
					aria-controls="idea-stash-content"
				>
					<div className="idea-stash-toggle-label">
						<span>{isOpen ? "Hide idea stash" : "Show idea stash"}</span>
						<span className="idea-stash-summary">{summaryText}</span>
					</div>
					<ChevronDown
						className={cn("idea-stash-toggle-icon", isOpen ? "idea-stash-toggle-icon--open" : "")}
						aria-hidden
					/>
				</button>
				{highlightTitles.length > 0 ? (
					<div className="idea-stash-highlights">
						{highlightTitles.map((title) => (
							<span key={title} className="idea-stash-chip">
								{title}
							</span>
						))}
						{savedCards.length > highlightTitles.length ? (
							<span className="idea-stash-chip">+{savedCards.length - highlightTitles.length} more saved</span>
						) : null}
					</div>
				) : null}
			</div>
			{hasVotedCards ? (
				isOpen ? (
					<div className="idea-stash" id="idea-stash-content">
						<IdeaGroup
							title={`Saved (${savedCards.length})`}
							emphasis="positive"
							cards={savedCards}
							votesByCareerId={votesByCareerId}
							voteCareer={voteCareer}
						/>
						<IdeaGroup
							title={`Maybe (${maybeCards.length})`}
							emphasis="neutral"
							cards={maybeCards}
							votesByCareerId={votesByCareerId}
							voteCareer={voteCareer}
						/>
						<IdeaGroup
							title={`Parked (${skippedCards.length})`}
							emphasis="muted"
							cards={skippedCards}
							votesByCareerId={votesByCareerId}
							voteCareer={voteCareer}
						/>
					</div>
				) : null
			) : (
				isOpen ? (
					<div className="voted-cards-placeholder" id="idea-stash-content">
						<p className="text-muted-foreground text-center py-8">
							Voted cards will appear here once you react to career suggestions in the chat.
						</p>
					</div>
				) : null
			)}
		</section>
	);
});
IdeaStashSection.displayName = "IdeaStashSection";

function TopPathwaysSection({
	pathways,
	onExploreIdeas,
}: {
	pathways: TopPathway[];
	onExploreIdeas: () => void;
}) {
	if (pathways.length === 0) return null;

	return (
		<section className="top-pathways-section">
			<SectionHeader
				eyebrow="Where your aptitudes could lead"
				title="Top paths to explore next"
				description="Quick snapshot of the routes that stood out. Jump into the ideas list for full details."
			/>
			<div className="top-pathways-grid">
				{pathways.map((pathway, index) => (
					<article key={pathway.id} className="top-pathway-card">
						<header>
							<span className="top-pathway-index">{index + 1}</span>
							<h3>{pathway.title}</h3>
						</header>
						<p className="top-pathway-description">{pathway.summary}</p>
						{pathway.nextStep ? <p className="top-pathway-step">{pathway.nextStep}</p> : null}
					</article>
				))}
			</div>
			<div>
				<Button type="button" variant="outline" onClick={onExploreIdeas}>
					Explore full idea stash
				</Button>
			</div>
		</section>
	);
}

function SignalGroup({
	title,
	items,
	variant,
}: {
	title: string;
	items: SignalItem[];
	variant: "strength" | "interest" | "goal";
}) {
	const colorClass =
		variant === "strength"
			? "signal-icon--strength"
			: variant === "interest"
			? "signal-icon--interest"
			: "signal-icon--goal";

	if (items.length === 0) {
		return (
			<article className="signal-group signal-group--empty">
				<h3>{title}</h3>
				<p className="signal-empty-state">We’ll add more here as you share new details.</p>
			</article>
		);
	}

	return (
		<article className="signal-group">
			<h3>{title}</h3>
			<ul>
				{items.map((item, index) => (
					<li key={`${variant}-${index}`}>
						<span className={cn("signal-icon", colorClass)} aria-hidden />
						<div>
							<span className="signal-label">{item.label}</span>
							{item.evidence ? <span className="signal-evidence">{item.evidence}</span> : null}
						</div>
					</li>
				))}
			</ul>
		</article>
	);
}

function IdeaGroup({
	title,
	emphasis,
	cards,
	votesByCareerId,
	voteCareer,
}: {
	title: string;
	emphasis: "positive" | "neutral" | "muted";
	cards: CareerSuggestion[];
	votesByCareerId: Record<string, 1 | 0 | -1>;
	voteCareer: (careerId: string, value: 1 | -1 | 0 | null) => void;
}) {
	if (cards.length === 0) return null;
	return (
		<article className={cn("idea-group", `idea-group-${emphasis}`)}>
			<header className="idea-group-header">
				<h3>{title}</h3>
			</header>
			<div className="idea-list">
				{cards.map((card) => (
					<InlineCareerCard
						key={card.id}
						suggestion={card}
						voteStatus={votesByCareerId[card.id]}
						onVote={(value) => voteCareer(card.id, value)}
					/>
				))}
			</div>
		</article>
	);
}

function TimelineColumn({ title, items, emptyMessage }: { title: string; items: TimelineItem[]; emptyMessage: string }) {
	return (
		<div className="timeline-column">
			<h3>{title}</h3>
			{items.length > 0 ? (
				<ul>
					{items.map((item) => (
						<li key={`${item.action}-${item.condition ?? ""}`} className="timeline-item">
							<span className="timeline-bullet" aria-hidden />
							<div className="timeline-copy">
								<span className="timeline-action">{item.action}</span>
								{item.condition ? <span className="timeline-condition">{item.condition}</span> : null}
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="empty-state">{emptyMessage}</p>
			)}
		</div>
	);
}

export function ExplorationView() {
	const {
		profile,
		suggestions,
		votesByCareerId,
		sessionId,
		voteCareer,
		journeyVisual,
		setJourneyVisual,
		turns,
	} = useSession();

	const snapshot = useMemo(() => buildExplorationSnapshot(profile, suggestions, votesByCareerId), [
		profile,
		suggestions,
		votesByCareerId,
	]);

	const savedCount = useMemo(
		() => suggestions.filter((suggestion) => votesByCareerId[suggestion.id] === 1).length,
		[suggestions, votesByCareerId]
	);

	const stats = useMemo<JourneyStats>(
		() => ({
			insightsUnlocked: profile.insights.length,
			pathwaysExplored: suggestions.length,
			pathsAmpedAbout: savedCount,
			boldMovesMade: Math.max(profile.mutualMoments.length, profile.goals.length),
		}),
		[
			profile.insights.length,
			profile.mutualMoments.length,
			profile.goals.length,
			suggestions.length,
			savedCount,
		]
	);

	const [shareUrl, setShareUrl] = useState<string>("");
	useEffect(() => {
		if (typeof window !== "undefined") {
			setShareUrl(window.location.href);
		}
	}, []);

	const userName = getUserName(profile.demographics);
	const discoveryDate = formatDisplayDate(new Date());
	const topPathways = useMemo(
		() => buildTopPathways(profile, suggestions, votesByCareerId),
		[profile, suggestions, votesByCareerId]
	);
	const signalBuckets = useMemo(() => buildSignalBuckets(profile), [profile]);

const summaryPayload = useMemo(
	() =>
		buildSummaryRequestPayload({
			userName,
			signalBuckets,
			topPathways,
			stats,
			turns,
			profile,
		}),
	[userName, signalBuckets, topPathways, stats, turns, profile]
);
const summaryPayloadJson = useMemo(() => JSON.stringify(summaryPayload), [summaryPayload]);

const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("loading");
const [summaryError, setSummaryError] = useState<string | null>(null);
const [aiSummary, setAiSummary] = useState<GeneratedSummary | null>(null);
const [summaryVersion, setSummaryVersion] = useState(0);
useEffect(() => {
	let cancelled = false;
	const controller = new AbortController();

	async function generateSummary() {
		try {
			setSummaryStatus("loading");
			setSummaryError(null);
			setAiSummary(null);

			const res = await fetch("/api/exploration/summary", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: summaryPayloadJson,
				signal: controller.signal,
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? res.statusText);
			}

			const data = (await res.json()) as { summary: GeneratedSummary };
			if (!cancelled) {
				setAiSummary(data.summary);
				setSummaryStatus("ready");
			}
		} catch (err) {
			if (cancelled) return;
			const message = err instanceof Error ? err.message : "Failed to generate summary";
			setSummaryStatus("error");
			setSummaryError(message);
		}
	}

	generateSummary();

	return () => {
		cancelled = true;
		controller.abort();
	};
}, [summaryPayloadJson, summaryVersion]);

const handleSummaryRetry = useCallback(() => {
	setSummaryVersion((version) => version + 1);
}, []);

	type VisualStatus = "idle" | "loading" | "error" | "ready";
	const [visualOpen, setVisualOpen] = useState(false);
	const [visualStatus, setVisualStatus] = useState<VisualStatus>("idle");
	const [visualError, setVisualError] = useState<string | null>(null);
	const isGenerating = visualStatus === "loading";

	const buildContext = useMemo(() => {
		const context: JourneyVisualContext = {
			sessionId,
			profile: {
				insights: profile.insights,
				inferredAttributes: profile.inferredAttributes,
				activitySignals: profile.activitySignals,
				goals: profile.goals,
				hopes: profile.hopes,
				highlights: profile.highlights,
				mutualMoments: profile.mutualMoments,
				interests: profile.interests,
				strengths: profile.strengths,
				readiness: profile.readiness,
			},
			suggestions: suggestions.map((item) => ({
				id: item.id,
				title: item.title,
				summary: item.summary,
				distance: item.distance,
				whyItFits: item.whyItFits,
				nextSteps: item.nextSteps,
				microExperiments: item.microExperiments,
			})),
			votes: votesByCareerId,
			snapshot: {
				themes: snapshot.themes,
				discoveryInsights: snapshot.discoveryInsights,
			},
		};
		return context;
	}, [profile, sessionId, snapshot.discoveryInsights, snapshot.themes, suggestions, votesByCareerId]);

	const base64ToBlob = (base64: string, mime = "image/png") => {
		if (typeof window === "undefined" || typeof window.atob !== "function") {
			throw new Error("Base64 decoding is not supported in this environment.");
		}
		const byteCharacters = window.atob(base64);
		const byteNumbers = new Array(byteCharacters.length);
		for (let i = 0; i < byteCharacters.length; i += 1) {
			byteNumbers[i] = byteCharacters.charCodeAt(i);
		}
		const byteArray = new Uint8Array(byteNumbers);
		return new Blob([byteArray], { type: mime });
	};

	const visualPlan = journeyVisual?.plan ?? null;
	const visualDataUrl = journeyVisual
		? `data:${journeyVisual.mimeType ?? "image/png"};base64,${journeyVisual.imageBase64}`
		: null;
	const visualMeta = journeyVisual
		? { model: journeyVisual.model, created: journeyVisual.createdAt }
		: null;

const triggerGeneration = async () => {
		setVisualStatus("loading");
		setVisualError(null);
		try {
			const response = await fetch("/api/journey/visual", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ context: buildContext }),
			});
			if (!response.ok) {
				const errorPayload = await response.json().catch(() => ({}));
				const message =
					typeof errorPayload?.message === "string"
						? errorPayload.message
						: "We couldn't sketch the journey yet.";
				setVisualStatus("error");
				setVisualError(message);
				return;
			}
			const data = await response.json();
			const createdAt = typeof data.created === "number" ? data.created : Date.now();
			setJourneyVisual({
				imageBase64: data.image,
				plan: data.plan,
				model: data.model,
				createdAt,
				mimeType: (typeof data.mimeType === "string" ? data.mimeType : undefined) ?? "image/png",
			});
			setVisualError(null);
			setVisualStatus("ready");
		} catch (error) {
			console.error("[ExplorationView] failed to generate visual", error);
			setVisualStatus("error");
			setVisualError("Something went sideways while sketching the journey.");
		}
	};

	const handleVisualiseMap = () => {
		setVisualOpen(true);
		if (journeyVisual) {
			setVisualStatus("ready");
			setVisualError(null);
			return;
		}
		void triggerGeneration();
	};

	const handleOpenChange = (open: boolean) => {
		setVisualOpen(open);
		if (!open && visualStatus === "error") {
			setVisualStatus("idle");
			setVisualError(null);
		}
	};

	const handleDownload = () => {
		if (!journeyVisual) return;
		try {
			const blob = base64ToBlob(journeyVisual.imageBase64, journeyVisual.mimeType ?? "image/png");
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "journey-visual.png";
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("[ExplorationView] failed to download journey visual", error);
		}
	};

	const handleCopyCaption = async () => {
		if (!journeyVisual) return;
		try {
			await navigator.clipboard.writeText(
				`${journeyVisual.plan.caption}\n${journeyVisual.plan.highlights.join("\n")}`
			);
		} catch (error) {
			console.error("[ExplorationView] failed to copy caption", error);
		}
	};

	return (
		<>
			<ExplorationBody
				snapshot={snapshot}
				userName={userName}
				discoveryDate={discoveryDate}
				sessionId={sessionId}
				shareUrl={shareUrl}
				stats={stats}
				topPathways={topPathways}
				signalBuckets={signalBuckets}
				summaryStatus={summaryStatus}
				summaryData={aiSummary}
				summaryError={summaryError}
				onSummaryRetry={handleSummaryRetry}
				suggestions={suggestions}
				votesByCareerId={votesByCareerId}
				voteCareer={voteCareer}
				journeyVisual={journeyVisual}
				onVisualiseMap={handleVisualiseMap}
			/>
			<Dialog open={visualOpen} onOpenChange={handleOpenChange}>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>Visualise your journey</DialogTitle>
						<DialogDescription>
							We’re sketching a shareable snapshot of the conversation, strengths, and paths you uncovered.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-6">
						{visualStatus === "loading" ? (
							<div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
								<div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden />
								<p>Sketching your journey…</p>
							</div>
						) : null}
						{visualStatus === "error" && visualError ? (
							<div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
								<p>{visualError}</p>
								<Button
									type="button"
									variant="outline"
									className="mt-3"
									onClick={() => {
										void triggerGeneration();
									}}
								>
									<RefreshCw className="mr-2 size-4" aria-hidden />
									Try again
								</Button>
							</div>
						) : null}
				{visualStatus === "ready" && visualPlan && visualDataUrl ? (
					<div className="flex flex-col gap-4">
						<div className="rounded-lg border bg-muted/30 p-4">
							<img
								src={visualDataUrl}
								alt={`Journey visual in a ${visualPlan.themeLabel}`}
								className="w-full rounded-md border bg-background"
							/>
						</div>
								<div className="rounded-lg border bg-muted/40 p-4">
									<h3 className="text-base font-semibold">Story beats</h3>
									<p className="text-sm text-muted-foreground mt-1">{visualPlan.caption}</p>
									<ul className="mt-3 space-y-1 text-sm">
										{visualPlan.highlights.map((highlight) => (
											<li key={highlight}>• {highlight}</li>
										))}
									</ul>
									{visualMeta ? (
										<p className="mt-3 text-xs text-muted-foreground">
											Model: {visualMeta.model} • Generated {new Date(visualMeta.created).toLocaleString()}
										</p>
									) : null}
								</div>
					</div>
				) : null}
			</div>
			<DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								disabled={isGenerating}
								onClick={() => {
									void triggerGeneration();
								}}
							>
								<RefreshCw className="mr-2 size-4" aria-hidden />
								{visualStatus === "ready" ? "Regenerate" : "Generate"}
							</Button>
						</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" disabled={!visualPlan || !journeyVisual} onClick={handleCopyCaption}>
						<Copy className="mr-2 size-4" aria-hidden />
						Copy caption
					</Button>
					<Button type="button" disabled={!journeyVisual || isGenerating} onClick={handleDownload}>
						<Download className="mr-2 size-4" aria-hidden />
						Download image
					</Button>
				</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function buildTopPathways(
	profile: Profile,
	suggestions: CareerSuggestion[],
	votesByCareerId: Record<string, 1 | 0 | -1>
): TopPathway[] {
	const saved = suggestions.filter((card) => votesByCareerId[card.id] === 1);
	const maybe = suggestions.filter((card) => votesByCareerId[card.id] === 0);
	const remaining = suggestions.filter((card) => votesByCareerId[card.id] === undefined);

	const rankedCards = [...saved, ...maybe, ...remaining];
	const seenIds = new Set<string>();
	const pathways: TopPathway[] = [];

	for (const card of rankedCards) {
		if (seenIds.has(card.id)) continue;
		seenIds.add(card.id);
		const summary =
			card.summary ||
			card.whyItFits.find((line) => line.trim().length > 0) ||
			"Let’s explore how this direction lines up with what you shared.";
		const nextStep =
			card.nextSteps.find((step) => step.trim().length > 0) ??
			card.whyItFits.find((line) => line.trim().length > 0);

		pathways.push({
			id: card.id,
			title: card.title,
			summary,
			nextStep,
		});
		if (pathways.length >= 3) break;
	}

	if (pathways.length < 3) {
		const goalFallbacks = [...profile.goals, ...profile.hopes]
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		for (let i = 0; i < goalFallbacks.length && pathways.length < 3; i += 1) {
			const goal = goalFallbacks[i];
			pathways.push({
				id: `goal-${i}`,
				title: goal,
				summary: "Use this as a north star. We’ll translate it into concrete experiments together.",
				nextStep: "Add more detail or examples so we can shape the next steps.",
			});
		}
	}

	return pathways.slice(0, 3);
}

function buildOpportunitySummary(opportunities: OpportunityMap): OpportunitySummaryGroup[] {
	const summariseLane = (lane: OpportunityLane): OpportunitySummaryItem => {
		const contextSource = lane.highlights[0] ?? lane.description;
		return {
			id: lane.id,
			title: lane.title,
			context: contextSource ? shortenEvidence(contextSource, 18) : null,
			action: lane.callToAction ?? null,
		};
	};

	const groups: OpportunitySummaryGroup[] = [];

	const coreItems = opportunities.directPaths.slice(0, 3).map(summariseLane);
	if (coreItems.length > 0) {
		groups.push({
			id: "core-plays",
			title: "Core plays to double down on",
			description: "Saved directions that line up cleanly with the strengths you kept highlighting.",
			items: coreItems,
		});
	}

	const adjacentItems = opportunities.adjacentOpportunities.slice(0, 3).map(summariseLane);
	if (adjacentItems.length > 0) {
		groups.push({
			id: "adjacent-missions",
			title: "Adjacent missions worth sampling",
			description: "Nearby lanes that stretch your skills without throwing you into the deep end.",
			items: adjacentItems,
		});
	}

	const experimentLanes = [
		...opportunities.transferableSkills.slice(0, 2),
		...opportunities.innovationPotential.slice(0, 2),
	];
	const experimentItems = experimentLanes.map(summariseLane);
	if (experimentItems.length > 0) {
		groups.push({
			id: "experiments",
			title: "Experiments to prototype",
			description: "Use these to test demand, sharpen a skill gap, or package your own offer.",
			items: experimentItems,
		});
	}

	return groups;
}

function formatTimelineEntries(entries: string[], limit = 3): TimelineItem[] {
	const seen = new Set<string>();
	const items: TimelineItem[] = [];

	entries.forEach((entry) => {
		const parsed = parseTimelineEntry(entry);
		if (!parsed) {
			return;
		}
		const key = `${parsed.action.toLowerCase()}|${(parsed.condition ?? "").toLowerCase()}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		items.push(parsed);
	});

	return items.slice(0, limit);
}

function parseTimelineEntry(entry: string): TimelineItem | null {
	if (!entry) return null;
	let working = entry.replace(/^[•\-\u2022]\s*/, "").trim();
	if (!working) return null;

	working = working.replace(/\s+/g, " ");

	const colonIndex = working.indexOf(":");
	if (colonIndex !== -1 && colonIndex < working.length - 1) {
		const head = working.slice(0, colonIndex).trim();
		const tail = working.slice(colonIndex + 1).trim();
		if (tail) {
			working = `${head} ${tail}`;
		} else {
			working = head;
		}
	}

	let action = working;
	let condition: string | undefined;

	const ifMatch = action.match(/\bif\b/i);
	if (ifMatch) {
		const [before, after] = action.split(/\bif\b/i, 2);
		if (before?.trim()) {
			action = before.trim();
		}
		if (after?.trim()) {
			condition = `If ${capitalizeSentence(after.trim())}`;
		}
	}

	const connectorPatterns: Array<{ regex: RegExp; label: string }> = [
		{ regex: /\bso you can\b/i, label: "So you can" },
		{ regex: /\bso that you can\b/i, label: "So you can" },
		{ regex: /\bso you\b/i, label: "So you" },
	];

	for (const { regex, label } of connectorPatterns) {
		const match = regex.exec(action);
		if (match && typeof match.index === "number") {
			const base = action.slice(0, match.index).trim();
			const tail = action.slice(match.index + match[0].length).trim();
			if (base) {
				action = base;
			}
			if (tail) {
				condition = condition ?? `${label} ${capitalizeSentence(tail)}`;
			}
			break;
		}
	}

	action = capitalizeSentence(action);
	if (!action) return null;

	if (condition) {
		condition = condition.replace(/\.$/, "");
	}

	return {
		action,
		condition: condition ?? null,
	};
}

function capitalizeSentence(value: string): string {
	const trimmed = value.trim().replace(/\s+/g, " ").replace(/\.$/, "");
	if (!trimmed) return "";
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function buildSignalBuckets(profile: Profile): SignalBuckets {
	const fromInsights = (
		kinds: ProfileInsight["kind"][],
		labelFormatter: (value: string) => string,
		evidenceKind: "strength" | "interest" | "goal"
	): SignalItem[] => {
		const items: SignalItem[] = [];
		profile.insights
			.filter((insight) => kinds.includes(insight.kind))
			.forEach((insight) => {
				const formattedLabel = labelFormatter(insight.value);
				if (!formattedLabel) return;
				items.push({
					label: formattedLabel,
					evidence: insight.evidence
						? shortenEvidence(normaliseEvidence(insight.evidence))
						: defaultSignalEvidence(evidenceKind, formattedLabel),
				});
			});
		return items;
	};

	const strengths = dedupeSignalItems(
		[
			...fromInsights(["strength"], formatStrengthLabel, "strength"),
			...profile.strengths.map((value) => {
				const label = formatStrengthLabel(value);
				return {
					label,
					evidence: defaultSignalEvidence("strength", label),
				};
			}),
		],
		3
	);

	const interests = dedupeSignalItems(
		[
			...fromInsights(["interest"], formatInterestLabel, "interest"),
			...profile.interests.map((value) => {
				const label = formatInterestLabel(value);
				return { label, evidence: defaultSignalEvidence("interest", label) };
			}),
		],
		3,
		["lot", "watching", "watch", "videos", "video", "idea", "able"]
	);

	const goals = dedupeSignalItems(
		[
			...fromInsights(["goal", "hope"], formatGoalLabel, "goal"),
			...profile.goals.map((value) => {
				const label = formatGoalLabel(value);
				return { label, evidence: defaultSignalEvidence("goal", label) };
			}),
			...profile.hopes.map((value) => {
				const label = formatGoalLabel(value);
				return { label, evidence: defaultSignalEvidence("goal", label) };
			}),
		],
		3
	);

	return {
		strengths,
		interests,
		goals,
	};
}

function shortenEvidence(text: string, wordLimit = 24): string {
	const words = text.trim().split(/\s+/);
	if (words.length <= wordLimit) return text.trim();
	return `${words.slice(0, wordLimit).join(" ")}…`;
}

function tokenKey(value: string, extraStopWords: string[] = []): string {
	const baseStopWords = [
		"a",
		"an",
		"and",
		"the",
		"to",
		"for",
		"of",
		"into",
		"with",
		"about",
		"thing",
		"gig",
		"paid",
		"your",
		"my",
		"our",
		"their",
	];
	const stopWords = new Set([
		...baseStopWords,
		...extraStopWords.map((word) => word.toLowerCase()),
	]);
	const tokens = value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 2 && !stopWords.has(token));
	const unique = Array.from(new Set(tokens)).sort();
	return unique.join("-");
}

function toSentenceFragment(label: string): string {
	const trimmed = label.trim();
	if (!trimmed) return trimmed;
	const parts = trimmed.split(/\s+/);
	const [first, ...rest] = parts;
	const isAcronym = /^[A-Z]{2,}$/.test(first);
	const firstWord = isAcronym ? first : first.charAt(0).toLowerCase() + first.slice(1);
	return [firstWord, ...rest].join(" ");
}

function defaultSignalEvidence(
	kind: "strength" | "interest" | "goal",
	label: string
): string | null {
	const fragment = toSentenceFragment(label);
	if (!fragment) return null;
	switch (kind) {
		case "strength":
			return `You kept leaning on ${fragment} as a proven strength.`;
		case "interest":
			return formatInterestEvidence(fragment);
		case "goal":
			return `You're aiming to ${fragment}.`;
		default:
			return null;
	}
}

function formatInterestEvidence(fragment: string): string {
	const lower = fragment.toLowerCase();

	if (lower.startsWith("immersed in")) {
		return `You kept circling back to being ${fragment}.`;
	}

	if (lower.startsWith("watching ")) {
		const focus = capitalizeSentence(fragment.slice("watching ".length));
		return `You kept circling back to watching ${focus}.`;
	}

	if (lower.startsWith("building toward")) {
		return `You kept circling back to ${fragment}.`;
	}

	return `You kept circling back to ${fragment}.`;
}

function dedupeSignalItems(
	items: SignalItem[],
	limit: number,
	extraStopWords: string[] = []
): SignalItem[] {
	const map = new Map<string, SignalItem>();
	items.forEach((item) => {
		const label = item.label.trim();
		if (!label) return;
		const key = tokenKey(label, extraStopWords);
		if (map.has(key)) return;
		map.set(key, { label, evidence: item.evidence ?? null });
	});
	return Array.from(map.values()).slice(0, limit);
}

function formatPrimaryThemeLabel(
	themes: Array<{ label: string }>,
	pathways: TopPathway[]
): string {
	const themeCandidate =
		themes.find((theme) => theme.label && theme.label.trim().length > 0)?.label ??
		pathways[0]?.title ??
		"your next chapter";
	return humaniseTheme(themeCandidate);
}

interface SummaryRequestPayload {
	userName: string;
	themes: string[];
	goals: string[];
	strengths: Array<{ label: string; evidence?: string | null }>;
	constraint: string | null;
	metrics: JourneyStats;
	topPathways: Array<{ title: string; summary: string; nextStep?: string | null }>;
	anchorQuotes: string[];
	notes: string[];
}

function buildSummaryRequestPayload({
	userName,
	signalBuckets,
	topPathways,
	stats,
	turns,
	profile,
}: {
	userName: string;
	signalBuckets: SignalBuckets;
	topPathways: TopPathway[];
	stats: JourneyStats;
	turns: ConversationTurn[];
	profile: Profile;
}): SummaryRequestPayload {
	const themeCandidates = [
		...topPathways.map((path) => path.title),
		...signalBuckets.interests.map((item) => item.label),
		...profile.interests,
	];

	const themes = uniqueStrings(themeCandidates, 5, humaniseTheme);
	const goals = uniqueStrings(
		[
			...signalBuckets.goals.map((item) => item.label),
			...profile.goals,
			...profile.hopes,
		],
		5,
		humaniseTheme
	);

	const strengths = signalBuckets.strengths.slice(0, 5).map((item) => ({
		label: humaniseTheme(item.label),
		evidence: item.evidence ? normaliseEvidence(item.evidence) : null,
	}));

	const constraintCandidate =
		profile.constraints[0] ?? profile.frustrations[0] ?? profile.boundaries[0] ?? null;

	const anchorQuotes = pickAnchorQuotes(turns);
	const notes = uniqueStrings(
		[...profile.highlights, ...profile.mutualMoments.map((moment) => moment.text)],
		5,
		(value) => value.trim()
	);

	return {
		userName,
		themes,
		goals,
		strengths,
		constraint: constraintCandidate ? humaniseConstraint(constraintCandidate) : null,
		metrics: stats,
		topPathways: topPathways.slice(0, 3).map((path) => ({
			title: humaniseTheme(path.title),
			summary: path.summary,
			nextStep: path.nextStep ?? null,
		})),
		anchorQuotes,
		notes,
	};
}

function normaliseEvidence(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return trimmed;
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function humaniseConstraint(raw: string): string {
	let text = raw.trim();
	if (!text) return text;
	text = text.replace(/\bmy\b/gi, "your");
	text = text.replace(/\bI\b/g, "you");
	text = text.replace(/^need to\s+/i, "");
	text = text.replace(/^got to\s+/i, "");
	if (!text.toLowerCase().startsWith("balancing") && !text.toLowerCase().startsWith("keeping")) {
		text = `Balancing ${text}`;
	}
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function uniqueStrings(
	values: string[],
	limit: number,
	transform: (value: string) => string = (value) => value
): string[] {
	const map = new Map<string, string>();
	values.forEach((value) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		const key = tokenKey(trimmed);
		if (map.has(key)) return;
		map.set(key, transform(trimmed));
	});
	return Array.from(map.values()).slice(0, limit);
}

function pickAnchorQuotes(turns: ConversationTurn[], limit = 3): string[] {
	const anchors: string[] = [];
	for (let i = turns.length - 1; i >= 0; i -= 1) {
		const turn = turns[i];
		if (turn.role !== "user") continue;
		const text = turn.text?.trim();
		if (!text || text.length < 30) continue;
		const snippet = text.length > 220 ? `${text.slice(0, 217)}…` : text;
		anchors.unshift(snippet);
		if (anchors.length >= limit) break;
	}
	return anchors;
}
