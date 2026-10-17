// Pure parsers for the translation sources. Each returns a VerseTable:
//   table[BOOK][chapter][verse] = plain text
// Only the 66 canonical books (src/lib/books.ts) are kept.

import { BOOKS, BOOK_CODES } from "../../src/lib/books";

export type VerseTable = Map<string, Map<number, Map<number, string>>>;

const CANON = new Set(BOOK_CODES);

export function setVerse(t: VerseTable, book: string, ch: number, v: number, text: string): void {
  let b = t.get(book);
  if (!b) t.set(book, (b = new Map()));
  let c = b.get(ch);
  if (!c) b.set(ch, (c = new Map()));
  c.set(v, text);
}

export const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

// ---------- scrollmapper JSON ({translation, books:[{name, chapters:[{chapter, verses:[{verse,text}]}]}]}) ----------

/** scrollmapper book names → USFM codes (built from books.ts names + the Roman-numeral forms the files use). */
export function scrollmapperNameToCode(name: string): string | undefined {
  const n = name.trim();
  const roman: Record<string, string> = { I: "1", II: "2", III: "3" };
  const norm = n.replace(/^(III|II|I)\s+/, (_, r: string) => `${roman[r]} `);
  const special: Record<string, string> = { "Revelation of John": "REV", "Song of Songs": "SNG", Psalm: "PSA" };
  if (special[n]) return special[n];
  const hit = BOOKS.find((b) => b.name.toLowerCase() === norm.toLowerCase());
  return hit?.code;
}

export interface ScrollmapperJson {
  translation?: string;
  books: { name: string; chapters: { chapter: number; verses: { verse: number; text: string }[] }[] }[];
}

export function parseScrollmapperJson(
  raw: string,
  clean: (text: string, book: string, ch: number, v: number) => string = (t) => collapse(t),
): { table: VerseTable; unmappedBooks: string[] } {
  const j = JSON.parse(raw) as ScrollmapperJson;
  const table: VerseTable = new Map();
  const unmappedBooks: string[] = [];
  for (const b of j.books) {
    const code = scrollmapperNameToCode(b.name);
    if (!code || !CANON.has(code)) {
      unmappedBooks.push(b.name);
      continue;
    }
    for (const c of b.chapters) for (const v of c.verses) setVerse(table, code, c.chapter, v.verse, clean(v.text ?? "", code, c.chapter, v.verse));
  }
  return { table, unmappedBooks };
}

// ---------- eBible VPL ("GEN 1:1 text" per line) ----------

export function parseVpl(raw: string, clean: (text: string) => string = collapse): { table: VerseTable; skippedBooks: Set<string> } {
  const table: VerseTable = new Map();
  const skippedBooks = new Set<string>();
  for (const line of raw.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = /^([1-4A-Z][A-Z0-9]{2})\s+(\d+):(\d+)\s?(.*)$/.exec(line);
    if (!m) continue;
    const [, book, c, v, text] = m;
    if (!CANON.has(book)) {
      skippedBooks.add(book);
      continue;
    }
    setVerse(table, book, +c, +v, clean(text));
  }
  return { table, skippedBooks };
}

// ---------- USFX XML (eBible / open-bibles) ----------

const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Elements whose entire content is dropped (notes, cross refs, headings, titles, printed verse numbers…). */
const USFX_DROP = new Set(["f", "x", "fe", "s", "d", "h", "toc", "id", "ide", "cl", "cp", "vp", "rem", "periph", "ms", "mr", "r", "sr", "fig", "languageCode"]);

/**
 * Stream through a USFX document. Text is collected only between <v id=…/> and <ve/> (or the next
 * <v>/<c>/<book>), skipping the content of USFX_DROP elements. Character wrappers such as <w>, <wj>,
 * <add>, <qs>, <nd>, <k> keep their text. <p sfm="..."> heading-like paragraphs are dropped too.
 */
export function parseUsfx(raw: string): { table: VerseTable; skippedBooks: Set<string>; rangedVerses: number } {
  const table: VerseTable = new Map();
  const skippedBooks = new Set<string>();
  let book = "";
  let inCanon = false;
  let chapter = 0;
  let verse = 0;
  let buf = "";
  let dropDepth = 0;
  const stack: { name: string; dropped: boolean }[] = [];
  let rangedVerses = 0;

  const flush = () => {
    if (inCanon && chapter > 0 && verse > 0) {
      const prev = table.get(book)?.get(chapter)?.get(verse);
      const text = collapse(buf);
      setVerse(table, book, chapter, verse, prev ? collapse(prev + " " + text) : text);
    }
    buf = "";
    verse = 0;
  };

  const re = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m[5] !== undefined) {
      if (dropDepth === 0 && verse > 0) buf += decodeEntities(m[5]);
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2];
    const attrs = m[3];
    const selfClosing = m[4] === "/" || /\/\s*$/.test(attrs);
    const attr = (k: string): string | undefined => new RegExp(`\\b${k}="([^"]*)"`).exec(attrs)?.[1];

    if (closing) {
      // pop to the matching element
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          for (let j = stack.length - 1; j >= i; j--) if (stack[j].dropped) dropDepth--;
          stack.length = i;
          break;
        }
      }
      if (name === "p" || name === "q" || name === "b" || name === "li") buf += " ";
      continue;
    }

    if (name === "book") {
      flush();
      book = attr("id") ?? "";
      inCanon = CANON.has(book);
      if (!inCanon) skippedBooks.add(book);
      chapter = 0;
      if (!selfClosing) stack.push({ name, dropped: false });
      continue;
    }
    if (name === "c" && dropDepth === 0) {
      flush();
      chapter = parseInt(attr("id") ?? "0", 10);
      if (!selfClosing) stack.push({ name, dropped: false });
      continue;
    }
    if (name === "v" && dropDepth === 0) {
      flush();
      const id = attr("id") ?? "0";
      const vm = /^(\d+)(?:-(\d+))?/.exec(id);
      verse = vm ? parseInt(vm[1], 10) : 0;
      if (vm?.[2] && inCanon) rangedVerses++;
      if (!selfClosing) stack.push({ name, dropped: false });
      continue;
    }
    if (name === "ve") {
      if (dropDepth === 0) flush();
      continue;
    }
    if (selfClosing) {
      if (name === "b" || name === "optionalLineBreak") buf += " ";
      continue;
    }
    const sfm = attr("sfm");
    const dropped =
      USFX_DROP.has(name) || (name === "p" && !!sfm && /^(mt\d?|ms\d?|mr|s\d?|sr|r|d|is\d?|ip|imt\d?|io\d?|iot|cl|sp|qa)$/.test(sfm));
    if (dropped) dropDepth++;
    stack.push({ name, dropped });
    if (name === "p" || name === "q" || name === "li") buf += " ";
  }
  flush();
  return { table, skippedBooks, rangedVerses };
}
