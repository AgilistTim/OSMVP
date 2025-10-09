import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionProvider } from "@/components/session-provider";
import { SuggestionCards } from "@/components/suggestion-cards";

const SUGGESTIONS = [
	{
		id: "ai-ethics-navigator",
		title: "AI Ethics Navigator",
		summary: "Keep AI fair, transparent, and grounded in how people actually use it.",
		whyItFits: [
			"You mentioned wanting to explain AI bias so people can act on it.",
			"You keep weighing automation’s impact on real jobs.",
		],
		careerAngles: [
			"Responsible AI researcher – audit models for bias and ship guidelines people actually follow.",
			"AI policy analyst – translate the risks into moves teams can apply.",
		],
		nextSteps: [
			"Break down one AI bias example and what a fairer take would look like.",
			"Drop into an AI ethics meetup and note the hottest questions.",
		],
		confidence: "high" as const,
		score: 5,
	},
];

const renderWithSession = (ui: React.ReactNode) =>
	render(<SessionProvider>{ui}</SessionProvider>);

const originalGetComputedStyle = window.getComputedStyle;

beforeAll(() => {
	Object.defineProperty(window.HTMLElement.prototype, "setPointerCapture", {
		value: () => {},
		configurable: true,
	});
	Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
		value: () => {},
		configurable: true,
	});
});

beforeEach(() => {
	vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
		const style = originalGetComputedStyle(element);
		return new Proxy(style, {
			get(target, prop, receiver) {
				if (
					prop === "transform" ||
					prop === "webkitTransform" ||
					prop === "mozTransform"
				) {
					const value = Reflect.get(target, prop, receiver);
					return value && value !== "" ? value : "none";
				}
				return Reflect.get(target, prop, receiver);
			},
		});
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("SuggestionCards", () => {
	it("lets users react to a suggestion with a quick save toggle", async () => {
		const user = userEvent.setup();
		renderWithSession(<SuggestionCards suggestions={SUGGESTIONS} />);

		const saveButton = screen.getByRole("button", { name: /Save it/i });
		expect(saveButton).toHaveAttribute("aria-pressed", "false");

		await user.click(saveButton);
		expect(saveButton).toHaveAttribute("aria-pressed", "true");

		await user.click(saveButton);
		expect(saveButton).toHaveAttribute("aria-pressed", "false");
	});

	it("opens a drawer with deeper context and next steps", async () => {
		const user = userEvent.setup();
		renderWithSession(<SuggestionCards suggestions={SUGGESTIONS} />);

	await user.click(screen.getByRole("button", { name: /See details/i }));
	await waitFor(() => {
		const drawer = document.querySelector('[data-slot="drawer-content"]');
		expect(drawer).not.toBeNull();
		expect(drawer?.getAttribute("data-state")).toBe("open");
	});
	const reasons = await screen.findAllByText(/You mentioned wanting to explain AI bias/i);
	expect(reasons[0]).toBeInTheDocument();

	await user.click(screen.getByRole("button", { name: /^Close$/i }));
	await waitFor(() => {
		const drawer = document.querySelector('[data-slot="drawer-content"]');
		expect(drawer?.getAttribute("data-state")).toBe("closed");
	});
});
});
