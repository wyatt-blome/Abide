// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  HINT_SPAN,
  KEY_ROWS,
  KEYBOARD_COLUMNS,
  KEYBOARD_SPACER_CLASS,
  keyWidthAt,
  LetterKeyboard,
} from "@/components/practice/LetterKeyboard";

afterEach(cleanup);

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
