// normalizeWs and sentence-boundary cutting (placeholder text only).
import { describe, expect, it } from "vitest";
import { MAX_EXCERPT, sentenceEnds, windowAround, windowFromStart, windowParagraphs } from "../../scripts/lib/cut";
import { normalizeWithMap, normalizeWs, rawToNorm } from "../../scripts/lib/normalize";

describe("normalizeWs", () => {
  it("collapses whitespace runs to one space and nothing else", () => {
    expect(normalizeWs("lorem \t\n  ipsum dolor")).toBe("lorem ipsum dolor");
    expect(normalizeWs("  lead and trail  ")).toBe(" lead and trail ");
    expect(normalizeWs("Lorem “ipsum” — dolor; SIT.")).toBe("Lorem “ipsum” — dolor; SIT.");
  });
  it("joins line-wrap hyphenation only before a lowercase letter on the next line", () => {
    expect(normalizeWs("exam-\nple")).toBe("example");
    expect(normalizeWs("exam-  \r\n   ple")).toBe("example");
    expect(normalizeWs("well-known")).toBe("well-known");
    expect(normalizeWs("Lorem-\nIpsum")).toBe("Lorem- Ipsum");
    expect(normalizeWs("1-\n2")).toBe("1- 2");
  });
  it("maps normalized offsets back to raw positions", () => {
    const raw = "ab  cd-\nef\n\ngh";
    const nm = normalizeWithMap(raw);
    expect(nm.text).toBe("ab cdef gh");
    expect(raw[nm.n2r[nm.text.indexOf("gh")]]).toBe("g");
    expect(rawToNorm(nm, raw.indexOf("gh"))).toBe(nm.text.indexOf("gh"));
  });
});

const sent = (n: number, w = 12) =>
  Array.from({ length: n }, (_, i) => `Lorem${i} ${"ipsum ".repeat(w).trim()} dolor.`).join(" ");

describe("sentence cutting", () => {
  it("does not split at abbreviations, roman numerals after books, or before digits", () => {
    const t = "Lorem ipsum (Rom. viii. 28) dolor St. Lorem ver. 5 sit. Amet lorem.";
    const ends = sentenceEnds(t, 0, t.length);
    expect(ends.map((e) => t.slice(0, e))).toEqual(["Lorem ipsum (Rom. viii. 28) dolor St. Lorem ver. 5 sit.", t]);
  });
  it("cuts at sentence ends, ≤ 1500 chars, never adding text", () => {
    const t = sent(40);
    const w = windowFromStart(t, 0, t.length);
    const cut = t.slice(w.start, w.end);
    expect(cut.length).toBeLessThanOrEqual(MAX_EXCERPT);
    expect(cut.endsWith("dolor.")).toBe(true);
    expect(w.truncatedEnd).toBe(true);
    expect(w.truncatedStart).toBe(false);
    expect(cut).not.toMatch(/…|\.\.\.$/);
    expect(t.startsWith(cut)).toBe(true);
  });
  it("keeps the focus (citation) inside the window and flags both sides", () => {
    const t = sent(80);
    const focus = t.indexOf("Lorem40 ");
    const w = windowAround(t, 0, t.length, focus, focus + 7);
    expect(w.start).toBeLessThanOrEqual(focus);
    expect(w.end).toBeGreaterThanOrEqual(focus + 7);
    expect(w.end - w.start).toBeLessThanOrEqual(MAX_EXCERPT);
    expect(w.truncatedStart && w.truncatedEnd).toBe(true);
    expect(/^Lorem\d+ /.test(t.slice(w.start))).toBe(true);
  });
  it("returns the whole segment when it fits", () => {
    const t = sent(3);
    expect(windowFromStart(t, 0, t.length)).toEqual({ start: 0, end: t.length, truncatedStart: false, truncatedEnd: false });
  });
  it("cuts book intros at a paragraph boundary", () => {
    const p1 = sent(5);
    const p2 = sent(10);
    const p3 = sent(10);
    const t = `${p1} ${p2} ${p3}`;
    const ends = [p1.length, p1.length + 1 + p2.length, t.length];
    const w = windowParagraphs(t, 0, t.length, ends);
    expect(w.end).toBe(ends[0] + 1 + p2.length <= MAX_EXCERPT ? ends[1] : ends[0]);
    expect(w.truncatedEnd).toBe(true);
  });
});
