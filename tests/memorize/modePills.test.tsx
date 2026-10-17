// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const support = vi.hoisted(() => ({ value: { supported: false, reason: "Speech recognition isn't available in this browser." } as { supported: boolean; reason?: string } }));
vi.mock("@/lib/speech", () => ({ speechSupport: () => support.value }));

import { ModePills, resetSpeechSupportCache } from "@/components/practice/ModePills";

beforeEach(() => resetSpeechSupportCache());
afterEach(cleanup);

describe("ModePills", () => {
  it("hides the Speak It pill and shows the one-line reason when unsupported", () => {
    support.value = { supported: false, reason: "Speech recognition isn't available in this browser." };
    render(<ModePills mode="typeFirst" onChange={() => {}} hasHeadings />);
    expect(screen.queryByRole("button", { name: /Speak it/ })).toBeNull();
    expect(screen.getByText(/Speak it: Speech recognition isn't available/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Type letters/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Story of the Passage/ })).toBeTruthy();
  });

  it("shows Speak It when supported; no headings → no Story pill, plain label", () => {
    support.value = { supported: true };
    render(<ModePills mode="typeFirst" onChange={() => {}} hasHeadings={false} />);
    expect(screen.getByRole("button", { name: /Speak it/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Story of the Passage/ })).toBeNull();
    expect(screen.getByText("No BSB headings in this range")).toBeTruthy();
  });
});
