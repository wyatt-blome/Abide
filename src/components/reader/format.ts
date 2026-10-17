// UI formatting helpers (labels only).

import type { ReadingPortion, ReadingStyle } from "@/db/types";
import type { ISODate } from "@/lib/isoDate";

function localDate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Mon, Oct 19". */
export function formatDate(iso: ISODate): string {
  return localDate(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "Monday, October 19, 2026". */
export function formatDateLong(iso: ISODate): string {
  return localDate(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const TRACK_LABEL: Record<ReadingPortion["track"], string> = {
  OT: "Old Testament",
  NT: "New Testament",
  PP: "Psalms & Proverbs",
  ALL: "Reading",
};

export const STYLE_LABEL: Record<ReadingStyle, string> = {
  blended: "Blended",
  canonical: "Canonical",
  chronological: "Chronological",
};

export const STYLE_HELP: Record<ReadingStyle, string> = {
  blended: "Old Testament, New Testament, and Psalms or Proverbs every day.",
  canonical: "Genesis to Revelation in order.",
  chronological: "Roughly in the order events happened.",
};

export const minutesLabel = (m: number): string => (m <= 0 ? "" : `about ${m} min`);
