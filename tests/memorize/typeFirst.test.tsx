// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TypeFirst, type TypeFirstResult } from "@/components/practice/TypeFirst";
import { expectedLetter } from "@/components/practice/helpers";

afterEach(cleanup);

const TEXT = "The LORD is my shepherd; I shall not want.";

function statuses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-word-status]")).map((e) => e.getAttribute("data-word-status") ?? "");
}

function setup(text = TEXT) {
  const onComplete = vi.fn<(r: TypeFirstResult) => void>();
  const utils = render(<TypeFirst items={[{ id: "PSA.23.1", label: "v.1", text }]} onComplete={onComplete} />);
  return { ...utils, onComplete };
}

const tap = (letter: string) => fireEvent.click(screen.getByRole("button", { name: `Letter ${letter.toUpperCase()}` }));

describe("TypeFirst", () => {
  it("correct letters mark words ✓ (on-screen keys)", () => {
    const { container } = setup();
    for (const l of ["t", "l", "i"]) tap(l);
    const done = Array.from(container.querySelectorAll('[data-word-status="first"]'));
    expect(done).toHaveLength(3);
    expect(done[0].textContent).toContain("The");
    expect(done[1].textContent).toContain("LORD");
    for (const d of done) expect(d.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(statuses(container)[3]).toBe("current");
  });

  it("ignores case and punctuation; physical keyboard works; reports accuracy", () => {
    const { container, onComplete } = setup();
    // "shepherd;" and "want." carry punctuation; upper-case keys are accepted.
    for (const k of ["T", "L", "I", "M", "S", "I", "S", "N", "W"]) fireEvent.keyDown(window, { key: k });
    expect(statuses(container).every((s) => s === "first")).toBe(true);
    expect(container.textContent).toContain("shepherd;");
    expect(onComplete).toHaveBeenCalledTimes(1);
    const r = onComplete.mock.calls[0][0];
    expect(r.perItem["PSA.23.1"]).toMatchObject({ accuracy: 1, firstTry: 9, total: 9, peeks: 0 });
  });

  it("a wrong letter counts a miss; two misses reveal the word (✗)", () => {
    const { container, onComplete } = setup("The LORD");
    tap("x");
    expect(screen.getByTestId("miss-count").textContent).toContain("1 miss");
    expect(statuses(container)[0]).toBe("current");
    tap("q");
    const first = container.querySelector("[data-word-status]")!;
    expect(first.getAttribute("data-word-status")).toBe("revealed");
    expect(first.textContent).toContain("The");
    expect(first.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(screen.getByTestId("miss-count").textContent).toContain("2 misses");
    tap("l");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].perItem["PSA.23.1"].accuracy).toBe(0.5);
  });

  it("one miss then right is not first-try; hint is a peek", () => {
    const { container, onComplete } = setup("The LORD is");
    tap("x");
    tap("t");
    expect(statuses(container)[0]).toBe("late");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Hint/ }));
    });
    expect(statuses(container)[1]).toBe("peeked");
    tap("i");
    const r = onComplete.mock.calls[0][0].perItem["PSA.23.1"];
    expect(r.firstTry).toBe(1);
    expect(r.peeks).toBe(1);
    expect(r.accuracy).toBeCloseTo(1 / 3 - 0.03, 5);
  });

  it("numbers use the first letter of the spoken word", () => {
    expect(expectedLetter("40")).toBe("f");
    expect(expectedLetter("153")).toBe("o");
    expect(expectedLetter("“Let")).toBe("l");
    const { container } = setup("40 days");
    tap("f");
    expect(statuses(container)[0]).toBe("first");
  });
});
