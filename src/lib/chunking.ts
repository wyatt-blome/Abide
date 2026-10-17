// Split a memory passage into daily chunks.
//
// Rules (in priority order):
//  1. Empty verses (no BSB text, e.g. textual-variant verses) are skipped; every other verse lands
//     in exactly one chunk and order is preserved.
//  2. A verse longer than LONG_VERSE_WORDS (30) words is a chunk on its own.
//  3. A chunk never crosses a BSB heading: a verse that starts a heading always begins a new chunk.
//     (Always avoidable, since a one-verse chunk is allowed.)
//  4. Each run of ordinary verses between those boundaries is split into ⌈n / size⌉ chunks whose
//     sizes differ by at most one, larger chunks first (size 2, run of 5 → 2, 2, 1).
// `size` is clamped to 1..3 (default 2).

import type { BsbHeading, VerseKey } from "@/db/types";
import { wordCount } from "@/lib/text";

export const LONG_VERSE_WORDS = 30;
export const DEFAULT_CHUNK_SIZE = 2;

/** VerseKeys where a BSB section heading starts (Psalm superscriptions, level "d", are not breaks). */
export function headingStartKeys(headings: BsbHeading[]): Set<VerseKey> {
  return new Set(headings.filter((h) => h.level !== "d").map((h) => `${h.book}.${h.chapter}.${h.verse}`));
}

export interface ChunkVerse { key: VerseKey; text: string }

/** Split n items into ⌈n/size⌉ near-equal groups, larger groups first. */
function balancedSizes(n: number, size: number): number[] {
  if (n <= 0) return [];
  const k = Math.ceil(n / size);
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

export function chunkPassage(
  verses: ChunkVerse[],
  headingStarts: Set<VerseKey> | VerseKey[] = new Set(),
  size = DEFAULT_CHUNK_SIZE,
  emptyKeys: Set<VerseKey> | VerseKey[] = new Set(),
): VerseKey[][] {
  const heads = headingStarts instanceof Set ? headingStarts : new Set(headingStarts);
  const empty = emptyKeys instanceof Set ? emptyKeys : new Set(emptyKeys);
  const n = Math.min(3, Math.max(1, Math.round(size)));
  const kept = verses.filter((v) => v.text.trim().length > 0 && !empty.has(v.key));

  const chunks: VerseKey[][] = [];
  let run: VerseKey[] = [];
  const flush = () => {
    let i = 0;
    for (const s of balancedSizes(run.length, n)) {
      chunks.push(run.slice(i, i + s));
      i += s;
    }
    run = [];
  };

  for (const v of kept) {
    if (heads.has(v.key)) flush();
    if (wordCount(v.text) > LONG_VERSE_WORDS) {
      flush();
      chunks.push([v.key]);
      continue;
    }
    run.push(v.key);
  }
  flush();
  return chunks;
}
