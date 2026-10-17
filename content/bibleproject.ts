// BibleProject overview videos: book codes, chapter spans and verified slugs ONLY.
// Only slugs that were verified to exist are listed; every other book falls back to the explore page.
// The app shows title + URL; nothing from the video page is fetched or copied.

import type { BookCode, VerseRange } from "@/db/types";

export interface BibleProjectVideo {
  book: BookCode;
  slug: string;
  /** Short title for the link (book name and chapter span). */
  title: string;
  fromChapter: number;
  toChapter: number;
}

export const BIBLEPROJECT_VIDEO_BASE = "https://bibleproject.com/videos/";
export const BIBLEPROJECT_EXPLORE_URL = "https://bibleproject.com/explore/";
export const BIBLEPROJECT_EXPLORE_TITLE = "BibleProject Explore";

const ALL = 999;

export const BIBLEPROJECT_VIDEOS: BibleProjectVideo[] = [
  { book: "PSA", slug: "psalms", title: "Psalms", fromChapter: 1, toChapter: ALL },
  { book: "PRO", slug: "proverbs", title: "Proverbs", fromChapter: 1, toChapter: ALL },
  { book: "ISA", slug: "isaiah-1-39", title: "Isaiah 1-39", fromChapter: 1, toChapter: 39 },
  { book: "ISA", slug: "isaiah-40-66", title: "Isaiah 40-66", fromChapter: 40, toChapter: ALL },
  { book: "MAT", slug: "matthew-1-13", title: "Matthew 1-13", fromChapter: 1, toChapter: 13 },
  { book: "MAT", slug: "matthew-14-28", title: "Matthew 14-28", fromChapter: 14, toChapter: ALL },
  { book: "JHN", slug: "john-1-12", title: "John 1-12", fromChapter: 1, toChapter: 12 },
  { book: "JHN", slug: "john-13-21", title: "John 13-21", fromChapter: 13, toChapter: ALL },
  { book: "ROM", slug: "romans-1-4", title: "Romans 1-4", fromChapter: 1, toChapter: 4 },
  { book: "ROM", slug: "romans-5-16", title: "Romans 5-16", fromChapter: 5, toChapter: ALL },
  { book: "1CO", slug: "1-corinthians", title: "1 Corinthians", fromChapter: 1, toChapter: ALL },
  { book: "EPH", slug: "ephesians", title: "Ephesians", fromChapter: 1, toChapter: ALL },
  { book: "PHP", slug: "philippians", title: "Philippians", fromChapter: 1, toChapter: ALL },
];

export const bibleProjectUrl = (slug: string): string => `${BIBLEPROJECT_VIDEO_BASE}${slug}/`;

export interface BibleProjectLink {
  title: string;
  url: string;
  /** false for the explore-page fallback. */
  isVideo: boolean;
}

/**
 * Videos whose chapter span overlaps the range (multi-book ranges check each listed book's
 * chapters). No verified video → the explore page.
 */
export function bibleProjectLinksForRange(range: VerseRange, bookOrder: readonly BookCode[]): BibleProjectLink[] {
  const a = bookOrder.indexOf(range.start.book);
  const b = bookOrder.indexOf(range.end.book);
  const books = a >= 0 && b >= a ? bookOrder.slice(a, b + 1) : [range.start.book];
  const out: BibleProjectLink[] = [];
  for (const book of books) {
    const fromCh = book === range.start.book ? range.start.chapter : 1;
    const toCh = book === range.end.book ? range.end.chapter : ALL;
    for (const v of BIBLEPROJECT_VIDEOS) {
      if (v.book !== book) continue;
      if (v.fromChapter <= toCh && fromCh <= v.toChapter) out.push({ title: v.title, url: bibleProjectUrl(v.slug), isVideo: true });
    }
  }
  return out.length ? out : [{ title: BIBLEPROJECT_EXPLORE_TITLE, url: BIBLEPROJECT_EXPLORE_URL, isVideo: false }];
}
