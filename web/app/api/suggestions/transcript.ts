type TranscriptTurn = { role: string; text: string };

export function summariseTranscript(transcript: TranscriptTurn[]): string {
	return transcript
		.filter((item) => typeof item?.text === "string" && item.text.trim().length > 0)
		.map((item) => ({
			role: typeof item.role === "string" ? item.role.trim() : "",
			text: item.text.trim(),
		}))
		.filter((item) => item.role.length > 0)
		.map((item) => `${item.role}: ${item.text}`)
		.join("\n");
}

