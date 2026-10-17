// 312-day reading plan generator (pure, deterministic).
//
// Calendar: 312 reading days = 6 days/week × 52 weeks; the grace weekday (default Sunday = 0) is
// skipped. Default start date = the next Monday.
//
// Styles and tracks:
//   canonical     one ALL track, Genesis → Revelation.
//   chronological one ALL track in the order of content/plans/chronological.ts. When the sequence
//                 jumps (e.g. 1 Samuel → a Psalm → 1 Samuel), a day gets one portion per contiguous run.
//   blended       (default) three tracks every day: OT (Old Testament minus Psalms/Proverbs),
//                 NT, and PP (Psalms then Proverbs). Each track is spread over all 312 days, so all
//                 three finish on day 312.
//
// A track is a flat sequence of non-empty BSB verses, grouped into UNITS that are never split:
// a single verse, or a whole Psalm (never split a Psalm). Psalm 119 is a SOLO unit: it gets a day of
// its own in its track. Solo units cut the track into SEGMENTS; days are allocated to segments in
// proportion to their verse counts (largest remainder, capped at the segment's unit count).
//
// Daily cut, per track: target T = verses left in the segment ÷ days left in the segment. Among the
// unit boundaries reachable today (leaving at least one unit for every remaining day):
//   1. a chapter end within ±25% of T (closest wins);
//   2. otherwise a BSB section-heading boundary within ±20% of T (closest wins);
//   3. otherwise the verse boundary closest to T.
// Blended balances the DAY TOTAL: PP and NT are cut first; the OT target is then adjusted by their
// deviation from their own targets (clamped to 25%–200% of the OT base target), so a long Psalm is
// offset by a shorter OT portion. Because targets are recomputed from what remains, every track
// still ends exactly on its last day.

import type { BsbHeading, ReadingPortion, ReadingStyle, VerseKey, VerseRef } from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import type { ChronoRange } from "../../content/plans/chronological";
import { BOOKS, PP_BOOKS } from "@/lib/books";
import { headingStartKeys } from "@/lib/chunking";
import { nextMonday, readingDates, todayISO, type ISODate } from "@/lib/isoDate";
import { chapterCount, isEmptyKey, iterateRefs, toKey, versesIn } from "@/lib/refs";

export const PLAN_DAYS = 312;
export const DEFAULT_VERSES_PER_MIN = 7;
const CHAPTER_WINDOW = 0.25;
const HEADING_WINDOW = 0.2;
const SOLO: VerseKey[] = ["PSA.119"]; // book.chapter of solo-day units

export interface PlanGenOptions {
  style: ReadingStyle;
  meta: BibleMeta;
  headings: BsbHeading[];
  /** Required for the chronological style. */
  chronological?: ChronoRange[];
  /** YYYY-MM-DD; default nextMonday(today). */
  startDate?: ISODate;
  /** Default 0 (Sunday); null = no grace day. */
  graceWeekday?: number | null;
  versesPerMin?: number;
  totalDays?: number;
  /** "Today" used for the default start date. */
  today?: ISODate;
}

export interface GeneratedDay {
  dayIndex: number;
  date: ISODate;
  portions: ReadingPortion[];
  verseCount: number;
  estimatedMinutes: number;
}

type Track = ReadingPortion["track"];

interface Unit {
  start: number; // index into the track sequence
  end: number; // exclusive
  count: number;
  chapterEnd: boolean;
  headingAfter: boolean;
  solo: boolean;
}

interface Segment { from: number; to: number; verses: number; days: number; solo: boolean }

// ---------------------------------------------------------------- sequences

function booksSeq(meta: BibleMeta, codes: string[]): VerseRef[] {
  const out: VerseRef[] = [];
  for (const code of codes) {
    const n = chapterCount(meta, code);
    if (!n) continue;
    out.push(...iterateRefs(meta, { start: { book: code, chapter: 1, verse: 1 }, end: { book: code, chapter: n, verse: versesIn(meta, code, n) } }, true));
  }
  return out;
}

export function chronoSeq(meta: BibleMeta, ranges: ChronoRange[]): VerseRef[] {
  const out: VerseRef[] = [];
  for (const r of ranges) {
    out.push(...iterateRefs(meta, {
      start: { book: r.book, chapter: r.from.c, verse: r.from.v ?? 1 },
      end: { book: r.book, chapter: r.to.c, verse: r.to.v ?? versesIn(meta, r.book, r.to.c) },
    }, true));
  }
  return out;
}

export function trackSequences(opts: Pick<PlanGenOptions, "style" | "meta" | "chronological">): { track: Track; seq: VerseRef[] }[] {
  const { meta } = opts;
  const all = BOOKS.map((b) => b.code);
  switch (opts.style) {
    case "canonical":
      return [{ track: "ALL", seq: booksSeq(meta, all) }];
    case "chronological":
      if (!opts.chronological) throw new Error("chronological ranges required");
      return [{ track: "ALL", seq: chronoSeq(meta, opts.chronological) }];
    case "blended": {
      const ot = BOOKS.filter((b) => b.testament === "OT" && !PP_BOOKS.includes(b.code)).map((b) => b.code);
      const nt = BOOKS.filter((b) => b.testament === "NT").map((b) => b.code);
      // Order matters: PP and NT are cut before OT (OT absorbs their deviation).
      return [
        { track: "PP", seq: booksSeq(meta, PP_BOOKS) },
        { track: "NT", seq: booksSeq(meta, nt) },
        { track: "OT", seq: booksSeq(meta, ot) },
      ];
    }
  }
}

// ---------------------------------------------------------------- units & segments

function lastNonEmptyVerse(meta: BibleMeta, book: string, chapter: number): number {
  let v = versesIn(meta, book, chapter);
  while (v > 1 && isEmptyKey(meta, `${book}.${chapter}.${v}`)) v--;
  return v;
}

function buildUnits(meta: BibleMeta, seq: VerseRef[], headingStarts: Set<VerseKey>): Unit[] {
  const units: Unit[] = [];
  const lastCache = new Map<string, number>();
  const lastOf = (r: VerseRef) => {
    const k = `${r.book}.${r.chapter}`;
    let v = lastCache.get(k);
    if (v === undefined) lastCache.set(k, (v = lastNonEmptyVerse(meta, r.book, r.chapter)));
    return v;
  };
  let i = 0;
  while (i < seq.length) {
    const r = seq[i];
    let j = i + 1;
    if (r.book === "PSA") {
      // A Psalm is one unit: extend over the contiguous verses of the same psalm.
      while (j < seq.length && seq[j].book === "PSA" && seq[j].chapter === r.chapter) j++;
    }
    const last = seq[j - 1];
    const next = seq[j];
    units.push({
      start: i,
      end: j,
      count: j - i,
      chapterEnd: last.verse === lastOf(last),
      headingAfter: !!next && next.book === last.book && next.chapter === last.chapter && headingStarts.has(toKey(next)),
      solo: r.book === "PSA" && SOLO.includes(`PSA.${r.chapter}`),
    });
    i = j;
  }
  return units;
}

/** Largest-remainder apportionment of `days` over weights, each share in [1, cap]. */
function apportion(days: number, weights: number[], caps: number[]): number[] {
  const n = weights.length;
  if (!n) return [];
  const out = new Array<number>(n).fill(1);
  let left = days - n;
  // Iteratively hand out days to the segment furthest below its proportional share, respecting caps.
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  while (left > 0) {
    let best = -1;
    let bestGap = -Infinity;
    for (let k = 0; k < n; k++) {
      if (out[k] >= caps[k]) continue;
      const gap = (weights[k] / total) * days - out[k];
      if (gap > bestGap) { bestGap = gap; best = k; }
    }
    if (best < 0) break;
    out[best]++;
    left--;
  }
  return out;
}

function buildSegments(units: Unit[], days: number): Segment[] {
  const segs: Segment[] = [];
  let from = 0;
  const push = (to: number, solo: boolean) => {
    if (to > from) segs.push({ from, to, verses: units.slice(from, to).reduce((n, u) => n + u.count, 0), days: 0, solo });
    from = to;
  };
  units.forEach((u, i) => {
    if (u.solo) { push(i, false); push(i + 1, true); }
  });
  push(units.length, false);

  const solos = segs.filter((s) => s.solo).length;
  const normal = segs.filter((s) => !s.solo);
  if (days < segs.length) throw new Error("Not enough days for this track");
  const shares = apportion(days - solos, normal.map((s) => s.verses), normal.map((s) => s.to - s.from));
  let k = 0;
  for (const s of segs) s.days = s.solo ? 1 : shares[k++];
  const assigned = segs.reduce((n, s) => n + s.days, 0);
  if (assigned !== days) throw new Error("Track too short to fill every day");
  return segs;
}

// ---------------------------------------------------------------- cursor

class TrackCursor {
  private segIdx = 0;
  private pos: number; // unit index
  private dayInSeg = 0;
  private readonly segs: Segment[];
  private lastTarget = 0;

  constructor(readonly track: Track, readonly seq: VerseRef[], private readonly units: Unit[], days: number) {
    this.segs = buildSegments(units, days);
    this.pos = 0;
  }

  private seg(): Segment {
    while (this.dayInSeg >= this.segs[this.segIdx].days) { this.segIdx++; this.dayInSeg = 0; }
    return this.segs[this.segIdx];
  }

  /** Base target for today (verses left in segment ÷ days left in segment). */
  baseTarget(): number {
    const s = this.seg();
    let left = 0;
    for (let j = this.pos; j < s.to; j++) left += this.units[j].count;
    return left / (s.days - this.dayInSeg);
  }

  isSoloToday(): boolean {
    return this.seg().solo;
  }

  /** Cut today's portion with target T; returns [seqStart, seqEnd) and advances. */
  take(target: number): [number, number] {
    const s = this.seg();
    const daysLeft = s.days - this.dayInSeg;
    let endUnit: number; // exclusive
    if (daysLeft <= 1) {
      endUnit = s.to;
    } else {
      const maxEnd = s.to - (daysLeft - 1); // leave ≥ 1 unit per remaining day
      const T = Math.max(1, target);
      let cum = 0;
      let best = { prio: 9, dev: Infinity, end: this.pos + 1 };
      for (let j = this.pos; j < maxEnd; j++) {
        const u = this.units[j];
        cum += u.count;
        const dev = Math.abs(cum - T);
        const prio = u.chapterEnd && dev <= CHAPTER_WINDOW * T ? 0 : u.headingAfter && dev <= HEADING_WINDOW * T ? 1 : 2;
        if (prio < best.prio || (prio === best.prio && dev < best.dev)) best = { prio, dev, end: j + 1 };
        if (cum > T * (1 + CHAPTER_WINDOW) + 1) break;
      }
      endUnit = best.end;
    }
    const a = this.units[this.pos].start;
    const b = this.units[endUnit - 1].end;
    this.pos = endUnit;
    this.dayInSeg++;
    this.lastTarget = target;
    return [a, b];
  }

  get target(): number { return this.lastTarget; }
}

// ---------------------------------------------------------------- portions

function canonicalIndex(meta: BibleMeta): Map<VerseKey, number> {
  const m = new Map<VerseKey, number>();
  booksSeq(meta, BOOKS.map((b) => b.code)).forEach((r, i) => m.set(toKey(r), i));
  return m;
}

/** Split a slice of a track sequence into canonically contiguous portions. */
function portionsOf(track: Track, seq: VerseRef[], a: number, b: number, gidx: Map<VerseKey, number>): ReadingPortion[] {
  const out: ReadingPortion[] = [];
  let runStart = a;
  for (let i = a + 1; i <= b; i++) {
    const contiguous = i < b && gidx.get(toKey(seq[i])) === (gidx.get(toKey(seq[i - 1])) ?? -2) + 1;
    if (!contiguous) {
      out.push({ track, range: { start: seq[runStart], end: seq[i - 1] }, verseCount: i - runStart, done: false });
      runStart = i;
    }
  }
  return out;
}


// ---------------------------------------------------------------- generator

export function generatePlan(opts: PlanGenOptions): GeneratedDay[] {
  const totalDays = opts.totalDays ?? PLAN_DAYS;
  const grace = opts.graceWeekday === undefined ? 0 : opts.graceWeekday;
  const start = opts.startDate ?? nextMonday(opts.today ?? todayISO());
  const vpm = opts.versesPerMin ?? DEFAULT_VERSES_PER_MIN;
  const heads = headingStartKeys(opts.headings);
  const gidx = canonicalIndex(opts.meta);

  const cursors = trackSequences(opts).map(
    ({ track, seq }) => new TrackCursor(track, seq, buildUnits(opts.meta, seq, heads), totalDays),
  );
  const dates = readingDates(start, totalDays, grace);
  const blended = opts.style === "blended";

  return dates.map((date, dayIndex) => {
    const portions: ReadingPortion[] = [];
    let deviation = 0; // verses over (+) / under (−) target from tracks cut so far today
    let soloDay = false;
    for (const c of cursors) {
      const base = c.baseTarget();
      let target = base;
      if (blended && c.track === "OT" && !soloDay) {
        target = Math.min(2 * base, Math.max(0.25 * base, base - deviation));
      }
      if (c.isSoloToday()) soloDay = true;
      const [a, b] = c.take(target);
      deviation += b - a - base;
      portions.push(...portionsOf(c.track, c.seq, a, b, gidx));
    }
    // Display order OT, NT, PP regardless of cut order.
    const order: Record<Track, number> = { ALL: 0, OT: 1, NT: 2, PP: 3 };
    portions.sort((x, y) => order[x.track] - order[y.track]);
    const verseCount = portions.reduce((n, p) => n + p.verseCount, 0);
    return { dayIndex, date, portions, verseCount, estimatedMinutes: Math.max(1, Math.ceil(verseCount / vpm)) };
  });
}

/** Days whose portions include Psalm 119 (exempt from load-balance checks). */
export const isPsalm119Day = (d: GeneratedDay): boolean =>
  d.portions.some((p) => p.range.start.book === "PSA" && p.range.start.chapter <= 119 && p.range.end.chapter >= 119 && p.range.end.book === "PSA");
