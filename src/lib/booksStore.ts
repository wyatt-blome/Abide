// Books track persistence (BookPlan / BookLog) and UI helpers over lib/books-track.ts.
//
// BookPlan.current = last unit finished. Logging "I'm at page N" keeps ONE log per book per day:
// today's logs are replaced by a single log from (current at start of today + 1) to N, so the
// assignment (which subtracts today's logs) stays put while the user reads. Going below the start
// of today removes today's logs and simply sets current (a correction).
// Date-locked devotionals (Morning and Evening) count one unit per day marked read.

import { db } from "@/db/db";
import type { BookLog, BookPlan } from "@/db/types";
import { newId } from "@/db/repo";
import { addDays, type ISODate } from "@/lib/isoDate";
import {
  formatAssignment, nthReadingDay, paceStatus, todayAssignment, unitsLogged, type Assignment, type PaceStatus,
} from "@/lib/books-track";

export interface NewBookInput {
  title: string;
  author: string;
  edition?: string;
  unit: BookPlan["unit"];
  total: number;
  startDate: ISODate;
  /** Either a target date … */
  targetDate?: ISODate;
  /** … or a fixed amount per reading day (target date derived from it). */
  unitsPerDay?: number;
  classicId?: string;
  dateLocked?: boolean;
  current?: number;
}

/** Target date that a fixed daily amount reaches (6-day weeks). */
export function targetFromUnitsPerDay(total: number, unitsPerDay: number, startDate: ISODate, graceWeekday: number | null): ISODate {
  const days = Math.max(1, Math.ceil(total / Math.max(1, unitsPerDay)));
  return nthReadingDay(startDate, days, graceWeekday);
}

export function buildBookPlan(input: NewBookInput, graceWeekday: number | null, now = Date.now()): BookPlan {
  const total = Math.max(1, Math.round(input.total));
  const upd = input.unitsPerDay && input.unitsPerDay > 0 ? Math.round(input.unitsPerDay) : undefined;
  const targetDate = upd
    ? targetFromUnitsPerDay(total, upd, input.startDate, graceWeekday)
    : input.targetDate ?? addDays(input.startDate, 55);
  return {
    id: newId(),
    title: input.title.trim(),
    author: input.author.trim(),
    edition: input.edition?.trim() || undefined,
    unit: input.unit,
    total,
    current: Math.max(0, Math.min(total, Math.round(input.current ?? 0))),
    startDate: input.startDate,
    targetDate: targetDate < input.startDate ? input.startDate : targetDate,
    unitsPerDay: upd,
    classicId: input.classicId,
    dateLocked: input.dateLocked || undefined,
    status: "active",
    updatedAt: now,
  };
}

export async function createBookPlan(input: NewBookInput, graceWeekday: number | null, now = Date.now()): Promise<BookPlan> {
  const plan = buildBookPlan(input, graceWeekday, now);
  await db.bookPlans.put(plan);
  return plan;
}

export async function updateBookPlan(id: string, patch: Partial<Omit<BookPlan, "id">>, now = Date.now()): Promise<void> {
  await db.transaction("rw", db.bookPlans, async () => {
    const plan = await db.bookPlans.get(id);
    if (!plan) return;
    await db.bookPlans.put({ ...plan, ...patch, id, updatedAt: now });
  });
}

export async function deleteBookPlan(id: string): Promise<void> {
  await db.transaction("rw", db.bookPlans, db.bookLogs, async () => {
    await db.bookLogs.where("bookId").equals(id).delete();
    await db.bookPlans.delete(id);
  });
}

/**
 * Record that the user is now at `newCurrent` (last unit finished) today.
 * Returns the saved plan and today's log (if any).
 */
export async function logProgress(bookId: string, newCurrent: number, today: ISODate, now = Date.now()): Promise<{ plan: BookPlan; log?: BookLog }> {
  return db.transaction("rw", db.bookPlans, db.bookLogs, async () => {
    const plan = await db.bookPlans.get(bookId);
    if (!plan) throw new Error("Book not found");
    const target = Math.max(0, Math.min(plan.total, Math.round(newCurrent)));
    const todays = await db.bookLogs.where("bookId").equals(bookId).filter((l) => l.date === today).toArray();
    const startOfToday = Math.max(0, plan.current - unitsLogged(todays, bookId, today));
    await db.bookLogs.bulkDelete(todays.map((l) => l.id));
    let log: BookLog | undefined;
    if (target > startOfToday) {
      log = { id: todays[0]?.id ?? newId(), bookId, date: today, from: startOfToday + 1, to: target, updatedAt: now };
      await db.bookLogs.put(log);
    }
    const finished = target >= plan.total;
    const next: BookPlan = {
      ...plan,
      current: target,
      status: finished ? "finished" : plan.status === "finished" ? "active" : plan.status,
      updatedAt: now,
    };
    await db.bookPlans.put(next);
    return { plan: next, log };
  });
}

/** Date-locked devotional: mark today's entries read (idempotent per day). */
export async function markDatedRead(bookId: string, today: ISODate, read: boolean, now = Date.now()): Promise<void> {
  await db.transaction("rw", db.bookPlans, db.bookLogs, async () => {
    const plan = await db.bookPlans.get(bookId);
    if (!plan) return;
    const todays = await db.bookLogs.where("bookId").equals(bookId).filter((l) => l.date === today).toArray();
    if (read && todays.length === 0) {
      const n = Math.min(plan.total, plan.current + 1);
      await db.bookLogs.put({ id: newId(), bookId, date: today, from: n, to: n, updatedAt: now });
      await db.bookPlans.put({ ...plan, current: n, updatedAt: now });
    } else if (!read && todays.length > 0) {
      await db.bookLogs.bulkDelete(todays.map((l) => l.id));
      await db.bookPlans.put({ ...plan, current: Math.max(0, plan.current - 1), updatedAt: now });
    }
  });
}

// ---------------------------------------------------------------- UI helpers (pure)

export interface BookTodayView {
  assignment: Assignment | null;
  /** "Today: pp. 112–126" or null when nothing is assigned today. */
  label: string | null;
  pace: PaceStatus;
  /** Units logged today. */
  loggedToday: number;
}

export function bookTodayView(plan: BookPlan, today: ISODate, graceWeekday: number | null, logs: BookLog[]): BookTodayView {
  const assignment = todayAssignment(plan, today, graceWeekday, logs);
  return {
    assignment,
    label: assignment ? `Today: ${formatAssignment(assignment)}` : null,
    pace: paceStatus(plan, today, graceWeekday),
    loggedToday: unitsLogged(logs, plan.id, today),
  };
}

/** "Today: pp. 1–7" for a plan on a date (null on the grace day, before the start, or when finished). */
export function assignmentLabel(plan: BookPlan, today: ISODate, graceWeekday: number | null, logs: BookLog[] = []): string | null {
  return bookTodayView(plan, today, graceWeekday, logs).label;
}

export const UNIT_WORD: Record<BookPlan["unit"], { one: string; many: string }> = {
  pages: { one: "page", many: "pages" },
  chapters: { one: "chapter", many: "chapters" },
  sections: { one: "section", many: "sections" },
};

/** "p. 126", "ch. 4", "§ 12". */
export function unitPosition(unit: BookPlan["unit"], n: number): string {
  return formatAssignment({ from: n, to: n, unit });
}

export function percentRead(plan: Pick<BookPlan, "current" | "total">): number {
  return plan.total > 0 ? Math.min(100, Math.floor((plan.current / plan.total) * 100)) : 0;
}

/** "Behind by 2 days", "Ahead by 1 day", "On pace" (UI label). */
export function bookPaceLabel(p: PaceStatus): string {
  if (p.status === "onPace") return "On pace";
  const n = Math.max(1, Math.round(Math.abs(p.daysBehind)));
  return `${p.status === "behind" ? "Behind" : "Ahead"} by ${n} ${n === 1 ? "day" : "days"}`;
}
