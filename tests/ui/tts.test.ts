import { describe, expect, it } from "vitest";
import { charIndexToWordIndex, clampRate, splitForSpeech, wordStartOffsets } from "@/lib/tts";
import { speechSupport } from "@/lib/speech";

describe("tts helpers", () => {
  it("maps boundary charIndex to word index", () => {
    const text = "Lorem ipsum  dolor sit";
    expect(wordStartOffsets(text)).toEqual([0, 6, 13, 19]);
    expect(charIndexToWordIndex(text, 0)).toBe(0);
    expect(charIndexToWordIndex(text, 6)).toBe(1);
    expect(charIndexToWordIndex(text, 12)).toBe(1);
    expect(charIndexToWordIndex(text, 13)).toBe(2);
    expect(charIndexToWordIndex(text, 99)).toBe(3);
    expect(charIndexToWordIndex("", 3)).toBe(-1);
  });

  it("clamps rate to 0.6–1.4", () => {
    expect(clampRate(0.2)).toBe(0.6);
    expect(clampRate(2)).toBe(1.4);
    expect(clampRate(1.1)).toBe(1.1);
    expect(clampRate(undefined)).toBe(1);
  });

  it("splits long text into chunks whose offsets reconstruct the text", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Lorem ipsum dolor ${i}, sit amet consectetur.`).join(" ");
    const chunks = splitForSpeech(text, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(120);
      expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
    }
  });

  it("speech recognition reports unsupported outside a browser", () => {
    const s = speechSupport();
    expect(s.supported).toBe(false);
    expect(s.reason).toMatch(/isn't available/);
  });
});
