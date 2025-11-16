import { NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";

type ResourceRequest = {
	strengths?: Array<{ label: string; evidence?: string | null }>;
	goals?: Array<{ label: string; evidence?: string | null }>;
	themes?: Array<{ label: string }>;
};

type ResourceLink = {
	label: string;
	description: string;
	url: string;
	source: string;
};

type ResourceGroup = {
	title: string;
	description: string;
	resources: ResourceLink[];
};

const PERPLEXITY_ENDPOINT = process.env.PERPLEXITY_ENDPOINT ?? "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL ?? "sonar";

export async function POST(req: Request) {
	const apiKey = process.env.PERPLEXITY_API_KEY;
	if (!apiKey) {
		return NextResponse.json({ error: "PERPLEXITY_API_KEY is not configured" }, { status: 500 });
	}

	let payload: ResourceRequest;
	try {
		payload = (await req.json()) as ResourceRequest;
	} catch {
		return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
	}

	const strengths = (payload.strengths ?? []).map((item) => item.label).filter(Boolean);
	const goals = (payload.goals ?? []).map((item) => item.label).filter(Boolean);
	const themes = (payload.themes ?? []).map((item) => item.label).filter(Boolean);

	if (strengths.length === 0 && goals.length === 0 && themes.length === 0) {
		return NextResponse.json({ error: "No exploration context provided" }, { status: 400 });
	}

	const formattedPrompt = buildPrompt({ strengths, goals, themes });

	try {
		const response = await fetch(PERPLEXITY_ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: PERPLEXITY_MODEL,
				temperature: 0.2,
				max_tokens: 700,
				messages: [
					{
						role: "system",
						content:
							"You are MirAI, a UK youth career guide. Respond with strict JSON only. No markdown, no commentary.",
					},
					{
						role: "user",
						content: formattedPrompt,
					},
				],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("[exploration/resources] Perplexity request failed", {
				status: response.status,
				body: errorText.slice(0, 500),
			});
			return NextResponse.json({ error: "Unable to fetch exploration resources right now." }, { status: 502 });
		}

		const result = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};

		const rawContent = result.choices?.[0]?.message?.content ?? "";
		const jsonContent = extractJson(rawContent);

		if (!jsonContent) {
			console.error("[exploration/resources] Missing JSON in Perplexity response", {
				raw: rawContent.slice(0, 200),
			});
			return NextResponse.json({ error: "Unable to parse exploration resources." }, { status: 502 });
		}

		const groups = parseGroups(jsonContent);
		if (!groups || groups.length === 0) {
			console.error("[exploration/resources] Parsed response missing groups", { json: jsonContent });
			return NextResponse.json({ error: "No exploration resources returned." }, { status: 502 });
		}

		return NextResponse.json({ groups });
	} catch (error) {
		console.error("[exploration/resources] Unexpected failure", error);
		const message =
			error instanceof Error && error.name === "AbortError"
				? "The resource provider took too long to respond. Please try again."
				: "Unexpected error retrieving exploration resources.";
		return NextResponse.json({ error: message }, { status: 502 });
	}
}

function buildPrompt({
	strengths,
	goals,
	themes,
}: {
	strengths: string[];
	goals: string[];
	themes: string[];
}): string {
	const lines: string[] = [
		"Context for the learner:",
	];

	if (strengths.length > 0) {
		lines.push("Strengths:", ...strengths.map((item) => `- ${item}`));
	}
	if (goals.length > 0) {
		lines.push("Goals:", ...goals.map((item) => `- ${item}`));
	}
	if (themes.length > 0) {
		lines.push("Themes:", ...themes.map((item) => `- ${item}`));
	}

	lines.push(
		"",
		"Provide JSON: { \"groups\": [ { \"title\": string, \"description\": string, \"resources\": [ { \"label\": string, \"description\": string, \"url\": string, \"source\": \"course\"|\"community\"|\"experience\"|\"social\"|\"resource\" } ] } ] }",
		"Use these four group titles exactly: Self-directed curiosities, Plug into communities, Learn by doing, Ship experiments quickly.",
		"Each group should contain between 2 and 3 UK-relevant resources (courses, communities, accelerators, social accounts, or live opportunities).",
		"Across all groups, include at least one social media channel to follow (YouTube, TikTok, Instagram, LinkedIn, X, or newsletter) and mark it with source \"social\".",
		"Every url must begin with https:// and point to a reputable destination. Avoid paywalled or dead links.",
		"If a resource is global rather than UK-only, make sure it still provides practical value (e.g. proven tactics, global communities, study methods).",
		"Keep descriptions ≤140 characters and make them specific about the value of the link.",
		"If a group has no good matches, return an empty array for that group's resources.",
		"Never invent URLs. Prefer official sites, notable UK organisations, or globally credible programmes.",
		"Respond with JSON only."
	);

	return lines.join("\n");
}

function extractJson(rawContent: string): string | null {
	if (!rawContent) return null;

	const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (codeBlockMatch?.[1]) {
		return codeBlockMatch[1].trim();
	}

	const trimmed = rawContent.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		return trimmed;
	}

	const firstBrace = rawContent.indexOf("{");
	const lastBrace = rawContent.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		return rawContent.slice(firstBrace, lastBrace + 1).trim();
	}

	return null;
}

function parseGroups(jsonContent: string): ResourceGroup[] | null {
	const parsed = tryParseJson(jsonContent);
	if (!parsed || !parsed.groups || !Array.isArray(parsed.groups)) {
		return null;
	}

	const cleaned = parsed.groups
		.map((group) => sanitizeGroup(group))
		.filter((group): group is ResourceGroup => group !== null);
	return cleaned;
}

function sanitizeGroup(group: ResourceGroup): ResourceGroup | null {
	if (!group || typeof group !== "object") return null;
	const title = typeof group.title === "string" ? group.title.trim() : "";
	const description = typeof group.description === "string" ? group.description.trim() : "";
	const deduped: ResourceLink[] = [];
	const seenHosts = new Set<string>();
	if (Array.isArray(group.resources)) {
		group.resources.forEach((resource) => {
			const sanitized = sanitizeResource(resource);
			if (!sanitized) return;
			const host = getHost(sanitized.url);
			if (!host || seenHosts.has(host)) return;
			seenHosts.add(host);
			deduped.push(sanitized);
		});
	}

	if (!title) return null;

	return {
		title,
		description,
		resources: deduped,
	};
}

function sanitizeResource(resource: ResourceLink): ResourceLink | null {
	if (!resource || typeof resource !== "object") return null;
	const label = typeof resource.label === "string" ? resource.label.trim() : "";
	const description = typeof resource.description === "string" ? resource.description.trim() : "";
	const url = typeof resource.url === "string" ? resource.url.trim() : "";
	let source = typeof resource.source === "string" ? resource.source.trim().toLowerCase() : "";

	if (!label || !url || !url.startsWith("https://")) return null;
	const host = getHost(url);
	if (!host) return null;

	source = normaliseSource(source, host);

	return {
		label,
		description: description.slice(0, 140),
		url,
		source,
	};
}

function getHost(url: string): string | null {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

function normaliseSource(source: string, host: string): string {
	const allowed = new Set(["course", "community", "experience", "social", "resource"]);
	if (allowed.has(source)) return source;

	if (/youtube\.com|tiktok\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|newsletter/i.test(host)) {
		return "social";
}
	if (/eventbrite|meetup|discord|slack|community/i.test(host)) {
		return "community";
}
	if (/gov\.uk|ac\.uk|edu|college|academy|learn|course/i.test(host)) {
		return "course";
}
	if (/volunteer|do-it\.life|doit\.org|experience|placement/i.test(host)) {
		return "experience";
}

	return "resource";
}

function tryParseJson(input: string): { groups?: ResourceGroup[] } | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	try {
		return JSON.parse(trimmed) as { groups?: ResourceGroup[] };
	} catch (error) {
		try {
			const repaired = jsonrepair(trimmed);
			console.warn("[exploration/resources] JSON repair applied to Perplexity response", {
				originalError: error instanceof Error ? error.message : "unknown",
			});
			return JSON.parse(repaired) as { groups?: ResourceGroup[] };
		} catch (repairError) {
			console.error("[exploration/resources] Failed to parse JSON content", {
				originalError: error instanceof Error ? error.message : "unknown",
				repairError: repairError instanceof Error ? repairError.message : "unknown",
				snippet: trimmed.slice(0, 400),
			});
			return null;
		}
	}
}

