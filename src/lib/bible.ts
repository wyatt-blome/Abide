// Client-side loader for the bundled Bible data in public/bible/** (BSB, WEB, KJV).
// - fetches relative URLs (`/bible/...`) so it works under the Next app and its service worker;
// - memoizes per file (one request per book per translation, shared by concurrent callers);
// - no top-level window access, so it is safe to import from tests. Tests can point it at the
//   files on disk with `configureBible({ fetchJson })`.
// ESV is not handled here (BYOK ESV lives in its own module).

import type { BsbHeading, VerseKey, VerseRange, VerseRef } from "@/db/types";
import { bookIndex } from "@/lib/books";
import { iterateRange, type BibleMeta } from "@/lib/meta";

export type BundledTranslation = "BSB" | "WEB" | "KJV";
export const BUNDLED_TRANSLATIONS: BundledTranslation[] = ["BSB", "WEB", "KJV"];

/** `{ "1": ["v1", "v2", ...], ... }` — index 0 = verse 1, "" = no text in this translation. */
export type BookFile = Record<string, string[]>;

export interface BibleSourcesFile {
  [translation: string]: unknown;
}

type FetchJson = (path: string) => Promise<unknown>;

const defaultFetchJson: FetchJson = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
};

let fetchJson: FetchJson = defaultFetchJson;
let basePath = "/bible";
const cache = new Map<string, Promise<unknown>>();

/** Override how files are fetched (tests) or where they live. Clears the cache. */
export function configureBible(opts: { fetchJson?: FetchJson; basePath?: string }): void {
  if (opts.fetchJson) fetchJson = opts.fetchJson;
  if (opts.basePath !== undefined) basePath = opts.basePath.replace(/\/$/, "");
  cache.clear();
}

/** Drop memoized files (e.g. after an app update). */
export function clearBibleCache(): void {
  cache.clear();
}

function load<T>(rel: string): Promise<T> {
  const path = `${basePath}/${rel}`;
  let p = cache.get(path);
  if (!p) {
    p = fetchJson(path).catch((e) => {
      cache.delete(path); // allow a retry after a network failure
      throw e;
    });
    cache.set(path, p);
  }
  return p as Promise<T>;
}

const dirOf = (t: BundledTranslation): string => t.toLowerCase();

// ---------------------------------------------------------------- files

export function loadMeta(): Promise<BibleMeta> {
  return load<BibleMeta>("meta.json");
}

export function loadHeadings(): Promise<BsbHeading[]> {
  return load<BsbHeading[]>("bsb/headings.json");
}

export function loadSources(): Promise<BibleSourcesFile> {
  return load<BibleSourcesFile>("sources.json");
}

export function loadBook(translation: BundledTranslation, book: string): Promise<BookFile> {
  if (!BUNDLED_TRANSLATIONS.includes(translation)) return Promise.reject(new Error(`Not a bundled translation: ${translation}`));
  return load<BookFile>(`${dirOf(translation)}/${book}.json`);
}

/** Verse texts of one chapter (index 0 = verse 1). Unknown chapter → []. */
export async function loadChapter(translation: BundledTranslation, book: string, chapter: number): Promise<string[]> {
  const b = await loadBook(translation, book);
  return b[String(chapter)] ?? [];
}

// ---------------------------------------------------------------- verses

const parseKey = (key: VerseKey): VerseRef => {
  const [book, c, v] = key.split(".");
  return { book, chapter: Number(c), verse: Number(v) };
};
const keyOf = (r: VerseRef): VerseKey => `${r.book}.${r.chapter}.${r.verse}`;

/** Text of one verse ("" when the translation has no text in that slot). */
export async function getVerseText(translation: BundledTranslation, key: VerseKey): Promise<string> {
  const r = parseKey(key);
  const ch = await loadChapter(translation, r.book, r.chapter);
  return ch[r.verse - 1] ?? "";
}

export interface RangeVerse {
  key: VerseKey;
  ref: VerseRef;
  text: string;
}

/**
 * Every verse of the range on the BSB grid with its text in `translation`. Empty slots are included
 * with text "" unless `skipEmpty` is set (which drops verses with no text in this translation).
 */
export async function getRangeVerses(
  translation: BundledTranslation,
  range: VerseRange,
  opts: { skipEmpty?: boolean } = {},
): Promise<RangeVerse[]> {
  const meta = await loadMeta();
  const refs = iterateRange(meta, range);
  const books = [...new Set(refs.map((r) => r.book))];
  const files = new Map(await Promise.all(books.map(async (b) => [b, await loadBook(translation, b)] as const)));
  const out: RangeVerse[] = [];
  for (const ref of refs) {
    const text = files.get(ref.book)?.[String(ref.chapter)]?.[ref.verse - 1] ?? "";
    if (opts.skipEmpty && text === "") continue;
    out.push({ key: keyOf(ref), ref, text });
  }
  return out;
}

// ---------------------------------------------------------------- headings

const cmp = (a: VerseRef, b: VerseRef): number =>
  bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.verse - b.verse;

/** Headings whose verse lies inside the range (inclusive), in canonical order. Pure. */
export function headingsInRange(headings: BsbHeading[], range: VerseRange): BsbHeading[] {
  return headings.filter((h) => cmp(range.start, h) <= 0 && cmp(h, range.end) <= 0);
}

/** VerseKeys at which at least one heading starts, within the range (for heading-aware chunking). */
export function headingStartKeys(headings: BsbHeading[], range?: VerseRange): Set<VerseKey> {
  const hs = range ? headingsInRange(headings, range) : headings;
  return new Set(hs.map((h) => `${h.book}.${h.chapter}.${h.verse}`));
}
