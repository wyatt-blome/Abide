// Book pacing over 6-day weeks (the grace weekday is a day off). Pure.
//
// BookPlan.current = last unit finished (0 = not started), units are numbered 1..total.
// Daily amount: unitsPerDay when set, otherwise ⌈remaining at start of today ÷ reading days left
// through targetDate⌉, recomputed every day, so the pace self-corrects (300 pages over 8 weeks
// → 48 reading days → a mix of 7- and 6-page days).
// "At start of today" = current minus what today's logs recorded, so the assignment does not move
// while the user is reading.

import type { BookLog, BookPlan } from "@/db/types";
import { addDays, countReadingDays, weekdayOf, type ISODate } from "@/lib/isoDate";

export interface Assignment {
  /** null on the grace day, before the start date, or when the book is finished. */
  from: number;
  to: number;
  unit: BookPlan["unit"];
  perDay: number;
  /** Today's assignment already read. */
  done: boolean;
}

const isGrace = (d: ISODate, g: number | null) => g !== null && weekdayOf(d) === g;

/** Units recorded in logs for a date. */
export function unitsLogged(logs: BookLog[], bookId: string, date: ISODate): number {
  return logs.filter((l) => l.bookId === bookId && l.date === date).reduce((n, l) => n + Math.max(0, l.to - l.from + 1), 0);
}

/** Reading days from `today` through the target date (inclusive), at least 1. */
export function readingDaysLeft(plan: BookPlan, today: ISODate, graceWeekday: number | null): number {
  return Math.max(1, countReadingDays(today, plan.targetDate, graceWeekday));
}

/** Units per day needed from today to finish by the target date. */
export function perDayToTarget(plan: BookPlan, today: ISODate, graceWeekday: number | null, currentAtStart = plan.current): number {
  const remaining = Math.max(0, plan.total - currentAtStart);
  if (remaining === 0) return 0;
  return Math.ceil(remaining / readingDaysLeft(plan, today, graceWeekday));
}

export function todayAssignment(plan: BookPlan, today: ISODate, graceWeekday: number | null, logs: BookLog[] = []): Assignment | null {
  if (plan.status !== "active") return null;
  if (today < plan.startDate || isGrace(today, graceWeekday)) return null;
  const startCurrent = Math.max(0, plan.current - unitsLogged(logs, plan.id, today));
  if (startCurrent >= plan.total) return null;
  const perDay = plan.unitsPerDay && plan.unitsPerDay > 0 ? Math.ceil(plan.unitsPerDay) : perDayToTarget(plan, today, graceWeekday, startCurrent);
  const from = startCurrent + 1;
  const to = Math.min(plan.total, startCurrent + Math.max(1, perDay));
  return { from, to, unit: plan.unit, perDay, done: plan.current >= to };
}

/** "pp. 112–126", "p. 112", "ch. 3–4", "§ 5" — UI label for an assignment. */
export function formatAssignment(a: Pick<Assignment, "from" | "to" | "unit">): string {
  const span = a.from === a.to ? `${a.from}` : `${a.from}–${a.to}`;
  switch (a.unit) {
    case "pages": return `${a.from === a.to ? "p." : "pp."} ${span}`;
    case "chapters": return `ch. ${span}`;
    case "sections": return `§ ${span}`;
  }
}

export interface PaceStatus {
  status: "ahead" | "onPace" | "behind";
  /** Units the plan expected to be finished by the end of yesterday. */
  expected: number;
  /** Positive = reading days behind, negative = ahead (in units of the ideal per-day pace). */
  daysBehind: number;
}

/**
 * Off-pace detection against the straight line from (startDate, 0) to (targetDate, total) over
 * reading days. Within one day's worth of the line is "onPace".
 */
export function paceStatus(plan: BookPlan, today: ISODate, graceWeekday: number | null): PaceStatus {
  const totalDays = Math.max(1, countReadingDays(plan.startDate, plan.targetDate, graceWeekday));
  const ideal = plan.total / totalDays;
  const elapsed = Math.min(totalDays, countReadingDays(plan.startDate, addDays(today, -1), graceWeekday));
  const expected = Math.min(plan.total, ideal * elapsed);
  const daysBehind = ideal > 0 ? (expected - plan.current) / ideal : 0;
  const status = daysBehind > 1 ? "behind" : daysBehind < -1 ? "ahead" : "onPace";
  return { status, expected: Math.round(expected), daysBehind: Math.round(daysBehind * 10) / 10 };
}

/** Recompute to keep the target date: clears a fixed unitsPerDay and returns the new daily amount. */
export function recomputeToTarget(plan: BookPlan, today: ISODate, graceWeekday: number | null): { plan: BookPlan; perDay: number } {
  const next: BookPlan = { ...plan, unitsPerDay: undefined };
  return { plan: next, perDay: perDayToTarget(next, today, graceWeekday) };
}

/** The date of the n-th reading day counting today as the first (n ≥ 1). */
export function nthReadingDay(today: ISODate, n: number, graceWeekday: number | null): ISODate {
  let d = today;
  let count = 0;
  for (;;) {
    if (!isGrace(d, graceWeekday)) {
      count++;
      if (count >= n) return d;
    }
    d = addDays(d, 1);
  }
}

/**
 * Propose a new target date that keeps a given daily amount (default: unitsPerDay, else the pace the
 * user has actually kept since the start date, else the original plan pace).
 */
export function proposeTarget(plan: BookPlan, today: ISODate, graceWeekday: number | null, perDay?: number): ISODate {
  const remaining = Math.max(0, plan.total - plan.current);
  let pace = perDay ?? plan.unitsPerDay;
  if (!pace || pace <= 0) {
    const daysSoFar = countReadingDays(plan.startDate, addDays(today, -1), graceWeekday);
    pace = daysSoFar > 0 && plan.current > 0
      ? plan.current / daysSoFar
      : plan.total / Math.max(1, countReadingDays(plan.startDate, plan.targetDate, graceWeekday));
  }
  if (remaining === 0) return today;
  return nthReadingDay(today, Math.ceil(remaining / pace), graceWeekday);
}
