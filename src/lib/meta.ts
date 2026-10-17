// Pure helpers over BibleMeta (public/bible/meta.json): the BSB chapter/verse grid.
// No I/O. Every function takes `meta` explicitly so it works the same in the browser and in tests.

import type { VerseKey, VerseRange, VerseRef } from "@/db/types";
import { BOOKS, bookIndex } from "@/lib/books";

export interface BibleMetaBook {
  code: string;
  name: string;
  /** number of chapters */
  chapters: number;
  /** verses per chapter; verses[0] = chapter 1 */
  verses: number[];
}

export interface BibleMeta {
  books: BibleMetaBook[];
  totalVerses: number;
  emptyVerses: { BSB: VerseKey[] };
}

// ---------------------------------------------------------------- index (cached per meta object)

interface Index {
  byCode: Map<string, BibleMetaBook>;
  empty: Set<VerseKey>;
  /** book order as present in meta (canonical) */
  order: string[];
}
const cache = new WeakMap<BibleMeta, Index>();

function index(meta: BibleMeta): Index {
  let ix = cache.get(meta);
  if (!ix) {
    const order = [...meta.books].sort((a, b) => bookIndex(a.code) - bookIndex(b.code)).map((b) => b.code);
    ix = { byCode: new Map(meta.books.map((b) => [b.code, b])), empty: new Set(meta.emptyVerses?.BSB ?? []), order };
    cache.set(meta, ix);
  }
  return ix;
}

const keyOf = (r: VerseRef): VerseKey => `${r.book}.${r.chapter}.${r.verse}`;
const cmp = (a: VerseRef, b: VerseRef): number =>
  bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.verse - b.verse;

// ---------------------------------------------------------------- counts

export function chapterCount(meta: BibleMeta, book: string): number {
  return index(meta).byCode.get(book)?.chapters ?? 0;
}

export function verseCount(meta: BibleMeta, book: string, chapter: number): number {
  return index(meta).byCode.get(book)?.verses[chapter - 1] ?? 0;
}

export function bookVerseTotal(meta: BibleMeta, book: string): number {
  const b = index(meta).byCode.get(book);
  return b ? b.verses.reduce((n, v) => n + v, 0) : 0;
}

export function bookName(meta: BibleMeta, book: string): string {
  return index(meta).byCode.get(book)?.name ?? BOOKS.find((b) => b.code === book)?.name ?? book;
}

/** True for a verse slot the BSB leaves empty (e.g. "MAT.17.21"). */
export function isEmptyVerse(meta: BibleMeta, key: VerseKey): boolean {
  return index(meta).empty.has(key);
}

/** True when the ref exists in the BSB grid. */
export function isValidRef(meta: BibleMeta, r: VerseRef): boolean {
  return r.chapter >= 1 && r.verse >= 1 && r.verse <= verseCount(meta, r.book, r.chapter);
}

// ---------------------------------------------------------------- navigation

/** Clamp a ref to the grid (chapter/verse numbers past the end, e.g. 999 sentinels, become the last one). */
export function clampToGrid(meta: BibleMeta, r: VerseRef): VerseRef {
  const chapters = chapterCount(meta, r.book);
  if (chapters === 0) return r;
  const chapter = Math.max(1, Math.min(r.chapter, chapters));
  const verse = Math.max(1, Math.min(r.verse, verseCount(meta, r.book, chapter)));
  return { book: r.book, chapter, verse };
}

/** The verse after `ref` in canonical order (crossing chapters and books); null after the last verse. */
export function nextVerse(meta: BibleMeta, ref: VerseRef): VerseRef | null {
  const r = clampToGrid(meta, ref);
  if (r.verse < verseCount(meta, r.book, r.chapter)) return { book: r.book, chapter: r.chapter, verse: r.verse + 1 };
  if (r.chapter < chapterCount(meta, r.book)) return { book: r.book, chapter: r.chapter + 1, verse: 1 };
  const { order } = index(meta);
  const i = order.indexOf(r.book);
  if (i < 0 || i + 1 >= order.length) return null;
  return { book: order[i + 1], chapter: 1, verse: 1 };
}

/** The verse before `ref` in canonical order; null before the first verse. */
export function prevVerse(meta: BibleMeta, ref: VerseRef): VerseRef | null {
  const r = clampToGrid(meta, ref);
  if (r.verse > 1) return { book: r.book, chapter: r.chapter, verse: r.verse - 1 };
  if (r.chapter > 1) return { book: r.book, chapter: r.chapter - 1, verse: verseCount(meta, r.book, r.chapter - 1) };
  const { order } = index(meta);
  const i = order.indexOf(r.book);
  if (i <= 0) return null;
  const pb = order[i - 1];
  const pc = chapterCount(meta, pb);
  return { book: pb, chapter: pc, verse: verseCount(meta, pb, pc) };
}

// ---------------------------------------------------------------- ranges

/**
 * Every verse in the range, inclusive, in canonical order (BSB grid), crossing chapter and book
 * boundaries. Out-of-grid numbers are clamped. Empty BSB verses are included (they are real slots);
 * pass `{ skipEmpty: true }` to drop them.
 */
export function iterateRange(meta: BibleMeta, range: VerseRange, opts: { skipEmpty?: boolean } = {}): VerseRef[] {
  const start = clampToGrid(meta, range.start);
  const end = clampToGrid(meta, range.end);
  const out: VerseRef[] = [];
  if (chapterCount(meta, start.book) === 0 || chapterCount(meta, end.book) === 0) return out;
  if (cmp(start, end) > 0) return out;
  const { empty } = index(meta);
  let cur: VerseRef | null = start;
  while (cur && cmp(cur, end) <= 0) {
    if (!opts.skipEmpty || !empty.has(keyOf(cur))) out.push(cur);
    cur = nextVerse(meta, cur);
  }
  return out;
}

/** VerseKeys of every verse in the range (see iterateRange). */
export function rangeKeys(meta: BibleMeta, range: VerseRange, opts: { skipEmpty?: boolean } = {}): VerseKey[] {
  return iterateRange(meta, range, opts).map(keyOf);
}

/** Number of verses in the range that have BSB text. */
export function countNonEmpty(meta: BibleMeta, range: VerseRange): number {
  return iterateRange(meta, range, { skipEmpty: true }).length;
}

/** Whole-book range on the grid. */
export function bookRangeOf(meta: BibleMeta, book: string): VerseRange {
  const c = chapterCount(meta, book);
  return { start: { book, chapter: 1, verse: 1 }, end: { book, chapter: c, verse: verseCount(meta, book, c) } };
}

/** Whole-chapter range on the grid. */
export function chapterRangeOf(meta: BibleMeta, book: string, chapter: number): VerseRange {
  return { start: { book, chapter, verse: 1 }, end: { book, chapter, verse: verseCount(meta, book, chapter) } };
}
