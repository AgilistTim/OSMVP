"use client";

import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useSession } from "@/components/session-provider";

const VALUE_POINTS = [
	"Personalised conversation that adapts to your career readiness (G1–G4)",
	"Draft career matches surfaced mid-chat with quick reactions",
	"Shareable Matches Report capturing strengths, themes, and next steps",
];

const HOW_IT_WORKS = [
	"Share a few interests, experiences, and constraints",
	"See draft career cards appear after the first couple of questions",
	"Vote on what resonates and unlock a Matches Report you can share",
];

export function WelcomeScreen() {
	const { mode, setMode, beginSession } = useSession();

	function handleModeSelect(nextMode: "text" | "voice") {
		setMode(nextMode);
	}

	function handleStart() {
		if (!mode) {
			setMode("text");
		}
		beginSession();
	}

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-10">
			<section className="space-y-3">
				<span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
					Career exploration
				</span>
				<h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
					Finding your future starts here
				</h1>
				<p className="text-base text-muted-foreground sm:text-lg">
					Answer a handful of guided prompts and we’ll surface curated career ideas,
					make sense of your strengths, and publish a Matches Report you can share.
				</p>
			</section>

			<Card className="gap-0">
				<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<Sparkles className="size-4 text-primary" aria-hidden />
						What you’ll unlock
					</CardTitle>
					<CardDescription>
						A conversational guide designed for early career exploration.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2">
					<ul className="space-y-2 text-sm text-foreground">
						{VALUE_POINTS.map((point) => (
							<li key={point} className="flex items-start gap-2">
								<Check className="mt-0.5 size-4 text-primary" aria-hidden />
								<span>{point}</span>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<Card className="gap-0">
				<CardHeader className="pb-3">
					<CardTitle className="text-base font-semibold">How it works</CardTitle>
					<CardDescription>
						We tailor every question, then capture a profile that powers your report.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ol className="space-y-2 text-sm text-muted-foreground">
						{HOW_IT_WORKS.map((step, index) => (
							<li key={step} className="flex items-start gap-3">
								<span className="mt-0.5 size-6 rounded-full bg-primary/10 text-center text-xs font-semibold leading-6 text-primary">
									{index + 1}
								</span>
								<span>{step}</span>
							</li>
						))}
					</ol>
				</CardContent>
			</Card>

			<section className="rounded-2xl border bg-muted/40 p-5">
				<span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
					Choose how to chat
				</span>
				<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => handleModeSelect("text")}
						className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
							mode === "text"
								? "border-primary bg-primary/10 text-primary"
								: "border-border bg-background hover:border-primary/60"
						}`}
					>
						<span className="block font-semibold">Text chat</span>
						<span className="mt-1 block text-xs text-muted-foreground">
							Type responses at your own pace.
						</span>
					</button>
					<button
						type="button"
						onClick={() => handleModeSelect("voice")}
						className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
							mode === "voice"
								? "border-primary bg-primary/10 text-primary"
								: "border-border bg-background hover:border-primary/60"
						}`}
					>
						<span className="block font-semibold">Voice guide</span>
						<span className="mt-1 block text-xs text-muted-foreground">
							Speak your answers and let us transcribe.
						</span>
					</button>
				</div>
				<p className="mt-3 text-xs text-muted-foreground">
					You can switch modes later inside the conversation.
				</p>
				<Button size="lg" className="mt-6 w-full" onClick={handleStart}>
					Get started
				</Button>
			</section>
		</div>
	);
}

export default WelcomeScreen;
