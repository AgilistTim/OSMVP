import { Metadata } from "next";
import { ExplorationView } from "@/components/exploration/exploration-view";

export const metadata: Metadata = {
	title: "Exploration Journey | Off-script",
	description: "Transforming exploration conversations into a shareable mission page.",
};

export default function ExplorationPage() {
	return (
		<div className="exploration-page">
			<ExplorationView />
		</div>
	);
}
