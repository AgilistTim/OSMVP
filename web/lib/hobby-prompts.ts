type HobbyMapping = {
	keywords: string[];
	skills: string[];
	fields: string[];
	customPrompt?: string;
};

const HOBBY_MAPPINGS: HobbyMapping[] = [
	{
		keywords: ["rugby", "football", "soccer", "hockey"],
		skills: ["teamwork", "situational awareness", "communication"],
		fields: ["project management", "team leadership", "event planning"],
		customPrompt:
			"Rugby takes teamwork. Would you say you're strong at teamwork, game awareness, and communicating under pressure? Those skills show up constantly in project management, team leadership, and even event planning.",
	},
	{
		keywords: ["tennis", "badminton"],
		skills: ["discipline", "self-coaching", "pattern recognition"],
		fields: ["coaching", "operations coordination", "product testing"],
		customPrompt:
			"Tennis looks solo, but it demands discipline and self-coaching. Do those strengths resonate for you? They're the backbone of coaching others, coordinating operations, and even product testing roles.",
	},
	{
		keywords: ["cook", "chef", "kitchen", "bake", "baking"],
		skills: ["planning", "time management", "quality control"],
		fields: ["operations planning", "hospitality management", "product development"],
		customPrompt:
			"Cooking well means planning, timing, and keeping quality high. Would you call those strengths of yours? They translate directly into operations planning, hospitality management, and even product development.",
	},
	{
		keywords: ["music", "band", "sing", "song", "guitar", "piano"],
		skills: ["creative discipline", "audience empathy", "collaboration"],
		fields: ["content production", "marketing", "community building"],
		customPrompt:
			"Making music sharpens creative discipline and collaboration. Does that fit how you work? Those skills power content production, marketing, and community-building roles.",
	},
];

const POSITIVE_SUFFIX =
	"If that sounds right, say so and we can work with those strengths. If not, tell me what's closer.";

const GENERIC_TEMPLATE = (label: string, skills: string[], fields: string[]) =>
	`You're obviously into ${label}. Would you say you're strong at ${skills.join(
		", "
	)}? Those show up a ton in ${fields.join(", ")}.`;

export function buildHobbyDeepeningPrompt(label: string): {
	prompt: string;
	skills: string[];
	fields: string[];
} {
	const normalized = label.toLowerCase();
	const mapping =
		HOBBY_MAPPINGS.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword))) ?? null;

	if (mapping) {
		const basePrompt = mapping.customPrompt ?? GENERIC_TEMPLATE(label, mapping.skills, mapping.fields);
		return {
			prompt: `${basePrompt.trim()} ${POSITIVE_SUFFIX}`.trim(),
			skills: mapping.skills,
			fields: mapping.fields,
		};
	}

	const fallbackSkills = ["planning", "communication", "self-direction"];
	const fallbackFields = ["project coordination", "people leadership", "community roles"];

	return {
		prompt: `${GENERIC_TEMPLATE(label, fallbackSkills, fallbackFields)} ${POSITIVE_SUFFIX}`,
		skills: fallbackSkills,
		fields: fallbackFields,
	};
}
