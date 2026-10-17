// Versification used to validate citation ranges: public/bible/meta.json (written by
// scripts/build-bible.ts). If it is absent, a fallback is derived from the BSB JSON on GitHub and
// stored under .cache/ only (never under public/).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { VerseRange, VerseRef } from "../../src/db/types";
import { BOOKS, BOOK_BY_CODE, bookIndex } from "../../src/lib/books";
import { fetchUrl, ROOT } from "./fetch";

export interface MetaBook { code: string; name: string; chapters: number; verses: number[] }
export interface BibleMeta { books: MetaBook[]; totalVerses?: number }

export const META_PATH = path.join(ROOT, "public", "bible", "meta.json");
export const FALLBACK_META_PATH = path.join(ROOT, ".cache", "bible", "meta-fallback.json");
const BSB_JSON_URL = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/BSB.json";

/** Build meta from scrollmapper's BSB.json ({books:[{name, chapters:[{chapter, verses:[...]}]}]}, canonical order). */
export function metaFromScrollmapper(json: { books: { chapters: { verses: { verse: number }[] }[] }[] }): BibleMeta {
  if (json.books.length !== 66) throw new Error(`expected 66 books, got ${json.books.length}`);
  const books = json.books.map((b, i) => {
    const verses = b.chapters.map((c) => Math.max(0, ...c.verses.map((v) => v.verse)));
    return { code: BOOKS[i].code, name: BOOKS[i].name, chapters: verses.length, verses };
  });
  return { books, totalVerses: books.reduce((n, b) => n + b.verses.reduce((a, c) => a + c, 0), 0) };
}

export async function loadMeta(metaPath = META_PATH): Promise<BibleMeta> {
  if (existsSync(metaPath)) return JSON.parse(readFileSync(metaPath, "utf8")) as BibleMeta;
  if (existsSync(FALLBACK_META_PATH)) return JSON.parse(readFileSync(FALLBACK_META_PATH, "utf8")) as BibleMeta;
  const buf = await fetchUrl(BSB_JSON_URL);
  const meta = metaFromScrollmapper(JSON.parse(new TextDecoder().decode(buf)));
  mkdirSync(path.dirname(FALLBACK_META_PATH), { recursive: true });
  writeFileSync(FALLBACK_META_PATH, JSON.stringify(meta));
  return meta;
}

// ---------------------------------------------------------------- small range helpers (scripts only)

const versesCache = new WeakMap<BibleMeta, Map<string, number[]>>();
function versesOf(meta: BibleMeta, book: string): number[] | undefined {
  let m = versesCache.get(meta);
  if (!m) {
    m = new Map(meta.books.map((b) => [b.code, b.verses]));
    versesCache.set(meta, m);
  }
  return m.get(book);
}

export function chapterCount(meta: BibleMeta, book: string): number {
  return versesOf(meta, book)?.length ?? 0;
}
export function verseCount(meta: BibleMeta, book: string, chapter: number): number {
  return versesOf(meta, book)?.[chapter - 1] ?? 0;
}

export function cmpRef(a: VerseRef, b: VerseRef): number {
  return bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.verse - b.verse;
}

export function refValid(meta: BibleMeta, r: VerseRef): boolean {
  return Number.isInteger(r.chapter) && Number.isInteger(r.verse) && r.chapter >= 1 && r.verse >= 1 &&
    r.verse <= verseCount(meta, r.book, r.chapter);
}

/** null when valid, else a human-readable reason. */
export function rangeProblem(meta: BibleMeta, r: VerseRange): string | null {
  if (!BOOK_BY_CODE[r.start.book] || !BOOK_BY_CODE[r.end.book]) return "unknown book";
  if (!refValid(meta, r.start)) return `start ${fmtRef(r.start)} is outside the versification`;
  if (!refValid(meta, r.end)) return `end ${fmtRef(r.end)} is outside the versification`;
  if (cmpRef(r.start, r.end) > 0) return "range ends before it starts";
  return null;
}

export function chapterRange(meta: BibleMeta, book: string, chapter: number, chapterEnd = chapter): VerseRange {
  return {
    start: { book, chapter, verse: 1 },
    end: { book, chapter: chapterEnd, verse: Math.max(1, verseCount(meta, book, chapterEnd)) },
  };
}

export function bookRange(meta: BibleMeta, book: string): VerseRange {
  const last = chapterCount(meta, book);
  return { start: { book, chapter: 1, verse: 1 }, end: { book, chapter: last, verse: verseCount(meta, book, last) } };
}

/** Short display form used in locators: "Ps 23:1", "Rom 8:28–30", "1 Cor 15". */
export function shortBook(code: string): string {
  const osis = BOOK_BY_CODE[code]?.osis ?? code;
  return osis.replace(/^(\d)/, "$1 ");
}
export function fmtRef(r: VerseRef): string {
  return `${shortBook(r.book)} ${r.chapter}:${r.verse}`;
}
export function fmtRange(meta: BibleMeta, r: VerseRange): string {
  const { start: s, end: e } = r;
  if (s.book !== e.book) return `${fmtRef(s)}–${fmtRef(e)}`;
  const wholeChapters = s.verse === 1 && e.verse === verseCount(meta, e.book, e.chapter);
  if (wholeChapters) return s.chapter === e.chapter ? `${shortBook(s.book)} ${s.chapter}` : `${shortBook(s.book)} ${s.chapter}–${e.chapter}`;
  if (s.chapter === e.chapter)
    return s.verse === e.verse ? fmtRef(s) : `${shortBook(s.book)} ${s.chapter}:${s.verse}–${e.verse}`;
  return `${shortBook(s.book)} ${s.chapter}:${s.verse}–${e.chapter}:${e.verse}`;
}

/** Number of verses in a range (for most-specific-first sorting). */
export function rangeVerseCount(meta: BibleMeta, r: VerseRange): number {
  let n = 0;
  const bi = bookIndex(r.start.book);
  const be = bookIndex(r.end.book);
  for (let b = bi; b <= be; b++) {
    const code = BOOKS[b].code;
    const cs = b === bi ? r.start.chapter : 1;
    const ce = b === be ? r.end.chapter : chapterCount(meta, code);
    for (let c = cs; c <= ce; c++) {
      const vs = b === bi && c === r.start.chapter ? r.start.verse : 1;
      const ve = b === be && c === r.end.chapter ? r.end.verse : verseCount(meta, code, c);
      n += Math.max(0, ve - vs + 1);
    }
  }
  return n;
}

export function rangeKey(r: VerseRange): string {
  return `${r.start.book}.${r.start.chapter}.${r.start.verse}-${r.end.book}.${r.end.chapter}.${r.end.verse}`;
}

/** Remove duplicate ranges, keep order. */
export function dedupeRanges(rs: VerseRange[]): VerseRange[] {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(rangeKey(r)) ? false : (seen.add(rangeKey(r)), true)));
}

/** Books touched by a range, in canonical order. */
export function booksOfRange(r: VerseRange): string[] {
  const out: string[] = [];
  for (let b = bookIndex(r.start.book); b <= bookIndex(r.end.book); b++) out.push(BOOKS[b].code);
  return out;
}
