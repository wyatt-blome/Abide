import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { clearAllData } from "@/db/repo";
import type { ReadingDay } from "@/db/types";
import { CHRONOLOGICAL } from "../../content/plans/chronological";
import { weekdayOf } from "@/lib/isoDate";
import { isDayComplete } from "@/lib/missed";
import {
  applyMissedToPlan, createReadingPlan, dayId, getPlanDays, planStats, setDayDone, setPortionDone, totalVerses,
} from "@/lib/readingPlanStore";
import { loadHeadings, loadMeta } from "../logic/_data";

const meta = loadMeta();
const data = { meta, headings: loadHeadings(), chronological: CHRONOLOGICAL };
const T0 = new Date(2026, 9, 17, 9, 0, 0).getTime();

beforeEach(async () => {
  await clearAllData();
});

describe("reading plan store", () => {
  it("generates and stores 312 days with stable ids, none on the grace weekday", async () => {
    const plan = await createReadingPlan({ style: "blended", startDate: "2026-10-19", graceWeekday: 0, translation: "BSB" }, data, T0);
    const stored = await db.readingPlans.get(plan.id);
    expect(stored).toMatchObject({ style: "blended", totalDays: 312, missedPolicy: "ask", graceWeekday: 0, translation: "BSB" });
    const days = await getPlanDays(plan.id);
    expect(days).toHaveLength(312);
    days.forEach((d, i) => {
      expect(d.id).toBe(dayId(plan.id, i));
      expect(d.dayIndex).toBe(i);
      expect(weekdayOf(d.date)).not.toBe(0);
      expect(d.portions.length).toBeGreaterThan(0);
      expect(d.portions.every((p) => p.done === false)).toBe(true);
    });
    expect(days[0].date).toBe("2026-10-19");
    expect(totalVerses(days)).toBe(31086);
  });

  it("chronological plan with a Saturday grace day; a new plan replaces the old one", async () => {
    const first = await createReadingPlan({ style: "canonical", startDate: "2026-10-19", graceWeekday: 0, translation: "BSB" }, data, T0);
    const plan = await createReadingPlan({ style: "chronological", startDate: "2026-10-19", graceWeekday: 6, translation: "KJV" }, data, T0 + 1);
    expect(await db.readingPlans.count()).toBe(1);
    expect(await db.readingDays.where("planId").equals(first.id).count()).toBe(0);
    const days = await getPlanDays(plan.id);
    expect(days).toHaveLength(312);
    expect(days.some((d) => weekdayOf(d.date) === 6)).toBe(false);
  });

  it("missed days + Spread via the store: only missed and future days change; completed days and today never", async () => {
    const plan = await createReadingPlan({ style: "blended", startDate: "2026-10-19", graceWeekday: 0, translation: "BSB" }, data, T0);
    await setDayDone(dayId(plan.id, 0), true, T0);
    await setDayDone(dayId(plan.id, 1), true, T0);
    await setPortionDone(dayId(plan.id, 2), 0, true, T0);
    const before = await getPlanDays(plan.id);
    const today = before[5].date; // 2026-10-24 (Sat): days 2–4 missed
    expect(planStats(plan, before, today).behindDays).toBe(3);

    const { written } = await applyMissedToPlan(plan.id, "spread", { meta, today, now: T0 + 1000, remember: true });
    const after = await getPlanDays(plan.id);
    const byId = new Map<string, ReadingDay>(after.map((d) => [d.id, d]));
    expect(after).toHaveLength(before.length);

    let changedFuture = 0;
    for (const d of before) {
      const a = byId.get(d.id)!;
      if (isDayComplete(d)) expect(a).toEqual(d);
      else if (d.date === today) expect(a).toEqual(d);
      else if (d.date < today) expect(a.portions).toEqual(d.portions.filter((p) => p.done));
      else {
        expect(a.date).toBe(d.date);
        expect(a.portions.slice(0, d.portions.length)).toEqual(d.portions);
        if (a.portions.length > d.portions.length) changedFuture++;
        else expect(a).toEqual(d);
      }
    }
    expect(changedFuture).toBeGreaterThan(0);
    expect(changedFuture).toBeLessThanOrEqual(12);
    expect(written).toBe(3 + changedFuture);
    expect(totalVerses(after)).toBe(totalVerses(before));
    expect(planStats(plan, after, today).behindDays).toBe(0);
    expect((await db.readingPlans.get(plan.id))?.missedPolicy).toBe("spread");
  });

  it("pace and projected finish", async () => {
    const plan = await createReadingPlan({ style: "canonical", startDate: "2026-10-19", graceWeekday: 0, translation: "BSB" }, data, T0);
    const days = await getPlanDays(plan.id);
    const today = days[3].date;
    const s = planStats(plan, days, today);
    expect(s.behindDays).toBe(3);
    expect(s.net).toBe(-3);
    expect(s.lastDate).toBe(days[311].date);
    expect(s.projectedFinish! > s.lastDate!).toBe(true);
    expect(weekdayOf(s.projectedFinish!)).not.toBe(0);
    expect(s.percent).toBe(0);
  });
});
