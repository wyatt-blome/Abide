import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { clearAllData } from "@/db/repo";
import type { BookLog, BookPlan } from "@/db/types";
import { addDays, weekdayOf } from "@/lib/isoDate";
import { assignmentLabel, buildBookPlan, createBookPlan, logProgress, targetFromUnitsPerDay } from "@/lib/booksStore";

const START = "2026-10-19"; // Monday
const span = (label: string): number => {
  const m = /pp\. (\d+)–(\d+)/.exec(label);
  if (!m) throw new Error(label);
  return Number(m[2]) - Number(m[1]) + 1;
};

beforeEach(async () => {
  await clearAllData();
});

describe("books track UI helper", () => {
  it("300 pages over 8 weeks shows ~6–7 pages a day and finishes on time", () => {
    let plan: BookPlan = buildBookPlan({ title: "Lorem", author: "Ipsum", unit: "pages", total: 300, startDate: START, targetDate: addDays(START, 55) }, 0);
    expect(assignmentLabel(plan, START, 0)).toBe("Today: pp. 1–7");
    const logs: BookLog[] = [];
    let readingDays = 0;
    for (let d = START; d <= plan.targetDate; d = addDays(d, 1)) {
      const label = assignmentLabel(plan, d, 0, logs);
      if (weekdayOf(d) === 0) {
        expect(label).toBeNull();
        continue;
      }
      if (!label) break;
      readingDays++;
      const n = span(label);
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(7);
      plan = { ...plan, current: plan.current + n };
    }
    expect(plan.current).toBe(300);
    expect(readingDays).toBe(48);
  });

  it("units per day sets the target date", () => {
    expect(targetFromUnitsPerDay(300, 10, START, 0)).toBe(addDays(START, 33)); // 30 reading days = 5 six-day weeks
    const plan = buildBookPlan({ title: "Lorem", author: "", unit: "chapters", total: 30, startDate: START, unitsPerDay: 2 }, 0);
    expect(plan.unitsPerDay).toBe(2);
    expect(assignmentLabel(plan, START, 0)).toBe("Today: ch. 1–2");
  });

  it("logging keeps one log per day and the assignment steady while reading", async () => {
    const plan = await createBookPlan({ title: "Lorem", author: "Ipsum", unit: "pages", total: 300, startDate: START, targetDate: addDays(START, 55) }, 0);
    await logProgress(plan.id, 3, START);
    await logProgress(plan.id, 7, START);
    const logs = await db.bookLogs.where("bookId").equals(plan.id).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ from: 1, to: 7, date: START });
    const saved = (await db.bookPlans.get(plan.id))!;
    expect(saved.current).toBe(7);
    expect(assignmentLabel(saved, START, 0, logs)).toBe("Today: pp. 1–7");
    // A correction below the start of today drops today's log.
    await logProgress(plan.id, 0, START);
    expect(await db.bookLogs.where("bookId").equals(plan.id).count()).toBe(0);
    // Finishing marks the book finished.
    const done = await logProgress(plan.id, 300, addDays(START, 1));
    expect(done.plan.status).toBe("finished");
  });
});
