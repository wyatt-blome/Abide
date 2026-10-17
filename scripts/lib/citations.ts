// Regex/tokenizer citation parser for scripture references printed in old works.
//
// It recognises what the WORK ITSELF prints — "Rom. viii. 28", "Rom. 8:28-30", "John iii. 16, 17",
// "1 Cor. xv. 22; Gal. ii. 20", "Matt. v.-vii.", "Ps. cxix. 105", "Jude 3" — and nothing else.
// It never infers a passage from what a paragraph is about.
//
// Matching rules (to avoid English-word collisions):
//  * the book token must be Capitalized ("Rom", "Romans") or ALL CAPS ("ROM"); never lowercase;
//  * the book token must be followed by a chapter number (arabic or roman numerals);
//  * aliases of <= 2 letters ("Is", "Am", "Ex", "Jn") need a trailing period AND chapter+verse;
//  * aliases that are common words/names ("Job", "Song", "Mark", "Col", ...) need chapter+verse;
//  * book names that are also personal names or English words ("James", "Daniel", "Amos", "Ezra",
//    "Titus", "Esther", "Joel", "Jude", "John", "Luke", "Acts", "Mark", "Numbers", "Job", "Ruth")
//    need an EXPLICIT verse: "John 3:16", "John iii. 16", "Daniel 3, ver. 5", "Jude ver. 3" —
//    never "King James I.", "Daniel 3", "Numbers 3" or a bare "Jude 3" (a numbered prefix,
//    "1 John 4", is not a name and keeps the normal rule);
//  * a chapter written as a CAPITAL roman numeral alone ("James II.", "Matt. V.") is a regnal or
//    list number as often as a chapter: it needs a verse ("Matt. V. 3");
//  * "Ps. 23, 24" (arabic chapter + comma + number, no colon) is ambiguous -> dropped and logged;
//  * "ver. 5" / "verses 5-7" are only resolved when the caller passes a heading-derived context
//    ({book, chapter}); otherwise they are dropped and logged;
//  * every resulting range is validated against the versification (meta.json); ranges beyond a
//    chapter's verse count are dropped and logged.
// OCR tolerance (matching only; the excerpt text is never changed): "l" read as "1" in a book
// prefix ("l Cor.") or inside a verse number ("2l"), and "," or "." after a roman chapter ("xv,").
import type { VerseRange } from "../../src/db/types";
import { BOOKS, BOOK_BY_CODE, BOOK_BY_OSIS } from "../../src/lib/books";
import { type BibleMeta, chapterCount, chapterRange, rangeProblem, verseCount } from "./bible-meta";

export interface Citation {
  /** [index, end) of the matched citation in the input string. */
  index: number;
  end: number;
  text: string;
  /** Valid, versification-checked ranges. Empty when everything was dropped. */
  ranges: VerseRange[];
  /** Reasons parts were dropped (ambiguous, invalid, no context). */
  problems: string[];
  relative?: boolean;
}

export interface CitationContext { book?: string; chapter?: number }

// ---------------------------------------------------------------- roman numerals

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function toRoman(n: number): string {
  const table: [number, string][] = [[100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Strict roman numeral (1..199). Mixed case ("Xv") and non-canonical forms ("iiii") -> null. */
export function romanToInt(s: string): number | null {
  if (!/^[ivxlc]+$/.test(s) && !/^[IVXLC]+$/.test(s)) return null;
  const t = s.toLowerCase();
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const v = ROMAN_VALUES[t[i]];
    const next = ROMAN_VALUES[t[i + 1]] ?? 0;
    n += v < next ? -v : v;
  }
  return n > 0 && n < 200 && toRoman(n) === t ? n : null;
}

// ---------------------------------------------------------------- alias tables

/** Extra spellings found in older works, beyond src/lib/books.ts aliases. */
const EXTRA_ALIASES: Record<string, string[]> = {
  GEN: ["gene"], EXO: ["exodus"], LEV: ["levit"], DEU: ["deuter"], JDG: ["judges"],
  PSA: ["psal", "psalm"], ECC: ["eccles", "eccl", "eccle"], SNG: ["cant", "canticles"],
  ISA: ["isai", "esa", "esay"], JER: ["jerem"], LAM: ["lament"], EZK: ["ezech"],
  HAB: ["habak"], ZEP: ["zephan"], ZEC: ["zach", "zachary"], MAT: ["matth"],
  ACT: ["acts"], GAL: ["galat"], EPH: ["ephes"], PHP: ["philip", "philipp"],
  COL: ["coloss"], HEB: ["hebr"], REV: ["revel", "apoc", "apocalypse"], JAS: ["jam"],
};

/** Numbered-book bases: base -> [code for 1, code for 2, code for 3]. */
const NUMBERED: Record<string, (string | undefined)[]> = {};
const NUMBERED_EXTRA: Record<string, string[]> = {
  SA: ["sam", "samuel"], KI: ["kings", "kgs", "kin", "ki"], CH: ["chron", "chr", "chronicles", "ch"],
  CO: ["cor", "corinth", "corinthians", "co"], TH: ["thess", "thessal", "thes", "th", "thessalonians"],
  TI: ["tim", "timothy", "ti"], PE: ["pet", "peter", "pe"], JN: ["john", "joh", "jn"],
};

const UNNUMBERED = new Map<string, string>(); // lowercase alias -> code

for (const b of BOOKS) {
  const m = /^([123])(.+)$/.exec(b.code);
  if (m) {
    const n = Number(m[1]);
    const bases = new Set<string>();
    for (const a of [...b.aliases, b.name.toLowerCase()]) {
      const mm = /^(?:[123]|i{1,3})\s?(.+)$/.exec(a);
      if (mm) bases.add(mm[1]);
    }
    for (const base of [...bases, ...(NUMBERED_EXTRA[m[2]] ?? [])]) {
      (NUMBERED[base] ??= [undefined, undefined, undefined])[n - 1] = b.code;
    }
  } else {
    for (const a of [...b.aliases, b.name.toLowerCase(), ...(EXTRA_ALIASES[b.code] ?? [])]) UNNUMBERED.set(a, b.code);
  }
}

/** Aliases that are ordinary English words or names: need chapter AND verse. */
const COLLISION = new Set([
  "is", "am", "job", "song", "sol", "mark", "jon", "pro", "col", "jam", "dan", "mal", "hag", "tit",
  "lam", "num", "ex", "act", "philip", "can", "ruth", "sam", "kin", "esay",
]);

/** Person names / English words among full book names: need an explicit verse (unnumbered only). */
const NAME_COLLISION = new Set([
  "james", "daniel", "amos", "ezra", "titus", "esther", "joel", "jude", "john", "luke", "acts", "mark", "numbers", "job", "ruth",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function aliasAlt(list: string[]): string {
  return [...new Set(list)].sort((a, b) => b.length - a.length).map((a) => escapeRe(a).replace(/ /g, "\\s+")).join("|");
}

// Arabic/OCR prefixes may touch the base ("1Cor"); word/roman prefixes need a space so that
// "Isa." is never read as "I Sa." (1 Samuel).
const PREFIX = "(?:(?<pre>[123]|l)[ \\u00a0]?|(?<pre2>III|II|I|1st|2nd|3rd|First|Second|Third|FIRST|SECOND|THIRD)[ \\u00a0])";
const BOOK_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${PREFIX}(?<nbase>${aliasAlt(Object.keys(NUMBERED))})|(?<base>${aliasAlt([...UNNUMBERED.keys()])}))(?![\\p{L}])(?<dot>\\.)?`,
  "giu",
);

/** Capitalized ("Rom", "Song of Solomon") or ALL CAPS ("ROM"); lowercase never matches. */
function isCapitalized(tok: string): boolean {
  const words = tok.split(/\s+/);
  if (words.every((w) => w === w.toUpperCase())) return /\p{Lu}/u.test(tok);
  return words.every((w, i) => (i > 0 && /^(of|the)$/.test(w)) || (/^\p{Lu}/u.test(w) && w.slice(1) === w.slice(1).toLowerCase()));
}

function prefixNumber(pre: string): { n: number; ocr: boolean } | null {
  const p = pre;
  if (p === "1" || p === "I" || p === "1st" || /^first$/i.test(p)) return { n: 1, ocr: false };
  if (p === "l") return { n: 1, ocr: true };
  if (p === "2" || p === "II" || p === "2nd" || /^second$/i.test(p)) return { n: 2, ocr: false };
  if (p === "3" || p === "III" || p === "3rd" || /^third$/i.test(p)) return { n: 3, ocr: false };
  return null; // lowercase roman etc.
}

interface BookHit { code: string; index: number; end: number; strict: "short" | "collision" | "normal" }

/** Try to read a book token exactly at position `at` (sticky). */
function bookAt(s: string, at: number): BookHit | null {
  BOOK_RE.lastIndex = at;
  const m = BOOK_RE.exec(s);
  if (!m || m.index !== at) return null;
  return toHit(m);
}

function toHit(m: RegExpExecArray): BookHit | null {
  const g = m.groups!;
  let code: string | undefined;
  let alias: string;
  if (g.nbase) {
    if (!isCapitalized(g.nbase)) return null;
    const pn = prefixNumber(g.pre ?? g.pre2);
    if (!pn) return null;
    alias = g.nbase.toLowerCase().replace(/\s+/g, " ");
    code = NUMBERED[alias]?.[pn.n - 1];
  } else {
    if (!isCapitalized(g.base)) return null;
    alias = g.base.toLowerCase().replace(/\s+/g, " ");
    code = UNNUMBERED.get(alias);
  }
  if (!code) return null;
  const strict = alias.length <= 2 ? "short" : COLLISION.has(alias) || (!g.nbase && NAME_COLLISION.has(alias)) ? "collision" : "normal";
  if (strict === "short" && !g.dot) return null;
  return { code, index: m.index, end: m.index + m[0].length, strict };
}

// ---------------------------------------------------------------- tail tokenizer

interface Num { value: number; roman: boolean; end: number; ocr?: boolean }

function readChapter(s: string, p: number): Num | null {
  const a = /^\d{1,3}(?!\d)/.exec(s.slice(p, p + 4));
  if (a) return { value: Number(a[0]), roman: false, end: p + a[0].length };
  const r = /^([ivxlc]+|[IVXLC]+)(?![\p{L}\p{N}])/u.exec(s.slice(p, p + 12));
  if (r) {
    const v = romanToInt(r[1]);
    if (v !== null) return { value: v, roman: true, end: p + r[1].length };
  }
  return null;
}

function readVerse(s: string, p: number): Num | null {
  const m = /^([\dl]{1,3})[a-c]?(?![\p{L}\p{N}])/u.exec(s.slice(p, p + 6));
  if (!m || !/\d/.test(m[1])) return null;
  const ocr = m[1].includes("l");
  return { value: Number(m[1].replace(/l/g, "1")), roman: false, end: p + m[0].length, ocr };
}

interface Group {
  chapter: number; chapterEnd?: number; verses?: [number, number][]; crossEnd?: { chapter: number; verse: number };
  /** verses were printed after a chapter separator (":", ".", "ver."), not inferred ("Jude 3"). */
  explicit?: boolean;
}

/** "ver. 5", ", v. 5", "verse 5" between a chapter (or a single-chapter book) and its verse. */
const VER_SEP = /^[ \u00a0]?[,.]?[ \u00a0]?(?:ver|vers|verse|v|vv)\.?[ \u00a0]?(?=\d)/i;

function skip(s: string, p: number, re: RegExp): number {
  const m = re.exec(s.slice(p, p + 16));
  return m ? p + m[0].length : -1;
}

/** "28", "28-30", "28, 29", "28a" lists after a chapter separator. Returns verses and end position. */
function readVerseList(s: string, p: number, problems: string[]): { verses: [number, number][]; end: number; crossEnd?: { chapter: number; verse: number } } | null {
  const first = readVerse(s, p);
  if (!first) return null;
  if (first.ocr) problems.push("ocr: 'l' read as '1' in verse number");
  const verses: [number, number][] = [[first.value, first.value]];
  let end = first.end;
  let crossEnd: { chapter: number; verse: number } | undefined;
  for (;;) {
    // range "-30", or cross-chapter "-9:3" (arabic needs ":") / "-ix. 3" (roman needs "." or ",")
    const d = skip(s, end, /^[ \u00a0]?[-\u2013\u2014][ \u00a0]?/);
    if (d >= 0) {
      const ch = readChapter(s, d);
      if (ch) {
        const sep = skip(s, ch.end, ch.roman ? /^[.,][ \u00a0]?/ : /^:[ \u00a0]?/);
        const cv = sep >= 0 ? readVerse(s, sep) : null;
        if (cv) {
          crossEnd = { chapter: ch.value, verse: cv.value };
          end = cv.end;
          break;
        }
      }
      const v2 = readVerse(s, d);
      if (v2) {
        verses[verses.length - 1][1] = v2.value;
        end = v2.end;
        continue;
      }
      break;
    }
    // list ", 29" (but not ", 1 John 4:19" and not ", 9:1" which is a new chapter group)
    const c = skip(s, end, /^,[  ]?/);
    if (c >= 0) {
      const v = readVerse(s, c);
      if (!v) break;
      if (/^[:.]\s?\d/.test(s.slice(v.end, v.end + 3))) break;
      const after = skip(s, v.end, /^[  ]/);
      if (after >= 0 && v.value <= 3 && bookAt(s, c)) break;
      verses.push([v.value, v.value]);
      end = v.end;
      continue;
    }
    break;
  }
  if (/^[  ]?ff?\./.test(s.slice(end, end + 5))) problems.push("'f./ff.' after verse: only the stated verses are mapped");
  return { verses, end, crossEnd };
}

/** Parse the "viii. 28-30; ix. 1" tail after a book token. */
function parseTail(s: string, p: number, singleChapterBook: boolean, problems: string[]): { groups: Group[]; end: number } | null {
  let q = skip(s, p, /^[  ]?(?:(?:chap|ch|c)\.[  ]?)?/);
  const groups: Group[] = [];
  let end = p;
  for (let round = 0; ; round++) {
    const ch = readChapter(s, q);
    if (!ch) break;
    let g: Group | null = null;
    // chapter/verse separator: ":" or "." (or "," after roman, OCR tolerant)
    const sepColon = skip(s, ch.end, /^[  ]?[:.][  ]?/);
    const sepComma = skip(s, ch.end, /^,[  ]?/);
    let vl = sepColon >= 0 ? readVerseList(s, sepColon, problems) : null;
    if (!vl) {
      const sepVer = skip(s, ch.end, VER_SEP);
      if (sepVer >= 0) vl = readVerseList(s, sepVer, problems);
    }
    if (!vl && sepComma >= 0 && readVerse(s, sepComma)) {
      if (ch.roman) vl = readVerseList(s, sepComma, problems);
      else if (round === 0) {
        problems.push("ambiguous: arabic chapter followed by comma and number (chapter list or verse?)");
        return { groups: [], end: readVerse(s, sepComma)!.end };
      }
    }
    if (vl) {
      g = { chapter: ch.value, verses: vl.verses, crossEnd: vl.crossEnd, explicit: true };
      end = vl.end;
    } else if (round > 0 && !ch.roman) {
      break; // "; 5" after a group: not a chapter-only continuation we can trust
    } else {
      // chapter only: "Ps. xxiii.", "Matt. v.-vii.", "Jude 3" (single-chapter book -> verse)
      const next = s.slice(ch.end, ch.end + 2);
      if (/^[\p{L}\p{N}]/u.test(next)) break;
      // a roman chapter on its own must be closed by punctuation ("Rom. i." but not "Rom. I think")
      if (ch.roman && !/^[.,;)\]]/.test(next)) break;
      // a CAPITAL roman numeral alone ("James II.", "Matt. V.") needs a verse
      if (ch.roman && /^[IVXLC]+$/.test(s.slice(q, ch.end))) break;
      g = { chapter: ch.value };
      end = ch.end;
      const d = skip(s, ch.end, /^\.?[  ]?[-–—][  ]?/);
      const ch2 = d >= 0 ? readChapter(s, d) : null;
      if (ch2 && ch2.roman === ch.roman && ch2.value > ch.value) {
        g.chapterEnd = ch2.value;
        end = ch2.end;
      }
      if (singleChapterBook && !ch.roman) {
        g = { chapter: 1, verses: [[ch.value, ch.value]] };
      }
    }
    groups.push(g);
    // ";" continuation in the same book (a new book token is handled by the outer scan)
    const semi = skip(s, end, /^[  ]?;[  ]?/);
    if (semi < 0 || bookAt(s, semi)) break;
    const look = readChapter(s, semi);
    if (!look) break;
    q = semi;
  }
  if (!groups.length) return null;
  return { groups, end };
}

function groupsToRanges(meta: BibleMeta, code: string, groups: Group[], problems: string[]): VerseRange[] {
  const out: VerseRange[] = [];
  const push = (r: VerseRange) => {
    const why = rangeProblem(meta, r);
    if (why) problems.push(`invalid range dropped (${why})`);
    else out.push(r);
  };
  for (const g of groups) {
    if (g.chapter > chapterCount(meta, code)) {
      problems.push(`invalid range dropped (chapter ${g.chapter} beyond ${code} ${chapterCount(meta, code)})`);
      continue;
    }
    if (!g.verses) {
      const ce = g.chapterEnd ?? g.chapter;
      if (ce > chapterCount(meta, code)) { problems.push(`invalid range dropped (chapter ${ce})`); continue; }
      push(chapterRange(meta, code, g.chapter, ce));
      continue;
    }
    g.verses.forEach(([a, b], i) => {
      const last = i === g.verses!.length - 1;
      if (last && g.crossEnd)
        push({ start: { book: code, chapter: g.chapter, verse: a }, end: { book: code, chapter: g.crossEnd.chapter, verse: g.crossEnd.verse } });
      else if (b < a) problems.push(`invalid range dropped (${g.chapter}:${a}-${b} ends before it starts)`);
      else push({ start: { book: code, chapter: g.chapter, verse: a }, end: { book: code, chapter: g.chapter, verse: b } });
    });
  }
  return out;
}

const RELATIVE_RE = /(?<![\p{L}])(?:[Vv]er(?:s(?:es?)?)?\.?|[Vv]v\.|VER(?:SES?)?\.?)[  ]?(?<v1>\d{1,3})(?!\d)(?!:\d)(?:[  ]?[-–][  ]?(?<v2>\d{1,3})(?![\d]))?/gu;

/**
 * Find every citation in `text`. Each result lists the valid ranges and the problems that caused
 * other parts to be dropped; callers keep `ranges` and log `problems`.
 */
export function findCitations(text: string, meta: BibleMeta, context?: CitationContext): Citation[] {
  const out: Citation[] = [];
  BOOK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOOK_RE.exec(text))) {
    const hit = toHit(m);
    if (!hit) { BOOK_RE.lastIndex = m.index + 1; continue; }
    const problems: string[] = [];
    const single = chapterCount(meta, hit.code) === 1;
    const tail = parseTail(text, hit.end, single, problems);
    if (!tail) { BOOK_RE.lastIndex = hit.end; continue; }
    // word-like/name books: keep only groups with an explicitly printed verse
    if (hit.strict === "collision") tail.groups = tail.groups.filter((g) => g.verses && g.explicit);
    const hasVerse = tail.groups.some((g) => g.verses);
    if (hit.strict !== "normal" && !hasVerse && !problems.length) { BOOK_RE.lastIndex = hit.end; continue; }
    if (!tail.groups.length && !problems.length) { BOOK_RE.lastIndex = hit.end; continue; }
    const ranges = groupsToRanges(meta, hit.code, tail.groups, problems);
    out.push({ index: hit.index, end: tail.end, text: text.slice(hit.index, tail.end), ranges, problems });
    BOOK_RE.lastIndex = Math.max(tail.end, hit.end);
  }
  // relative "ver. 5" references outside explicit citations
  RELATIVE_RE.lastIndex = 0;
  let r: RegExpExecArray | null;
  while ((r = RELATIVE_RE.exec(text))) {
    const idx = r.index;
    if (out.some((c) => idx >= c.index && idx < c.end)) continue;
    const v1 = Number(r.groups!.v1);
    const v2 = r.groups!.v2 ? Number(r.groups!.v2) : v1;
    const problems: string[] = [];
    let ranges: VerseRange[] = [];
    if (context?.book && context.chapter) {
      const range = { start: { book: context.book, chapter: context.chapter, verse: v1 }, end: { book: context.book, chapter: context.chapter, verse: v2 } };
      const why = rangeProblem(meta, range);
      if (why) problems.push(`invalid range dropped (${why})`);
      else ranges = [range];
    } else {
      problems.push("relative verse reference without a heading context");
    }
    out.push({ index: idx, end: idx + r[0].length, text: r[0], ranges, problems, relative: true });
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- OSIS ("Rom.8.28-Rom.8.30")

/**
 * Parse OSIS-style references as used by Creeds.json proofs and OpenBible: "Rom.8.28",
 * "Rom.14.7-Rom.14.9", "Ps.8" (whole chapter), "Gen.1-Gen.2", comma lists "Rom.3.10,Rom.3.23".
 */
export function parseOsis(input: string, meta: BibleMeta, problems: string[] = []): VerseRange[] {
  const out: VerseRange[] = [];
  for (const part of input.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?(?:-([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?)?$/.exec(part);
    if (!m) { problems.push(`unparseable OSIS reference "${part}"`); continue; }
    const b1 = BOOK_BY_OSIS[m[1]]?.code;
    const b2 = m[4] ? BOOK_BY_OSIS[m[4]]?.code : b1;
    if (!b1 || !b2) { problems.push(`unknown OSIS book in "${part}"`); continue; }
    const c1 = Number(m[2]);
    const c2 = m[5] ? Number(m[5]) : c1;
    const v1 = m[3] ? Number(m[3]) : 1;
    let v2: number;
    if (m[4]) v2 = m[6] ? Number(m[6]) : verseCount(meta, b2, c2);
    else v2 = m[3] ? v1 : verseCount(meta, b1, c1);
    const r: VerseRange = { start: { book: b1, chapter: c1, verse: v1 }, end: { book: b2, chapter: c2, verse: v2 } };
    const why = rangeProblem(meta, r);
    if (why) problems.push(`invalid range dropped "${part}" (${why})`);
    else out.push(r);
  }
  return out;
}

/** Resolve a free book name ("Romans", "ROMANS", "1 Corinthians", "Psalm") to a code. */
export function bookFromName(name: string): string | undefined {
  const t = name.trim().replace(/\.$/, "");
  if (BOOK_BY_CODE[t.toUpperCase()] && t.length === 3 && t === t.toUpperCase()) return t;
  const re = new RegExp(`^(?:${BOOK_RE.source})$`, "iu");
  const m = re.exec(t);
  if (!m) return undefined;
  const g = m.groups!;
  if (g.nbase) {
    const pre = g.pre ?? g.pre2;
    const pn = prefixNumber(pre) ?? (/^i{1,3}$/i.test(pre) ? { n: pre.length, ocr: false } : null);
    return pn ? NUMBERED[g.nbase.toLowerCase().replace(/\s+/g, " ")]?.[pn.n - 1] : undefined;
  }
  return UNNUMBERED.get(g.base.toLowerCase().replace(/\s+/g, " "));
}

/** Parse "viii", "8", "VIII" (strict). */
export function parseNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  return romanToInt(s);
}
