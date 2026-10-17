import { describe, expect, it } from "vitest";
import { DAY_MS } from "@/lib/isoDate";
import { AGAIN_DELAY_MS, forgettingCurve, intervalDays, newState, ratingFromGrade, retrievability, review } from "@/lib/srs";

const T0 = Date.UTC(2026, 0, 5, 9);
const days = (s: { due: number }, now: number) => Math.round((s.due - now) / DAY_MS);

describe("FSRS-4.5 curve", () => {
  it("R(S, S) = 0.9 and interval(S) = S at 90% retention", () => {
    expect(forgettingCurve(10, 10)).toBeCloseTo(0.9, 10);
    expect(intervalDays(7.3)).toBeCloseTo(7.3, 10);
  });
  it("maps app grades to ratings", () => {
    expect([1, 2, 3, 4, 5].map((g) => ratingFromGrade(g as 1))).toEqual([1, 2, 3, 3, 4]);
  });
});

describe("review", () => {
  it("first Good uses w2 (3.7145) as stability → 4-day interval", () => {
    const s = review(newState(T0), 3, T0);
    expect(s.stability).toBeCloseTo(3.7145, 4);
    expect(days(s, T0)).toBe(4);
    expect(s.reps).toBe(1);
    expect(s.lapses).toBe(0);
  });
  it("first review intervals order Again < Hard < Good < Easy, all passing ≥ 1 day", () => {
    const iv = [1, 2, 3, 5].map((g) => review(newState(T0), g as 1, T0).due - T0);
    expect(iv[0]).toBe(AGAIN_DELAY_MS);
    expect(iv[1]).toBeGreaterThanOrEqual(DAY_MS);
    expect(iv[1]).toBeLessThan(iv[2]);
    expect(iv[2]).toBeLessThan(iv[3]);
  });
  it("intervals grow on repeated Good", () => {
    let s = review(newState(T0), 3, T0);
    let now = T0;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      now = s.due;
      s = review(s, 3, now);
      intervals.push(days(s, now));
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });
  it("Again on a learned card lapses: lapses++, stability shrinks, due in 10 minutes", () => {
    let s = review(newState(T0), 3, T0);
    s = review(s, 3, s.due);
    const before = s;
    const now = s.due;
    const after = review(s, 1, now);
    expect(after.lapses).toBe(before.lapses + 1);
    expect(after.stability).toBeLessThan(before.stability);
    expect(after.due).toBe(now + AGAIN_DELAY_MS);
    expect(after.difficulty).toBeGreaterThan(before.difficulty);
  });
  it("Again on a new card is not a lapse", () => {
    expect(review(newState(T0), 1, T0).lapses).toBe(0);
  });
  it("is pure", () => {
    const s = newState(T0);
    const copy = { ...s };
    review(s, 5, T0);
    expect(s).toEqual(copy);
  });
  it("retrievability decays over time", () => {
    const s = review(newState(T0), 3, T0);
    expect(retrievability(s, T0)).toBeCloseTo(1, 6);
    expect(retrievability(s, T0 + 10 * DAY_MS)).toBeLessThan(retrievability(s, T0 + 2 * DAY_MS));
    expect(retrievability(newState(T0), T0)).toBe(0);
  });
});
