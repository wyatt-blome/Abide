// Minimal USFM reader for the BSB: section headings (\s1 \s2 \ms \d) and plain verse text.
// Pure functions: (raw USFM text) → data. No network, no file I/O.

import type { BsbHeading } from "../../src/db/types";

export type HeadingLevel = BsbHeading["level"];

/** Paragraph-level markers whose line content is a heading we keep, mapped to our level. */
const HEADING_MARKERS: Record<string, HeadingLevel> = {
  s: "s1",
  s1: "s1",
  s2: "s2",
  ms: "ms",
  ms1: "ms",
  d: "d",
};

/** Paragraph-level markers whose content is never verse text and is not kept as a heading. */
const SKIP_MARKERS = new Set([
  "id", "ide", "h", "h1", "h2", "h3", "toc1", "toc2", "toc3", "toca1", "toca2", "toca3",
  "mt", "mt1", "mt2", "mt3", "mt4", "mte", "mte1", "mte2", "imt", "imt1", "imt2", "is", "is1", "is2",
  "ip", "ipi", "im", "imi", "ipq", "imq", "ipr", "iq", "iq1", "iq2", "ib", "ili", "ili1", "ili2", "iot", "io", "io1", "io2", "ior", "iex", "ie",
  "r", "mr", "sr", "s3", "s4", "ms2", "ms3", "sp", "sd", "sd1", "sd2", "cl", "cp", "cd", "rem", "sts", "restore",
  "qa", "periph",
]);

/**
 * Strip USFM character-level markup from a run of text:
 * footnotes (\f ...\f*), cross refs (\x ...\x*), \fe endnotes, word attributes (\w word|attrs\w*),
 * and any remaining \marker / \+marker / \marker* tokens. Whitespace is collapsed and trimmed;
 * the words themselves are not altered.
 */
export function stripUsfmInline(s: string): string {
  let t = s;
  t = t.replace(/\\(f|fe|x|ef|ex)\s[\s\S]*?\\\1\*/g, "");
  // \w word|lemma="..."\w*  (also \+w)  → word
  t = t.replace(/\\\+?w\s+([^|\\]*?)(?:\|[^\\]*)?\\\+?w\*/g, "$1");
  // any other attribute lists inside character spans: "text|attr=..." before a closing marker
  t = t.replace(/\|[^\\]*?(?=\\\+?[a-z0-9]+\*)/g, "");
  t = t.replace(/\\\+?[a-z0-9]+\*/g, "");
  t = t.replace(/\\\+?[a-z0-9]+\s?/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export interface UsfmParse {
  book: string;
  headings: BsbHeading[];
  /** verses[chapter][verse] = plain text (markup stripped) */
  verses: Map<number, Map<number, string>>;
  /** markers seen that were neither handled nor known (for logging) */
  unknownMarkers: Set<string>;
  /** headings found after the last verse of the book (no following \v) — dropped */
  orphanHeadings: { marker: string; text: string }[];
}

/**
 * Parse one USFM book. A heading's verse is the next \v that follows it (in that chapter, or the
 * next chapter's first verse if the heading sits just before a \c).
 */
export function parseUsfm(raw: string, expectBook?: string): UsfmParse {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const idMatch = /\\id\s+([A-Z0-9]{3})/.exec(text);
  const book = idMatch ? idMatch[1] : expectBook ?? "";
  if (expectBook && book !== expectBook) throw new Error(`USFM \\id ${book} does not match expected ${expectBook}`);

  const headings: BsbHeading[] = [];
  const verses = new Map<number, Map<number, string>>();
  const unknownMarkers = new Set<string>();
  const pending: { level: HeadingLevel; text: string; marker: string }[] = [];

  let chapter = 0;
  let verse = 0;
  let verseBuf = "";

  const flushVerse = () => {
    if (chapter > 0 && verse > 0) {
      if (!verses.has(chapter)) verses.set(chapter, new Map());
      verses.get(chapter)!.set(verse, stripUsfmInline(verseBuf));
    }
    verseBuf = "";
  };

  // Split into paragraph-level marker chunks. A chunk starts at a backslash marker at line start
  // or at an inline \v / \c (BSB puts each on its own line, but be tolerant).
  const tokenRe = /(?:^|(?<=\n))\\([a-z]+[0-9]*)(?:[ \t]+|(?=\n)|$)|\\(v|c)\s+/g;
  type Chunk = { marker: string; body: string };
  const chunks: Chunk[] = [];
  let m: RegExpExecArray | null;
  let last: { marker: string; start: number } | null = null;
  while ((m = tokenRe.exec(text))) {
    const marker = m[1] ?? m[2];
    if (last) chunks.push({ marker: last.marker, body: text.slice(last.start, m.index) });
    last = { marker, start: m.index + m[0].length };
  }
  if (last) chunks.push({ marker: last.marker, body: text.slice(last.start) });

  for (const { marker, body } of chunks) {
    if (marker === "c") {
      flushVerse();
      const n = parseInt(body, 10);
      if (!Number.isFinite(n)) throw new Error(`${book}: bad \\c "${body.slice(0, 20)}"`);
      chapter = n;
      verse = 0;
      continue;
    }
    if (marker === "v") {
      flushVerse();
      const vm = /^(\d+)(?:[-–](\d+))?\s*([\s\S]*)$/.exec(body);
      if (!vm) throw new Error(`${book} ${chapter}: bad \\v "${body.slice(0, 20)}"`);
      verse = parseInt(vm[1], 10);
      verseBuf = vm[3];
      for (const h of pending) headings.push({ book, chapter, verse, level: h.level, text: h.text });
      pending.length = 0;
      continue;
    }
    const level = HEADING_MARKERS[marker];
    if (level) {
      // Heading text is never verse text. A heading that interrupts a verse does not end it:
      // following paragraph text still belongs to the running verse.
      const ht = stripUsfmInline(body);
      if (ht) pending.push({ level, text: ht, marker });
      continue;
    }
    if (SKIP_MARKERS.has(marker)) continue; // e.g. \r \mr \qa: content is neither verse text nor a kept heading
    // Paragraph/poetry markers (\p \m \q1 \q2 \pi \b \nb \pc \li ...): body continues the verse.
    if (!/^(p|m|pi\d?|pmo|pm|pmc|pmr|pc|pr|ph\d?|mi|nb|b|q\d?|qr|qc|qm\d?|qd|li\d?|lh|lf|lim\d?|tr|tc\d?|th\d?|cls)$/.test(marker)) {
      unknownMarkers.add(marker);
    }
    if (verse > 0) verseBuf += " " + body;
  }
  flushVerse();

  const orphanHeadings = pending.map((p) => ({ marker: p.marker, text: p.text }));
  return { book, headings, verses, unknownMarkers, orphanHeadings };
}
