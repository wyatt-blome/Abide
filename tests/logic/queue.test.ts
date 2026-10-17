import { describe, expect, it } from "vitest";
import type { MemoryPlan, PassageCard, VerseCard } from "@/db/types";
import { DAY_MS } from "@/lib/isoDate";
import {
  applyPassageRun, AUTO_PAUSE_THRESHOLD, buildQueue, buildUpLabel, formatSummary, newChunksAllowedToday,
} from "@/lib/queue";
import { newState, review } from "@/lib/srs";

const NOW = new Date(2026, 2, 10, 12, 0, 0).getTime(); // local noon
const plan = (over: Partial<MemoryPlan> = {}): MemoryPlan => ({
  id: "p1", title: "T", translation: "BSB",
  range: { start: { book: "PSA", chapter: 23, verse: 1 }, end: { book: "PSA", chapter: 23, verse: 6 } },
  chunks: [["PSA.23.1", "PSA.23.2"], ["PSA.23.3", "PSA.23.4"], ["PSA.23.5", "PSA.23.6"]],
  chunksIntroduced: 2, pace: "daily", status: "active", createdAt: 0, updatedAt: 0, ...over,
});
let n = 0;
const card = (key: string, due: number, reps = 1, planId = "p1"): VerseCard => ({
  id: `c${n++}`, planId, key, stability: 3, difficulty: 5, due, reps, lapses: 0, lastReviewed: due - 3 * DAY_MS, updatedAt: 0,
});

describe("buildQueue", () => {
  it("orders overdue → due → passage → new", () => {
    const p = plan();
    const cards = [
      card("PSA.23.2", NOW - 1000), // due today
      card("PSA.23.1", NOW - 3 * DAY_MS), // overdue
      card("PSA.23.3", NOW + 2 * 3600_000), // later today → still due
      card("PSA.23.4", NOW + 2 * DAY_MS), // not due
      card("PSA.23.5", NOW, 0), card("PSA.23.6", NOW, 0), // new chunk 3
    ];
    const pc: PassageCard = { id: "pc", planId: "p1", ...newState(NOW - DAY_MS), updatedAt: 0 };
    const q = buildQueue({ plans: [p], verseCards: cards, passageCards: [pc], now: NOW });
    expect(q.items.map((i) => i.kind)).toEqual(["review", "review", "review", "passage", "new"]);
    const first = q.items[0];
    expect(first.kind === "review" && first.overdue && first.card.key).toBe("PSA.23.1");
    expect(q.items.slice(1, 3).map((i) => i.kind === "review" && i.card.key)).toEqual(["PSA.23.2", "PSA.23.3"]);
    const nw = q.items[4];
    expect(nw.kind === "new" && nw.chunkIndex).toBe(2);
    expect(nw.kind === "new" && nw.runThrough).toEqual(p.chunks.flat());
    expect(q.summary).toMatchObject({ overdue: 1, dueToday: 2, reviews: 3, passageRuns: 1, newChunks: 1 });
    // 3×25 + 6×6 + 60 + 6×6 = 207 s → 4 min
    expect(q.summary.minutes).toBe(4);
    expect(formatSummary(q.summary)).toBe("4 due · 1 new · ~4 min");
  });
  it("skips paused plans and flags auto-pause", () => {
    const cards = Array.from({ length: AUTO_PAUSE_THRESHOLD + 1 }, (_, i) => card(`PSA.23.${(i % 6) + 1}`, NOW - 1000));
    expect(buildQueue({ plans: [plan()], verseCards: cards, passageCards: [], now: NOW }).summary.newPaused).toBe(true);
    expect(buildQueue({ plans: [plan({ status: "paused" })], verseCards: cards, passageCards: [], now: NOW }).items).toHaveLength(0);
  });
});

describe("newChunksAllowedToday", () => {
  const ctx = { dueReviews: 0, introducedToday: 0, dailyNewLimit: 3, pendingNew: false };
  it("daily: one per day", () => {
    expect(newChunksAllowedToday(plan({ lastIntroducedAt: NOW - DAY_MS }), NOW, ctx)).toBe(1);
    expect(newChunksAllowedToday(plan({ lastIntroducedAt: NOW - 3600_000 }), NOW, ctx)).toBe(0);
  });
  it("everyOtherDay waits two days", () => {
    expect(newChunksAllowedToday(plan({ pace: "everyOtherDay", lastIntroducedAt: NOW - DAY_MS }), NOW, ctx)).toBe(0);
    expect(newChunksAllowedToday(plan({ pace: "everyOtherDay", lastIntroducedAt: NOW - 2 * DAY_MS }), NOW, ctx)).toBe(1);
  });
  it("twicePerDay gives two, capped by remaining and the daily limit", () => {
    const p = plan({ pace: "twicePerDay", chunksIntroduced: 0, lastIntroducedAt: undefined });
    expect(newChunksAllowedToday(p, NOW, ctx)).toBe(2);
    expect(newChunksAllowedToday({ ...p, chunksIntroduced: 2 }, NOW, ctx)).toBe(1);
    expect(newChunksAllowedToday(p, NOW, { ...ctx, introducedToday: 2 })).toBe(1);
  });
  it("auto-pauses when more than 40 reviews are due", () => {
    expect(newChunksAllowedToday(plan({ chunksIntroduced: 0 }), NOW, { ...ctx, dueReviews: 41 })).toBe(0);
    expect(newChunksAllowedToday(plan({ chunksIntroduced: 0 }), NOW, { ...ctx, dueReviews: 40 })).toBe(1);
  });
  it("waits for pending new cards, start date and active status", () => {
    expect(newChunksAllowedToday(plan({ chunksIntroduced: 0 }), NOW, { ...ctx, pendingNew: true })).toBe(0);
    expect(newChunksAllowedToday(plan({ chunksIntroduced: 0, startDate: "2099-01-01" }), NOW, ctx)).toBe(0);
    expect(newChunksAllowedToday(plan({ chunksIntroduced: 0, status: "paused" }), NOW, ctx)).toBe(0);
    expect(newChunksAllowedToday(plan({ chunksIntroduced: 3 }), NOW, ctx)).toBe(0);
  });
});

describe("buildUpLabel", () => {
  it("returns learning and cumulative run-through ranges", () => {
    const l = buildUpLabel(plan(), 2);
    expect(l.learning).toEqual({ start: { book: "PSA", chapter: 23, verse: 5 }, end: { book: "PSA", chapter: 23, verse: 6 } });
    expect(l.runThrough).toEqual({ start: { book: "PSA", chapter: 23, verse: 1 }, end: { book: "PSA", chapter: 23, verse: 6 } });
    expect(buildUpLabel(plan(), 0).runThrough).toBeNull();
  });
});

describe("applyPassageRun", () => {
  const learned = (key: string): VerseCard => ({ id: key, planId: "p1", key, ...review(review(newState(NOW - 10 * DAY_MS), 3, NOW - 10 * DAY_MS), 3, NOW - 6 * DAY_MS), updatedAt: 0 });
  const pc: PassageCard = { id: "pc", planId: "p1", ...review(newState(NOW - 5 * DAY_MS), 3, NOW - 5 * DAY_MS), updatedAt: 0 };
  it("a lapsed verse reschedules that verse and caps the passage at Hard", () => {
    const cards = ["PSA.23.1", "PSA.23.2", "PSA.23.3"].map(learned);
    const r = applyPassageRun(pc, cards, { "PSA.23.1": 5, "PSA.23.2": 1, "PSA.23.3": 5 }, NOW);
    expect(r.passageGrade).toBe(2);
    expect(r.verseCards.map((c) => c.key)).toEqual(["PSA.23.2"]);
    expect(r.verseCards[0].lapses).toBe(cards[1].lapses + 1);
    expect(r.verseCards[0].due).toBeLessThan(NOW + DAY_MS);
    expect(r.passageCard.reps).toBe(pc.reps + 1);
  });
  it("a clean run updates only the passage card", () => {
    const cards = ["PSA.23.1", "PSA.23.2"].map(learned);
    const r = applyPassageRun(pc, cards, { "PSA.23.1": 5, "PSA.23.2": 4 }, NOW);
    expect(r.passageGrade).toBe(5);
    expect(r.verseCards).toEqual([]);
    expect(r.passageCard.due).toBeGreaterThan(NOW + DAY_MS);
  });
});
