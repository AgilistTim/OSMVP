"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { JourneyPage } from "@/components/journey/journey-page";
import type { JourneyPageData } from "@/lib/journey-page";
import { buildJourneyInputFromSession } from "@/lib/journey-input";
import { useSession } from "@/components/session-provider";

type Status = "idle" | "loading" | "loaded" | "error" | "ready";

export function JourneyPreview() {
	const { profile, suggestions, votesByCareerId, turns, started } = useSession();
	const [status, setStatus] = useState<Status>("idle");
	const [data, setData] = useState<JourneyPageData | null>(null);
	const [error, setError] = useState<string | null>(null);

	const turnCount = turns.length;
	const insightCount = profile.insights.length;
	const savedCount = useMemo(
		() => suggestions.filter((suggestion) => votesByCareerId[suggestion.id] === 1).length,
		[suggestions, votesByCareerId]
	);
	const canBuild = started && (turnCount > 0 || insightCount > 0 || savedCount > 0);

	const payload = useMemo(() => {
		if (!canBuild) {
			return null;
		}
		return buildJourneyInputFromSession({
			profile,
			suggestions,
			votesByCareerId,
			turns,
		});
	}, [canBuild, profile, suggestions, votesByCareerId, turns]);

	const payloadString = useMemo(() => (payload ? JSON.stringify(payload) : null), [payload]);

	useEffect(() => {
		if (!payload || !payloadString) {
			return;
		}

		let cancelled = false;
		setStatus("loading");
		setError(null);

		const fetchData = async () => {
			try {
				const response = await fetch("/api/journey", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: payloadString,
				});

				if (!response.ok) {
					const message = await extractErrorMessage(response);
					throw new Error(message ?? `Request failed with status ${response.status}`);
				}

				const body = (await response.json()) as { data?: JourneyPageData };
				if (!body?.data) {
					throw new Error("Journey data missing from response");
				}
				if (!cancelled) {
					setData(body.data);
					setStatus("loaded");
				}
			} catch (err) {
				if (cancelled) return;
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(message);
				setStatus("error");
			}
		};

		fetchData();

		return () => {
			cancelled = true;
		};
	}, [payload, payloadString]);

	if (!started) {
		return renderMessage("Run a chat session to populate the journey preview.");
	}

	if (!canBuild) {
		return renderMessage("Share a few details in the chat to unlock the journey page preview.");
	}

	if (status === "loading" || status === "idle") {
		return renderMessage("Assembling your journey page…");
	}

	if (status === "error" || !data) {
		return renderError(error ?? "We could not build the journey page.");
	}

	return <JourneyPage data={data} startUrl="/chat-poc" />;
}

function renderMessage(text: string) {
	return (
		<div style={messageStyle}>
			<p>{text}</p>
		</div>
	);
}

function renderError(text: string) {
	return (
		<div style={{ ...messageStyle, borderColor: "#ffb6a3", backgroundColor: "#fff3ed" }}>
			<p style={{ fontWeight: 600 }}>Something went wrong</p>
			<p>{text}</p>
		</div>
	);
}

async function extractErrorMessage(response: Response): Promise<string | null> {
	try {
		const data = await response.json();
		if (typeof data?.error === "string") {
			return data.error;
		}
		return null;
	} catch {
		return null;
	}
}

const messageStyle: CSSProperties = {
	padding: "48px",
	margin: "0 auto",
	maxWidth: "640px",
	borderRadius: "24px",
	border: "3px solid #000000",
	backgroundColor: "#ffb6a3",
	fontFamily: '"Inter", "Manrope", system-ui, sans-serif',
	textAlign: "center",
	lineHeight: 1.6,
};
