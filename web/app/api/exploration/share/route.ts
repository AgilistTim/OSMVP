import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { validateSharedExplorationPayload, MAX_SHARE_PAYLOAD_BYTES, SHARE_PAYLOAD_VERSION } from "@/lib/exploration-share";
import { SHARE_NAMESPACE } from "@/lib/exploration-share-server";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
	try {
		const payload = await parsePayload(request);
		const createdAt = new Date();
		const expiresAt = new Date(createdAt.getTime() + getTtlMs());
		const slug = createShareSlug();
		const storedPayload = {
			...payload,
			version: SHARE_PAYLOAD_VERSION,
			createdAt: createdAt.toISOString(),
			expiresAt: expiresAt.toISOString(),
			slug,
		};

		const encoded = new TextEncoder().encode(JSON.stringify(storedPayload));
		if (encoded.byteLength > MAX_SHARE_PAYLOAD_BYTES * 1.2) {
			return NextResponse.json({ error: "Share payload too large" }, { status: 413 });
		}

		await ensureBlobToken();
		await put(`${SHARE_NAMESPACE}/${slug}.json`, JSON.stringify(storedPayload), {
			access: "public",
			contentType: "application/json",
			addRandomSuffix: false,
		});

		return NextResponse.json({
			slug,
			expiresAt: storedPayload.expiresAt,
		});
	} catch (error) {
		if (error instanceof Response) {
			return error;
		}
		const message = error instanceof Error ? error.message : "Unexpected error";
		const status = /payload/i.test(message) ? 400 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}

async function parsePayload(request: Request) {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	try {
		return validateSharedExplorationPayload(raw);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid share payload";
		throw NextResponse.json({ error: message }, { status: 400 });
	}
}

function createShareSlug(): string {
	return `${Date.now().toString(36)}-${crypto.randomUUID().split("-")[0]}`;
}

function getTtlMs(): number {
	const fromEnv = Number(process.env.EXPLORATION_SHARE_TTL_MS);
	if (!Number.isNaN(fromEnv) && fromEnv > 0) {
		return fromEnv;
	}
	return DEFAULT_TTL_MS;
}

async function ensureBlobToken() {
	if (process.env.BLOB_READ_WRITE_TOKEN) {
		return;
	}
	throw NextResponse.json(
		{
			error: "BLOB_READ_WRITE_TOKEN is not configured",
		},
		{ status: 500 }
	);
}

