"use client";

import { useMemo } from "react";
import { useSession } from "@/components/session-provider";

const VALUE_CARDS = [
	{
		title: "A conversation that doesn't suck",
		text: "No corporate BS or weird assessment questions. Just a chat about what you're working on and where you want to go with it.",
	},
	{
		title: "Stuff you can actually try",
		text: "Get specific next steps, people to check out, and projects to experiment with - not just generic career descriptions.",
	},
	{
		title: "Something to share with the important people",
		text: "A dynamic page that captures your exploration journey. Share it with parents, teachers, or mentors to have better conversations about your future.",
	},
	{
		title: "Your journey evolves with you",
		text: "Update your exploration as you try new things and figure out what works. This isn't a one-and-done assessment.",
	},
];

const HOW_STEPS = [
	{
		step: "1",
		title: "Chat about what you're up to",
		text: "What's been keeping you busy? What are you working on that you actually care about? We'll chat about your current interests and what draws you to them.",
	},
	{
		step: "2",
		title: "Explore what's possible",
		text: "Based on what you've shared, we'll suggest areas you might want to explore. See how your interests could translate into different paths - including ones you probably haven't thought of.",
	},
	{
		step: "3",
		title: "Get your roadmap",
		text: "We'll create a personalized page with your exploration summary, next steps to try, and questions to discuss with people in your life. You can share it and update it as you learn more about yourself.",
	},
];

export function WelcomeScreen() {
	const { beginSession } = useSession();

	const heroCards = useMemo(
		() => [
			{
				title: "Real Talk",
				text: "You steer the chat. We just keep the momentum.",
			},
			{
				title: "Next Steps",
				text: "Every suggestion comes with tiny experiments you can run this week.",
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
					<span className="hero-kicker">Build your own path</span>
					<h1 id="landing-hero-title" className="hero-title">
						Figure out what you actually want to do
					</h1>
					<p className="hero-subtitle">Skip the career quizzes and personality tests.</p>
						<p className="hero-body">
							{
								"Have a real conversation about what you're into, what you're good at, and where you might want to take it. Get a personalized roadmap you can actually use."
							}
						</p>
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
