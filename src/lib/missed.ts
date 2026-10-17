// Missed reading days (pure). A day is MISSED when its date is before today and it still has an
// unread portion. Completed days (every portion done) are never rewritten by any policy.
//
// Policies (the app asks once, then remembers ReadingPlan.missedPolicy):
//   graceDay  "Catch up on grace day": the unread portions of missed days move to catch-up days on the
//             next grace weekday(s) from today on (PER_GRACE_DAY missed days per grace day). Catch-up
//             days have dayIndex −1 and id `${planId}:catchup:${date}`.
//   spread    "Spread over next 2 weeks": the unread verses of missed days are cut into equal shares and
//             appended as sub-range portions to the next SPREAD_DAYS (12) reading days AFTER today
//             (today's reading is left alone; only future days change).
//   shiftEnd  "Shift end date": every not-completed day from the first missed day on moves forward, the
//             first missed day landing on today, so the plan ends later by the number of missed days.
//             Dates of completed days (e.g. read ahead) are skipped, never doubled up.
// For graceDay and spread the moved portions are removed from the missed day (a missed day whose
// portions all moved has no portions left and counts as complete), so no verse is listed twice.

import type { ReadingDay, ReadingPortion } from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import { addDays, weekdayOf, type ISODate } from "@/lib/isoDate";
import { iterateRefs } from "@/lib/refs";

export type MissedPolicy = "graceDay" | "spread" | "shiftEnd";
export const CATCH_UP_DAY_INDEX = -1;
export const SPREAD_DAYS = 12;
export const PER_GRACE_DAY = 2;

export const isDayComplete = (d: ReadingDay): boolean => d.portions.every((p) => p.done);
export const isCatchUpDay = (d: ReadingDay): boolean => d.dayIndex === CATCH_UP_DAY_INDEX;

const byDate = (a: ReadingDay, b: ReadingDay) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.dayIndex - b.dayIndex);

export function missedDays(days: ReadingDay[], today: ISODate): ReadingDay[] {
  return days.filter((d) => d.date < today && !isDayComplete(d)).sort(byDate);
}

export function missedSummary(days: ReadingDay[], today: ISODate): { days: number; verses: number } {
  const m = missedDays(days, today);
  return { days: m.length, verses: m.reduce((n, d) => n + d.portions.filter((p) => !p.done).reduce((k, p) => k + p.verseCount, 0), 0) };
}

export interface MissedOptions {
  graceWeekday: number | null;
  /** Needed by "spread" to cut ranges at verse level. */
  meta?: BibleMeta;
  now?: number;
  spreadDays?: number;
  perGraceDay?: number;
}

export function applyMissedPolicy(days: ReadingDay[], today: ISODate, policy: MissedPolicy | "ask", opts: MissedOptions): ReadingDay[] {
  const missed = missedDays(days, today);
  if (policy === "ask" || missed.length === 0) return [...days].sort(byDate);
  switch (policy) {
    case "graceDay": return catchUpOnGraceDays(days, today, missed, opts);
    case "spread": return spread(days, today, missed, opts);
    case "shiftEnd": return shiftEnd(days, today, missed, opts);
  }
}

/** Replace days by id in the full list. */
function withReplaced(days: ReadingDay[], changed: Map<string, ReadingDay>, added: ReadingDay[] = []): ReadingDay[] {
  return [...days.map((d) => changed.get(d.id) ?? d), ...added].sort(byDate);
}

function stripUnread(d: ReadingDay, now: number): ReadingDay {
  return { ...d, portions: d.portions.filter((p) => p.done), updatedAt: now };
}

function catchUpOnGraceDays(days: ReadingDay[], today: ISODate, missed: ReadingDay[], opts: MissedOptions): ReadingDay[] {
  const g = opts.graceWeekday;
  if (g === null) throw new Error("No grace weekday is set.");
  const now = opts.now ?? Date.now();
  const per = Math.max(1, opts.perGraceDay ?? PER_GRACE_DAY);
  const planId = missed[0].planId;
  let graceDate = addDays(today, (g - weekdayOf(today) + 7) % 7); // today if today is the grace day

  const changed = new Map<string, ReadingDay>();
  const added: ReadingDay[] = [];
  const existing = new Map(days.filter(isCatchUpDay).map((d) => [d.date, d]));

  for (let i = 0; i < missed.length; i += per) {
    const group = missed.slice(i, i + per);
    const moved: ReadingPortion[] = group.flatMap((d) => d.portions.filter((p) => !p.done));
    for (const d of group) changed.set(d.id, stripUnread(changed.get(d.id) ?? d, now));
    const prev = changed.get(existing.get(graceDate)?.id ?? "") ?? existing.get(graceDate);
    if (prev) {
      changed.set(prev.id, { ...prev, portions: [...prev.portions, ...moved], updatedAt: now });
    } else {
      added.push({ id: `${planId}:catchup:${graceDate}`, planId, dayIndex: CATCH_UP_DAY_INDEX, date: graceDate, portions: moved, updatedAt: now });
    }
    graceDate = addDays(graceDate, 7);
  }
  return withReplaced(days, changed, added);
}

function spread(days: ReadingDay[], today: ISODate, missed: ReadingDay[], opts: MissedOptions): ReadingDay[] {
  if (!opts.meta) throw new Error("spread needs meta");
  const meta = opts.meta;
  const now = opts.now ?? Date.now();
  const n = Math.max(1, opts.spreadDays ?? SPREAD_DAYS);
  const future = days.filter((d) => d.date > today && !isDayComplete(d) && !isCatchUpDay(d)).sort(byDate).slice(0, n);
  const missedIds = new Set(missed.map((d) => d.id));
  // Nothing in the future to spread onto: fall back to the plan's last non-missed day.
  const targets = future.length ? future : [...days].filter((d) => !missedIds.has(d.id)).sort(byDate).slice(-1);
  if (!targets.length) return [...days].sort(byDate);

  // Flatten the unread verses, remembering which portion each came from.
  const verses: { portion: number; track: ReadingPortion["track"]; ref: ReturnType<typeof iterateRefs>[number] }[] = [];
  let pi = 0;
  for (const d of missed) for (const p of d.portions.filter((x) => !x.done)) {
    for (const ref of iterateRefs(meta, p.range, true)) verses.push({ portion: pi, track: p.track, ref });
    pi++;
  }

  // Verse i goes to target day ⌊i · k / V⌋ — equal shares, order preserved.
  const k = targets.length;
  const shares: ReadingPortion[][] = targets.map(() => []);
  let runStart = 0;
  for (let i = 1; i <= verses.length; i++) {
    const day = (x: number) => Math.floor((x * k) / verses.length);
    if (i === verses.length || verses[i].portion !== verses[runStart].portion || day(i) !== day(runStart)) {
      shares[day(runStart)].push({
        track: verses[runStart].track,
        range: { start: verses[runStart].ref, end: verses[i - 1].ref },
        verseCount: i - runStart,
        done: false,
      });
      runStart = i;
    }
  }

  const changed = new Map<string, ReadingDay>();
  for (const d of missed) changed.set(d.id, stripUnread(d, now));
  targets.forEach((d, i) => {
    if (shares[i].length) changed.set(d.id, { ...d, portions: [...d.portions, ...shares[i]], updatedAt: now });
  });
  return withReplaced(days, changed);
}

function shiftEnd(days: ReadingDay[], today: ISODate, missed: ReadingDay[], opts: MissedOptions): ReadingDay[] {
  const now = opts.now ?? Date.now();
  const g = opts.graceWeekday;
  const firstMissed = missed[0].date;
  const toShift = days.filter((d) => d.date >= firstMissed && !isDayComplete(d)).sort(byDate);
  const occupied = new Set(days.filter((d) => d.date >= today && isDayComplete(d) && d.portions.length > 0).map((d) => d.date));

  const changed = new Map<string, ReadingDay>();
  let date = today;
  for (const d of toShift) {
    while ((g !== null && weekdayOf(date) === g) || occupied.has(date)) date = addDays(date, 1);
    if (d.date !== date) changed.set(d.id, { ...d, date, updatedAt: now });
    date = addDays(date, 1);
  }
  return withReplaced(days, changed);
}
