import { Card } from "@/components/ui/card";
import type { CareerSuggestion } from "@/components/session-provider";

interface SuggestionCardsProps {
	suggestions: CareerSuggestion[];
}

export function SuggestionCards({ suggestions }: SuggestionCardsProps) {
	return (
		<section className="space-y-3">
			<header>
				<h3 className="text-base font-semibold">Ideas people like you have turned into work</h3>
				<p className="text-sm text-muted-foreground">
					Pick what feels interesting, skip what doesn’t. These are snapshots of how folks turn
					similar vibes into paid work or side projects.
				</p>
			</header>
			<div className="space-y-3">
				{suggestions.map((suggestion) => (
					<Card key={suggestion.id} className="space-y-3 p-4">
						<div className="space-y-1">
							<h4 className="text-lg font-semibold">{suggestion.title}</h4>
							<p className="text-sm text-muted-foreground">{suggestion.summary}</p>
						</div>
						{suggestion.whyItFits.length > 0 ? (
							<div className="space-y-1 text-sm">
								<p className="font-medium text-foreground">Why this fits you</p>
								<ul className="list-disc space-y-1 pl-4">
									{suggestion.whyItFits.map((reason, idx) => (
										<li key={`${suggestion.id}-reason-${idx}`}>{reason}</li>
									))}
								</ul>
							</div>
						) : null}
						<div className="h-px w-full bg-border" />
						<div className="space-y-2 text-sm">
							<p className="font-medium text-foreground">People turn this into:</p>
							<ul className="list-disc space-y-1 pl-4">
								{suggestion.careerAngles.map((angle, idx) => (
									<li key={`${suggestion.id}-angle-${idx}`}>{angle}</li>
								))}
							</ul>
						</div>
						{suggestion.nextSteps.length > 0 ? (
							<div className="space-y-2 text-sm">
								<p className="font-medium text-foreground">Tiny experiments to try</p>
								<ul className="list-disc space-y-1 pl-4">
									{suggestion.nextSteps.map((step, idx) => (
										<li key={`${suggestion.id}-step-${idx}`}>{step}</li>
									))}
								</ul>
							</div>
						) : null}
					</Card>
				))}
			</div>
		</section>
	);
}
