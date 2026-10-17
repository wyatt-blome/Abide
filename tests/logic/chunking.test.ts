import { describe, expect, it } from "vitest";
import { chunkPassage, headingStartKeys, LONG_VERSE_WORDS } from "@/lib/chunking";
import { rangeToKeys, ref } from "@/lib/refs";
import { wordCount } from "@/lib/text";
import { loadBook, loadHeadings, loadMeta } from "./_data";

const words = (n: number) => Array.from({ length: n }, () => "lorem").join(" ");
const V = (key: string, n = 8) => ({ key, text: words(n) });

describe("chunkPassage (synthetic)", () => {
  it("default size 2, balanced, larger first", () => {
    const vs = [1, 2, 3, 4, 5].map((v) => V(`PSA.1.${v}`));
    expect(chunkPassage(vs)).toEqual([["PSA.1.1", "PSA.1.2"], ["PSA.1.3", "PSA.1.4"], ["PSA.1.5"]]);
    expect(chunkPassage(vs, new Set(), 3)).toEqual([["PSA.1.1", "PSA.1.2", "PSA.1.3"], ["PSA.1.4", "PSA.1.5"]]);
    expect(chunkPassage(vs, new Set(), 1)).toHaveLength(5);
  });
  it("long verses stand alone", () => {
    const vs = [V("X.1.1"), V("X.1.2", LONG_VERSE_WORDS + 1), V("X.1.3"), V("X.1.4")];
    expect(chunkPassage(vs)).toEqual([["X.1.1"], ["X.1.2"], ["X.1.3", "X.1.4"]]);
  });
  it("never spans a heading start", () => {
    const vs = [1, 2, 3, 4].map((v) => V(`X.1.${v}`));
    expect(chunkPassage(vs, new Set(["X.1.2"]))).toEqual([["X.1.1"], ["X.1.2", "X.1.3"], ["X.1.4"]]);
  });
  it("skips empty verses", () => {
    const vs = [V("X.1.1"), { key: "X.1.2", text: "" }, V("X.1.3")];
    expect(chunkPassage(vs)).toEqual([["X.1.1", "X.1.3"]]);
    expect(chunkPassage([V("X.1.1"), V("X.1.2")], new Set(), 2, ["X.1.2"])).toEqual([["X.1.1"]]);
  });
});

describe("chunkPassage (BSB data)", () => {
  const meta = loadMeta();
  const heads = headingStartKeys(loadHeadings());
  const passage = (book: string, c1: number, v1: number, c2: number, v2: number) => {
    const text = loadBook(book);
    return rangeToKeys(meta, { start: ref(book, c1, v1), end: ref(book, c2, v2) }).map((key) => {
      const [, c, v] = key.split(".").map(Number);
      return { key, text: text[String(c)][v - 1] ?? "" };
    });
  };

  for (const [book, c1, v1, c2, v2] of [["MAT", 5, 1, 7, 29], ["ROM", 8, 1, 8, 39], ["MAT", 17, 1, 18, 35], ["ISA", 52, 13, 53, 12]] as const) {
    it(`${book} ${c1}:${v1}-${c2}:${v2}: every non-empty verse exactly once, in order, rules hold`, () => {
      const vs = passage(book, c1, v1, c2, v2);
      const chunks = chunkPassage(vs, heads, 2, meta.emptyVerses.BSB);
      const flat = chunks.flat();
      const expected = vs.filter((v) => v.text.trim() && !meta.emptyVerses.BSB.includes(v.key)).map((v) => v.key);
      expect(flat).toEqual(expected);
      const text = new Map(vs.map((v) => [v.key, v.text]));
      for (const c of chunks) {
        expect(c.length).toBeGreaterThanOrEqual(1);
        expect(c.length).toBeLessThanOrEqual(2);
        if (c.length > 1) {
          for (const k of c) expect(wordCount(text.get(k)!)).toBeLessThanOrEqual(LONG_VERSE_WORDS);
          for (const k of c.slice(1)) expect(heads.has(k)).toBe(false);
        }
      }
    });
  }
  it("skips MAT 17:21 (BSB empty)", () => {
    const flat = chunkPassage(passage("MAT", 17, 1, 17, 27), heads, 2, meta.emptyVerses.BSB).flat();
    expect(flat).not.toContain("MAT.17.21");
  });
});
