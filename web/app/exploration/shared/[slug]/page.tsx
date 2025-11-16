import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchSharedExplorationPayload, getShareCanonicalUrl } from "@/lib/exploration-share-server";
import { SharedExplorationView } from "@/components/exploration/exploration-view";

interface PageProps {
	params: Promise<{
		slug: string;
	}>;
}

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const payload = await fetchSharedExplorationPayload(slug);
	if (!payload) {
		return {
			title: "Journey not found | Off-Script",
		};
	}
	return {
		title: `${payload.userName}’s journey | Off-Script`,
		description: payload.heroSummary,
	};
}

export default async function SharedJourneyPage({ params }: PageProps) {
	const { slug } = await params;
	const payload = await fetchSharedExplorationPayload(slug);
	if (!payload) {
		notFound();
	}
	const expired =
		payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now();
	if (expired) {
		return (
			<div className="exploration-shared-expired">
				<div className="exploration-shared-expired-card">
					<h1>Share link expired</h1>
					<p>This journey link has expired. Ask the owner to generate a fresh link.</p>
					<a className="share-primary" href="/chat-integrated">
						Start your own journey
					</a>
				</div>
			</div>
		);
	}
	const hdrs = await headers();
	const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
	const protocol = hdrs.get("x-forwarded-proto") ?? "https";
	const origin = host ? `${protocol}://${host}` : "";
	const canonicalUrl = origin ? getShareCanonicalUrl(slug, origin) : "";
	return (
		<SharedExplorationView slug={slug} payload={payload} canonicalUrl={canonicalUrl} />
	);
}

