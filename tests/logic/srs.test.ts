import { describe, expect, it } from "vitest";
import { addDays, DAY_MS, diffDays, localMidnight, todayISO } from "@/lib/isoDate";
import {
  AGAIN_DELAY_MS,
  forgettingCurve,
  intervalDays,
  lastWasAgain,
  newState,
  previewIntervalDays,
  ratingFromGrade,
  retrievability,
  review,
} from "@/lib/srs";

const T0 = new Date(2026, 0, 5, 9).getTime();
/** Calendar days from the local day of `now` to the local day the card is due. */
const days = (s: { due: number }, now: number) => diffDays(todayISO(now), todayISO(s.due));
const midnightAfter = (now: number, n: number) => localMidnight(addDays(todayISO(now), n));

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
  it("first Good keeps w2 (3.7145) as stability but is due tomorrow (learning step)", () => {
    const s = review(newState(T0), 3, T0);
    expect(s.stability).toBeCloseTo(3.7145, 4);
    expect(s.due).toBe(midnightAfter(T0, 1));
    expect(s.reps).toBe(1);
    expect(s.lapses).toBe(0);
  });
  it("a new card passed with any grade 2..5 is due at tomorrow's local midnight", () => {
    for (const g of [2, 3, 4, 5] as const) {
      for (const hour of [0, 9, 23]) {
        const now = new Date(2026, 0, 5, hour, 59).getTime();
        const s = review(newState(now), g, now);
        expect(s.due).toBeGreaterThanOrEqual(midnightAfter(now, 1));
        expect(s.due).toBeLessThan(midnightAfter(now, 2));
        expect(previewIntervalDays(newState(now), g, now)).toBe(1);
      }
    }
  });
  it("first review stabilities order Hard < Good < Easy; Again is due in 10 minutes", () => {
    expect(review(newState(T0), 1, T0).due - T0).toBe(AGAIN_DELAY_MS);
    const st = [2, 3, 5].map((g) => review(newState(T0), g as 2, T0).stability);
    expect(st[0]).toBeLessThan(st[1]);
    expect(st[1]).toBeLessThan(st[2]);
  });
  it("second review uses the FSRS interval (whole days, due at local midnight)", () => {
    const first = review(newState(T0), 3, T0);
    const now = first.due + 9 * 3_600_000;
    const s = review(first, 3, now);
    expect(days(s, now)).toBe(Math.round(intervalDays(s.stability)));
    expect(s.due).toBe(midnightAfter(now, days(s, now)));
  });
  it("first passing review after an Again on the same day (relearning) is due tomorrow", () => {
    // New card: Again, then Good 10 minutes later.
    const a = review(newState(T0), 1, T0);
    expect(lastWasAgain(a)).toBe(true);
    const b = review(a, 3, a.due);
    expect(b.due).toBe(midnightAfter(a.due, 1));
    expect(lastWasAgain(b)).toBe(false);
    // Learned card that lapses, then passes the same day.
    let s = review(newState(T0), 5, T0);
    let now = s.due + 10 * 3_600_000;
    s = review(s, 5, now);
    now = s.due + 10 * 3_600_000;
    const lapsed = review(s, 1, now);
    expect(lapsed.lapses).toBe(1);
    const relearned = review(lapsed, 4, lapsed.due + 60_000);
    expect(relearned.due).toBe(midnightAfter(now, 1));
  });
  it("due dates are whole calendar days across a DST change", () => {
    // Saturday before the EU (last Sunday of March) and US (second Sunday of March) changes.
    for (const start of [new Date(2026, 2, 7, 21).getTime(), new Date(2026, 2, 28, 21).getTime()]) {
      let s = review(newState(start), 3, start);
      let now = start;
      for (let i = 0; i < 4; i++) {
        expect(new Date(s.due).getHours()).toBe(0);
        expect(new Date(s.due).getMinutes()).toBe(0);
        now = s.due + 21 * 3_600_000;
        s = review(s, 3, now);
      }
      expect(s.due).toBe(midnightAfter(now, days(s, now)));
    }
  });
  it("intervals grow on repeated Good", () => {
    let s = review(newState(T0), 3, T0);
    let now = T0;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      now = s.due + 9 * 3_600_000;
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
