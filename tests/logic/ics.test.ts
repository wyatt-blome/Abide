import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/config";
import { buildDailyIcs, escapeText, foldLine, icsFilename } from "@/lib/ics";

describe("ics", () => {
  const ics = buildDailyIcs({ reminderTime: "7:05", startDate: "2026-10-19", now: Date.UTC(2026, 9, 17, 12, 0, 0) });
  it("is a VCALENDAR with a daily VEVENT and VALARM, CRLF endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = ics.split("\r\n");
    for (const l of ["VERSION:2.0", "BEGIN:VEVENT", "RRULE:FREQ=DAILY", "DTSTART:20261019T070500", "DTSTAMP:20261017T120000Z", "BEGIN:VALARM", "ACTION:DISPLAY", "END:VALARM", "END:VEVENT"]) {
      expect(lines).toContain(l);
    }
    expect(lines.some((l) => l.startsWith("UID:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("TRIGGER:"))).toBe(true);
    expect(icsFilename()).toBe(`${APP_NAME}-daily.ics`);
  });
  it("escapes text", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe(String.raw`a\,b\;c\\d\ne`);
  });
  it("folds long lines at 75 octets without splitting characters", () => {
    const long = "DESCRIPTION:" + "é".repeat(100);
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(long);
    const withUrl = buildDailyIcs({ reminderTime: "21:30", url: "https://example.org/" + "x".repeat(120) });
    for (const l of withUrl.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
  it("rejects invalid times", () => {
    expect(() => buildDailyIcs({ reminderTime: "25:00" })).toThrow();
  });
});
