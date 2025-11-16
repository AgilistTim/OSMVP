"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Copy, Download, Map as MapIcon, RefreshCw, Share2 } from "lucide-react";
import { useSession } from "@/components/session-provider";
import {
	buildExplorationSnapshot,
	type ExplorationSnapshot,
	type OpportunityLane,
	type StakeholderMessage,
	type LearningPathwayGroup,
} from "@/lib/exploration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function OpportunityColumn({ title, lanes }: { title: string; lanes: OpportunityLane[] }) {
	if (lanes.length === 0) return null;
	return (
		<div className="opportunity-column">
			<h3>{title}</h3>
			<div className="opportunity-stack">
				{lanes.map((lane) => (
					<article key={lane.id} className="tilted-card opportunity-card">
						<h4>{lane.title}</h4>
						<p>{lane.description}</p>
						<ul>
							{lane.highlights.map((highlight) => (
								<li key={highlight}>{highlight}</li>
							))}
						</ul>
						{lane.callToAction ? (
							<p className="opportunity-cta">
								<span>Try:</span> {lane.callToAction}
							</p>
						) : null}
					</article>
				))}
			</div>
		</div>
	);
}

function StakeholderColumn({ message }: { message: StakeholderMessage }) {
	const labels: Record<StakeholderMessage["audience"], string> = {
		parents: "Parents & Guardians",
		teachers: "Teachers & Advisors",
		mentors: "Mentors & Sponsors",
	};
	return (
		<div className="stakeholder-card tilted-card">
			<Badge variant="secondary" className="stakeholder-badge">
				{labels[message.audience]}
			</Badge>
			<h3>{message.headline}</h3>
			<ul>
				{message.points.map((point) => (
					<li key={point}>{point}</li>
				))}
			</ul>
		</div>
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

function ShareControls({ shareUrl, userName }: { shareUrl: string; userName: string }) {
	const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

	const handleShare = async () => {
		const payload = {
			title: `${userName}’s Exploration Journey`,
			text: "Discovering pathways aligned with my interests and passions.",
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
	const passionSummary =
		snapshot.themes.length > 0
			? snapshot.themes
					.slice(0, 3)
					.map((theme) => theme.label)
					.join(", ")
			: "documenting sparks as they appear";

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
				passions={passionSummary}
				shareUrl={shareUrl}
				sessionId={sessionId}
				onVisualiseMap={onVisualiseMap}
			/>

			<JourneyStatsBar stats={stats} />

			<ConversationSummarySection
				status={summaryStatus}
				summary={summaryData}
				error={summaryError}
				onRetry={onSummaryRetry}
			/>

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
					title={`Where ${primaryThemeLabel} can lead next`}
					description="Routes to turn this focus into real steps—pick what energises you and we’ll build it together."
				/>
				<div className="opportunity-grid">
					<OpportunityColumn title="Direct roles that fit" lanes={snapshot.opportunities.directPaths} />
					<OpportunityColumn
						title="Adjacent missions worth exploring"
						lanes={snapshot.opportunities.adjacentOpportunities}
					/>
					<OpportunityColumn
						title="Transferable skills you’re building"
						lanes={snapshot.opportunities.transferableSkills}
					/>
					<OpportunityColumn
						title="Innovation and entrepreneurial plays"
						lanes={snapshot.opportunities.innovationPotential}
					/>
				</div>
			</section>

			<section className="market-reality">
				<SectionHeader
					eyebrow="UK market reality"
					title="Proof points to back you up"
					description="Grounding the exploration in real data to reassure anyone backing the mission."
				/>
				{snapshot.marketReality.salaryData.length > 0 ? (
					<div className="market-cards">
						{snapshot.marketReality.salaryData.map((item) => (
							<article key={`salary-${item.title}`} className="market-card tilted-card">
								<h3>{item.title}</h3>
								<p className="market-range">{item.salaryRange}</p>
								<p className="market-note">{item.opportunitySignal}</p>
								<ul>
									{item.sources.map((source) => (
										<li key={source.url}>
											<a href={source.url} target="_blank" rel="noreferrer">
												{source.label} <ArrowUpRight className="resource-icon" aria-hidden />
											</a>
										</li>
									))}
								</ul>
							</article>
						))}
					</div>
				) : (
					<p className="empty-state">Once you react to a few cards, we’ll surface salary benchmarks here.</p>
				)}
				{snapshot.marketReality.marketDemand.length > 0 ? (
					<div className="market-cards secondary">
						{snapshot.marketReality.marketDemand.map((item) => (
							<article key={`demand-${item.title}`} className="market-card secondary-card">
								<h3>{item.title}</h3>
								<p>{item.opportunitySignal}</p>
								<ul>
									{item.sources.map((source) => (
										<li key={source.url}>
											<a href={source.url} target="_blank" rel="noreferrer">
												{source.label} <ArrowUpRight className="resource-icon" aria-hidden />
											</a>
										</li>
									))}
								</ul>
							</article>
						))}
					</div>
				) : null}
			</section>

			<section className="learning-pathways">
				<SectionHeader
					eyebrow="Build your craft"
					title={`How to develop your ${snapshot.themes[0]?.label ?? "interest"}`}
					description="Mix and match routes—formal, informal, and experimental—to keep momentum."
				/>
				<div className="learning-grid">
					{snapshot.learningPathways.map((group) => (
						<LearningPathway key={group.title} group={group} />
					))}
				</div>
			</section>

			<section className="stakeholder-guide">
				<SectionHeader
					eyebrow="Bring people with you"
					title="How to talk about your journey"
					description="Tactical language to get supporters excited and confident."
				/>
				<div className="stakeholder-grid">
					{snapshot.stakeholderMessages.map((message) => (
						<StakeholderColumn key={message.audience} message={message} />
					))}
				</div>
			</section>

			<section className="next-steps">
				<SectionHeader
					eyebrow="Stay in motion"
					title="What to do now, next, later"
					description="Tiny experiments stack up—treat these as prompts you can remix."
				/>
				<div className="timeline-grid">
					<TimelineColumn title="This week" items={snapshot.nextSteps.immediate} emptyMessage="Complete a card reaction to unlock quick experiments." />
					<TimelineColumn title="This month" items={snapshot.nextSteps.shortTerm} emptyMessage="We’ll add deeper projects once a few directions stand out." />
					<TimelineColumn title="Next quarter" items={snapshot.nextSteps.mediumTerm} emptyMessage="Big plays appear here once we’ve stress-tested a few sparks." />
				</div>
			</section>
		</div>
	);
}
function JourneyHeader({
	userName,
	discoveryDate,
	passions,
	shareUrl,
	sessionId,
	onVisualiseMap,
}: {
	userName: string;
	discoveryDate: string;
	passions: string;
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
					<p>Exploring pathways aligned with interests in {passions}.</p>
				</div>
			</div>
			<div className="journey-header-sidebar">
				<ShareControls shareUrl={shareUrl} userName={userName} />
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

function JourneyStatsBar({ stats }: { stats: JourneyStats }) {
	const items = [
		{
			label: "Insights unlocked",
			value: stats.insightsUnlocked,
			helper: "Live strengths, interests, and boundaries we captured together.",
		},
		{
			label: "Pathways explored",
			value: stats.pathwaysExplored,
			helper: "Distinct ideas we surfaced and pressure-tested in the chat.",
		},
		{
			label: "Paths I’m amped about",
			value: stats.pathsAmpedAbout,
			helper: "Directions you saved or reacted to with 👍 during the session.",
		},
		{
			label: "Bold moves logged",
			value: stats.boldMovesMade,
			helper: "Next actions, experiments, or commitments you voiced out loud.",
		},
	];

	return (
		<section className="journey-stats-section">
			<SectionHeader
				eyebrow="Progress snapshot"
				title="What MirAI picked up today"
				description="These numbers update as you keep chatting—think of them as your session heartbeat."
			/>
			<div className="journey-stats">
				{items.map((item) => (
					<div key={item.label} className="journey-stat-card" role="group" aria-label={item.label}>
						<div className="journey-stat-value" aria-hidden>
							{item.value}
						</div>
						<div className="journey-stat-label">{item.label}</div>
						<p className="journey-stat-helper">{item.helper}</p>
					</div>
				))}
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
	const savedCards = suggestions.filter((s) => votesByCareerId[s.id] === 1);
	const maybeCards = suggestions.filter((s) => votesByCareerId[s.id] === 0);
	const skippedCards = suggestions.filter((s) => votesByCareerId[s.id] === -1);
	const hasVotedCards = savedCards.length > 0 || maybeCards.length > 0 || skippedCards.length > 0;

	return (
		<section className="voted-cards-section" ref={ref}>
			<SectionHeader
				eyebrow="Ideas to explore"
				title="What you bookmarked during the chat"
				description="Saved ideas stay front and centre. Maybe and skipped cards wait here until you’re ready to revisit."
			/>
			{hasVotedCards ? (
				<div className="idea-stash">
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
			) : (
				<div className="voted-cards-placeholder">
					<p className="text-muted-foreground text-center py-8">
						Voted cards will appear here once you react to career suggestions in the chat.
					</p>
				</div>
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

function TimelineColumn({ title, items, emptyMessage }: { title: string; items: string[]; emptyMessage: string }) {
	return (
		<div className="timeline-column">
			<h3>{title}</h3>
			{items.length > 0 ? (
				<ul>
					{items.map((item) => (
						<li key={item}>{item}</li>
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

function buildSignalBuckets(profile: Profile): SignalBuckets {
	const fromInsights = (kind: ProfileInsight["kind"][]): SignalItem[] => {
		const seen = new Set<string>();
		const items: SignalItem[] = [];
		profile.insights
			.filter((insight) => kind.includes(insight.kind))
			.forEach((insight) => {
				const label = insight.value.trim();
				if (!label) return;
				const key = tokenKey(label);
				if (seen.has(key)) return;
				seen.add(key);
				items.push({
					label,
					evidence: insight.evidence ? shortenEvidence(insight.evidence) : null,
				});
			});
		return items;
	};

	const strengths = dedupeSignalItems(fromInsights(["strength"]), 5);

	const interests = dedupeSignalItems(
		[
			...fromInsights(["interest"]),
			...profile.interests.map((label) => ({ label, evidence: null })),
		],
		5
	);

	const goals = dedupeSignalItems(
		[
			...fromInsights(["goal", "hope"]),
			...profile.goals.map((label) => ({ label, evidence: null })),
		],
		5
	);

	return {
		strengths,
		interests,
		goals,
	};
}

function shortenEvidence(text: string, wordLimit = 16): string {
	const words = text.trim().split(/\s+/);
	if (words.length <= wordLimit) return text.trim();
	return `${words.slice(0, wordLimit).join(" ")}…`;
}

function capitalize(word: string): string {
	if (!word) return word;
	return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function tokenKey(value: string): string {
	const stopWords = new Set([
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
	]);
	const tokens = value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 2 && !stopWords.has(token));
	const unique = Array.from(new Set(tokens)).sort();
	return unique.join("-");
}

function dedupeSignalItems(items: SignalItem[], limit: number): SignalItem[] {
	const map = new Map<string, SignalItem>();
	items.forEach((item) => {
		const label = item.label.trim();
		if (!label) return;
		const key = tokenKey(label);
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

function humaniseTheme(raw: string): string {
	let text = raw.trim();
	if (!text) return "your next chapter";

	text = text.replace(/\s+/g, " ");
	text = text.replace(/\bAI\b/gi, "AI");
	text = text.replace(/^(my own|my|our)\s+/i, "");
	text = text.replace(/^(the|a|an)\s+/i, "");
	text = text.replace(/\s+/g, " ").trim();

	const words = text.split(" ");
	if (words.length === 0) {
		return "your next chapter";
	}

	const verbMap: Record<string, string> = {
		help: "Helping",
		helping: "Helping",
		build: "Building",
		building: "Building",
		create: "Creating",
		creating: "Creating",
		turn: "Turning",
		turning: "Turning",
		launch: "Launching",
		launching: "Launching",
		support: "Supporting",
		supporting: "Supporting",
		develop: "Developing",
		developing: "Developing",
		make: "Making",
		making: "Making",
		refine: "Refining",
		refining: "Refining",
		start: "Starting",
		starting: "Starting",
	};

	const firstLower = words[0].toLowerCase();
	const leadsWithVerb = verbMap[firstLower] !== undefined;
	if (leadsWithVerb) {
		words[0] = verbMap[firstLower];
	} else {
		words[0] = capitalize(words[0]);
	}

	for (let i = 1; i < words.length; i += 1) {
		const lower = words[i].toLowerCase();
		if (verbMap[lower]) {
			words[i] = verbMap[lower];
		} else if (lower === "ai") {
			words[i] = "AI";
		} else if (lower === "tool" && i > 0 && words[i - 1].toLowerCase() === "ai") {
			words[i] = "tool";
		} else {
			words[i] = words[i].toLowerCase();
		}
	}

	let result = words.join(" ").replace(/\s+/g, " ").trim();
	result = result.replace(/\bai\b/gi, "AI");

	if (leadsWithVerb) {
		result = result.replace(/with (the )?AI/i, "with your AI");
		return result;
	}

	if (!/^Your\b/i.test(result)) {
		result = `Your ${result}`;
	}

	return result.charAt(0).toUpperCase() + result.slice(1);
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
