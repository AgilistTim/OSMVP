import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "@/components/welcome-screen";

const mockSession = {
  mode: null as "text" | "voice" | null,
  started: false,
  profile: {},
  candidates: [],
  votesByCareerId: {},
  summary: undefined as string | undefined,
  setMode: vi.fn(),
  setProfile: vi.fn(),
  setCandidates: vi.fn(),
  voteCareer: vi.fn(),
  setSummary: vi.fn(),
  beginSession: vi.fn(),
};

vi.mock("@/components/session-provider", () => ({
  useSession: () => mockSession,
}));

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
} as const;

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

describe("WelcomeScreen", () => {
  beforeEach(() => {
    mockSession.mode = null;
    mockSession.beginSession.mockClear();
    mockSession.setMode.mockClear();
    mockRouter.push.mockClear();
  });

  it("renders value proposition and CTA", () => {
    render(<WelcomeScreen />);

    expect(
      screen.getByRole("heading", { name: /write the mission you want to work on/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start the chat/i })).toBeEnabled();
  });

  it("defaults to text mode when starting without a selection", () => {
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole("button", { name: /start the chat/i }));

    expect(mockSession.beginSession).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith("/chat-integrated");
  });

  it("respects preselected voice mode", () => {
    mockSession.mode = "voice";
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole("button", { name: /start the chat/i }));

    expect(mockSession.setMode).not.toHaveBeenCalled();
    expect(mockSession.beginSession).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith("/chat-integrated");
  });
});
