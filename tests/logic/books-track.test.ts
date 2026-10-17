import { describe, expect, it } from "vitest";
import type { BookPlan } from "@/db/types";
import { formatAssignment, paceStatus, proposeTarget, recomputeToTarget, todayAssignment } from "@/lib/books-track";
import { addDays, countReadingDays, weekdayOf } from "@/lib/isoDate";

// 2026-03-02 is a Monday; 8 weeks later the Saturday 2026-04-25 is the last reading day.
const book = (over: Partial<BookPlan> = {}): BookPlan => ({
  id: "b", title: "T", author: "A", unit: "pages", total: 300, current: 0,
  startDate: "2026-03-02", targetDate: "2026-04-25", status: "active", updatedAt: 0, ...over,
});

describe("books track", () => {
  it("300 pages over 8 weeks of 6-day weeks → 6–7 pages/day", () => {
    expect(countReadingDays("2026-03-02", "2026-04-25", 0)).toBe(48);
    let plan = book();
    let date = plan.startDate;
    const perDay: number[] = [];
    while (plan.current < plan.total) {
      const a = todayAssignment(plan, date, 0);
      if (a) {
        perDay.push(a.to - a.from + 1);
        plan = { ...plan, current: a.to };
      } else expect(weekdayOf(date)).toBe(0);
      date = addDays(date, 1);
    }
    expect(perDay).toHaveLength(48);
    for (const n of perDay) expect([6, 7]).toContain(n);
    expect(perDay.reduce((a, b) => a + b, 0)).toBe(300);
  });

  it("assignment is stable while reading today and formats as pp.", () => {
    const plan = book({ current: 111, startDate: "2026-03-02" });
    const a = todayAssignment(plan, "2026-03-20", 0)!;
    expect(a.from).toBe(112);
    const after = todayAssignment({ ...plan, current: 115 }, "2026-03-20", 0, [{ id: "l", bookId: "b", date: "2026-03-20", from: 112, to: 115 }])!;
    expect(after.from).toBe(112);
    expect(after.to).toBe(a.to);
    expect(formatAssignment({ from: 112, to: 126, unit: "pages" })).toBe("pp. 112–126");
    expect(formatAssignment({ from: 3, to: 3, unit: "chapters" })).toBe("ch. 3");
  });

  it("no assignment on the grace day or after finishing", () => {
    expect(todayAssignment(book(), "2026-03-08", 0)).toBeNull();
    expect(todayAssignment(book({ current: 300 }), "2026-03-09", 0)).toBeNull();
  });

  it("uses fixed unitsPerDay when set", () => {
    const a = todayAssignment(book({ unitsPerDay: 10, current: 20 }), "2026-03-05", 0)!;
    expect([a.from, a.to]).toEqual([21, 30]);
  });

  it("detects off-pace and recomputes / proposes a target", () => {
    // After two weeks (12 reading days) the plan expects 75 pages.
    const behind = book({ current: 30 });
    expect(paceStatus(behind, "2026-03-16", 0).status).toBe("behind");
    expect(paceStatus(book({ current: 75 }), "2026-03-16", 0).status).toBe("onPace");
    expect(paceStatus(book({ current: 120 }), "2026-03-16", 0).status).toBe("ahead");
    const { perDay } = recomputeToTarget(behind, "2026-03-16", 0);
    expect(perDay).toBe(Math.ceil(270 / 36));
    // Keeping 6 pages/day from 30 → 270 left → 45 reading days.
    const target = proposeTarget(behind, "2026-03-16", 0, 6);
    expect(countReadingDays("2026-03-16", target, 0)).toBe(45);
  });
});
