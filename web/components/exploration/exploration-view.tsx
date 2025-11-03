"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Copy, Share2, Map } from "lucide-react";
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
import type { CareerSuggestion } from "@/components/session-provider";
import { InlineCareerCard } from "@/components/inline-career-card-v2";
import "@/components/inline-career-card-v2.css";

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

interface ExplorationBodyProps {
	snapshot: ExplorationSnapshot;
	userName: string;
	discoveryDate: string;
	sessionId: string;
	shareUrl: string;
	stats: JourneyStats;
	suggestions: CareerSuggestion[];
	votesByCareerId: Record<string, 1 | 0 | -1>;
	voteCareer: (careerId: string, value: 1 | -1 | 0 | null) => void;
}

function ExplorationBody({
	snapshot,
	userName,
	discoveryDate,
	sessionId,
	shareUrl,
	stats,
	suggestions,
	votesByCareerId,
	voteCareer,
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

	const handleVisualiseMap = () => {
		router.push("/exploration-temp");
	};

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
				onVisualiseMap={handleVisualiseMap}
			/>

			<JourneyStatsBar stats={stats} />

			<IdeaStashSection
				suggestions={suggestions}
				votesByCareerId={votesByCareerId}
				voteCareer={voteCareer}
			/>

			<section className="passion-discovery">
				<SectionHeader
					eyebrow="Exploration signals"
					title="What you're into"
					description="Celebrating the sparks that cropped up across the conversation."
				/>
				<div className="discovery-grid">
					{snapshot.discoveryInsights.map((insight) => (
						<article key={insight.title} className={cn("tilted-card insight-card", insight.tone)}>
							<h3>{insight.title}</h3>
							<p>{insight.description}</p>
						</article>
					))}
				</div>
			</section>

			<section className="opportunity-mapping">
				<SectionHeader
					eyebrow="Opportunity mapping"
					title={`Where ${snapshot.themes[0]?.label ?? "this interest"} can take you`}
					description="Multiple routes we can pursue and remix—no single path required."
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
					title="Opportunities, earnings, and proof"
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
					title="What to try next"
					description="Tiny experiments stack up. Treat these as prompts you can remix."
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
						<Map className="size-4" aria-hidden />
						<span>Visualise your map</span>
					</Button>
					<p className="session-id">Journey ID: {sessionId.slice(0, 8).toUpperCase()}</p>
				</div>
			</div>
		</section>
	);
}

function JourneyStatsBar({ stats }: { stats: JourneyStats }) {
	const items = [
		{ label: "Insights unlocked", value: stats.insightsUnlocked },
		{ label: "Pathways explored", value: stats.pathwaysExplored },
		{ label: "Paths I’m amped about", value: stats.pathsAmpedAbout },
		{ label: "Bold moves logged", value: stats.boldMovesMade },
	];

	return (
		<section className="journey-stats">
			{items.map((item) => (
				<div key={item.label} className="journey-stat-card">
					<div className="journey-stat-value">{item.value}</div>
					<div className="journey-stat-label">{item.label}</div>
				</div>
			))}
		</section>
	);
}

function IdeaStashSection({
	suggestions,
	votesByCareerId,
	voteCareer,
}: {
	suggestions: CareerSuggestion[];
	votesByCareerId: Record<string, 1 | 0 | -1>;
	voteCareer: (careerId: string, value: 1 | -1 | 0 | null) => void;
}) {
	const savedCards = suggestions.filter((s) => votesByCareerId[s.id] === 1);
	const maybeCards = suggestions.filter((s) => votesByCareerId[s.id] === 0);
	const skippedCards = suggestions.filter((s) => votesByCareerId[s.id] === -1);
	const hasVotedCards = savedCards.length > 0 || maybeCards.length > 0 || skippedCards.length > 0;

	return (
		<section className="voted-cards-section">
			<SectionHeader
				eyebrow="Your reactions"
				title="Idea stash"
				description="Saved cards stay front and centre. Maybe and skipped cards are parked for when you want to review."
			/>
			{hasVotedCards ? (
				<div className="idea-stash">
					<IdeaGroup
						title={`✅ Saved (${savedCards.length})`}
						emphasis="positive"
						cards={savedCards}
						votesByCareerId={votesByCareerId}
						voteCareer={voteCareer}
					/>
					<IdeaGroup
						title={`🤔 Maybe (${maybeCards.length})`}
						emphasis="neutral"
						cards={maybeCards}
						votesByCareerId={votesByCareerId}
						voteCareer={voteCareer}
					/>
					<IdeaGroup
						title={`👎 Skipped (${skippedCards.length})`}
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
	const { profile, suggestions, votesByCareerId, sessionId, voteCareer } = useSession();

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

	return (
		<ExplorationBody
			snapshot={snapshot}
			userName={userName}
			discoveryDate={discoveryDate}
			sessionId={sessionId}
			shareUrl={shareUrl}
			stats={stats}
			suggestions={suggestions}
			votesByCareerId={votesByCareerId}
			voteCareer={voteCareer}
		/>
	);
}
