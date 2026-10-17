// VerseKey / VerseRef / VerseRange helpers, user-typed reference parsing and display formatting.
//
// Meta-dependent helpers take `meta` as a parameter and use only the documented meta.json shape
// (books[].code/chapters/verses, emptyVerses.BSB). Without meta, references that mean "to the end
// of the chapter/book" ("Ps 23", "Jude") use the sentinel END (999); `clampRange(meta, r)` resolves it.

import type { VerseKey, VerseRange, VerseRef } from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import { BOOKS, BOOK_BY_CODE, bookIndex } from "@/lib/books";

/** Sentinel chapter/verse number meaning "last one" when no meta is available. */
export const END = 999;

// ---------------------------------------------------------------- keys & comparison

export const toKey = (ref: VerseRef): VerseKey => `${ref.book}.${ref.chapter}.${ref.verse}`;

export function fromKey(key: VerseKey): VerseRef {
  const [book, c, v] = key.split(".");
  return { book, chapter: Number(c), verse: Number(v) };
}

export const ref = (book: string, chapter: number, verse: number): VerseRef => ({ book, chapter, verse });

export function compareRefs(a: VerseRef, b: VerseRef): number {
  return bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.verse - b.verse;
}

export const compareKeys = (a: VerseKey, b: VerseKey): number => compareRefs(fromKey(a), fromKey(b));

export function rangeContains(r: VerseRange, x: VerseRef): boolean {
  return compareRefs(r.start, x) <= 0 && compareRefs(x, r.end) <= 0;
}

export function rangesOverlap(a: VerseRange, b: VerseRange): boolean {
  return compareRefs(a.start, b.end) <= 0 && compareRefs(b.start, a.end) <= 0;
}

export const singleVerse = (r: VerseRef): VerseRange => ({ start: r, end: r });

/** Compact range id "ROM.8.1-ROM.8.39" (URL parameter, React key). Inverse: parseRangeId. */
export const rangeId = (r: VerseRange): string => `${toKey(r.start)}-${toKey(r.end)}`;

const KEY_RE = /^([1-3A-Z]{3})\.(\d{1,3})\.(\d{1,3})$/;

function parseKeyStrict(s: string): VerseRef | null {
  const m = KEY_RE.exec(s);
  if (!m || !BOOK_BY_CODE[m[1]]) return null;
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  return chapter >= 1 && verse >= 1 ? { book: m[1], chapter, verse } : null;
}

/** Parse a rangeId ("ROM.8.1-ROM.8.39", or a single key "ROM.8.28"); null when malformed or reversed. */
export function parseRangeId(id: string | null | undefined): VerseRange | null {
  if (!id) return null;
  const parts = id.trim().split("-");
  if (parts.length > 2) return null;
  const start = parseKeyStrict(parts[0]);
  const end = parts.length === 2 ? parseKeyStrict(parts[1]) : start;
  if (!start || !end || compareRefs(start, end) > 0) return null;
  return { start, end };
}

// ---------------------------------------------------------------- meta index (cached per meta object)

interface MetaIndex {
  verses: Map<string, number[]>; // book → verses per chapter
  empty: Set<VerseKey>;
}
const indexCache = new WeakMap<object, MetaIndex>();

function idx(meta: BibleMeta): MetaIndex {
  let m = indexCache.get(meta);
  if (!m) {
    m = {
      verses: new Map(meta.books.map((b) => [b.code, b.verses])),
      empty: new Set(meta.emptyVerses?.BSB ?? []),
    };
    indexCache.set(meta, m);
  }
  return m;
}

export function chapterCount(meta: BibleMeta, book: string): number {
  return idx(meta).verses.get(book)?.length ?? 0;
}

export function versesIn(meta: BibleMeta, book: string, chapter: number): number {
  return idx(meta).verses.get(book)?.[chapter - 1] ?? 0;
}

export function isEmptyKey(meta: BibleMeta, key: VerseKey): boolean {
  return idx(meta).empty.has(key);
}

export function bookRange(meta: BibleMeta, book: string): VerseRange {
  const last = chapterCount(meta, book);
  return { start: ref(book, 1, 1), end: ref(book, last, versesIn(meta, book, last)) };
}

export function chapterRange(meta: BibleMeta, book: string, chapter: number): VerseRange {
  return { start: ref(book, chapter, 1), end: ref(book, chapter, versesIn(meta, book, chapter)) };
}

/** Resolve END sentinels and clamp out-of-range chapter/verse numbers to the real versification. */
export function clampRef(meta: BibleMeta, r: VerseRef): VerseRef {
  const chapters = chapterCount(meta, r.book);
  const chapter = Math.max(1, Math.min(r.chapter, chapters));
  const verse = Math.max(1, Math.min(r.verse, versesIn(meta, r.book, chapter)));
  return ref(r.book, chapter, verse);
}

export const clampRange = (meta: BibleMeta, r: VerseRange): VerseRange => ({
  start: clampRef(meta, r.start),
  end: clampRef(meta, r.end),
});

/** The verse after `r` in canonical order (crossing chapters and books), or null after Rev 22:21. */
export function nextRef(meta: BibleMeta, r: VerseRef): VerseRef | null {
  if (r.verse < versesIn(meta, r.book, r.chapter)) return ref(r.book, r.chapter, r.verse + 1);
  if (r.chapter < chapterCount(meta, r.book)) return ref(r.book, r.chapter + 1, 1);
  const bi = bookIndex(r.book);
  for (let i = bi + 1; i < BOOKS.length; i++) {
    if (chapterCount(meta, BOOKS[i].code) > 0) return ref(BOOKS[i].code, 1, 1);
  }
  return null;
}

/** Every verse in the range (inclusive), in order; `skipEmpty` drops BSB empty verses. */
export function iterateRefs(meta: BibleMeta, range: VerseRange, skipEmpty = false): VerseRef[] {
  const r = clampRange(meta, range);
  const out: VerseRef[] = [];
  if (compareRefs(r.start, r.end) > 0) return out;
  const { empty } = idx(meta);
  let cur: VerseRef | null = r.start;
  while (cur && compareRefs(cur, r.end) <= 0) {
    if (!skipEmpty || !empty.has(toKey(cur))) out.push(cur);
    cur = nextRef(meta, cur);
  }
  return out;
}

export function rangeToKeys(meta: BibleMeta, range: VerseRange, skipEmpty = false): VerseKey[] {
  return iterateRefs(meta, range, skipEmpty).map(toKey);
}

/** Number of verses in the range (BSB versification, empty verses included). */
export function rangeSize(range: VerseRange, meta: BibleMeta): number {
  return iterateRefs(meta, range).length;
}

/** Union of every key covered by the ranges, de-duplicated, canonical order. */
export function keysCovered(meta: BibleMeta, ranges: VerseRange[], skipEmpty = false): VerseKey[] {
  const seen = new Set<VerseKey>();
  for (const r of ranges) for (const k of rangeToKeys(meta, r, skipEmpty)) seen.add(k);
  return [...seen].sort(compareKeys);
}

// ---------------------------------------------------------------- formatting

const DASH = "–"; // en dash

function bookName(code: string, singleChapter: boolean): string {
  const name = BOOK_BY_CODE[code]?.name ?? code;
  // "Psalm 23" for one psalm, "Psalms 1–2" for several.
  return code === "PSA" && singleChapter ? "Psalm" : name;
}

export function formatRef(r: VerseRef): string {
  return `${bookName(r.book, true)} ${r.chapter}:${r.verse}`;
}

const isChapterStart = (r: VerseRef) => r.verse === 1;
function isChapterEnd(r: VerseRef, meta?: BibleMeta): boolean {
  if (r.verse >= END) return true;
  return !!meta && r.verse === versesIn(meta, r.book, r.chapter);
}
function isBookEnd(r: VerseRef, meta?: BibleMeta): boolean {
  if (!isChapterEnd(r, meta)) return false;
  if (r.chapter >= END) return true;
  return !!meta && r.chapter === chapterCount(meta, r.book);
}

/**
 * "Romans 8:28", "John 1:1–18", "Isaiah 52:13–53:12", "Romans 8" (whole chapter), "Matthew 5–7",
 * "Psalm 23", "Jude" (whole book), cross-book "Genesis 50:1–Exodus 2:10" / "Genesis 50–Exodus 2".
 * Whole-chapter detection needs `meta` (or an END sentinel in the range).
 */
export function formatRange(range: VerseRange, meta?: BibleMeta): string {
  const { start: s, end: e } = range;
  const wholeChapters = isChapterStart(s) && isChapterEnd(e, meta);
  if (s.book === e.book) {
    if (wholeChapters && s.chapter === 1 && isBookEnd(e, meta) && (meta || e.chapter >= END)) {
      // Whole book. Psalms as a book is plural.
      return BOOK_BY_CODE[s.book]?.name ?? s.book;
    }
    if (wholeChapters) {
      return s.chapter === e.chapter
        ? `${bookName(s.book, true)} ${s.chapter}`
        : `${bookName(s.book, false)} ${s.chapter}${DASH}${e.chapter}`;
    }
    if (s.chapter === e.chapter) {
      const v = s.verse === e.verse ? `${s.verse}` : `${s.verse}${DASH}${e.verse}`;
      return `${bookName(s.book, true)} ${s.chapter}:${v}`;
    }
    return `${bookName(s.book, true)} ${s.chapter}:${s.verse}${DASH}${e.chapter}:${e.verse}`;
  }
  if (wholeChapters) {
    return `${bookName(s.book, true)} ${s.chapter}${DASH}${bookName(e.book, true)} ${e.chapter}`;
  }
  return `${formatRef(s)}${DASH}${formatRef(e)}`;
}

export function formatRanges(ranges: VerseRange[], meta?: BibleMeta): string {
  return ranges.map((r) => formatRange(r, meta)).join("; ");
}

// ---------------------------------------------------------------- parsing

const normBookText = (s: string) =>
  s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

let bookLookup: Map<string, string> | null = null;
function lookupBook(raw: string): string | null {
  if (!bookLookup) {
    bookLookup = new Map();
    for (const b of BOOKS) {
      const names = [b.code, b.osis, b.name, ...b.aliases].map(normBookText);
      for (const n of names) {
        // First registration wins (e.g. "jud" stays Judges as in books.ts order).
        if (!bookLookup.has(n)) bookLookup.set(n, b.code);
        const compact = n.replace(/ /g, "");
        if (!bookLookup.has(compact)) bookLookup.set(compact, b.code);
      }
    }
  }
  const n = normBookText(raw).replace(/^(first|1st)\s/, "1 ").replace(/^(second|2nd)\s/, "2 ").replace(/^(third|3rd)\s/, "3 ");
  const hit = bookLookup.get(n) ?? bookLookup.get(n.replace(/ /g, ""));
  if (hit) return hit;
  // Unique prefix of a full book name, at least 3 letters ("Philem", "Lament").
  if (n.replace(/[^a-z]/g, "").length >= 3) {
    const cands = BOOKS.filter((b) => normBookText(b.name).startsWith(n) || normBookText(b.name).replace(/ /g, "").startsWith(n.replace(/ /g, "")));
    if (cands.length === 1) return cands[0].code;
  }
  return null;
}

interface Ctx { book: string; chapter: number | null; hadVerse: boolean }

const num = (s: string) => Number(s.replace(/[ab]$/i, ""));

/**
 * Parse one comma part's numeric reference, e.g. "8:28-30", "5-7", "52:13-53:12", "23", "18".
 * `ctx.hadVerse` decides whether a bare number after a comma is a verse ("John 3:16, 18") or a
 * chapter ("Ps 1, 23").
 */
function parseNumeric(part: string, ctx: Ctx, first: boolean): VerseRange | null {
  const p = part.replace(/\s+/g, "").replace(/[–—‒−]/g, "-").replace(/\./g, ":");
  const cv = "(\\d+[ab]?)(?::(\\d+[ab]?))?";
  const m = new RegExp(`^${cv}(?:-${cv})?$`, "i").exec(p);
  if (!m) return null;
  const [, a1, a2, b1, b2] = m;
  const b = ctx.book;
  let start: VerseRef;
  let end: VerseRef;
  if (a2 !== undefined) {
    // c:v ...
    start = ref(b, num(a1), num(a2));
    if (b1 === undefined) end = start;
    else if (b2 !== undefined) end = ref(b, num(b1), num(b2)); // c:v-c:v
    else end = ref(b, start.chapter, num(b1)); // c:v-v
    ctx.chapter = end.chapter;
    ctx.hadVerse = true;
  } else if (!first && ctx.hadVerse && ctx.chapter !== null) {
    // ", 18" or ", 18-20" after a verse reference → verses in the current chapter.
    start = ref(b, ctx.chapter, num(a1));
    end = b2 !== undefined ? ref(b, num(b1), num(b2)) : ref(b, ctx.chapter, b1 !== undefined ? num(b1) : num(a1));
    ctx.chapter = end.chapter;
  } else {
    // Chapter(s): "23", "5-7", "5-7:29".
    start = ref(b, num(a1), 1);
    if (b1 === undefined) end = ref(b, num(a1), END);
    else if (b2 !== undefined) end = ref(b, num(b1), num(b2));
    else end = ref(b, num(b1), END);
    ctx.chapter = end.chapter;
    ctx.hadVerse = b2 !== undefined;
  }
  return start.chapter >= 1 && start.verse >= 1 && end.verse >= 1 ? { start, end } : null;
}

/** Split "Rom 8:28" into ["Rom", "8:28"]; "1 Cor 13" → ["1 Cor", "13"]; "Jude" → ["Jude", ""]. */
function splitBook(seg: string): [string, string] | null {
  const m = /^((?:[1-3]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-z][a-z .]*?)\.?\s*(\d.*)?$/i.exec(seg.trim());
  if (!m) return null;
  return [m[1].trim(), (m[2] ?? "").trim()];
}

/**
 * Parse user-typed references: "Rom 8:28-30; Ps 23", "1 Cor 13", "John 15:4–5", "John 3:16, 18",
 * "Gen 50–Exod 2", "Jude". Segments without a book inherit the previous one ("Rom 8:28; 12:1").
 * Returns null when anything fails to parse (or, with `meta`, refers to verses that do not exist).
 * Without meta, chapter/book ends use the END sentinel; with meta they are resolved.
 */
export function parseReference(input: string, meta?: BibleMeta): VerseRange[] | null {
  const out: VerseRange[] = [];
  const ctx: Ctx = { book: "", chapter: null, hadVerse: false };
  const segments = input.split(";").map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return null;

  for (const seg of segments) {
    // Cross-book range: "<ref> – <book ref>".
    const cross = /^(.+?)\s*[-–—]\s*((?:[1-3]\s*)?[a-z].*)$/i.exec(seg);
    if (cross && /\d/.test(cross[1]) && /^[1-3]?\s*[a-z]/i.test(cross[2])) {
      const left = parseReference(cross[1], meta);
      const right = parseReference(cross[2], meta);
      if (!left || !right || left.length !== 1 || right.length !== 1) return null;
      out.push({ start: left[0].start, end: right[0].end });
      continue;
    }

    let rest = seg;
    if (/^\s*([1-3]\s*)?[a-z]/i.test(seg) && !/^\d+\s*[:.]/.test(seg)) {
      const sp = splitBook(seg);
      if (!sp) return null;
      const code = lookupBook(sp[0]);
      if (!code) return null;
      ctx.book = code;
      ctx.chapter = null;
      ctx.hadVerse = false;
      rest = sp[1];
      if (!rest) {
        out.push({ start: ref(code, 1, 1), end: ref(code, END, END) });
        continue;
      }
    } else if (!ctx.book) {
      return null;
    } else {
      // A new ";" segment without a book starts a fresh chapter context.
      ctx.hadVerse = false;
    }

    const parts = rest.split(",").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const r = parseNumeric(parts[i], ctx, i === 0);
      if (!r) return null;
      out.push(r);
    }
  }

  if (!meta) {
    for (const r of out) if (compareRefs(r.start, r.end) > 0) return null;
    return out;
  }
  const resolved: VerseRange[] = [];
  for (const r of out) {
    // Validate real chapter/verse numbers (END sentinels excepted), then resolve sentinels.
    for (const x of [r.start, r.end]) {
      const chapters = chapterCount(meta, x.book);
      if (x.chapter !== END && (x.chapter < 1 || x.chapter > chapters)) return null;
      const c = x.chapter === END ? chapters : x.chapter;
      if (x.verse !== END && (x.verse < 1 || x.verse > versesIn(meta, x.book, c))) return null;
    }
    const c = clampRange(meta, r);
    if (compareRefs(c.start, c.end) > 0) return null;
    resolved.push(c);
  }
  return resolved;
}
