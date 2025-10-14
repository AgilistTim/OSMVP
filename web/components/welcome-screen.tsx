"use client";

import { useMemo } from "react";
import { useSession } from "@/components/session-provider";

const VALUE_CARDS = [
	{
		title: "Name the mission",
		text: "Surface the problems, people, or causes you actually want to back – not just the subjects on your timetable.",
	},
	{
		title: "Translate your worth",
		text: "Turn projects, side hustles, and everyday wins into proof of what you can deliver next.",
	},
	{
		title: "Co-pilot with your people",
		text: "Share a living mission page with parents, mentors, or supporters so everyone pulls in the same direction.",
	},
	{
		title: "Experiment on purpose",
		text: "Keep running low-stakes experiments, capture what you learn, and adjust your roadmap without starting again.",
	},
];

const HOW_STEPS = [
	{
		step: "1",
		title: "Start with your world",
		text: "We talk about the projects, people, and playlists you’re already obsessed with so we’re designing from energy, not emptiness.",
	},
	{
		step: "2",
		title: "Map possibility spaces",
		text: "We connect your mission to creators, founders, and communities rewriting the rules – plus small actions you can try this week.",
	},
	{
		step: "3",
		title: "Build your Offscript playbook",
		text: "Collect insights, next experiments, and talking points in a page you can share with the people backing you.",
	},
];

const VIDEO_FEATURES = [
	{
		title: "Launchpad energy",
		text: "Clips from OFFSCRIPT sessions – where founders and creators light up the room and remind you to stay curious.",
		src: "/videos/AdobeStock_779518867.mov",
		accent: "coral",
	},
	{
		title: "Learning out loud",
		text: "Stories of young adults testing ideas in public and learning faster by sharing the mess.",
		src: "/videos/AdobeStock_1555953349.mov",
		accent: "mint",
	},
	{
		title: "Creativity is a muscle",
		text: "A reminder that experimentation beats perfection – straight from the OFFSCRIPT crew.",
		src: "/videos/AdobeStock_239572930.mov",
		accent: "blue",
	},
];

export function WelcomeScreen() {
	const { beginSession } = useSession();

	const heroCards = useMemo(
		() => [
			{
				title: "Mission > job title",
				text: "Figure out the change you care about before you worry about the role.",
			},
			{
				title: "Allies included",
				text: "Keep friends, parents, and mentors aligned with a living mission page.",
			},
		],
		[]
	);

	function handleStart() {
		beginSession();
	}

	return (
		<main className="landing-page" role="main">
			<section className="hero-section" aria-labelledby="landing-hero-title">
			<div className="hero-content">
				<span className="hero-kicker">Offscript Generation</span>
				<h1 id="landing-hero-title" className="hero-title">
					Write the mission you want to work on
				</h1>
				<p className="hero-subtitle">
					We’re the personal mission co-pilot spun out from the OFFSCRIPT summit crew.
				</p>
				<p className="hero-body">
					Recognise your worth, name the problems you actually care about, and test bespoke routes that fit you— not someone else’s playbook.
				</p>
				<div className="hero-actions">
					<button type="button" className="primary-button hero-cta" onClick={handleStart}>
						Start the chat
					</button>
					<p className="hero-actions-note">No sign-up. 15 minutes to grab your first experiments.</p>
				</div>
			</div>
				<div className="hero-visual" aria-hidden="true">
					<div className="hero-card-stack">
						{heroCards.map((card) => (
							<div key={card.title} className="hero-card">
								<p className="hero-card-title">{card.title}</p>
								<p className="hero-card-text">{card.text}</p>
							</div>
						))}
					</div>
				</div>
		</section>

		<section className="mission-reels" aria-labelledby="mission-reels-title">
			<header className="mission-reels-header">
				<h2 id="mission-reels-title" className="section-header">
					Offscript Generation in motion
				</h2>
				<p className="value-card-text">
					Short clips from our parent summit show the energy, honesty, and experimentation you’ll tap into here.
				</p>
			</header>
			<div className="mission-reels-grid">
				{VIDEO_FEATURES.map((feature) => (
					<article key={feature.title} className={`video-bubble video-bubble-${feature.accent}`}>
						<div className="video-frame">
							<video controls playsInline preload="metadata" autoPlay muted loop>
								<source src={feature.src} type="video/quicktime" />
								Your browser does not support the video tag.
							</video>
						</div>
						<h3 className="video-bubble-title">{feature.title}</h3>
						<p className="video-bubble-text">{feature.text}</p>
					</article>
				))}
			</div>
		</section>

		<section className="value-props" aria-labelledby="landing-value-title">
				<h2 id="landing-value-title" className="section-header">
					What You Get:
				</h2>
				{VALUE_CARDS.map((card) => (
					<article key={card.title} className="value-card">
						<h3 className="value-card-title">{card.title}</h3>
						<p className="value-card-text">{card.text}</p>
					</article>
				))}
			</section>

			<section className="how-it-works" aria-labelledby="landing-how-title">
				<div className="how-grid">
					<header>
						<h2 id="landing-how-title" className="section-header">
							How It Actually Works:
						</h2>
						<p className="value-card-text">We start where you are, not where we think you should be.</p>
					</header>
					{HOW_STEPS.map((step) => (
						<article key={step.step} className="how-step step-card" data-step={step.step}>
							<div className="how-step-number" aria-hidden="true">
								{step.step}
							</div>
							<h3 className="how-step-title">{step.title}</h3>
							<p className="how-step-text">{step.text}</p>
						</article>
					))}
				</div>
			</section>

			<section className="cta-section" aria-labelledby="landing-cta-title">
				<h2 id="landing-cta-title" className="cta-title">
					Ready to start?
				</h2>
				<p className="cta-text">
					No signup required. No email collection. Just start the conversation.
				</p>
				<p className="cta-text">
					{
						"We'll begin by chatting about what you're currently into and what you're trying to figure out. Takes about 15-30 minutes, and you can always come back to continue later."
					}
				</p>
				<button type="button" className="primary-button primary-cta-button" onClick={handleStart}>
					Start YOUR discussion
				</button>
			</section>

			<div className="sticky-cta" role="complementary" aria-label="Start your Off-script discussion">
				<button type="button" className="primary-button primary-cta-button sticky-cta-button" onClick={handleStart}>
					Start YOUR discussion
				</button>
			</div>
		</main>
	);
}

export default WelcomeScreen;
