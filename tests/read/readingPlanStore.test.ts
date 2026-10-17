import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { clearAllData } from "@/db/repo";
import type { ReadingDay } from "@/db/types";
import { CHRONOLOGICAL } from "../../content/plans/chronological";
import { addDays, weekdayOf } from "@/lib/isoDate";
import { isDayComplete } from "@/lib/missed";
import { iterateRefs, toKey } from "@/lib/refs";
import {
  applyMissedToPlan, changePlanGraceWeekday, createReadingPlan, dayId, getPlanDays, planStats, regraceDays, setDayDone,
  setPortionDone, totalVerses,
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

describe("changing the grace day", () => {
  it("re-dates future unread days off the new grace weekday; completed days untouched; coverage exactly once", async () => {
    const plan = await createReadingPlan({ style: "blended", startDate: "2026-10-19", graceWeekday: 0, translation: "BSB" }, data, T0);
    await setDayDone(dayId(plan.id, 0), true, T0);
    await setDayDone(dayId(plan.id, 1), true, T0);
    await setDayDone(dayId(plan.id, 10), true, T0); // read ahead
    await setPortionDone(dayId(plan.id, 3), 0, true, T0); // partly read
    const before = await getPlanDays(plan.id);
    const today = before[2].date; // 2026-10-21 (Wed)
    expect(weekdayOf(today)).toBe(3);

    await changePlanGraceWeekday(plan.id, 3, { today, now: T0 + 1000 });
    expect((await db.readingPlans.get(plan.id))?.graceWeekday).toBe(3);
    const after = await getPlanDays(plan.id);
    expect(after).toHaveLength(312);

    // Completed and partly read days keep date and content.
    const byId = new Map(before.map((d) => [d.id, d]));
    for (const d of after) {
      const old = byId.get(d.id)!;
      if (old.portions.some((p) => p.done)) expect(d).toEqual(old);
      expect(d.portions).toEqual(old.portions);
      expect(d.dayIndex).toBe(old.dayIndex);
    }
    // No future unread day falls on the new grace weekday.
    for (const d of after) {
      if (d.date >= today && !d.portions.some((p) => p.done)) expect(weekdayOf(d.date)).not.toBe(3);
    }
    // Unread days keep their order; one plan day per date; the end date moves by at most a week.
    const unread = after.filter((d) => d.dayIndex >= 0 && !d.portions.some((p) => p.done)).sort((a, b) => a.dayIndex - b.dayIndex);
    for (let i = 1; i < unread.length; i++) expect(unread[i].date > unread[i - 1].date).toBe(true);
    const dates = after.filter((d) => d.dayIndex >= 0).map((d) => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    const lastBefore = before[before.length - 1].date;
    const lastAfter = [...dates].sort().pop()!;
    expect(lastAfter >= lastBefore).toBe(true);
    expect(lastAfter <= addDays(lastBefore, 7)).toBe(true);
    // Every verse still scheduled exactly once.
    const seen = new Map<string, number>();
    for (const d of after) for (const p of d.portions) for (const r of iterateRefs(meta, p.range, true)) {
      const k = toKey(r);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect(seen.size).toBe(31086);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    expect(totalVerses(after)).toBe(31086);
  });

  it("regraceDays moves unread catch-up days to the new grace weekday", () => {
    const portion = { track: "NT" as const, range: { start: { book: "JHN", chapter: 1, verse: 1 }, end: { book: "JHN", chapter: 1, verse: 5 } }, verseCount: 5, done: false };
    const days: ReadingDay[] = [
      { id: "p:0", planId: "p", dayIndex: 0, date: "2026-10-26", portions: [{ ...portion }] },
      { id: "p:catchup:2026-11-01", planId: "p", dayIndex: -1, date: "2026-11-01", portions: [{ ...portion, range: { start: { book: "JHN", chapter: 2, verse: 1 }, end: { book: "JHN", chapter: 2, verse: 5 } } }] },
    ];
    const { days: out, removedIds } = regraceDays(days, "2026-10-25", 3, 1);
    expect(removedIds).toEqual(["p:catchup:2026-11-01"]);
    const cu = out.find((d) => d.dayIndex === -1)!;
    expect(cu.id).toBe("p:catchup:2026-11-04");
    expect(weekdayOf(cu.date)).toBe(3);
    expect(out.find((d) => d.id === "p:0")!.date).toBe("2026-10-26");
  });
});
