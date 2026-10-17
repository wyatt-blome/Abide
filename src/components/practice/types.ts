import type { PracticeMode, VerseKey, VerseRef } from "@/db/types";

/** A verse in a drill. Empty verses never reach a drill (they are skipped when building targets). */
export interface PracticeVerse {
  key: VerseKey;
  ref: VerseRef;
  text: string;
  /** Short label: "v.3", "5:12" or "Romans 8:28". */
  label: string;
}

export type DrillMode = Exclude<PracticeMode, "handsFree">;

/** Per-verse accuracy (0–1) of one finished attempt. */
export type PerVerseAccuracy = Record<VerseKey, number>;

export interface DrillOutcome {
  mode: DrillMode;
  perVerse: PerVerseAccuracy;
  /** Optional extra line for the summary (e.g. headings score). */
  note?: string;
}

/** What a finished attempt updates. */
export type RecordKind =
  /** Each verse card is graded (verse review). */
  | "verses"
  /** The plan's passage card is graded via recordPassageRun (lapsed verses reschedule). */
  | "passage"
  /** Cumulative run-through of a partly introduced plan: only lapsed verses (grade 1) are re-reviewed. */
  | "runThrough";

export const MODE_LABEL: Record<DrillMode, string> = {
  read: "Read & Listen",
  hide: "Hide words",
  firstLetters: "First letters",
  typeFirst: "Type letters",
  recall: "Full recall",
  speak: "Speak it",
  reference: "Reference",
  headings: "Story of the Passage",
};

/** Modes that show the text (assist) are capped at grade 4 (FSRS "Good"). */
export const ASSISTED_MODES: DrillMode[] = ["read", "hide", "firstLetters"];
