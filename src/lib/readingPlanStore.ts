// Reading-plan persistence (Dexie) and pure view helpers for the Read / Today screens.
//
// One reading plan at a time: creating a plan replaces the previous one and its days.
// Day ids are `${planId}:${dayIndex}` (catch-up days from lib/missed.ts: `${planId}:catchup:${date}`).
// Missed-day policies are applied with lib/missed.ts; only days whose content actually changed are
// written back, so completed days are never rewritten.

import { db } from "@/db/db";
import type { BsbHeading, ReadingDay, ReadingPlan, ReadingStyle, TranslationId } from "@/db/types";
import { newId } from "@/db/repo";
import type { ChronoRange } from "../../content/plans/chronological";
import { addDays, readingDates, weekdayOf, type ISODate } from "@/lib/isoDate";
import type { BibleMeta } from "@/lib/meta";
import { applyMissedPolicy, isCatchUpDay, isDayComplete, missedDays, type MissedPolicy } from "@/lib/missed";
import { generatePlan, PLAN_DAYS, type GeneratedDay } from "@/lib/planGen";

export interface CreatePlanInput {
  style: ReadingStyle;
  startDate: ISODate;
  graceWeekday: ReadingPlan["graceWeekday"];
  translation: TranslationId;
}

export interface PlanData {
  meta: BibleMeta;
  headings: BsbHeading[];
  chronological: ChronoRange[];
}

export const dayId = (planId: string, dayIndex: number): string => `${planId}:${dayIndex}`;

export function toReadingDays(planId: string, generated: GeneratedDay[], now = Date.now()): ReadingDay[] {
  return generated.map((d) => ({
    id: dayId(planId, d.dayIndex),
    planId,
    dayIndex: d.dayIndex,
    date: d.date,
    portions: d.portions.map((p) => ({ ...p, done: false })),
    updatedAt: now,
  }));
}

/** Generate and store a plan + its 312 days, replacing any existing plan. */
export async function createReadingPlan(input: CreatePlanInput, data: PlanData, now = Date.now()): Promise<ReadingPlan> {
  const generated = generatePlan({
    style: input.style,
    meta: data.meta,
    headings: data.headings,
    chronological: data.chronological,
    startDate: input.startDate,
    graceWeekday: input.graceWeekday,
  });
  const plan: ReadingPlan = {
    id: newId(),
    style: input.style,
    translation: input.translation,
    startDate: input.startDate,
    graceWeekday: input.graceWeekday,
    totalDays: PLAN_DAYS,
    missedPolicy: "ask",
    createdAt: now,
    updatedAt: now,
  };
  const days = toReadingDays(plan.id, generated, now);
  await db.transaction("rw", db.readingPlans, db.readingDays, async () => {
    const old = await db.readingPlans.toArray();
    for (const p of old) await db.readingDays.where("planId").equals(p.id).delete();
    await db.readingPlans.clear();
    await db.readingPlans.put(plan);
    await db.readingDays.bulkPut(days);
  });
  return plan;
}

export async function deleteReadingPlan(planId: string): Promise<void> {
  await db.transaction("rw", db.readingPlans, db.readingDays, async () => {
    await db.readingDays.where("planId").equals(planId).delete();
    await db.readingPlans.delete(planId);
  });
}

/** The current plan (latest created) from a list. */
export function pickCurrentPlan(plans: ReadingPlan[] | undefined): ReadingPlan | undefined {
  if (!plans?.length) return undefined;
  return [...plans].sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function getCurrentPlan(): Promise<ReadingPlan | undefined> {
  return pickCurrentPlan(await db.readingPlans.toArray());
}

export async function getPlanDays(planId: string): Promise<ReadingDay[]> {
  return sortDays(await db.readingDays.where("planId").equals(planId).toArray());
}

export async function updateReadingPlan(planId: string, patch: Partial<Omit<ReadingPlan, "id">>, now = Date.now()): Promise<void> {
  await db.readingPlans.update(planId, { ...patch, updatedAt: now });
}

export async function setPortionDone(id: string, portionIndex: number, done: boolean, now = Date.now()): Promise<void> {
  await db.transaction("rw", db.readingDays, async () => {
    const day = await db.readingDays.get(id);
    if (!day || !day.portions[portionIndex]) return;
    const portions = day.portions.map((p, i) =>
      i === portionIndex ? (done ? { ...p, done: true, doneAt: now } : { ...p, done: false, doneAt: undefined }) : p,
    );
    await db.readingDays.put({ ...day, portions, updatedAt: now });
  });
}

export async function setDayDone(id: string, done: boolean, now = Date.now()): Promise<void> {
  await db.transaction("rw", db.readingDays, async () => {
    const day = await db.readingDays.get(id);
    if (!day) return;
    const portions = day.portions.map((p) =>
      done ? (p.done ? p : { ...p, done: true, doneAt: now }) : { ...p, done: false, doneAt: undefined },
    );
    await db.readingDays.put({ ...day, portions, updatedAt: now });
  });
}

const sameDay = (a: ReadingDay, b: ReadingDay) =>
  a.date === b.date && a.dayIndex === b.dayIndex && JSON.stringify(a.portions) === JSON.stringify(b.portions);

/**
 * Apply a missed-day policy to a stored plan and write back only changed or new days.
 * `remember` stores the choice as the plan's missedPolicy.
 */
export async function applyMissedToPlan(
  planId: string,
  policy: MissedPolicy,
  opts: { meta: BibleMeta; today: ISODate; now?: number; remember?: boolean },
): Promise<{ written: number }> {
  const now = opts.now ?? Date.now();
  return db.transaction("rw", db.readingPlans, db.readingDays, async () => {
    const plan = await db.readingPlans.get(planId);
    if (!plan) return { written: 0 };
    const days = await db.readingDays.where("planId").equals(planId).toArray();
    const before = new Map(days.map((d) => [d.id, d]));
    const after = applyMissedPolicy(days, opts.today, policy, { graceWeekday: plan.graceWeekday, meta: opts.meta, now });
    const changed = after.filter((d) => {
      const old = before.get(d.id);
      return !old || !sameDay(old, d);
    });
    if (changed.length) await db.readingDays.bulkPut(changed);
    if (opts.remember && plan.missedPolicy !== policy) await db.readingPlans.put({ ...plan, missedPolicy: policy, updatedAt: now });
    return { written: changed.length };
  });
}

// ---------------------------------------------------------------- pure view helpers

export function sortDays(days: ReadingDay[]): ReadingDay[] {
  return [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.dayIndex - b.dayIndex));
}

/** Days scheduled on a date: the plan day first, then catch-up days. */
export function daysOn(days: ReadingDay[], date: ISODate): ReadingDay[] {
  return days
    .filter((d) => d.date === date && d.portions.length > 0)
    .sort((a, b) => Number(isCatchUpDay(a)) - Number(isCatchUpDay(b)) || a.dayIndex - b.dayIndex);
}

export const isGraceDate = (plan: Pick<ReadingPlan, "graceWeekday">, date: ISODate): boolean => weekdayOf(date) === plan.graceWeekday;

/** Estimated minutes for a number of verses (at least 1 when there is anything to read). */
export function estMinutes(verses: number, versesPerMin: number): number {
  if (verses <= 0) return 0;
  return Math.max(1, Math.round(verses / Math.max(1, versesPerMin)));
}

export const unreadVerses = (days: ReadingDay[]): number =>
  days.reduce((n, d) => n + d.portions.filter((p) => !p.done).reduce((k, p) => k + p.verseCount, 0), 0);

export const totalVerses = (days: ReadingDay[]): number =>
  days.reduce((n, d) => n + d.portions.reduce((k, p) => k + p.verseCount, 0), 0);

export interface PlanStats {
  totalVerses: number;
  doneVerses: number;
  /** 0–100, whole number. */
  percent: number;
  /** Past days with unread portions. */
  behindDays: number;
  /** Future plan days already completed. */
  aheadDays: number;
  /** aheadDays − behindDays. */
  net: number;
  /** Last date with a scheduled reading. */
  lastDate: ISODate | null;
  /** lastDate pushed out by the days behind (on reading days). */
  projectedFinish: ISODate | null;
  completeDays: number;
  planDays: number;
}

export function planStats(plan: Pick<ReadingPlan, "graceWeekday">, days: ReadingDay[], today: ISODate): PlanStats {
  const total = totalVerses(days);
  const done = days.reduce((n, d) => n + d.portions.filter((p) => p.done).reduce((k, p) => k + p.verseCount, 0), 0);
  const behindDays = missedDays(days, today).length;
  const aheadDays = days.filter((d) => d.date > today && !isCatchUpDay(d) && d.portions.length > 0 && isDayComplete(d)).length;
  const scheduled = days.filter((d) => d.portions.length > 0).map((d) => d.date).sort();
  const lastDate = scheduled.length ? scheduled[scheduled.length - 1] : null;
  let projectedFinish = lastDate;
  if (lastDate && behindDays > 0) {
    const extra = readingDates(addDays(lastDate, 1), behindDays, plan.graceWeekday);
    projectedFinish = extra[extra.length - 1];
  }
  const planDays = days.filter((d) => !isCatchUpDay(d));
  return {
    totalVerses: total,
    doneVerses: done,
    percent: total ? Math.floor((done / total) * 100) : 0,
    behindDays,
    aheadDays,
    net: aheadDays - behindDays,
    lastDate,
    projectedFinish,
    completeDays: planDays.filter((d) => d.portions.length > 0 && isDayComplete(d)).length,
    planDays: planDays.length,
  };
}

/** "On pace", "Ahead by 2 days", "Behind by 1 day" (UI label). */
export function paceLabel(net: number): string {
  if (net === 0) return "On pace";
  const n = Math.abs(net);
  return `${net > 0 ? "Ahead" : "Behind"} by ${n} ${n === 1 ? "day" : "days"}`;
}
