// Pure helpers for the chapter Reader: chapter navigation and heading section ranges.

import type { BsbHeading, VerseRange, VerseRef } from "@/db/types";
import { bookIndex } from "@/lib/books";
import { bookRangeOf, chapterCount, prevVerse, type BibleMeta } from "@/lib/meta";

const cmp = (a: VerseRef, b: VerseRef): number =>
  bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.verse - b.verse;

export interface ChapterPos {
  book: string;
  chapter: number;
}

/** The chapter before/after (crossing books); null at Genesis 1 / Revelation 22. */
export function adjacentChapter(meta: BibleMeta, pos: ChapterPos, dir: 1 | -1): ChapterPos | null {
  const order = [...meta.books].sort((a, b) => bookIndex(a.code) - bookIndex(b.code)).map((b) => b.code);
  const i = order.indexOf(pos.book);
  if (i < 0) return null;
  const next = pos.chapter + dir;
  if (next >= 1 && next <= chapterCount(meta, pos.book)) return { book: pos.book, chapter: next };
  const j = i + dir;
  if (j < 0 || j >= order.length) return null;
  return { book: order[j], chapter: dir === 1 ? 1 : chapterCount(meta, order[j]) };
}

/** A valid position on the grid, or null. */
export function validPos(meta: BibleMeta, book: string | null | undefined, chapter: number | null | undefined): ChapterPos | null {
  if (!book) return null;
  const code = book.toUpperCase();
  const n = chapterCount(meta, code);
  if (!n) return null;
  const c = Number.isFinite(chapter) && chapter ? Math.min(n, Math.max(1, Math.floor(chapter))) : 1;
  return { book: code, chapter: c };
}

/**
 * The section a heading introduces: from the heading's verse up to the verse before the next
 * section heading (s1/s2/ms; Psalm superscriptions do not end a section), within the same book.
 */
export function sectionRange(meta: BibleMeta, headings: BsbHeading[], h: BsbHeading): VerseRange {
  const start: VerseRef = { book: h.book, chapter: h.chapter, verse: h.verse };
  const next = headings.find((x) => x.level !== "d" && cmp(x, start) > 0);
  let end: VerseRef;
  if (next && next.book === h.book) end = prevVerse(meta, next) ?? start;
  else end = bookRangeOf(meta, h.book).end;
  if (cmp(end, start) < 0) end = start;
  return { start, end };
}

/** Order two refs into a range. */
export function orderedRange(a: VerseRef, b: VerseRef): VerseRange {
  return cmp(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

export const refInRange = (r: VerseRange, x: VerseRef): boolean => cmp(r.start, x) <= 0 && cmp(x, r.end) <= 0;
