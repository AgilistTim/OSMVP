"use client";

import { useMemo, useState } from "react";
import type { JourneyPageData } from "@/lib/journey-page";
import styles from "./journey-page.module.css";

interface JourneyPageProps {
	data: JourneyPageData;
	startUrl?: string;
}

export function JourneyPage({ data, startUrl = "/" }: JourneyPageProps) {
	const mapSection = useMemo(() => {
		if (data.exploration_map_url) {
			return (
				<img
					src={data.exploration_map_url}
					alt="Exploration map generated for this journey"
					className={styles.mapImage}
				/>
			);
		}
		return (
			<div className={styles.mapFallback}>
				<p>
					We tried to generate the exploration map but ran into an issue. Refresh to try
					again once everything is connected.
				</p>
				{data.exploration_map_error ? <small>{data.exploration_map_error}</small> : null}
			</div>
		);
	}, [data.exploration_map_error, data.exploration_map_url]);

	return (
		<div className={styles.pageWrap}>
			<header className={styles.header}>
				<h1 className={styles.title}>{data.page_title}</h1>
				<ShareButton />
			</header>

			<section className={styles.section} aria-labelledby="spark-heading">
				<div className={styles.infoCard}>
					<h2 id="spark-heading" className={styles.sparkHeading}>
						It All Started With a Question…
					</h2>
					<p className={styles.sparkQuote}>{data.opening_statement}</p>
				</div>
			</section>

			<section className={styles.section} aria-labelledby="map-heading">
				<h2 id="map-heading" className={styles.sectionTitle}>
					My Exploration Map
				</h2>
				<div className={styles.mapFrame}>{mapSection}</div>
			</section>

			{data.top_paths.length > 0 ? (
				<section className={styles.pathsSection} aria-labelledby="compass-heading">
					<h2 id="compass-heading" className={styles.sectionTitle}>
						My Compass: Where I'm Heading
					</h2>
					<div className={styles.pathsGrid}>
						{data.top_paths.map((path) => (
							<PathCard key={path.title} path={path} />
						))}
					</div>
				</section>
			) : null}

			<StatsGrid stats={data.stats} />

			<section className={styles.ctaSection}>
				<h2 className={styles.ctaHeading}>This Isn't a Resume. It's a Launchpad.</h2>
				<p className={styles.ctaBody}>
					My journey is just getting started. If this has inspired you, you can start your own
					exploration.
				</p>
				<a href={startUrl} className={styles.ctaButton}>
					Start Your Own Journey
				</a>
			</section>
		</div>
	);
}

function PathCard({ path }: { path: JourneyPageData["top_paths"][number] }) {
	const [activeTab, setActiveTab] = useState<"me" | "parents" | "peers">("me");

	const handleTabChange = (value: "me" | "parents" | "peers") => {
		setActiveTab(value);
	};

	return (
		<article className={styles.pathCard}>
			<div className={styles.pathHeader}>
				<div className={styles.pathIconFrame}>
					{path.icon_url ? (
						<img
							src={path.icon_url}
							alt={`${path.title} icon`}
							className={styles.pathIcon}
						/>
					) : (
						<div className={styles.pathIconFallback}>
							<p>{path.title}</p>
							{path.icon_error ? <small>{path.icon_error}</small> : null}
						</div>
					)}
				</div>
				<h3 className={styles.pathTitle}>{path.title}</h3>
				<div>
					<p className={styles.whyTitle}>Why I'm Excited</p>
					<p className={styles.whyText}>{path.for_me_text}</p>
				</div>
			</div>

			<div className={styles.tabs}>
				<div role="tablist" aria-label={`${path.title} audience tabs`} className={styles.tabList}>
					<TabButton label="For Me" isActive={activeTab === "me"} onSelect={() => handleTabChange("me")} />
					<TabButton
						label="For My Parents/Teachers"
						isActive={activeTab === "parents"}
						onSelect={() => handleTabChange("parents")}
					/>
					<TabButton
						label="For My Peers"
						isActive={activeTab === "peers"}
						onSelect={() => handleTabChange("peers")}
					/>
				</div>

				{activeTab === "me" ? (
					<div role="tabpanel" className={styles.tabPanel}>
						<h3>Why I'm Excited</h3>
						<p>{path.for_me_text}</p>
					</div>
				) : null}

				{activeTab === "parents" ? (
					<div role="tabpanel" className={styles.tabPanel}>
						<h3>The Opportunity</h3>
		{path.for_parents_data ? (
			<>
				<ul>
					<li>📈 Growth Trend: {path.for_parents_data.growth_trend}</li>
					<li>💰 Salary Range: {path.for_parents_data.salary_range_uk}</li>
					<li>
						🔑 Key Skills: {path.for_parents_data.key_skills.join(", ")}
					</li>
				</ul>
				<small>Data sourced from {path.for_parents_data.source} via Perplexity.</small>
			</>
		) : (
			<p>
				{path.for_parents_message ??
					"This is a new and emerging field! Market data is still taking shape, which means it's a great time to be a pioneer."}
			</p>
		)}
	</div>
) : null}

				{activeTab === "peers" ? (
					<div role="tabpanel" className={styles.tabPanel}>
						<h3>What This Actually Means</h3>
						<p>{path.for_peers_text}</p>
						{path.for_peers_error ? <small>{path.for_peers_error}</small> : null}
					</div>
				) : null}
			</div>
		</article>
	);
}

function TabButton({
	label,
	isActive,
	onSelect,
}: {
	label: string;
	isActive: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={isActive}
			className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ""}`}
			onClick={onSelect}
		>
			{label}
		</button>
	);
}

function ShareButton() {
	const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

	const handleShare = async () => {
		try {
			if (navigator.share) {
				await navigator.share({
					title: document.title,
					url: window.location.href,
				});
				setStatus("idle");
				return;
			}
			await navigator.clipboard.writeText(window.location.href);
			setStatus("copied");
		} catch {
			setStatus("error");
		}

		window.setTimeout(() => setStatus("idle"), 2200);
	};

	const label =
		status === "copied" ? "Link copied!" : status === "error" ? "Copy failed" : "Share";

	return (
		<button type="button" className={styles.shareButton} onClick={handleShare}>
			{label}
		</button>
	);
}

function StatsGrid({ stats }: { stats: JourneyPageData["stats"] }) {
	return (
		<section className={styles.section} aria-labelledby="stats-heading">
			<h2 id="stats-heading" className={styles.sectionTitle}>
				My Journey by the Numbers
			</h2>
			<div className={styles.statsGrid}>
				<StatCard number={stats.insights_unlocked} label="Insights Unlocked" />
				<StatCard number={stats.pathways_explored} label="Pathways Explored" />
				<StatCard number={stats.paths_amped_about} label="Paths I'm Amped About" />
				<StatCard number={stats.bold_moves_made} label="Bold Moves Made" />
			</div>
		</section>
	);
}

function StatCard({ number, label }: { number: number; label: string }) {
	return (
		<div className={styles.statCard}>
			<div className={styles.statNumber}>{number}</div>
			<div className={styles.statLabel}>{label}</div>
		</div>
	);
}
