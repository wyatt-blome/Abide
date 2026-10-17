import { describe, expect, it } from "vitest";
import type { MemoryPlan, PassageCard, ReviewLog, SrsState, VerseCard } from "@/db/types";
import { DAY_MS, todayISO, addDays } from "@/lib/isoDate";
import { classifyCard, forecastDue, isPlanMastered, planProgress, MATURE_DAYS } from "@/lib/progress";
import { newState, review } from "@/lib/srs";

const T0 = new Date(2026, 2, 9, 9, 0, 0).getTime();
const state = (s: Partial<SrsState>): SrsState => ({ stability: 0, difficulty: 5, due: T0, reps: 0, lapses: 0, ...s });

describe("classifyCard", () => {
  it("new: no card or never reviewed", () => {
    expect(classifyCard(undefined)).toBe("new");
    expect(classifyCard(newState(T0))).toBe("new");
  });
  it("learning: fewer than 2 reviews, or an Again pending", () => {
    const once = review(newState(T0), 4, T0);
    expect(classifyCard(once)).toBe("learning");
    const again = state({ reps: 6, stability: 4, lastReviewed: T0, due: T0 + 10 * 60 * 1000, lapses: 1 });
    expect(classifyCard(again)).toBe("learning");
  });
  it("young: reviewed, interval < 21 days", () => {
    expect(classifyCard(state({ reps: 3, stability: 8, lastReviewed: T0, due: T0 + 8 * DAY_MS }))).toBe("young");
  });
  it("mature: interval or stability ≥ 21 days", () => {
    expect(classifyCard(state({ reps: 4, stability: 25, lastReviewed: T0, due: T0 + 25 * DAY_MS }))).toBe("mature");
    expect(classifyCard(state({ reps: 4, stability: 10, lastReviewed: T0, due: T0 + MATURE_DAYS * DAY_MS }))).toBe("mature");
    expect(classifyCard(state({ reps: 4, stability: 30, lastReviewed: T0, due: T0 + 20 * DAY_MS }))).toBe("mature");
  });
  it("a card reviewed Good repeatedly over months matures", () => {
    let s = newState(T0);
    let t = T0;
    for (let i = 0; i < 6; i++) {
      s = review(s, 4, t);
      t = s.due;
    }
    expect(classifyCard(s)).toBe("mature");
  });
});

const plan = (chunks: string[][]): MemoryPlan => ({
  id: "p", title: "T", translation: "BSB", range: { start: { book: "PSA", chapter: 1, verse: 1 }, end: { book: "PSA", chapter: 1, verse: 4 } },
  chunks, chunksIntroduced: chunks.length, pace: "daily", status: "active", createdAt: T0, updatedAt: T0,
});
const card = (key: string, s: Partial<SrsState>): VerseCard => ({ id: `c-${key}`, planId: "p", key, updatedAt: T0, ...state(s) });
const mature = { reps: 5, stability: 30, lastReviewed: T0, due: T0 + 30 * DAY_MS };
const log = (cardId: string, grade: 1 | 2 | 3 | 4 | 5, at: number): ReviewLog => ({
  id: `${cardId}-${at}`, cardId, cardType: "verse", mode: "typeFirst", grade, accuracy: 1, durationMs: 1, at,
});

describe("planProgress / isPlanMastered", () => {
  it("counts maturity and due", () => {
    const p = plan([["PSA.1.1", "PSA.1.2"], ["PSA.1.3"]]);
    const cards = [card("PSA.1.1", mature), card("PSA.1.2", { reps: 3, stability: 5, lastReviewed: T0 - 5 * DAY_MS, due: T0 })];
    const pr = planProgress(p, cards, [], T0);
    expect(pr.total).toBe(3);
    expect(pr.counts).toEqual({ new: 1, learning: 0, young: 1, mature: 1 });
    expect(pr.known).toBe(2);
    expect(pr.dueToday).toBe(1);
  });
  it("mastered = all verses mature + last passage run ≥ 4", () => {
    const p = plan([["PSA.1.1"], ["PSA.1.2"]]);
    const cards = [card("PSA.1.1", mature), card("PSA.1.2", mature)];
    const pc: PassageCard = { id: "pc", planId: "p", updatedAt: T0, ...state(mature) };
    expect(isPlanMastered({ plan: p, verseCards: cards, passageCard: pc, logs: [] })).toBe(false);
    expect(isPlanMastered({ plan: p, verseCards: cards, passageCard: pc, logs: [log("pc", 5, T0), log("pc", 3, T0 + 1)] })).toBe(false);
    expect(isPlanMastered({ plan: p, verseCards: cards, passageCard: pc, logs: [log("pc", 3, T0), log("pc", 4, T0 + 1)] })).toBe(true);
    const young = [card("PSA.1.1", mature), card("PSA.1.2", { reps: 3, stability: 5, lastReviewed: T0, due: T0 + 5 * DAY_MS })];
    expect(isPlanMastered({ plan: p, verseCards: young, passageCard: pc, logs: [log("pc", 5, T0)] })).toBe(false);
  });
  it("single-chunk plans need every verse's last grade ≥ 4", () => {
    const p = plan([["PSA.1.1", "PSA.1.2"]]);
    const cards = [card("PSA.1.1", mature), card("PSA.1.2", mature)];
    expect(isPlanMastered({ plan: p, verseCards: cards, logs: [log("c-PSA.1.1", 4, T0)] })).toBe(false);
    expect(isPlanMastered({ plan: p, verseCards: cards, logs: [log("c-PSA.1.1", 4, T0), log("c-PSA.1.2", 5, T0)] })).toBe(true);
  });
});

describe("forecastDue", () => {
  it("buckets current due dates by local day; overdue lands on today; new cards excluded", () => {
    const cards = [
      { due: T0 - 3 * DAY_MS, reps: 2 },
      { due: T0 + 60_000, reps: 1 },
      { due: T0 + DAY_MS, reps: 3 },
      { due: T0 + 29 * DAY_MS, reps: 3 },
      { due: T0 + 30 * DAY_MS, reps: 3 },
      { due: T0, reps: 0 },
    ];
    const f = forecastDue(cards, T0, 30);
    expect(f).toHaveLength(30);
    expect(f[0]).toEqual({ date: todayISO(T0), count: 2 });
    expect(f[1]).toEqual({ date: addDays(todayISO(T0), 1), count: 1 });
    expect(f[29].count).toBe(1);
    expect(f.reduce((a, d) => a + d.count, 0)).toBe(4);
  });
});
