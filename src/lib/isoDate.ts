// Calendar-date helpers over "YYYY-MM-DD" strings.
//
// Calendar arithmetic is done in UTC on the date string itself, so it never drifts across DST
// changes. Only `todayISO` / `startOfLocalDay` / `endOfLocalDay` look at the device's local clock:
// a "day" in the app is the user's local calendar day.

export type ISODate = string; // "YYYY-MM-DD"
export const DAY_MS = 86_400_000;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Parse "YYYY-MM-DD" into a UTC midnight timestamp (for pure calendar arithmetic). */
function utcMs(iso: ISODate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): ISODate {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtcMs(utcMs(s)) === s;
}

/** The local calendar date of a timestamp (default: now). */
export function todayISO(now: number | Date = Date.now()): ISODate {
  const d = typeof now === "number" ? new Date(now) : now;
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromUtcMs(utcMs(iso) + n * DAY_MS);
}

/** b − a in whole calendar days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday (same numbering as Date#getDay and Settings.graceWeekday). */
export function weekdayOf(iso: ISODate): number {
  return new Date(utcMs(iso)).getUTCDay();
}

/** The first date strictly after `iso` that falls on `weekday`. */
export function nextWeekday(iso: ISODate, weekday: number): ISODate {
  const delta = (weekday - weekdayOf(iso) + 7) % 7 || 7;
  return addDays(iso, delta);
}

/** Default reading-plan start: the next Monday after `iso` (a Monday itself rolls to the following week). */
export function nextMonday(iso: ISODate): ISODate {
  return nextWeekday(iso, 1);
}

/** Local midnight of the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Last millisecond of the local day containing `ms`. */
export function endOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Local midnight timestamp of a calendar date. */
export function localMidnight(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Reading dates from `from` (inclusive) onward, skipping the grace weekday.
 * `count` dates are returned.
 */
export function readingDates(from: ISODate, count: number, graceWeekday: number | null): ISODate[] {
  const out: ISODate[] = [];
  let d = from;
  while (out.length < count) {
    if (graceWeekday === null || weekdayOf(d) !== graceWeekday) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** Number of reading (non-grace) days in [from, to] inclusive; 0 when to < from. */
export function countReadingDays(from: ISODate, to: ISODate, graceWeekday: number | null): number {
  const span = diffDays(from, to) + 1;
  if (span <= 0) return 0;
  if (graceWeekday === null) return span;
  const fullWeeks = Math.floor(span / 7);
  let n = fullWeeks * 6;
  const startWd = weekdayOf(from);
  for (let i = 0; i < span % 7; i++) if ((startWd + i) % 7 !== graceWeekday) n++;
  return n;
}
