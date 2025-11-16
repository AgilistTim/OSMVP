import { list } from "@vercel/blob";
import { validateSharedExplorationPayload, type SharedExplorationPayload } from "@/lib/exploration-share";

export const SHARE_NAMESPACE = "exploration-shares";

function isValidSlug(value: string): boolean {
	return /^[a-z0-9-]+$/i.test(value);
}

export async function fetchSharedExplorationPayload(slug: string): Promise<SharedExplorationPayload | null> {
	if (!isValidSlug(slug)) {
		return null;
	}
	try {
		const listing = await list({
			token: process.env.BLOB_READ_WRITE_TOKEN,
			prefix: `${SHARE_NAMESPACE}/${slug}.json`,
			limit: 1,
		});
		const blob = listing.blobs?.[0];
		if (!blob) {
			return null;
		}
		const response = await fetch(blob.downloadUrl);
		if (!response.ok) {
			return null;
		}
		const payload = validateSharedExplorationPayload(await response.json());
		return payload;
	} catch (error) {
		if (error instanceof Error && /not found/i.test(error.message)) {
			return null;
		}
		throw error;
	}
}

export function getShareCanonicalUrl(slug: string, origin: string): string {
	return `${origin.replace(/\/$/, "")}/exploration/shared/${slug}`;
}

