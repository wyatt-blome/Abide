// Checks the generated public/bible/** data (built by `npm run build:bible`) and the meta/bible helpers.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { BsbHeading } from "@/db/types";
import { BOOK_CODES } from "@/lib/books";
import {
  type BibleMeta,
  bookVerseTotal,
  chapterCount,
  countNonEmpty,
  isEmptyVerse,
  iterateRange,
  nextVerse,
  prevVerse,
  verseCount,
} from "@/lib/meta";
import { configureBible, getRangeVerses, getVerseText, headingsInRange, loadChapter, loadHeadings, loadMeta } from "@/lib/bible";

const ROOT = path.resolve(__dirname, "..", "public");
const BIBLE = path.join(ROOT, "bible");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const meta = readJson<BibleMeta>(path.join(BIBLE, "meta.json"));
const headings = readJson<BsbHeading[]>(path.join(BIBLE, "bsb", "headings.json"));
const book = (t: string, b: string) => readJson<Record<string, string[]>>(path.join(BIBLE, t, `${b}.json`));
const r = (b: string, c: number, v: number) => ({ book: b, chapter: c, verse: v });
const keys = (refs: { book: string; chapter: number; verse: number }[]) => refs.map((x) => `${x.book}.${x.chapter}.${x.verse}`);

const EMPTY_16 = [
  "MAT.17.21", "MAT.18.11", "MAT.23.14", "MRK.7.16", "MRK.9.44", "MRK.9.46", "MRK.11.26", "MRK.15.28",
  "LUK.17.36", "LUK.23.17", "JHN.5.4", "ACT.8.37", "ACT.15.34", "ACT.24.7", "ACT.28.29", "ROM.16.24",
];

describe("meta.json", () => {
  it("has 66 books in canonical order and 31,102 verses", () => {
    expect(meta.books.map((b) => b.code)).toEqual(BOOK_CODES);
    expect(meta.totalVerses).toBe(31102);
    const sum = meta.books.reduce((n, b) => n + b.verses.reduce((a, v) => a + v, 0), 0);
    expect(sum).toBe(31102);
    for (const b of meta.books) expect(b.verses.length).toBe(b.chapters);
  });

  it("lists exactly the 16 empty BSB verses, and they are empty in the BSB files", () => {
    expect([...meta.emptyVerses.BSB].sort()).toEqual([...EMPTY_16].sort());
    for (const k of EMPTY_16) {
      const [b, c, v] = k.split(".");
      expect(book("bsb", b)[c][Number(v) - 1]).toBe("");
      expect(isEmptyVerse(meta, k)).toBe(true);
    }
    expect(isEmptyVerse(meta, "JHN.3.16")).toBe(false);
  });

  it("matches the verse counts per section", () => {
    expect(bookVerseTotal(meta, "PSA")).toBe(2461);
    expect(bookVerseTotal(meta, "PRO")).toBe(915);
    const nt = BOOK_CODES.slice(39).reduce((n, b) => n + bookVerseTotal(meta, b), 0);
    expect(nt).toBe(7957);
    const otRest = BOOK_CODES.slice(0, 39).filter((b) => b !== "PSA" && b !== "PRO").reduce((n, b) => n + bookVerseTotal(meta, b), 0);
    expect(otRest).toBe(19769);
  });

  it("chapter files agree with the grid for all three translations", () => {
    for (const t of ["bsb", "web", "kjv"]) {
      for (const b of meta.books) {
        const f = book(t, b.code);
        expect(Object.keys(f).length).toBe(b.chapters);
        b.verses.forEach((n, i) => expect(f[String(i + 1)].length).toBe(n));
      }
    }
  });

  it("BSB has 31,086 non-empty verses", () => {
    let n = 0;
    for (const b of BOOK_CODES) for (const arr of Object.values(book("bsb", b))) n += arr.filter((t) => t !== "").length;
    expect(n).toBe(31086);
  });
});

describe("translations", () => {
  it("Psalm 23 has 6 non-empty verses in BSB, WEB and KJV", () => {
    for (const t of ["bsb", "web", "kjv"]) {
      const ps23 = book(t, "PSA")["23"];
      expect(ps23).toHaveLength(6);
      for (const v of ps23) expect(v.length).toBeGreaterThan(10);
    }
  });

  it("ships only the 66 canonical books (no apocrypha files)", () => {
    for (const t of ["bsb", "web", "kjv"]) {
      const files = readdirSync(path.join(BIBLE, t)).filter((f) => f.endsWith(".json") && f !== "headings.json");
      expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual([...BOOK_CODES].sort());
    }
    for (const apoc of ["TOB", "JDT", "WIS", "SIR", "BAR", "1MA", "2MA", "1ES", "2ES", "MAN", "SUS", "BEL"]) {
      expect(existsSync(path.join(BIBLE, "kjv", `${apoc}.json`))).toBe(false);
      expect(existsSync(path.join(BIBLE, "web", `${apoc}.json`))).toBe(false);
    }
  });

  it("WEB and KJV carry no residual markup or Strong's numbers", () => {
    for (const t of ["web", "kjv"]) {
      for (const b of BOOK_CODES) {
        for (const [c, arr] of Object.entries(book(t, b))) {
          arr.forEach((text, i) => {
            const where = `${t} ${b} ${c}:${i + 1}`;
            expect(/[\\<>[\]{}]/.test(text), where).toBe(false);
            expect(/\b[HG]\d{2,5}\b/.test(text), where).toBe(false);
            expect(text, where).toBe(text.trim());
            expect(/\s{2,}/.test(text), where).toBe(false);
          });
        }
      }
    }
  });

  it("BSB carries no markup either", () => {
    for (const b of BOOK_CODES)
      for (const arr of Object.values(book("bsb", b))) for (const text of arr) expect(/[\\<>[\]{}|]/.test(text)).toBe(false);
  });

  it("sources.json records a URL and sha256 for each translation", () => {
    const s = readJson<Record<string, { text: { url: string; sha256: string } }>>(path.join(BIBLE, "sources.json"));
    for (const t of ["BSB", "WEB", "KJV"]) {
      expect(s[t].text.url).toMatch(/^https:\/\//);
      expect(s[t].text.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("BSB headings", () => {
  const has = (b: string, c: number, v: number, level: string, text: string) =>
    headings.some((h) => h.book === b && h.chapter === c && h.verse === v && h.level === level && h.text === text);

  it("contains the acceptance headings", () => {
    expect(has("PSA", 1, 1, "s1", "The Two Paths")).toBe(true);
    expect(has("MAT", 1, 1, "s1", "The Genealogy of Jesus")).toBe(true);
    expect(has("PSA", 1, 1, "ms", "BOOK I")).toBe(true);
  });

  it("is in canonical order, on the grid, with clean text", () => {
    let prev = { book: "GEN", chapter: 0, verse: 0 };
    for (const h of headings) {
      expect(["s1", "s2", "ms", "d"]).toContain(h.level);
      expect(h.verse).toBeGreaterThanOrEqual(1);
      expect(h.verse).toBeLessThanOrEqual(verseCount(meta, h.book, h.chapter));
      expect(h.text.length).toBeGreaterThan(0);
      expect(/[\\|*]/.test(h.text)).toBe(false);
      const order = BOOK_CODES.indexOf(h.book) - BOOK_CODES.indexOf(prev.book) || h.chapter - prev.chapter || h.verse - prev.verse;
      expect(order).toBeGreaterThanOrEqual(0);
      prev = h;
    }
  });

  it("Psalm superscriptions (\\d) sit on verse 1 and are not repeated in the BSB verse text", () => {
    const ds = headings.filter((h) => h.level === "d" && h.book === "PSA");
    expect(ds.length).toBeGreaterThan(100);
    const psa = book("bsb", "PSA");
    for (const d of ds) {
      expect(d.verse).toBe(1);
      expect(psa[String(d.chapter)][0].startsWith(d.text)).toBe(false);
    }
  });
});

describe("meta.ts helpers", () => {
  it("counts chapters and verses", () => {
    expect(chapterCount(meta, "PSA")).toBe(150);
    expect(verseCount(meta, "PSA", 119)).toBe(176);
    expect(verseCount(meta, "PSA", 151)).toBe(0);
    expect(chapterCount(meta, "TOB")).toBe(0);
  });

  it("iterates within a chapter", () => {
    expect(keys(iterateRange(meta, { start: r("ROM", 8, 28), end: r("ROM", 8, 30) }))).toEqual(["ROM.8.28", "ROM.8.29", "ROM.8.30"]);
  });

  it("iterates across a chapter boundary", () => {
    const last = verseCount(meta, "JHN", 1);
    expect(keys(iterateRange(meta, { start: r("JHN", 1, last - 1), end: r("JHN", 2, 2) }))).toEqual([
      `JHN.1.${last - 1}`, `JHN.1.${last}`, "JHN.2.1", "JHN.2.2",
    ]);
  });

  it("iterates across a book boundary", () => {
    const malLastCh = chapterCount(meta, "MAL");
    const malLastV = verseCount(meta, "MAL", malLastCh);
    expect(keys(iterateRange(meta, { start: r("MAL", malLastCh, malLastV), end: r("MAT", 1, 2) }))).toEqual([
      `MAL.${malLastCh}.${malLastV}`, "MAT.1.1", "MAT.1.2",
    ]);
  });

  it("whole chapter / whole book ranges and sentinels", () => {
    expect(iterateRange(meta, { start: r("PSA", 23, 1), end: r("PSA", 23, 999) })).toHaveLength(6);
    expect(iterateRange(meta, { start: r("JUD", 1, 1), end: r("JUD", 999, 999) })).toHaveLength(bookVerseTotal(meta, "JUD"));
    expect(iterateRange(meta, { start: r("GEN", 1, 1), end: r("REV", 999, 999) })).toHaveLength(31102);
    expect(iterateRange(meta, { start: r("ROM", 8, 30), end: r("ROM", 8, 28) })).toEqual([]);
  });

  it("counts non-empty verses (skips BSB empties)", () => {
    const range = { start: r("MAT", 17, 20), end: r("MAT", 17, 22) };
    expect(iterateRange(meta, range)).toHaveLength(3);
    expect(countNonEmpty(meta, range)).toBe(2);
    expect(countNonEmpty(meta, { start: r("GEN", 1, 1), end: r("REV", 999, 999) })).toBe(31086);
  });

  it("next/prev verse cross chapters and books and stop at the ends", () => {
    expect(nextVerse(meta, r("PSA", 23, 6))).toEqual(r("PSA", 24, 1));
    expect(prevVerse(meta, r("PSA", 24, 1))).toEqual(r("PSA", 23, 6));
    const malLastCh = chapterCount(meta, "MAL");
    expect(nextVerse(meta, r("MAL", malLastCh, verseCount(meta, "MAL", malLastCh)))).toEqual(r("MAT", 1, 1));
    expect(prevVerse(meta, r("MAT", 1, 1))).toEqual(r("MAL", malLastCh, verseCount(meta, "MAL", malLastCh)));
    expect(prevVerse(meta, r("GEN", 1, 1))).toBeNull();
    expect(nextVerse(meta, r("REV", 22, verseCount(meta, "REV", 22)))).toBeNull();
  });
});

describe("bible.ts loader", () => {
  beforeAll(() => {
    configureBible({
      basePath: "/bible",
      fetchJson: async (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8")),
    });
  });

  it("loads meta, chapters and headings", async () => {
    expect((await loadMeta()).totalVerses).toBe(31102);
    expect(await loadChapter("KJV", "PSA", 23)).toHaveLength(6);
    expect((await loadHeadings()).length).toBe(headings.length);
  });

  it("gets verse text and range verses across a chapter boundary", async () => {
    expect(await getVerseText("BSB", "MAT.17.21")).toBe("");
    expect((await getVerseText("WEB", "JHN.3.16")).length).toBeGreaterThan(20);
    const vs = await getRangeVerses("BSB", { start: r("PSA", 22, 31), end: r("PSA", 23, 2) });
    expect(vs.map((v) => v.key)).toEqual(["PSA.22.31", "PSA.23.1", "PSA.23.2"]);
    for (const v of vs) expect(v.text.length).toBeGreaterThan(0);
    const skip = await getRangeVerses("BSB", { start: r("MAT", 17, 20), end: r("MAT", 17, 22) }, { skipEmpty: true });
    expect(skip.map((v) => v.key)).toEqual(["MAT.17.20", "MAT.17.22"]);
  });

  it("filters headings by range", () => {
    const ps1 = headingsInRange(headings, { start: r("PSA", 1, 1), end: r("PSA", 1, 6) });
    expect(ps1.map((h) => h.level).sort()).toEqual(["ms", "s1"]);
    expect(headingsInRange(headings, { start: r("PSA", 1, 2), end: r("PSA", 1, 6) })).toEqual([]);
  });
});
