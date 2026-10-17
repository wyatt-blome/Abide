// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TypeFirst, type TypeFirstResult } from "@/components/practice/TypeFirst";
import { expectedLetter } from "@/components/practice/helpers";
import { wordTokens } from "@/lib/text";

afterEach(cleanup);

// Verse text is read from the bundled BSB (never typed): Psalm 23:1.
const PSA = JSON.parse(readFileSync(path.resolve(__dirname, "../../public/bible/bsb/PSA.json"), "utf8")) as Record<string, string[]>;
const TEXT = PSA["23"][0];
const WORDS = TEXT.split(/\s+/).filter(Boolean);
/** The first n whitespace-separated words of the verse. */
const firstWords = (n: number) => WORDS.slice(0, n).join(" ");
const LETTERS = wordTokens(TEXT).map((t) => expectedLetter(t.core));
/** A letter that is not the expected one. */
const wrong = (expected: string, skip = "") => [..."xqzjv"].find((l) => l !== expected && l !== skip)!;

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
    for (const l of LETTERS.slice(0, 3)) tap(l);
    const done = Array.from(container.querySelectorAll('[data-word-status="first"]'));
    expect(done).toHaveLength(3);
    const tokens = wordTokens(TEXT);
    expect(done[0].textContent).toContain(tokens[0].core);
    expect(done[1].textContent).toContain(tokens[1].core);
    for (const d of done) expect(d.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(statuses(container)[3]).toBe("current");
  });

  it("ignores case and punctuation; physical keyboard works; reports accuracy", () => {
    const { container, onComplete } = setup();
    // Words carrying punctuation are shown with it; upper-case keys are accepted.
    const punctuated = WORDS.find((w) => /[;,.:!?]$/.test(w));
    expect(punctuated).toBeDefined();
    for (const k of LETTERS) fireEvent.keyDown(window, { key: k.toUpperCase() });
    expect(statuses(container).every((s) => s === "first")).toBe(true);
    expect(container.textContent).toContain(punctuated!);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const r = onComplete.mock.calls[0][0];
    expect(r.perItem["PSA.23.1"]).toMatchObject({ accuracy: 1, firstTry: LETTERS.length, total: LETTERS.length, peeks: 0 });
  });

  it("a wrong letter counts a miss; two misses reveal the word (✗)", () => {
    const { container, onComplete } = setup(firstWords(2));
    const w1 = wrong(LETTERS[0]);
    tap(w1);
    expect(screen.getByTestId("miss-count").textContent).toContain("1 miss");
    expect(statuses(container)[0]).toBe("current");
    tap(wrong(LETTERS[0], w1));
    const first = container.querySelector("[data-word-status]")!;
    expect(first.getAttribute("data-word-status")).toBe("revealed");
    expect(first.textContent).toContain(wordTokens(TEXT)[0].core);
    expect(first.querySelector('[data-icon="cross"]')).not.toBeNull();
    expect(screen.getByTestId("miss-count").textContent).toContain("2 misses");
    tap(LETTERS[1]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].perItem["PSA.23.1"].accuracy).toBe(0.5);
  });

  it("one miss then right is not first-try; hint is a peek", () => {
    const { container, onComplete } = setup(firstWords(3));
    tap(wrong(LETTERS[0]));
    tap(LETTERS[0]);
    expect(statuses(container)[0]).toBe("late");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Hint/ }));
    });
    expect(statuses(container)[1]).toBe("peeked");
    tap(LETTERS[2]);
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
