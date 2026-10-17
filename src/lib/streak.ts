// Memorization streak (pure).
//
// A day qualifies when the day's queue was cleared or at least 10 reviews were done.
// The grace weekday (settings.graceWeekday) never breaks a streak: when the gap between the last
// active day and today consists only of grace weekdays, the streak continues. A grace day on which
// the user did practise still counts (+1) like any other day.

import type { Streak } from "@/db/types";
import { addDays, diffDays, weekdayOf, type ISODate } from "@/lib/isoDate";

export const QUALIFYING_REVIEWS = 10;
/** activeDates keeps at most this many recent dates (enough for a year of dots/history). */
export const ACTIVE_DATES_KEPT = 400;

export function dayQualifies(opts: { queueCleared: boolean; reviewsToday: number }): boolean {
  return opts.queueCleared || opts.reviewsToday >= QUALIFYING_REVIEWS;
}

export function emptyStreak(): Streak {
  return { id: "singleton", current: 0, best: 0, activeDates: [], updatedAt: 0 };
}

/** True when every date strictly between a and b is the grace weekday (or there are none). */
function onlyGraceBetween(a: ISODate, b: ISODate, graceWeekday: number | null): boolean {
  for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) {
    if (graceWeekday === null || weekdayOf(d) !== graceWeekday) return false;
  }
  return true;
}

/**
 * Record today. When `qualifies` is false or today was already recorded, the streak is returned
 * unchanged (same object). Otherwise the streak grows if the previous active day connects to today
 * across grace days only, and restarts at 1 if not.
 */
export function updateStreak(streak: Streak, todayISO: ISODate, qualifies: boolean, graceWeekday: number | null, now = Date.now()): Streak {
  if (!qualifies) return streak;
  const last = streak.lastActiveDate;
  if (last === todayISO) return streak;
  if (last && last > todayISO) return streak; // clock went backwards; never rewrite history
  const continues = !!last && onlyGraceBetween(last, todayISO, graceWeekday);
  const current = continues ? streak.current + 1 : 1;
  const activeDates = [...streak.activeDates.filter((d) => d !== todayISO), todayISO].sort().slice(-ACTIVE_DATES_KEPT);
  return { ...streak, current, best: Math.max(streak.best, current), lastActiveDate: todayISO, activeDates, updatedAt: now };
}

/**
 * The streak as it stands today for display: `current` if the last active day still connects to
 * today (today itself may still be pending), else 0.
 */
export function displayStreak(streak: Streak, todayISO: ISODate, graceWeekday: number | null): number {
  const last = streak.lastActiveDate;
  if (!last) return 0;
  if (last === todayISO) return streak.current;
  return onlyGraceBetween(last, todayISO, graceWeekday) ? streak.current : 0;
}

export type DotStatus = "done" | "missed" | "grace" | "today" | "future";
export interface WeekDot { date: ISODate; weekday: number; status: DotStatus }

/**
 * Seven dots for the week containing today (weeks start on `weekStartsOn`, default Monday).
 * done = active that day; today = not yet active today; grace = grace weekday without activity;
 * missed = past day without activity; future = after today.
 */
export function weekDots(streak: Streak, todayISO: ISODate, graceWeekday: number | null, weekStartsOn = 1): WeekDot[] {
  const active = new Set(streak.activeDates);
  const offset = (weekdayOf(todayISO) - weekStartsOn + 7) % 7;
  const start = addDays(todayISO, -offset);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const weekday = weekdayOf(date);
    let status: DotStatus;
    if (active.has(date)) status = "done";
    else if (diffDays(todayISO, date) > 0) status = "future";
    else if (graceWeekday !== null && weekday === graceWeekday) status = "grace";
    else if (date === todayISO) status = "today";
    else status = "missed";
    return { date, weekday, status };
  });
}
