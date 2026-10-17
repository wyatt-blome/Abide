import { describe, expect, it } from "vitest";
import { STARTERS } from "../../content/starters";
import { rangeSize } from "@/lib/refs";
import { loadMeta } from "./_data";

describe("content/starters", () => {
  const meta = loadMeta();
  it("has the expected ids and valid ranges", () => {
    expect(STARTERS.map((s) => s.id)).toEqual([
      "psalm-23", "psalm-1", "prov-3-1-12", "john-1-1-18", "isa-52-13-53-12", "1cor-13", "phil-2-1-11", "eph-6-10-18", "rom-8", "matt-5-7",
    ]);
    for (const s of STARTERS) {
      for (const r of [s.range, s.fullChapterOption].filter(Boolean)) {
        for (const x of [r!.start, r!.end]) {
          const b = meta.books.find((bk) => bk.code === x.book)!;
          expect(x.verse, s.id).toBeLessThanOrEqual(b.verses[x.chapter - 1]);
        }
      }
    }
  });
  it("Matthew 5–7 is 111 verses, long, headings first; Philippians 2 has a full-chapter option", () => {
    const m = STARTERS.find((s) => s.id === "matt-5-7")!;
    expect(rangeSize(m.range, meta)).toBe(111);
    expect(m.long && m.headingsDrillFirst).toBe(true);
    const p = STARTERS.find((s) => s.id === "phil-2-1-11")!;
    expect(rangeSize(p.fullChapterOption!, meta)).toBe(30);
  });
});
