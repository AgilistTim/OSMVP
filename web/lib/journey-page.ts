import type { CareerSuggestion } from "@/components/session-provider";

export interface JourneyInput {
	user_name: string;
	conversation_data: {
		opening_statement: string;
		total_insights: number;
		total_cards_generated: number;
		turning_points: string[];
		map_generation_data: {
			start_point: string;
			themes: string[];
			landmarks: string[];
		};
	};
	voting_data: {
		saved: Array<{
			title: string;
			why_it_fits: string;
		}>;
	};
}

export interface JourneyStats {
	insights_unlocked: number;
	pathways_explored: number;
	paths_amped_about: number;
	bold_moves_made: number;
}

export interface ParentsData {
	growth_trend: string;
	salary_range_uk: string;
	key_skills: string[];
	source: string;
}

export interface JourneyPath {
	title: string;
	icon_url: string | null;
	icon_error?: string;
	for_me_text: string;
	for_peers_text: string;
	for_peers_error?: string;
	for_parents_data: ParentsData | null;
	for_parents_message?: string;
}

export interface JourneyPageData {
	user_name: string;
	page_title: string;
	opening_statement: string;
	exploration_map_url: string | null;
	exploration_map_error?: string;
	top_paths: JourneyPath[];
	stats: JourneyStats;
}

type Fetcher = typeof fetch;

interface JourneyServices {
	fetch?: Fetcher;
	perplexityApiKey?: string;
	openAIApiKey?: string;
	perplexityModel?: string;
	openAIImageModel?: string;
	openAIChatModel?: string;
	perplexityEndpoint?: string;
	openAIChatEndpoint?: string;
	openAIImageEndpoint?: string;
}

export async function buildJourneyPageData(
	input: JourneyInput,
	services: JourneyServices = {}
): Promise<JourneyPageData> {
	if (!input) {
		throw new Error("buildJourneyPageData requires input data");
	}

	const fetchImpl = services.fetch ?? globalThis.fetch.bind(globalThis);
	const perplexityKey = services.perplexityApiKey ?? process.env.PERPLEXITY_API_KEY;
	const openAiKey = services.openAIApiKey ?? process.env.OPENAI_API_KEY;

	if (!perplexityKey) {
		throw new Error("PERPLEXITY_API_KEY is not configured");
	}
	if (!openAiKey) {
		throw new Error("OPENAI_API_KEY is not configured");
	}

	const savedPathsInput = input.voting_data.saved.slice(0, 3);
	const mapPrompt = createMapPrompt({
		userName: input.user_name,
		openingStatement: input.conversation_data.opening_statement,
		mapData: input.conversation_data.map_generation_data,
		turningPoints: input.conversation_data.turning_points,
		savedPaths: savedPathsInput,
	});
	if (process.env.NODE_ENV !== "production") {
		console.debug("[journey] Map image prompt", {
			user: input.user_name,
			prompt: mapPrompt,
		});
	}
	const mapResult = await safeCall(async () =>
		generateImage({
			apiKey: openAiKey,
			fetchImpl,
			endpoint: services.openAIImageEndpoint,
				model: services.openAIImageModel,
				prompt: mapPrompt,
				size: "1536x1024",
				style: "natural",
				quality: "high",
			})
		);

	const savedPaths = savedPathsInput;
	const topPaths: JourneyPath[] = [];
	for (const saved of savedPaths) {
		const iconPrompt = createIconPrompt(
			saved.title,
			input.conversation_data.map_generation_data.themes,
			saved.why_it_fits
		);
		if (process.env.NODE_ENV !== "production") {
			console.debug("[journey] Icon image prompt", {
				title: saved.title,
				prompt: iconPrompt,
			});
		}
		const iconResult = await safeCall(async () =>
			generateImage({
				apiKey: openAiKey,
				fetchImpl,
				endpoint: services.openAIImageEndpoint,
					model: services.openAIImageModel,
					prompt: iconPrompt,
					size: "1024x1024",
					style: "natural",
					quality: "high",
				})
			);

		const parentsResult = await safeCall(async () =>
			fetchPerplexityInsights({
				apiKey: perplexityKey,
				fetchImpl,
				endpoint: services.perplexityEndpoint,
				model: services.perplexityModel,
				title: saved.title,
			})
		);

		const peersResult = await safeCall(async () =>
			generatePeerExplanation({
				apiKey: openAiKey,
				fetchImpl,
				endpoint: services.openAIChatEndpoint,
				model: services.openAIChatModel,
				title: saved.title,
			})
		);

		const path: JourneyPath = {
			title: saved.title,
			icon_url: iconResult.value ?? null,
			for_me_text: saved.why_it_fits,
			for_peers_text: peersResult.value ?? defaultPeerFallback(saved.title),
			for_parents_data: parentsResult.value ?? null,
		};

		if (iconResult.error) {
			path.icon_error = iconResult.error.message;
		}
		if (parentsResult.error) {
			path.for_parents_message =
				"This is a new and emerging field! Market data is still taking shape, which means it's a great time to be a pioneer.";
		}
		if (peersResult.error) {
			path.for_peers_error = peersResult.error.message;
		}

		topPaths.push(path);
	}

	const stats: JourneyStats = {
		insights_unlocked: input.conversation_data.total_insights,
		pathways_explored: input.conversation_data.total_cards_generated,
		paths_amped_about: savedPaths.length,
		bold_moves_made: input.conversation_data.turning_points.length,
	};

	return {
		user_name: input.user_name,
		page_title: `${input.user_name}'s Career Exploration Journey`,
		opening_statement: input.conversation_data.opening_statement,
		exploration_map_url: mapResult.value ?? null,
		exploration_map_error: mapResult.error?.message,
		top_paths: topPaths,
		stats,
	};
}

function createMapPrompt({
	userName,
	openingStatement,
	mapData,
	turningPoints,
	savedPaths,
}: {
	userName: string;
	openingStatement: string;
	mapData: JourneyInput["conversation_data"]["map_generation_data"];
	turningPoints: string[];
	savedPaths: JourneyInput["voting_data"]["saved"];
}): string {
	const displayName = userName && userName !== "Your" ? `${userName}` : "this explorer";
	const possessiveName = userName && userName !== "Your" ? `${userName}'s` : "the explorer's";
	const startPoint = mapData.start_point?.trim() || "Curiosity Basecamp";
	const openingLine = openingStatement?.trim() || "I'm exploring what to do next.";

	const themeList = (mapData.themes ?? []).map((theme) => theme.trim()).filter(Boolean);
	const themeText =
		themeList.length > 0 ? themeList.map((theme) => `"${theme}"`).join(", ") : `"Emerging Sparks"`;

	const landmarkSet = new Set<string>();
	(mapData.landmarks ?? []).forEach((landmark) => {
		const trimmed = landmark.trim();
		if (trimmed) {
			landmarkSet.add(`"${trimmed}"`);
		}
	});
	turningPoints.forEach((point) => {
		const trimmed = point.trim();
		if (trimmed) {
			landmarkSet.add(`"${trimmed}"`);
		}
	});
	const landmarksText = landmarkSet.size > 0 ? Array.from(landmarkSet).join(", ") : null;

	const pathDestinations = savedPaths
		.map((path) => path.title.trim())
		.filter(Boolean)
		.map((title) => `"${title}"`);
	const pathText = pathDestinations.length > 0 ? pathDestinations.join(", ") : null;

	const lines: string[] = [
		`Create a hand-drawn exploration map that captures ${possessiveName} career journey.`,
		`Start the route at a location named "${startPoint}" inspired by the opening reflection "${openingLine}".`,
		`Draw distinctive regions for themes such as ${themeText}, each with simple icons or patterns.`,
	];

	if (landmarksText) {
		lines.push(`Mark important landmarks or pit-stops like ${landmarksText}.`);
	}

	if (pathText) {
		lines.push(`Show destination banners for career ideas such as ${pathText}.`);
	}

	lines.push(
		`Keep the style playful and sketched—bold black outlines, plenty of white space, and the palette of sky blue #87CEEB and peach #FFB6A3.`,
		"Use minimal typography and legible handwritten labels that would look good on desktop and mobile."
	);

	return lines.join(" ");
}

function createIconPrompt(title: string, themes: string[], whyItFits: string): string {
	const themeList = themes.map((theme) => theme.trim()).filter(Boolean);
	const themeText = themeList.length > 0 ? themeList.join(", ") : "the user's exploration themes";
	const reason = (whyItFits ?? "").trim() || "it sparks immediate, practical momentum for the user.";

	return [
		`Design a flat icon with bold black outlines that represents the career path "${title}".`,
		"Use simple geometric forms, no gradients, and the palette of sky blue (#87CEEB) and peach (#FFB6A3) on white.",
		`Reference ideas from ${themeText} and hint at why it resonates: "${reason}".`,
		"Make it feel friendly, modern, and suitable for a shareable student portfolio badge.",
	].join(" ");
}

function defaultPeerFallback(title: string): string {
	return `It's a path called "${title}" and I'm figuring out how to describe it in plain language.`;
}

async function fetchPerplexityInsights({
	apiKey,
	fetchImpl,
	endpoint,
	model,
	title,
}: {
	apiKey: string;
	fetchImpl: Fetcher;
	endpoint?: string;
	model?: string;
	title: CareerSuggestion["title"] | string;
}): Promise<ParentsData> {
	const url = endpoint ?? "https://api.perplexity.ai/chat/completions";
	const response = await fetchImpl(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: model ?? "pplx-7b-online",
			temperature: 0.2,
			top_p: 0.1,
			messages: [
				{
					role: "system",
					content:
						"You are a concise UK careers researcher. Respond with valid JSON only.",
				},
				{
					role: "user",
					content: [
						`Provide up-to-date UK-focused insights for the career path "${title}".`,
						"Return a JSON object with keys: growth_trend (string), salary_range_uk (string), key_skills (array of strings), source (string with publication or organisation name).",
						"If information is unavailable, set the values to null.",
					].join(" "),
				},
			],
		}),
	});

	if (!response.ok) {
		throw new Error(
			`Perplexity request failed with status ${response.status}`
		);
	}

	const payload = await response.json();
	const content: string | undefined =
		payload?.choices?.[0]?.message?.content ?? payload?.output;
	if (!content) {
		throw new Error("Perplexity response missing content");
	}

	const parsed = parseJsonContent(content);
	if (!parsed) {
		throw new Error("Perplexity response is not valid JSON");
	}

	if (process.env.NODE_ENV !== "production") {
		console.debug(`[journey] Perplexity response for "${title}"`, parsed);
	}

	const growth = typeof parsed.growth_trend === "string" ? parsed.growth_trend : null;
	const salary = typeof parsed.salary_range_uk === "string" ? parsed.salary_range_uk : null;
	const skills = Array.isArray(parsed.key_skills)
		? parsed.key_skills.filter((item: unknown): item is string => typeof item === "string")
		: [];
	const source = typeof parsed.source === "string" ? parsed.source : null;

	if (!growth && !salary && skills.length === 0) {
		throw new Error("Perplexity did not return usable data");
	}

	return {
		growth_trend: growth ?? "Market signal emerging; watch this space.",
		salary_range_uk: salary ?? "Salary benchmarks are still forming.",
		key_skills: skills.length > 0 ? skills : ["Curiosity", "Experimentation"],
		source: source ?? "Perplexity Research",
	};
}

async function generatePeerExplanation({
	apiKey,
	fetchImpl,
	endpoint,
	model,
	title,
}: {
	apiKey: string;
	fetchImpl: Fetcher;
	endpoint?: string;
	model?: string;
	title: string;
}): Promise<string> {
	const url = endpoint ?? "https://api.openai.com/v1/chat/completions";
	const response = await fetchImpl(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: model ?? "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content:
						"You explain career paths to Gen Z in a sharp, non-corporate tone using one sentence.",
				},
				{
					role: "user",
					content: `Explain the career path "${title}" in a single, relatable sentence for a 16-25 year old. Be authentic and avoid jargon.`,
				},
			],
			temperature: 0.6,
			max_tokens: 80,
		}),
	});

	if (!response.ok) {
		throw new Error(`OpenAI chat request failed with status ${response.status}`);
	}

	const payload = await response.json();
	const text: string | undefined =
		payload?.choices?.[0]?.message?.content?.trim() ??
		payload?.choices?.[0]?.text?.trim();
	if (!text) {
		throw new Error("OpenAI chat response missing content");
	}
	return text;
}

async function generateImage({
	apiKey,
	fetchImpl,
	endpoint,
	model,
	prompt,
	size,
	style,
	quality,
	background,
	outputFormat,
}: {
	apiKey: string;
	fetchImpl: Fetcher;
	endpoint?: string;
	model?: string;
	prompt: string;
	size?: string;
	style?: "vivid" | "natural";
	quality?: "high" | "medium" | "low" | "standard";
	background?: "transparent" | "opaque" | "auto";
	outputFormat?: "png" | "jpeg" | "webp";
}): Promise<string> {
	const url = endpoint ?? "https://api.openai.com/v1/images/generations";
	const resolvedModel = model ?? "gpt-image-1";

	const body: Record<string, unknown> = {
		model: resolvedModel,
		prompt,
		size: size ?? (resolvedModel === "gpt-image-1" ? "1024x1024" : "1024x1024"),
	};

	if (style && resolvedModel === "dall-e-3") {
		body.style = style;
	}

	if (resolvedModel === "gpt-image-1") {
		if (quality) {
			body.quality = quality;
		}
		if (background) {
			body.background = background;
		}
		if (outputFormat) {
			body.output_format = outputFormat;
		} else {
			body.output_format = "png";
		}
	} else if (resolvedModel === "dall-e-3") {
		body.quality = quality ?? "hd";
		body.style = style ?? "natural";
	}

	const response = await fetchImpl(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`OpenAI image request failed with status ${response.status}`);
	}

	const payload = await response.json();

	if (resolvedModel === "gpt-image-1") {
		const b64: string | undefined = payload?.data?.[0]?.b64_json;
		if (!b64) {
			throw new Error("OpenAI image response missing base64 data");
		}
		const format = (body.output_format as string) ?? "png";
		return `data:image/${format};base64,${b64}`;
	}

	const urlResult: string | undefined = payload?.data?.[0]?.url;
	if (!urlResult) {
		throw new Error("OpenAI image response missing url");
	}
	return urlResult;
}

function parseJsonContent(content: string): Record<string, unknown> | null {
	const trimmed = content.trim();
	let jsonText = trimmed;

	if (trimmed.startsWith("```")) {
		const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (match?.[1]) {
			jsonText = match[1];
		}
	}

	try {
		return JSON.parse(jsonText);
	} catch {
		return null;
	}
}

async function safeCall<T>(fn: () => Promise<T>): Promise<{ value: T | null; error?: Error }> {
	try {
		const value = await fn();
		return { value };
	} catch (error) {
		if (error instanceof Error) {
			return { value: null, error };
		}
		return { value: null, error: new Error("Unknown error") };
	}
}
