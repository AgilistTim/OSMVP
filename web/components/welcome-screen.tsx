"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";

const MISSION_BULLETS = [
	"Live events that don’t feel like school",
	"1:1 support, online and on your terms",
	"Real-world projects, not just quizzes",
];

const MISSION_VIDEO_SRC = "/videos/t4-credibility-learning-value-1x1-ad.mp4";

const MIRAI_SLIDES = [
	{
		id: "meet-mirai",
		label: "Meet MirAI",
		body: "The more you share what you’re into, the smarter MirAI gets at finding your next move.",
		aside: "No tests. No forms. Just a real conversation.",
	},
	{
		id: "careers-boring",
		label: "Careers advice. Boring?",
		body: "MirAI’s built different. She learns from what inspires you and ignores the rest. She’ll show you what’s possible and how to get there.",
		aside: "Expect playlists, creators, and paths you actually care about.",
	},
	{
		id: "future-shared",
		label: "Your future. Shared.",
		body: "Own your vision, show what makes you stand out, and build your journey with your people.",
		aside: "Save your ideas, share them when you’re ready, and keep everyone aligned.",
	},
];

export function WelcomeScreen() {
	const router = useRouter();
	const { beginSession } = useSession();

	const heroCards = useMemo(
		() => [
			{
				title: "You",
				text: "I’m obsessed with upcycling clothes but don’t know how to make it real.",
			},
			{
				title: "MirAI",
				text: "Let’s test a Cardiff makers’ market this weekend—I’ll line up tools, costs, and first customers.",
			},
			{
				title: "MirAI",
				text: "I’m saving the plan to your Journey page so you can share it with friends or mentors.",
			},
		],
		[]
	);

	const [activeSlide, setActiveSlide] = useState(0);

	const handlePrev = () => {
		setActiveSlide((current) => (current === 0 ? MIRAI_SLIDES.length - 1 : current - 1));
	};

	const handleNext = () => {
		setActiveSlide((current) => (current === MIRAI_SLIDES.length - 1 ? 0 : current + 1));
	};

	function handleStart() {
		beginSession();
		router.push('/chat-integrated');
	}

	return (
		<main className="landing-page" role="main">
			<section className="hero-section" aria-labelledby="landing-hero-title">
				<div className="hero-content">
					<h1 id="landing-hero-title" className="hero-title">
						Chat. Discover. Do.
					</h1>
					<p className="hero-subtitle">
						Talk to MirAI and get real ideas for what to do next. Jobs, side hustles or paths you’ve never thought of. Time to flip the script.
					</p>
					<div className="hero-actions">
						<button type="button" className="primary-button hero-cta" onClick={handleStart}>
							LET’S TALK
						</button>
						<p className="hero-actions-note">No sign-up. 5 minutes to create your future.</p>
					</div>
				</div>
				<div className="hero-visual" aria-hidden="true">
					<div className="hero-card-stack">
						{heroCards.map((card, index) => (
							<div key={`${card.title}-${index}`} className="hero-card">
								<p className="hero-card-title">{card.title}</p>
								<p className="hero-card-text">{card.text}</p>
							</div>
						))}
					</div>
				</div>
		</section>

			<section className="mirai-carousel" aria-labelledby="mirai-carousel-title">
				<header className="mirai-carousel-header">
					<p className="mirai-carousel-eyebrow">How MirAI helps</p>
					<h2 id="mirai-carousel-title" className="mirai-carousel-title">
						Three quick reasons to start talking
					</h2>
				</header>
				<div className="mirai-carousel-body">
					<button
						type="button"
						className="mirai-carousel-nav mirai-carousel-nav--prev"
						onClick={handlePrev}
						aria-label="Show previous MirAI highlight"
					>
						<span aria-hidden="true">←</span>
					</button>
					<div className="mirai-carousel-viewport">
						{MIRAI_SLIDES.map((slide, index) => (
							<article
								key={slide.id}
								id={slide.id}
								className={`mirai-slide ${index === activeSlide ? "mirai-slide--active" : ""}`}
								role="tabpanel"
								aria-hidden={index !== activeSlide}
							>
								<div className="mirai-slide-art" aria-hidden="true">
									<div className="mirai-slide-artwork">
										<span>{slide.label}</span>
									</div>
								</div>
								<div className="mirai-slide-copy">
									<h3>{slide.label}</h3>
									<p>{slide.body}</p>
									<div className="mirai-slide-aside">{slide.aside}</div>
								</div>
							</article>
						))}
					</div>
					<button
						type="button"
						className="mirai-carousel-nav mirai-carousel-nav--next"
						onClick={handleNext}
						aria-label="Show next MirAI highlight"
					>
						<span aria-hidden="true">→</span>
					</button>
				</div>
				<div className="mirai-carousel-dots" role="tablist" aria-label="MirAI highlights">
					{MIRAI_SLIDES.map((slide, index) => (
						<button
							key={slide.id}
							type="button"
							className={`mirai-carousel-dot ${index === activeSlide ? "mirai-carousel-dot--active" : ""}`}
							onClick={() => setActiveSlide(index)}
							role="tab"
							aria-selected={index === activeSlide}
							aria-controls={slide.id}
							tabIndex={index === activeSlide ? 0 : -1}
						>
							<span className="visually-hidden">{slide.label}</span>
						</button>
					))}
				</div>
			</section>

			<section className="mission-section" aria-labelledby="mission-heading">
				<div className="mission-content">
					<div className="mission-copy">
						<p className="mission-eyebrow">Who we are</p>
						<h2 id="mission-heading" className="mission-title">
							The OffScript mission
						</h2>
						<p className="mission-text">
							The OffScript mission is to help young people everywhere take ownership of their next steps and find purpose
							through live events, online support and real-world learning.
						</p>
						<ul className="mission-bullets">
							{MISSION_BULLETS.map((item) => (
								<li key={item}>
									<span>{item}</span>
								</li>
							))}
						</ul>
					</div>
					<div className="mission-video">
						<div className="mission-video-frame">
							<video
								src={MISSION_VIDEO_SRC}
								className="mission-video-player"
								playsInline
								controls
								loop
								muted
							>
								Your browser does not support the video tag.
							</video>
						</div>
						<p className="mission-video-caption">Watch how OffScript helps you turn ideas into real next steps.</p>
					</div>
				</div>
			</section>
		</main>
	);
}

export default WelcomeScreen;
