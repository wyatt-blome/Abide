// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TypeFirst } from "@/components/practice/TypeFirst";
import {
  HINT_SPAN,
  KEY_ROWS,
  KEYBOARD_COLUMNS,
  KEYBOARD_SPACER_CLASS,
  keyWidthAt,
  LetterKeyboard,
} from "@/components/practice/LetterKeyboard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LetterKeyboard layout", () => {
  it("is A–Z in order, 4 rows of at most 7 units (Hint = 2 units in the last row)", () => {
    expect(KEY_ROWS.flat().join("")).toBe("abcdefghijklmnopqrstuvwxyz");
    expect(KEY_ROWS).toHaveLength(4);
    KEY_ROWS.forEach((row, i) => {
      const units = row.length + (i === KEY_ROWS.length - 1 ? HINT_SPAN : 0);
      expect(units).toBeLessThanOrEqual(KEYBOARD_COLUMNS);
    });
    expect(KEYBOARD_COLUMNS).toBe(7);
  });

  it("keys are at least 48px wide at a 360px viewport", () => {
    expect(keyWidthAt(360)).toBeGreaterThanOrEqual(48);
    expect(keyWidthAt(320)).toBeGreaterThan(42);
  });

  it("renders 26 letter keys + Hint on a 7-column grid, 56px tall", () => {
    render(<LetterKeyboard onKey={() => {}} onHint={() => {}} />);
    const group = screen.getByRole("group", { name: "Letter keyboard" });
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(27);
    for (const row of group.querySelectorAll(":scope > div > div")) expect(row.className).toContain("grid-cols-7");
    expect(screen.getByRole("button", { name: "Letter A" }).className).toContain("h-14");
    expect(screen.getByRole("button", { name: /Hint/ }).className).toContain("col-span-2");
    expect(KEYBOARD_SPACER_CLASS).toBe("h-[260px]");
  });
});

describe("TypeFirst keeps the current word above the keyboard", () => {
  it("scrolls when the current word is behind the keyboard, not when it is visible", () => {
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 360, width: 360, x: 0, y: top, toJSON: () => ({}) });
    let wordTop = 100;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.getAttribute("aria-label") === "Letter keyboard") return rect(500, 260) as DOMRect;
      if (this.getAttribute("data-word-status") === "current") return rect(wordTop, 30) as DOMRect;
      return rect(0, 0) as DOMRect;
    });
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
    // Structural placeholder text.
    render(<TypeFirst items={[{ id: "x", label: "1", text: "lorem ipsum dolor sit amet" }]} onComplete={() => {}} />);
    expect(scrollBy).not.toHaveBeenCalled();
    wordTop = 600;
    fireEvent.click(screen.getByRole("button", { name: "Letter L" }));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    const top = (scrollBy.mock.calls[0][0] as ScrollToOptions).top!;
    // Word lands in the middle of the area above the keyboard.
    expect(600 - top).toBeGreaterThan(8);
    expect(600 - top + 30).toBeLessThan(500);
  });
});
