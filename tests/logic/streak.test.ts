import { describe, expect, it } from "vitest";
import { dayQualifies, displayStreak, emptyStreak, updateStreak, weekDots } from "@/lib/streak";

// 2026-03-08 is a Sunday (grace weekday 0).
describe("streak", () => {
  it("qualifies on cleared queue or ≥ 10 reviews", () => {
    expect(dayQualifies({ queueCleared: true, reviewsToday: 0 })).toBe(true);
    expect(dayQualifies({ queueCleared: false, reviewsToday: 10 })).toBe(true);
    expect(dayQualifies({ queueCleared: false, reviewsToday: 9 })).toBe(false);
  });
  it("grows on consecutive days, ignores repeats and non-qualifying days", () => {
    let s = updateStreak(emptyStreak(), "2026-03-02", true, 0);
    s = updateStreak(s, "2026-03-03", true, 0);
    expect(s.current).toBe(2);
    expect(updateStreak(s, "2026-03-03", true, 0)).toBe(s);
    expect(updateStreak(s, "2026-03-04", false, 0)).toBe(s);
  });
  it("the grace weekday does not break the streak", () => {
    let s = updateStreak(emptyStreak(), "2026-03-07", true, 0); // Sat
    s = updateStreak(s, "2026-03-09", true, 0); // Mon, Sunday skipped
    expect(s.current).toBe(2);
    expect(displayStreak(s, "2026-03-10", 0)).toBe(2);
  });
  it("a missed weekday resets to 1 and keeps best", () => {
    let s = updateStreak(emptyStreak(), "2026-03-02", true, 0);
    s = updateStreak(s, "2026-03-03", true, 0);
    s = updateStreak(s, "2026-03-05", true, 0); // Wed missed
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
    expect(displayStreak(s, "2026-03-07", 0)).toBe(0);
  });
  it("without a grace weekday a Sunday gap breaks it", () => {
    let s = updateStreak(emptyStreak(), "2026-03-07", true, null);
    s = updateStreak(s, "2026-03-09", true, null);
    expect(s.current).toBe(1);
  });
  it("week dots", () => {
    let s = updateStreak(emptyStreak(), "2026-03-09", true, 0);
    s = updateStreak(s, "2026-03-11", true, 0);
    const dots = weekDots(s, "2026-03-12", 0);
    expect(dots.map((d) => d.date)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15"]);
    expect(dots.map((d) => d.status)).toEqual(["done", "missed", "done", "today", "future", "future", "future"]);
    expect(weekDots(s, "2026-03-15", 0)[6].status).toBe("grace");
  });
});
