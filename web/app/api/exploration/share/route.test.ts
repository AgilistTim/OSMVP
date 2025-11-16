import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ExplorationSnapshot } from "@/lib/exploration";
import type { CareerSuggestion } from "@/components/session-provider";
import type { SharedJourneyStats, SharedSignalBuckets } from "@/lib/exploration-share";
import { buildSharedExplorationPayload } from "@/lib/exploration-share";
import { POST } from "@/app/api/exploration/share/route";

const putMock = vi.fn(async () => ({ url: "https://blob.example/share" }));

vi.mock("@vercel/blob", () => ({
	put: (...args: unknown[]) => putMock(...args),
}));

const snapshot: ExplorationSnapshot = {
	themes: [],
	discoveryInsights: [],
	opportunities: {
		directPaths: [],
		adjacentOpportunities: [],
		transferableSkills: [],
		innovationPotential: [],
	},
	marketReality: {
		salaryData: [],
		marketDemand: [],
		successStories: [],
	},
	learningPathways: [],
	stakeholderMessages: [],
	nextSteps: {
		immediate: [],
		shortTerm: [],
		mediumTerm: [],
	},
};

const stats: SharedJourneyStats = {
	insightsUnlocked: 1,
	pathwaysExplored: 2,
	pathsAmpedAbout: 1,
	boldMovesMade: 1,
};

const signals: SharedSignalBuckets = {
	strengths: [{ label: "Focus" }],
	interests: [{ label: "Making" }],
	goals: [{ label: "Ship" }],
};

const suggestion: CareerSuggestion = {
	id: "s-1",
	title: "Path",
	summary: "Summary",
	confidence: "medium",
	distance: "core",
	whyItFits: ["Because"],
	nextSteps: [],
	microExperiments: [],
	careerAngles: [],
	neighborTerritories: [],
	externalLinks: [],
	score: 0.7,
};

function buildRequestBody() {
	return buildSharedExplorationPayload({
		userName: "Kai",
		heroSummary: "Hero summary",
		discoveryDate: "Today",
		sessionId: "session-abc",
		snapshot,
		stats,
		topPathways: [{ id: "t", title: "Title", summary: "Summary", nextStep: "Do it" }],
		signalBuckets: signals,
		summary: {
			themes: ["theme"],
			strengths: ["strength"],
			constraint: null,
			whyItMatters: "Matters",
			callToAction: null,
			closing: "Close",
		},
		learningResources: [],
		suggestions: [suggestion],
		votesByCareerId: { "s-1": 1 },
		journeyVisual: null,
	});
}

describe("POST /api/exploration/share", () => {
	beforeEach(() => {
		putMock.mockClear();
		process.env.BLOB_READ_WRITE_TOKEN = "test-token";
	});

	it("stores payload and returns slug metadata", async () => {
		const req = new Request("http://localhost", {
			method: "POST",
			body: JSON.stringify(buildRequestBody()),
			headers: { "Content-Type": "application/json" },
		});

		const res = await POST(req);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { slug: string; expiresAt: string };
		expect(body.slug).toMatch(/[a-z0-9]+-/i);
		expect(body.expiresAt).toMatch(/T/);
		expect(putMock).toHaveBeenCalledWith(expect.stringContaining("exploration-shares/"), expect.any(String), expect.objectContaining({ access: "public" }));
	});

	it("fails when blob token is missing", async () => {
		delete process.env.BLOB_READ_WRITE_TOKEN;
		const req = new Request("http://localhost", {
			method: "POST",
			body: JSON.stringify(buildRequestBody()),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/configured/i);
	});

	it("rejects invalid payloads", async () => {
		process.env.BLOB_READ_WRITE_TOKEN = "test-token";
		const req = new Request("http://localhost", {
			method: "POST",
			body: JSON.stringify({ invalid: true }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});
});

