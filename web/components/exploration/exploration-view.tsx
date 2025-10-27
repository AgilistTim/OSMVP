"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Copy, Share2 } from "lucide-react";
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
					<article key={`${title}-${lane.title}`} className="tilted-card opportunity-card">
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

interface ExplorationBodyProps {
	snapshot: ExplorationSnapshot;
	userName: string;
	discoveryDate: string;
	sessionId: string;
	shareUrl: string;
}

function ExplorationBody({ snapshot, userName, discoveryDate, sessionId, shareUrl }: ExplorationBodyProps) {
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

	return (
		<div className="exploration-container">
			<div className="exploration-nav">
				<Button type="button" variant="outline" size="sm" className="exploration-back-button" onClick={handleBack}>
					<ArrowLeft className="size-4" aria-hidden />
					<span>Back to chat</span>
				</Button>
			</div>
			<section className="discovery-header">
				<div>
					<h1>{`${userName}’s Exploration Journey`}</h1>
					<p className="exploration-date">Discovered: {discoveryDate}</p>
					<div className="passion-summary">
						<p>Exploring pathways aligned with interests in {passionSummary}.</p>
					</div>
				</div>
				<ShareControls shareUrl={shareUrl} userName={userName} />
					<p className="session-id">Journey ID: {sessionId.slice(0, 8).toUpperCase()}</p>
				</section>

				{/* Voted Cards Section - Idea Stash */}
				<section className="voted-cards-section">
					<SectionHeader
						eyebrow="Your reactions"
						title="Idea Stash"
						description="Career cards you've saved, marked as maybe, or skipped during your exploration."
					/>
					{/* TODO: Add voted cards display here - will be implemented with Epic 3 inline cards */}
					<div className="voted-cards-placeholder">
						<p className="text-muted-foreground text-center py-8">
							Voted cards will appear here once you react to career suggestions in the chat.
						</p>
					</div>
				</section>

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
					<div className="timeline-column">
						<h3>This week</h3>
						{snapshot.nextSteps.immediate.length > 0 ? (
							<ul>
								{snapshot.nextSteps.immediate.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						) : (
							<p className="empty-state">Complete a card reaction to unlock quick experiments.</p>
						)}
					</div>
					<div className="timeline-column">
						<h3>This month</h3>
						{snapshot.nextSteps.shortTerm.length > 0 ? (
							<ul>
								{snapshot.nextSteps.shortTerm.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						) : (
							<p className="empty-state">We’ll add deeper projects once a few directions stand out.</p>
						)}
					</div>
					<div className="timeline-column">
						<h3>Next quarter</h3>
						{snapshot.nextSteps.mediumTerm.length > 0 ? (
							<ul>
								{snapshot.nextSteps.mediumTerm.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						) : (
							<p className="empty-state">Big plays appear here once we’ve stress-tested a few sparks.</p>
						)}
					</div>
				</div>
			</section>
		</div>
	);
}

export function ExplorationView() {
	const { profile, suggestions, votesByCareerId, sessionId } = useSession();

	const snapshot = useMemo(() => buildExplorationSnapshot(profile, suggestions, votesByCareerId), [
		profile,
		suggestions,
		votesByCareerId,
	]);

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
		/>
	);
}
