import { describe, expect, it } from "vitest";
import { CHRONOLOGICAL } from "../../content/plans/chronological";
import { chronoSeq } from "@/lib/planGen";
import { toKey } from "@/lib/refs";
import { loadMeta } from "./_data";

describe("content/plans/chronological", () => {
  const meta = loadMeta();
  it("covers every BSB verse exactly once", () => {
    const counts = new Map<string, number>();
    for (const r of CHRONOLOGICAL) {
      const book = meta.books.find((b) => b.code === r.book);
      expect(book, r.book).toBeTruthy();
      for (let c = r.from.c; c <= r.to.c; c++) {
        const from = c === r.from.c ? r.from.v ?? 1 : 1;
        const to = c === r.to.c ? r.to.v ?? book!.verses[c - 1] : book!.verses[c - 1];
        expect(c).toBeLessThanOrEqual(book!.chapters);
        for (let v = from; v <= to; v++) counts.set(`${r.book}.${c}.${v}`, (counts.get(`${r.book}.${c}.${v}`) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(meta.totalVerses);
    for (const [k, n] of counts) expect(n, k).toBe(1);
  });
  it("includes all 66 books", () => {
    expect(new Set(CHRONOLOGICAL.map((r) => r.book)).size).toBe(66);
  });
  it("its non-empty sequence has no duplicates", () => {
    const keys = chronoSeq(meta, CHRONOLOGICAL).map(toKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(meta.totalVerses - meta.emptyVerses.BSB.length);
  });
});
