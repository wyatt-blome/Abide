// Daily reminder as an iCalendar (.ics, RFC 5545) file.
//
// One VEVENT starting on `startDate` at reminderTime (floating local time, so the reminder follows
// the device's time zone), RRULE:FREQ=DAILY, 10 minutes long, with a DISPLAY VALARM at the start.
// Lines end in CRLF, TEXT values escape \ ; , and newlines, and lines longer than 75 octets are
// folded (CRLF + one space) without splitting a UTF-8 character.

import { APP_NAME } from "@/config";
import { todayISO } from "@/lib/isoDate";

export const icsFilename = (appName = APP_NAME): string => `${appName}-daily.ics`;

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold one content line to ≤ 75 octets per physical line. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of Array.from(line)) {
    const b = enc.encode(ch).length;
    // The first physical line holds 75 octets; continuation lines hold 74 after the leading space.
    const limit = out.length === 0 ? 75 : 74;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");

function utcStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export interface DailyIcsOptions {
  /** "HH:MM", 24-hour local time. */
  reminderTime: string;
  /** First day (YYYY-MM-DD); default today (local). */
  startDate?: string;
  /** DTSTAMP time; default now. */
  now?: number;
  appName?: string;
  /** Link back to the app, put in URL and DESCRIPTION. */
  url?: string;
  /** Stable UID; default derived from the app name, so re-importing updates the same event. */
  uid?: string;
  durationMinutes?: number;
}

export function buildDailyIcs(opts: DailyIcsOptions): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(opts.reminderTime);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Invalid reminder time: ${opts.reminderTime}`);
  const appName = opts.appName ?? APP_NAME;
  const now = opts.now ?? Date.now();
  const date = (opts.startDate ?? todayISO(now)).replace(/-/g, "");
  const dtstart = `${date}T${pad(Number(m[1]))}${m[2]}00`;
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const uid = opts.uid ?? `daily-reminder@${slug}.app`;
  const summary = `${appName} \u00B7 daily practice`;
  const description = opts.url ? `Open ${appName}: ${opts.url}` : `Open ${appName}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeText(appName)}//Daily reminder//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${dtstart}`,
    `DURATION:PT${opts.durationMinutes ?? 10}M`,
    "RRULE:FREQ=DAILY",
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(opts.url ? [`URL:${opts.url}`] : []),
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(summary)}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
