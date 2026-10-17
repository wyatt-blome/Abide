import { describe, expect, it } from "vitest";
import { adjacentChapter, orderedRange, sectionRange, validPos } from "@/components/reader/readerNav";
import { headingsInRange } from "@/lib/bible";
import { loadHeadings, loadMeta } from "../logic/_data";

const meta = loadMeta();
const headings = loadHeadings();

describe("reader navigation", () => {
  it("moves across chapters and books", () => {
    expect(adjacentChapter(meta, { book: "GEN", chapter: 1 }, -1)).toBeNull();
    expect(adjacentChapter(meta, { book: "GEN", chapter: 50 }, 1)).toEqual({ book: "EXO", chapter: 1 });
    expect(adjacentChapter(meta, { book: "EXO", chapter: 1 }, -1)).toEqual({ book: "GEN", chapter: 50 });
    expect(adjacentChapter(meta, { book: "REV", chapter: 22 }, 1)).toBeNull();
    expect(validPos(meta, "psa", 200)).toEqual({ book: "PSA", chapter: 150 });
    expect(validPos(meta, "XYZ", 1)).toBeNull();
  });

  it("a heading's section runs to the verse before the next section heading", () => {
    const first = headingsInRange(headings, { start: { book: "GEN", chapter: 1, verse: 1 }, end: { book: "GEN", chapter: 50, verse: 26 } });
    const h = first.find((x) => x.level !== "d")!;
    const next = first.find((x) => x.level !== "d" && (x.chapter > h.chapter || x.verse > h.verse))!;
    const r = sectionRange(meta, headings, h);
    expect(r.start).toEqual({ book: h.book, chapter: h.chapter, verse: h.verse });
    expect(r.end.book).toBe("GEN");
    // end + 1 verse is where the next heading starts
    const after = r.end.verse < meta.books[0].verses[r.end.chapter - 1] ? { chapter: r.end.chapter, verse: r.end.verse + 1 } : { chapter: r.end.chapter + 1, verse: 1 };
    expect(after).toEqual({ chapter: next.chapter, verse: next.verse });
  });

  it("the last section of a book ends at the book's last verse", () => {
    const inJude = headingsInRange(headings, { start: { book: "JUD", chapter: 1, verse: 1 }, end: { book: "JUD", chapter: 1, verse: 25 } })
      .filter((x) => x.level !== "d");
    const last = inJude[inJude.length - 1];
    expect(sectionRange(meta, headings, last).end).toEqual({ book: "JUD", chapter: 1, verse: 25 });
  });

  it("orders a range picked backwards", () => {
    const a = { book: "PSA", chapter: 23, verse: 4 };
    const b = { book: "PSA", chapter: 23, verse: 1 };
    expect(orderedRange(a, b)).toEqual({ start: b, end: a });
  });
});
