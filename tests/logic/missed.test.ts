import { describe, expect, it } from "vitest";
import type { ReadingDay } from "@/db/types";
import { applyMissedPolicy, CATCH_UP_DAY_INDEX, isDayComplete, missedDays, missedSummary } from "@/lib/missed";
import { generatePlan } from "@/lib/planGen";
import { iterateRefs, toKey } from "@/lib/refs";
import { weekdayOf } from "@/lib/isoDate";
import { loadHeadings, loadMeta } from "./_data";

const meta = loadMeta();
const base: ReadingDay[] = generatePlan({ style: "blended", meta, headings: loadHeadings(), startDate: "2026-10-19", graceWeekday: 0 })
  .map((d) => ({ id: `p:${d.dayIndex}`, planId: "p", dayIndex: d.dayIndex, date: d.date, portions: d.portions }));

/** Days 0–1 done, day 2 partly done, days 2–4 missed; today = day 5 (2026-10-24, Sat). */
function setup(): { days: ReadingDay[]; today: string } {
  const days = structuredClone(base);
  for (const i of [0, 1]) days[i].portions = days[i].portions.map((p) => ({ ...p, done: true, doneAt: 1 }));
  days[2].portions[0] = { ...days[2].portions[0], done: true, doneAt: 1 };
  return { days, today: days[5].date };
}

const verseMultiset = (days: ReadingDay[]) => {
  const m = new Map<string, number>();
  for (const d of days) for (const p of d.portions) for (const r of iterateRefs(meta, p.range, true)) m.set(toKey(r), (m.get(toKey(r)) ?? 0) + 1);
  return m;
};

describe("missed days", () => {
  it("detects missed days", () => {
    const { days, today } = setup();
    expect(missedDays(days, today).map((d) => d.dayIndex)).toEqual([2, 3, 4]);
    expect(missedSummary(days, today).days).toBe(3);
  });

  it("ask leaves everything unchanged", () => {
    const { days, today } = setup();
    expect(applyMissedPolicy(days, today, "ask", { graceWeekday: 0 })).toEqual(days);
  });

  it("spread: 3 missed days change only future days; completed days unchanged", () => {
    const { days, today } = setup();
    const out = applyMissedPolicy(days, today, "spread", { graceWeekday: 0, meta, now: 5 });
    const byId = new Map(out.map((d) => [d.id, d]));
    expect(out).toHaveLength(days.length);
    for (const d of days) {
      const after = byId.get(d.id)!;
      if (isDayComplete(d)) expect(after).toEqual(d); // completed days never rewritten
      else if (d.date === today) expect(after).toEqual(d); // today untouched
      else if (d.date < today) {
        // missed: only the read portions remain
        expect(after.portions).toEqual(d.portions.filter((p) => p.done));
      } else if (d.dayIndex <= 5 + 12) {
        expect(after.portions.slice(0, d.portions.length)).toEqual(d.portions); // original kept, sub-ranges appended
        expect(after.portions.length).toBeGreaterThan(d.portions.length);
        expect(after.date).toBe(d.date);
      } else expect(after).toEqual(d);
    }
    expect(missedDays(out, today)).toHaveLength(0);
    // Nothing lost, nothing doubled.
    expect(verseMultiset(out)).toEqual(verseMultiset(days));
    // Shares are roughly equal.
    const added = out.filter((d) => d.dayIndex >= 6 && d.dayIndex <= 17).map((d) => d.portions.slice(byIdLen(days, d.id)).reduce((n, p) => n + p.verseCount, 0));
    expect(Math.max(...added) - Math.min(...added)).toBeLessThanOrEqual(1);
  });

  it("graceDay: moves unread portions to catch-up days on the next Sundays", () => {
    const { days, today } = setup();
    const out = applyMissedPolicy(days, today, "graceDay", { graceWeekday: 0, now: 5 });
    const catchUps = out.filter((d) => d.dayIndex === CATCH_UP_DAY_INDEX);
    expect(catchUps.map((d) => d.date)).toEqual(["2026-10-25", "2026-11-01"]);
    for (const c of catchUps) expect(weekdayOf(c.date)).toBe(0);
    for (const d of days.filter(isDayComplete)) expect(out.find((x) => x.id === d.id)).toEqual(d);
    for (const d of days.filter((x) => x.date >= today)) expect(out.find((x) => x.id === d.id)).toEqual(d);
    expect(verseMultiset(out)).toEqual(verseMultiset(days));
    expect(missedDays(out, today)).toHaveLength(0);
  });

  it("shiftEnd: every not-done day moves forward by the missed count; completed days keep their dates", () => {
    const { days, today } = setup();
    const out = applyMissedPolicy(days, today, "shiftEnd", { graceWeekday: 0, now: 5 });
    const byId = new Map(out.map((d) => [d.id, d]));
    for (const d of days.filter(isDayComplete)) expect(byId.get(d.id)).toEqual(d);
    expect(byId.get("p:2")!.date).toBe(today);
    expect(byId.get("p:2")!.portions).toEqual(days[2].portions);
    // Each not-done day lands exactly 3 reading days later than before.
    const order = days.map((d) => d.date);
    for (const d of days.filter((x) => !isDayComplete(x) && x.dayIndex < 300)) {
      expect(byId.get(d.id)!.date).toBe(order[d.dayIndex + 3]);
    }
    expect(out.some((d) => weekdayOf(d.date) === 0)).toBe(false);
    expect(new Set(out.map((d) => d.date)).size).toBe(out.length);
    expect(missedDays(out, today)).toHaveLength(0);
  });
});

function byIdLen(days: ReadingDay[], id: string): number {
  return days.find((d) => d.id === id)!.portions.length;
}
