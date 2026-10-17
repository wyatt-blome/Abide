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
import { bookFromName } from "../lib/citations";
import { type EmitOptions, inlineExcerpts } from "./emit";
import { type StructureOptions, prepareStructure } from "./structure";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export type CcelOptions = StructureOptions & EmitOptions & { useIndex?: "confirm" | "ignore" };

/** Parse the "Index of Scripture References" back-matter into "BOOK.c.v" keys. */
export function parseScriptureIndex(raw: string): Set<string> {
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
      const b = bookFromName(stripped);
      if (b) book = b;
      continue;
    }
    if (!book) continue;
    const re = /(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped))) {
      const c = Number(m[1]);
      const a = Number(m[2]);
      const b = m[3] ? Number(m[3]) : a;
      for (let v = a; v <= Math.min(b, a + 200); v++) keys.add(`${book}.${c}.${v}`);
    }
  }
  return keys;
}

export const parseCcelTxt: ExcerptParser = (files, opts, ctx) => {
  const o = opts as CcelOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const index = o.useIndex === "ignore" ? new Set<string>() : parseScriptureIndex(f.text);
    const confirm = index.size
      ? (r: VerseRange) => {
          // a range is confirmed if any of its verses (within its first chapter) is indexed
          const endV = r.end.chapter === r.start.chapter ? r.end.verse : r.start.verse + 200;
          for (let v = r.start.verse; v <= endV; v++) if (index.has(`${r.start.book}.${r.start.chapter}.${v}`)) return true;
          return false;
        }
      : undefined;
    const prep = prepareStructure(f, { ...o, layout: "ccel" }, ctx);
    for (const sec of prep.sections) {
      const xs = inlineExcerpts(prep, sec, { ...o, mappingMethod: confirm ? "scriptureIndex" : "inlineCitation" }, ctx, confirm);
      out.push(...xs);
    }
  }
  return out;
};
