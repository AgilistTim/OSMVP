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

describe("WelcomeScreen", () => {
  beforeEach(() => {
    mockSession.mode = null;
    mockSession.beginSession.mockClear();
    mockSession.setMode.mockClear();
  });

  it("renders value proposition and CTA", () => {
    render(<WelcomeScreen />);

    expect(
      screen.getByRole("heading", { name: /finding your future starts here/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get started/i })).toBeEnabled();
  });

  it("defaults to text mode when starting without a selection", () => {
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    expect(mockSession.setMode).toHaveBeenCalledWith("text");
    expect(mockSession.beginSession).toHaveBeenCalledTimes(1);
  });

  it("respects preselected voice mode", () => {
    mockSession.mode = "voice";
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    expect(mockSession.setMode).not.toHaveBeenCalled();
    expect(mockSession.beginSession).toHaveBeenCalledTimes(1);
  });
});
