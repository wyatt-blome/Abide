// ccel-txt: CCEL plain-text editions (".../cache/{work}.txt", a text rendering of the ThML book).
//
// Layout of these files: a header block ("Title:", "Print Basis:", "Rights: Public Domain", ...),
// a "Table of Contents", the body, then "Indexes" (with "Index of Scripture References") and a
// trailing "References" list of link targets. This parser:
//   1. starts the body after the table of contents (the first rule line "____" after it);
//   2. stops the body at the last "Indexes" line (the back-matter indexes);
//   3. reads the work's own "Index of Scripture References" into a set of verses;
//   4. maps paragraphs by their inline citations, keeping only citations that the work's
//      scripture index also lists (mappingMethod "scriptureIndex"). If the file has no scripture
//      index, inline citations are used as printed (mappingMethod "inlineCitation").
// parserOptions: headings (locators + context), useIndex ("confirm" | "ignore"), minChars.
import type { VerseRange } from "../../src/db/types";
import { type BibleMeta, verseCount } from "../lib/bible-meta";
import { bookFromName } from "../lib/citations";
import { type EmitOptions, inlineExcerpts } from "./emit";
import { type StructureOptions, prepareStructure } from "./structure";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export type CcelOptions = StructureOptions & EmitOptions & { useIndex?: "confirm" | "ignore" };

/**
 * Parse the "Index of Scripture References" back-matter into "BOOK.c.v" keys. A book line that
 * is not recognised RESETS the book (its numbers are skipped), so they are never filed under the
 * previous book. Cross-chapter entries ("7:24-8:2") add every verse of the span when `meta` is
 * given, else the start and end verses.
 */
export function parseScriptureIndex(raw: string, meta?: BibleMeta, log?: (s: string) => void): Set<string> {
  const keys = new Set<string>();
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/^Index of Scripture References$/i.test(lines[i])) { start = i; break; }
  if (start < 0) return keys;
  let book: string | undefined;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (/^(Index of |Indexes$|References$|Visible links)/i.test(l)) break;
    const stripped = l.replace(/\[\d+\]/g, " ").trim();
    if (!/\d/.test(stripped)) {
      book = bookFromName(stripped);
      if (!book) log?.(`scripture index: book line not recognised, its entries are skipped: "${stripped.slice(0, 60)}"`);
      continue;
    }
    if (!book) continue;
    const re = /(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(?:(\d{1,3}):)?(\d{1,3}))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped))) {
      const c = Number(m[1]);
      const a = Number(m[2]);
      const c2 = m[3] ? Number(m[3]) : c;
      const b = m[4] ? Number(m[4]) : a;
      if (c2 === c) {
        for (let v = a; v <= Math.min(b, a + 200); v++) keys.add(`${book}.${c}.${v}`);
      } else if (c2 > c) {
        if (meta) {
          for (let ch = c; ch <= c2; ch++) {
            const from = ch === c ? a : 1;
            const to = ch === c2 ? b : verseCount(meta, book, ch);
            for (let v = from; v <= to; v++) keys.add(`${book}.${ch}.${v}`);
          }
        } else {
          keys.add(`${book}.${c}.${a}`);
          keys.add(`${book}.${c2}.${b}`);
        }
      }
    }
  }
  return keys;
}

/**
 * A citation's range is confirmed by the scripture index when at least one verse of EVERY
 * chapter it spans is indexed (for a cross-chapter "Rom. vii. 24-viii. 2" both the start and the
 * end chapter must be listed), so a range is never confirmed by its first chapter alone.
 */
export function confirmedByIndex(index: Set<string>, r: VerseRange, meta: BibleMeta): boolean {
  if (r.start.book !== r.end.book) return false;
  const b = r.start.book;
  for (let ch = r.start.chapter; ch <= r.end.chapter; ch++) {
    const from = ch === r.start.chapter ? r.start.verse : 1;
    const to = ch === r.end.chapter ? r.end.verse : verseCount(meta, b, ch);
    let hit = false;
    for (let v = from; v <= to && !hit; v++) hit = index.has(`${b}.${ch}.${v}`);
    if (!hit) return false;
  }
  return true;
}

export const parseCcelTxt: ExcerptParser = (files, opts, ctx) => {
  const o = opts as CcelOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const index = o.useIndex === "ignore" ? new Set<string>() : parseScriptureIndex(f.text, ctx.meta, (s) => ctx.log(`[${ctx.packId}] ${s}`));
    const confirm = index.size ? (r: VerseRange) => confirmedByIndex(index, r, ctx.meta) : undefined;
    const prep = prepareStructure(f, { ...o, layout: "ccel" }, ctx);
    for (const sec of prep.sections) {
      const xs = inlineExcerpts(prep, sec, { ...o, mappingMethod: confirm ? "scriptureIndex" : "inlineCitation" }, ctx, confirm);
      out.push(...xs);
    }
  }
  return out;
};
