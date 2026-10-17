import { describe, expect, it } from "vitest";
import type { ReadingStyle } from "@/db/types";
import { CHRONOLOGICAL } from "../../content/plans/chronological";
import { generatePlan, isPsalm119Day, PLAN_DAYS, type GeneratedDay } from "@/lib/planGen";
import { iterateRefs, toKey } from "@/lib/refs";
import { weekdayOf } from "@/lib/isoDate";
import { loadHeadings, loadMeta } from "./_data";

const meta = loadMeta();
const headings = loadHeadings();
const allNonEmpty = meta.books.flatMap((b) =>
  iterateRefs(meta, { start: { book: b.code, chapter: 1, verse: 1 }, end: { book: b.code, chapter: b.chapters, verse: b.verses[b.chapters - 1] } }, true).map(toKey),
);

const plans = new Map<ReadingStyle, GeneratedDay[]>();
const gen = (style: ReadingStyle) => {
  if (!plans.has(style)) plans.set(style, generatePlan({ style, meta, headings, chronological: CHRONOLOGICAL, startDate: "2026-10-19", graceWeekday: 0 }));
  return plans.get(style)!;
};

describe.each(["canonical", "chronological", "blended"] as ReadingStyle[])("%s plan", (style) => {
  it("has 312 days, indices 0..311, never on the grace weekday, 6 per week", () => {
    const days = gen(style);
    expect(days).toHaveLength(PLAN_DAYS);
    days.forEach((d, i) => expect(d.dayIndex).toBe(i));
    expect(days.some((d) => weekdayOf(d.date) === 0)).toBe(false);
    expect(days[0].date).toBe("2026-10-19");
    expect(days[5].date).toBe("2026-10-24");
    expect(days[6].date).toBe("2026-10-26");
    expect(days[311].date).toBe("2027-10-16");
  });

  it("covers every non-empty BSB verse exactly once", () => {
    const seen = new Map<string, number>();
    for (const d of gen(style)) for (const p of d.portions) {
      const keys = iterateRefs(meta, p.range, true).map(toKey);
      expect(keys.length).toBe(p.verseCount);
      for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect(seen.size).toBe(allNonEmpty.length);
    for (const k of allNonEmpty) expect(seen.get(k)).toBe(1);
  });

  it("daily load within ±30% of the mean (Psalm 119 days excepted)", () => {
    const days = gen(style);
    const mean = days.reduce((n, d) => n + d.verseCount, 0) / days.length;
    for (const d of days) {
      if (isPsalm119Day(d)) continue;
      expect(Math.abs(d.verseCount / mean - 1)).toBeLessThanOrEqual(0.3);
    }
  });

  it("never splits a Psalm, and Psalm 119 has its own day in its track", () => {
    const days = gen(style);
    for (const d of days) for (const p of d.portions) {
      if (p.range.start.book === "PSA") expect(p.range.start.verse).toBe(1);
      if (p.range.end.book === "PSA") expect(p.range.end.verse).toBe(meta.books.find((b) => b.code === "PSA")!.verses[p.range.end.chapter - 1]);
    }
    const ps119 = days.filter(isPsalm119Day);
    expect(ps119).toHaveLength(1);
    const track = ps119[0].portions.find((p) => p.range.start.book === "PSA" && p.range.start.chapter === 119)!;
    const sameTrack = ps119[0].portions.filter((p) => p.track === track.track);
    expect(sameTrack).toHaveLength(1);
    expect(track.range.end.chapter).toBe(119);
  });

  it("is deterministic and estimates minutes at 7 verses/min", () => {
    const again = generatePlan({ style, meta, headings, chronological: CHRONOLOGICAL, startDate: "2026-10-19", graceWeekday: 0 });
    expect(again).toEqual(gen(style));
    const d = gen(style)[10];
    expect(d.estimatedMinutes).toBe(Math.ceil(d.verseCount / 7));
    expect(d.portions.every((p) => !p.done)).toBe(true);
  });
});

describe("style specifics", () => {
  it("canonical starts at Genesis 1:1 and ends at Revelation 22:21", () => {
    const days = gen("canonical");
    expect(days[0].portions[0].range.start).toEqual({ book: "GEN", chapter: 1, verse: 1 });
    expect(days[311].portions.at(-1)!.range.end).toEqual({ book: "REV", chapter: 22, verse: 21 });
    expect(days.every((d) => d.portions.every((p) => p.track === "ALL"))).toBe(true);
  });
  it("blended has OT, NT and PP every day, all finishing on day 312", () => {
    const days = gen("blended");
    for (const d of days) expect(new Set(d.portions.map((p) => p.track))).toEqual(new Set(["OT", "NT", "PP"]));
    const last = days[311].portions;
    expect(last.find((p) => p.track === "NT")!.range.end).toEqual({ book: "REV", chapter: 22, verse: 21 });
    expect(last.find((p) => p.track === "PP")!.range.end).toEqual({ book: "PRO", chapter: 31, verse: 31 });
    expect(last.find((p) => p.track === "OT")!.range.end).toEqual({ book: "MAL", chapter: 4, verse: 6 });
  });
  it("chronological splits non-contiguous runs into separate portions", () => {
    const days = gen("chronological");
    expect(days[0].portions[0].range.start.book).toBe("GEN");
    expect(days.some((d) => d.portions.length > 1)).toBe(true);
    // Job comes right after Genesis 11.
    const jobDay = days.findIndex((d) => d.portions.some((p) => p.range.start.book === "JOB" || p.range.end.book === "JOB"));
    const gen12Day = days.findIndex((d) => d.portions.some((p) => p.range.start.book === "GEN" && p.range.start.chapter >= 12));
    expect(jobDay).toBeLessThan(gen12Day);
  });
  it("defaults: start next Monday, Sunday grace", () => {
    const days = generatePlan({ style: "canonical", meta, headings, today: "2026-10-17" });
    expect(days[0].date).toBe("2026-10-19");
    expect(days.some((d) => weekdayOf(d.date) === 0)).toBe(false);
  });
});
