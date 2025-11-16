export interface ThemeLike {
	label: string;
}

export interface HeroSignal {
	label: string;
	evidence?: string | null;
}

function capitalize(word: string): string {
	if (!word) return word;
	return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function capitalizeSentence(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function humaniseTheme(raw: string): string {
	let text = raw.trim();
	if (!text) return "your next chapter";

	text = text.replace(/\s+/g, " ");
	text = text.replace(/\bAI\b/gi, "AI");
	text = text.replace(/^(my own|my|our)\s+/i, "");
	text = text.replace(/^(the|a|an)\s+/i, "");
	text = text.replace(/\s+/g, " ").trim();

	const words = text.split(" ");
	if (words.length === 0) {
		return "your next chapter";
	}

	const verbMap: Record<string, string> = {
		help: "Helping",
		helping: "Helping",
		build: "Building",
		building: "Building",
		create: "Creating",
		creating: "Creating",
		turn: "Turning",
		turning: "Turning",
		launch: "Launching",
		launching: "Launching",
		support: "Supporting",
		supporting: "Supporting",
		develop: "Developing",
		developing: "Developing",
		make: "Making",
		making: "Making",
		refine: "Refining",
		refining: "Refining",
		start: "Starting",
		starting: "Starting",
	};

	const firstLower = words[0].toLowerCase();
	const leadsWithVerb = verbMap[firstLower] !== undefined;
	if (leadsWithVerb) {
		words[0] = verbMap[firstLower];
	} else {
		words[0] = capitalize(words[0]);
	}

	for (let i = 1; i < words.length; i += 1) {
		const lower = words[i].toLowerCase();
		if (verbMap[lower]) {
			words[i] = verbMap[lower];
		} else if (lower === "ai") {
			words[i] = "AI";
		} else if (lower === "tool" && i > 0 && words[i - 1].toLowerCase() === "ai") {
			words[i] = "tool";
		} else {
			words[i] = words[i].toLowerCase();
		}
	}

	let result = words.join(" ").replace(/\s+/g, " ").trim();
	result = result.replace(/\bai\b/gi, "AI");

	if (leadsWithVerb) {
		result = result.replace(/with (the )?AI/i, "with your AI");
		return result;
	}

	if (!/^Your\b/i.test(result)) {
		result = `Your ${result}`;
	}

	return result.charAt(0).toUpperCase() + result.slice(1);
}

function formatList(items: string[]): string {
	if (items.length === 0) return "";
	if (items.length === 1) return items[0];
	if (items.length === 2) return `${items[0]} and ${items[1]}`;
	return `${items.slice(0, items.length - 1).join(", ")}, and ${items[items.length - 1]}`;
}

export function formatStrengthLabel(raw: string): string {
	const text = raw.trim();
	if (!text) return text;
	const normalised = text.replace(/\bai\b/gi, "AI");
	return normalised.charAt(0).toUpperCase() + normalised.slice(1);
}

export function formatGoalLabel(raw: string): string {
	let text = raw.trim();
	if (!text) return text;
	text = text.replace(/['’]/g, "'");
	text = text.replace(/\bmy\b/gi, "your");
	text = text.replace(/\bme\b/gi, "you");
	text = text.replace(/\bI\b/gi, "you");
	text = text.replace(/\bai\b/gi, "AI");
	text = text.replace(/\s+/g, " ");

	const leadPatterns: Array<RegExp> = [
		/^do\s+/i,
		/^it's just\s+/i,
		/^it's\s+/i,
		/^just\s+/i,
		/^i\s+want\s+to\s+/i,
		/^i\s+need\s+to\s+/i,
		/^need\s+to\s+/i,
		/^i\s+have\s+to\s+/i,
		/^have\s+to\s+/i,
		/^i\s+gotta\s+/i,
		/^gotta\s+/i,
		/^i\s+am\s+going\s+to\s+/i,
		/^i'm\s+going\s+to\s+/i,
		/^i\s+should\s+/i,
		/^should\s+/i,
		/^to\s+/i,
	];

	for (const pattern of leadPatterns) {
		if (pattern.test(text)) {
			text = text.replace(pattern, "");
			break;
		}
	}

	text = text.replace(/\bbecause\s*$/i, "").trim();
	text = text.replace(/\band\s*$/i, "").trim();
	text = text.replace(/\s+/g, " ").trim();

	if (!text) {
		return "";
	}

	return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatInterestLabel(raw: string): string {
	return summariseInterestLabel(raw);
}

export function formatHeroSummary(
	strengths: HeroSignal[],
	goals: HeroSignal[],
	themes: ThemeLike[]
): string {
	const strengthPhrases = strengths
		.map((item) => formatStrengthLabel(item.label))
		.filter((value, index, self) => value.length > 0 && self.indexOf(value) === index)
		.slice(0, 2);
	const goalPhrases = goals
		.map((item) => formatGoalLabel(item.label))
		.filter((value, index, self) => value.length > 0 && self.indexOf(value) === index)
		.slice(0, 2);

	if (strengthPhrases.length > 0 && goalPhrases.length > 0) {
		return `Leading with ${formatList(strengthPhrases)} while you pursue ${formatList(goalPhrases)}.`;
	}

	if (strengthPhrases.length > 0) {
		return `Leading with ${formatList(strengthPhrases)} while we shape what comes next.`;
	}

	if (goalPhrases.length > 0) {
		return `Focusing on ${formatList(goalPhrases)} and mapping the moves to get there.`;
	}

	const themePhrases = themes
		.map((theme) => formatInterestLabel(theme.label))
		.filter((value) => value.length > 0)
		.slice(0, 3);

	if (themePhrases.length > 0) {
		return `Exploring pathways around ${formatList(themePhrases)}.`;
	}

	return "Exploring new pathways and building momentum.";
}

function summariseInterestLabel(raw: string): string {
	const cleaned = cleanConversationFragment(raw);
	if (!cleaned) return "";

	const lower = cleaned.toLowerCase();
	if (lower.includes("culinary")) {
		return "Culinary arts inspire your ideas";
}
	if (lower.includes("youtube")) {
		return "Immersed in YouTube inspiration";
}
	if (lower.includes("italian")) {
		return "Exploring Italian cuisine";
}
	if (lower.includes("travel")) {
		return "Dreaming about travelling the world";
}
	if (lower.includes("challenge")) {
		return "Preparing for new challenges";
}
	if (/there'?s not much else.*have to do it/i.test(cleaned)) {
		return "Stepping up when others can't";
}
	if (/have to do it/i.test(cleaned) && /space/.test(lower)) {
		return "Owning the space when it matters";
}

	const words = cleaned.split(/\s+/).filter(Boolean);
	if (words.length > 12) {
		return words.slice(0, 12).join(" ") + "…";
}
	const sentence = capitalizeSentence(cleaned).replace(/\bAi\b/g, "AI");
	return sentence;
}

function cleanConversationFragment(raw: string): string {
	let text = raw.trim();
	if (!text) return "";

	text = text.replace(/[“”"']/g, "");
	text = text.replace(/\s+/g, " ");

	const sentenceMatch = text.split(/[.?!]/).map((part) => part.trim()).filter(Boolean);
	if (sentenceMatch.length > 0) {
		text = sentenceMatch[0];
}

	text = text.replace(/\s*,?\s*and then\b.*$/i, "");
	text = text.replace(/\s*,?\s*and\b\s*$/i, "");
	const commaSplit = text.split(/,/);
	if (commaSplit.length > 0) {
		text = commaSplit[0];
}

	text = text.replace(/^(and|so|but|then)\s+/i, "");
	text = text.replace(/\bare going to\b/gi, "will");
	text = text.replace(/\bmom\b/gi, "mum");
	text = text.replace(/\bthey\b/gi, "you");
	text = text.replace(/\bi'm\b/gi, "you're");
	text = text.replace(/\bi am\b/gi, "you are");
	text = text.replace(/\bi've\b/gi, "you have");
	text = text.replace(/\bi\b/gi, "you");
	text = text.replace(/\bmy\b/gi, "your");
	text = text.replace(/\bme\b/gi, "you");
	text = text.replace(/\bgoing to\b/gi, "planning to");

	text = text.replace(/\s+/g, " ").trim();
	if (text.length < 4) return "";

	const stopWords = new Set(["out", "also", "yeah", "ok", "okay", "yep", "nope", "well"]);
	if (stopWords.has(text.toLowerCase())) return "";

	return text;
}

