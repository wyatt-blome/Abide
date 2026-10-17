// Shared structure engine for the plain-text parsers (ccel-txt, verse-commentary, heading-range,
// inline-citation). It walks the RAW text line by line, recognises headings with regex rules from
// the pack manifest (parserOptions.headings), and returns sections whose positions are already
// translated to offsets in normalizeWs(raw) — the coordinate system every excerpt uses.
//
// Mapping comes only from the work's own structure: a heading's printed reference ("Homily XV.
// Matt. iv. 23", "PSALM XXIII", "VERSE 20.", "Chapter 8", "28. And we know ..."). Nothing is
// guessed from content.
import type { VerseRange } from "../../src/db/types";
import { BOOK_BY_CODE } from "../../src/lib/books";
import { bookRange, chapterCount, chapterRange, fmtRange, rangeProblem, shortBook } from "../lib/bible-meta";
import { ccelBodyRange } from "../lib/ccel";
import { bookFromName, findCitations, parseNumber } from "../lib/citations";
import { type Normalized, normalizeWithMap, normalizeWs, rawToNorm, trimSpan } from "../lib/normalize";
import type { ParseCtx, RawFile } from "./types";

export interface HeadingRule {
  /** Regex source tested against the trimmed line (or paragraph start for paragraphStart rules). */
  pattern: string;
  flags?: string;
  /**
   * unit    – a new top-level unit (homily, sermon, tractate, entry); resets chapter/verse.
   * book    – sets the book context (commentary volumes covering several books).
   * chapter – sets the chapter; section maps to the whole chapter (or chapter..chapterEnd).
   * verse   – a verse (range) within the current book/chapter.
   * label   – a sub-heading ("EXPOSITION"); keeps the range, adds a locator label.
   * skip    – ends the section; following text is ignored until the next heading.
   */
  level: "unit" | "book" | "chapter" | "verse" | "label" | "skip";
  /** Locator label template: $1..$9 = regex groups; {book} {chapter} {verse} {verseEnd}. */
  label?: string;
  /** Fixed BookCode ("JHN") or "$n" (group parsed as a book name). */
  book?: string;
  chapter?: string;
  chapterEnd?: string;
  verse?: string;
  verseEnd?: string;
  /** Parse explicit-book citations in the heading line itself; first valid one gives the range. */
  refFromLine?: boolean;
  /** Also look for that citation in the next N non-empty lines (sermon text lines). */
  refLookahead?: number;
  /** Match at the start of a paragraph instead of on a heading line ("28. And we know..."). */
  paragraphStart?: boolean;
  /** For level "book": the text before the first chapter heading is the book intro. */
  intro?: boolean;
  /** Anchor template for manifest.urlTemplate. */
  anchor?: string;
}

export interface StructureOptions {
  headings?: HeadingRule[];
  /** Line regex where the body starts (that line included) / ends (excluded). */
  bodyStart?: string;
  bodyEnd?: string;
  /** Strip Project Gutenberg header/footer (auto-detected when unset). */
  gutenberg?: boolean;
  maxHeadingLen?: number;
  /** Locator = formatted range (+ ", " sub-label), e.g. "Ps 23:1, Exposition". */
  locatorFromRange?: boolean;
  /** Raw character bounds of the body (set by parsers that know the file layout). */
  bodyRange?: [number, number];
  /** "ccel": body is between the table of contents and the back-matter indexes (lib/ccel.ts). */
  layout?: "ccel" | "plain";
  /** Locator prefix used before the range when locatorFromRange (e.g. unit label). */
  keepUnitInLocator?: boolean;
  /**
   * Regex (group 1 = the title) for the file's own title lines, searched in its first 400 lines.
   * Default "^Title:\\s*(.+)$" (CCEL and Project Gutenberg headers). For a file whose bookScope is
   * a single book, the book context before the first book-setting heading is the one book named
   * in these lines; bookScope only restricts (validates) it, never supplies it.
   */
  titlePattern?: string;
}

export const DEFAULT_TITLE_PATTERN = "^Title:\\s*(.+)$";
const TITLE_SCAN_LINES = 400;

/**
 * The book named in a file's own title line(s): the first line matching `pattern` (group 1, or
 * the whole line) in which bookInTitle finds exactly one book within `scope`. undefined when no
 * title line names one, so nothing is attributed to a book the text itself does not name.
 */
export function bookFromTitleLines(raw: string, pattern = DEFAULT_TITLE_PATTERN, scope?: string[]): { book?: string; title?: string } {
  const re = new RegExp(pattern, "i");
  let firstTitle: string | undefined;
  let pos = 0;
  for (let n = 0; n < TITLE_SCAN_LINES && pos <= raw.length; n++) {
    let nl = raw.indexOf("\n", pos);
    if (nl < 0) nl = raw.length;
    const line = raw.slice(pos, nl).trim();
    pos = nl + 1;
    const m = re.exec(line);
    if (!m) continue;
    const title = (m[1] ?? m[0]).trim();
    firstTitle ??= title;
    const book = bookInTitle(title, scope);
    if (book) return { book, title };
  }
  return { title: firstTitle };
}

export interface Section {
  rawIndex: number;
  /** normalized [start, end) of the whole section (trimmed) */
  start: number;
  end: number;
  /** normalized trimmed spans of the section's paragraphs */
  paras: [number, number][];
  ranges: VerseRange[];
  locator: string;
  isIntro: boolean;
  /** heading-derived context for relative "ver. 5" references */
  context: { book?: string; chapter?: number };
  anchor?: string;
  /** index of the unit this section belongs to (for grouping) */
  unitIndex: number;
}

export interface Prepared { raw: string; nm: Normalized; sections: Section[] }

interface Line { start: number; end: number; text: string }

function splitLines(raw: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  while (pos <= raw.length) {
    let nl = raw.indexOf("\n", pos);
    if (nl < 0) nl = raw.length;
    out.push({ start: pos, end: nl, text: raw.slice(pos, nl).trim() });
    pos = nl + 1;
  }
  return out;
}

function fill(tpl: string, m: RegExpExecArray, vals: Record<string, string | number | undefined>): string {
  return tpl
    .replace(/\$(\d)/g, (_x, d: string) => m[Number(d)] ?? "")
    .replace(/\{(\w+)\}/g, (_x, k: string) => String(vals[k] ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function group(spec: string | undefined, m: RegExpExecArray): string | undefined {
  if (!spec) return undefined;
  const g = /^\$(\d)$/.exec(spec);
  return g ? m[Number(g[1])] : spec;
}

/**
 * A book named somewhere in a title line ("An Exposition … of the First Book of Moses, called
 * Genesis"): exactly one distinct book (within scope, if given) must be named, else undefined.
 */
export function bookInTitle(title: string, scope?: string[]): string | undefined {
  const words = title.replace(/[^\p{L}\p{N} ]+/gu, " ").split(/\s+/).filter(Boolean);
  const found = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    for (const n of [3, 2, 1]) {
      if (i + n > words.length) continue;
      const cand = words.slice(i, i + n).join(" ");
      if (cand.length < 3 && n === 1) continue;
      const t = cand === cand.toUpperCase() ? cand[0] + cand.slice(1).toLowerCase() : cand;
      // title lines capitalise book names; a lowercase word ("can", "job") is never a book here
      if (!/^[\p{Lu}\p{N}]/u.test(t)) continue;
      const code = bookFromName(t);
      if (code && (!scope || scope.includes(code))) found.add(code);
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

interface State {
  book?: string; chapter?: number; ranges: VerseRange[]; intro: boolean; skipping: boolean;
  labels: { unit?: string; book?: string; chapter?: string; verse?: string; sub?: string };
  anchor?: string; unitIndex: number;
}

/** Run the heading rules over one raw file. */
export function prepareStructure(file: RawFile, opts: StructureOptions, ctx: ParseCtx): Prepared {
  const raw = file.text;
  const nm = normalizeWithMap(raw);
  const meta = ctx.meta;
  const scopeRaw = ctx.bookScope?.[file.rawIndex];
  const scope = scopeRaw && scopeRaw.length ? scopeRaw : undefined;
  const rules = (opts.headings ?? []).map((r) => ({ ...r, re: new RegExp(r.pattern, r.flags ?? "") }));
  const lineRules = rules.filter((r) => !r.paragraphStart);
  const paraRules = rules.filter((r) => r.paragraphStart);
  const maxLen = opts.maxHeadingLen ?? 120;
  const lines = splitLines(raw);

  // body bounds
  let first = 0;
  let last = lines.length;
  const gutenberg = opts.gutenberg ?? /\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG/i.test(raw.slice(0, 40000));
  if (gutenberg) {
    const s = lines.findIndex((l) => /^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG/i.test(l.text));
    const e = lines.findIndex((l) => /^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i.test(l.text));
    if (s >= 0) first = s + 1;
    if (e >= 0) last = e;
  }
  const bodyRange = opts.bodyRange ?? (opts.layout === "ccel" ? ccelBodyRange(raw) : undefined);
  if (bodyRange) {
    const [bs, be] = bodyRange;
    const s = lines.findIndex((l) => l.start >= bs);
    if (s >= 0) first = Math.max(first, s);
    const e = lines.findIndex((l) => l.start >= be);
    if (e >= 0) last = Math.min(last, e);
  }
  // bodyStart/bodyEnd select one work inside a multi-work file (ANF 1): when given they MUST be
  // found, otherwise text of other authors could be attributed to this pack.
  if (opts.bodyStart) {
    const re = new RegExp(opts.bodyStart);
    const s = lines.findIndex((l, i) => i >= first && i < last && re.test(l.text));
    if (s < 0) throw new Error(`bodyStart /${opts.bodyStart}/ not found in file ${file.rawIndex}`);
    first = s;
  }
  if (opts.bodyEnd) {
    const re = new RegExp(opts.bodyEnd);
    const e = lines.findIndex((l, i) => i > first && i < last && re.test(l.text));
    if (e < 0) throw new Error(`bodyEnd /${opts.bodyEnd}/ not found in file ${file.rawIndex}`);
    last = e;
  }

  const st: State = { ranges: [], intro: false, skipping: false, labels: {}, unitIndex: 0 };
  // A single-book file: the book context comes from the file's own title line, validated
  // against bookScope (which may only restrict). Not found -> no context (headings that need a
  // book are then dropped and logged).
  let fileBook: string | undefined;
  if (scope && scope.length === 1) {
    const t = bookFromTitleLines(raw, opts.titlePattern, scope);
    fileBook = t.book;
    if (fileBook) ctx.log(`[${ctx.packId}] file ${file.rawIndex}: book ${fileBook} from its title line "${t.title}"`);
    else ctx.log(`[${ctx.packId}] file ${file.rawIndex}: no title line names ${scope[0]} (title: ${t.title ? `"${t.title}"` : "none found"}); book context only from headings`);
  }
  st.book = fileBook;
  const sections: Section[] = [];
  let cur: { paras: [number, number][]; snap: State } | null = null;

  const snapshot = (): State => ({ ...st, ranges: [...st.ranges], labels: { ...st.labels } });
  const locatorOf = (s: State): string => {
    const l = s.labels;
    // book intro: "Romans, Introduction" (the label comes from the rule, default "Introduction")
    if (s.intro && s.book) return [l.unit, BOOK_BY_CODE[s.book]?.name ?? s.book, l.book ?? "Introduction"].filter(Boolean).join(", ");
    if (opts.locatorFromRange && s.ranges.length) {
      const r = fmtRange(meta, s.ranges[0]);
      return [opts.keepUnitInLocator ? l.unit : undefined, r, l.sub].filter(Boolean).join(", ");
    }
    return [l.unit, l.book, l.chapter, l.verse, l.sub].filter(Boolean).join(", ");
  };
  const flush = () => {
    if (cur && cur.paras.length) {
      const [s0] = cur.paras[0];
      const e0 = cur.paras[cur.paras.length - 1][1];
      sections.push({
        rawIndex: file.rawIndex, start: s0, end: e0, paras: cur.paras, ranges: cur.snap.ranges,
        locator: locatorOf(cur.snap), isIntro: cur.snap.intro,
        context: { book: cur.snap.book, chapter: cur.snap.chapter }, anchor: cur.snap.anchor, unitIndex: cur.snap.unitIndex,
      });
    }
    cur = null;
  };
  const startSection = () => {
    flush();
    cur = { paras: [], snap: snapshot() };
  };

  const resolveBook = (spec: string | undefined, m: RegExpExecArray, lineText: string): string | undefined => {
    const v = group(spec, m);
    if (!v) return undefined;
    const code = /^[1-3A-Z]{3}$/.test(v) && chapterCount(meta, v) ? v : bookFromName(v) ?? bookInTitle(v, scope);
    if (!code) { ctx.log(`[${ctx.packId}] heading book not recognised: "${lineText}"`); return undefined; }
    if (scope && !scope.includes(code)) {
      ctx.log(`[${ctx.packId}] heading book ${code} outside bookScope of file ${file.rawIndex}: "${lineText}"`);
      return undefined;
    }
    return code;
  };

  const citationRange = (texts: string[]): VerseRange[] => {
    for (const t of texts) {
      for (const c of findCitations(normalizeWs(t), meta)) {
        for (const p of c.problems) ctx.log(`[${ctx.packId}] heading citation "${c.text}": ${p}`);
        if (c.ranges.length) return c.ranges;
      }
    }
    return [];
  };

  /** Apply a matched rule to the state. Returns false when the heading could not be used. */
  const apply = (rule: (typeof rules)[number], m: RegExpExecArray, li: number): boolean => {
    const lineText = m.input;
    const num = (spec?: string) => {
      const v = group(spec, m);
      return v === undefined ? undefined : parseNumber(v.replace(/\.$/, "")) ?? undefined;
    };
    if (rule.anchor) st.anchor = fill(rule.anchor, m, {});
    if (rule.level === "skip") { st.skipping = true; return true; }
    st.skipping = false;
    if (rule.level === "label") {
      st.labels.sub = rule.label ? fill(rule.label, m, {}) : undefined;
      return true;
    }
    if (rule.level === "unit") {
      st.unitIndex++;
      const book = resolveBook(rule.book, m, lineText) ?? fileBook;
      st.book = book;
      st.chapter = num(rule.chapter);
      st.labels = { unit: rule.label ? fill(rule.label, m, { chapter: st.chapter }) : undefined };
      st.intro = false;
      st.ranges = [];
      if (rule.refFromLine || rule.refLookahead) {
        const texts = [lineText];
        for (let k = li + 1, n = 0; k < last && n < (rule.refLookahead ?? 0); k++) {
          if (!lines[k].text) continue;
          texts.push(lines[k].text);
          n++;
        }
        st.ranges = citationRange(rule.refFromLine ? texts : texts.slice(1));
        if (st.ranges.length) {
          st.book = st.ranges[0].start.book;
          st.chapter = st.ranges[0].start.chapter === st.ranges[0].end.chapter ? st.ranges[0].start.chapter : undefined;
        }
      } else if (book && st.chapter) {
        const v = num(rule.verse);
        const ve = num(rule.verseEnd) ?? v;
        const ce = num(rule.chapterEnd) ?? st.chapter;
        st.ranges = [v ? { start: { book, chapter: st.chapter, verse: v }, end: { book, chapter: ce, verse: ve! } } : chapterRange(meta, book, st.chapter, ce)];
      }
      return validateState(lineText);
    }
    if (rule.level === "book") {
      const book = resolveBook(rule.book ?? "$1", m, lineText);
      if (!book) return false;
      st.book = book;
      st.chapter = undefined;
      st.labels = { ...st.labels, book: rule.label ? fill(rule.label, m, { book: shortBook(book) }) : undefined, chapter: undefined, verse: undefined, sub: undefined };
      st.intro = !!rule.intro;
      st.ranges = rule.intro ? [bookRange(meta, book)] : [];
      return true;
    }
    if (rule.level === "chapter") {
      if (rule.book) {
        const b = resolveBook(rule.book, m, lineText);
        if (b) st.book = b;
      }
      const c = num(rule.chapter ?? "$1");
      if (!st.book || !c) { ctx.log(`[${ctx.packId}] chapter heading without book context: "${lineText}"`); return false; }
      st.chapter = c;
      const ce = num(rule.chapterEnd) ?? c;
      st.intro = false;
      st.labels = { ...st.labels, book: undefined, chapter: rule.label ? fill(rule.label, m, { chapter: c, book: shortBook(st.book) }) : undefined, verse: undefined, sub: undefined };
      st.ranges = [chapterRange(meta, st.book, c, ce)];
      return validateState(lineText);
    }
    // verse (a rule may also set book/chapter, e.g. "Ro 8:28-30." section headings)
    if (rule.book) {
      const b = resolveBook(rule.book, m, lineText);
      if (!b) { st.ranges = []; return false; }
      st.book = b;
    }
    if (rule.chapter) {
      const c = num(rule.chapter);
      if (c) st.chapter = c;
    }
    const v = num(rule.verse ?? "$1");
    const ve = num(rule.verseEnd) ?? v;
    if (!st.book || !st.chapter || !v) {
      ctx.log(`[${ctx.packId}] verse heading without book/chapter context dropped: "${lineText.slice(0, 80)}"`);
      st.ranges = [];
      return false;
    }
    st.intro = false;
    // the sub-label ("Exposition") persists across verse headings within it
    st.labels = { ...st.labels, verse: rule.label ? fill(rule.label, m, { verse: v, verseEnd: ve }) : undefined };
    st.ranges = [{ start: { book: st.book, chapter: st.chapter, verse: v }, end: { book: st.book, chapter: st.chapter, verse: ve! } }];
    return validateState(lineText);
  };

  const validateState = (lineText: string): boolean => {
    const ok = st.ranges.filter((r) => {
      const why = rangeProblem(meta, r);
      if (why) ctx.log(`[${ctx.packId}] heading range dropped (${why}): "${lineText.slice(0, 80)}"`);
      return !why;
    });
    st.ranges = ok;
    return true;
  };

  // walk blocks (runs of non-empty lines)
  let i = first;
  while (i < last) {
    if (!lines[i].text) { i++; continue; }
    let j = i;
    while (j < last && lines[j].text) j++;
    // [i, j) is a block; leading heading lines are consumed
    let k = i;
    while (k < j && lines[k].text.length <= maxLen) {
      const t = lines[k].text;
      const rule = lineRules.find((r) => r.re.test(t));
      if (!rule) break;
      flush();
      apply(rule, rule.re.exec(t)!, k);
      startSection();
      k++;
    }
    if (k < j && !st.skipping) {
      const t = lines[k].text;
      const pr = paraRules.find((r) => r.re.test(t));
      if (pr) {
        flush();
        apply(pr, pr.re.exec(t)!, k);
        startSection();
      }
      if (!cur) startSection();
      const [s, e] = trimSpan(nm.text, rawToNorm(nm, lines[k].start), rawToNorm(nm, lines[j - 1].end));
      if (e > s) cur!.paras.push([s, e]);
    }
    i = j;
  }
  flush();
  return { raw, nm, sections };
}
