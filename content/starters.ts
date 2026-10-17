// Starter memory plans: IDs, short titles and ranges only.

import type { VerseRange } from "@/db/types";
import type { MemoryPlan } from "@/db/types";

export interface StarterPlan {
  id: string;
  title: string;
  range: VerseRange;
  chunkSize: 1 | 2 | 3;
  pace: MemoryPlan["pace"];
  /** Offer the whole chapter as an alternative range. */
  fullChapterOption?: VerseRange;
  /** Long plan (months): show the expected duration before starting. */
  long?: boolean;
  /** Suggest learning the BSB section headings (outline) before the verses. */
  headingsDrillFirst?: boolean;
}

const R = (book: string, c1: number, v1: number, c2: number, v2: number): VerseRange => ({
  start: { book, chapter: c1, verse: v1 },
  end: { book, chapter: c2, verse: v2 },
});

export const STARTERS: StarterPlan[] = [
  { id: "psalm-23", title: "Psalm 23", range: R("PSA", 23, 1, 23, 6), chunkSize: 2, pace: "daily" },
  { id: "psalm-1", title: "Psalm 1", range: R("PSA", 1, 1, 1, 6), chunkSize: 2, pace: "daily" },
  { id: "prov-3-1-12", title: "Proverbs 3:1–12", range: R("PRO", 3, 1, 3, 12), chunkSize: 2, pace: "daily" },
  { id: "john-1-1-18", title: "John 1:1–18", range: R("JHN", 1, 1, 1, 18), chunkSize: 2, pace: "daily" },
  { id: "isa-52-13-53-12", title: "Isaiah 52:13–53:12", range: R("ISA", 52, 13, 53, 12), chunkSize: 2, pace: "daily" },
  { id: "1cor-13", title: "1 Corinthians 13", range: R("1CO", 13, 1, 13, 13), chunkSize: 2, pace: "daily" },
  {
    id: "phil-2-1-11", title: "Philippians 2:1–11", range: R("PHP", 2, 1, 2, 11), chunkSize: 2, pace: "daily",
    fullChapterOption: R("PHP", 2, 1, 2, 30),
  },
  { id: "eph-6-10-18", title: "Ephesians 6:10–18", range: R("EPH", 6, 10, 6, 18), chunkSize: 2, pace: "daily" },
  { id: "rom-8", title: "Romans 8", range: R("ROM", 8, 1, 8, 39), chunkSize: 2, pace: "daily", long: true },
  {
    id: "matt-5-7", title: "Matthew 5–7", range: R("MAT", 5, 1, 7, 29), chunkSize: 2, pace: "daily",
    long: true, headingsDrillFirst: true,
  },
];

export const STARTER_BY_ID: Record<string, StarterPlan> = Object.fromEntries(STARTERS.map((s) => [s.id, s]));
