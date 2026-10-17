// Record a finished attempt (verse reviews / passage run / run-through), then the follow-ups:
// mastered check and the streak day. Returns rows for the Summary screen.

import { db } from "@/db/db";
import { recordPassageRun, recordStreakDay, recordVerseReview, reviewsToday } from "@/db/repo";
import type { VerseCard, VerseKey } from "@/db/types";
import { markMasteredIfDone } from "@/lib/planActions";
import { buildQueue } from "@/lib/queue";
import type { Grade } from "@/lib/scoring";
import type { AppGrade } from "@/lib/srs";
import { dayQualifies } from "@/lib/streak";
import { gradeFor } from "./helpers";
import type { DrillOutcome, PracticeVerse, RecordKind } from "./types";

export interface SummaryRow {
  key: VerseKey;
  label: string;
  accuracy: number;
  grade: Grade;
  /** Next due (ms) after recording, when the verse has a card. */
  nextDue?: number;
  note?: string;
}

export interface RecordResult {
  rows: SummaryRow[];
  /** Next due of the passage card after a passage run. */
  passageDue?: number;
  passageGrade?: Grade;
  mastered: boolean;
}

export interface RecordInput {
  planId: string;
  kind: RecordKind;
  verses: PracticeVerse[];
  outcome: DrillOutcome;
  durationMs: number;
  passageCardId?: string;
}

async function cardFor(planId: string, key: VerseKey): Promise<VerseCard | undefined> {
  return db.verseCards.where("[planId+key]").equals([planId, key]).first();
}

export async function recordAttempt(input: RecordInput, now = Date.now()): Promise<RecordResult> {
  const { planId, kind, verses, outcome, durationMs } = input;
  const scored = verses.filter((v) => outcome.perVerse[v.key] !== undefined);
  const grades: Record<VerseKey, AppGrade> = {};
  for (const v of scored) grades[v.key] = gradeFor(outcome.mode, outcome.perVerse[v.key]);
  const perVerseMs = scored.length ? Math.round(durationMs / scored.length) : durationMs;
  const rows: SummaryRow[] = [];
  let passageDue: number | undefined;
  let passageGrade: Grade | undefined;

  if (kind === "passage" && input.passageCardId && scored.length) {
    const accs = scored.map((v) => outcome.perVerse[v.key]);
    const accuracy = accs.reduce((a, b) => a + b, 0) / accs.length;
    const pc = await recordPassageRun(input.passageCardId, grades, { mode: outcome.mode, accuracy, durationMs }, now);
    passageDue = pc.due;
    const log = await db.reviewLogs.where("cardId").equals(pc.id).reverse().sortBy("at");
    passageGrade = log[0]?.grade;
    for (const v of scored) {
      const card = await cardFor(planId, v.key);
      rows.push({
        key: v.key, label: v.label, accuracy: outcome.perVerse[v.key], grade: grades[v.key], nextDue: card?.due,
        note: grades[v.key] <= 1 ? "Back to verse review" : undefined,
      });
    }
  } else {
    for (const v of scored) {
      const accuracy = outcome.perVerse[v.key];
      const grade = grades[v.key];
      const card = await cardFor(planId, v.key);
      if (!card) {
        rows.push({ key: v.key, label: v.label, accuracy, grade, note: "Not started yet" });
        continue;
      }
      if (kind === "runThrough" && grade > 1) {
        rows.push({ key: v.key, label: v.label, accuracy, grade, nextDue: card.due, note: "Keeps its schedule" });
        continue;
      }
      const next = await recordVerseReview(card.id, grade, { mode: outcome.mode, accuracy, durationMs: perVerseMs }, now);
      rows.push({ key: v.key, label: v.label, accuracy, grade, nextDue: next.due });
    }
  }

  const mastered = await markMasteredIfDone(planId, now);
  await updateStreakAfterPractice(now);
  return { rows, passageDue, passageGrade, mastered };
}

/** Streak: the day counts when today's queue is cleared or ≥ 10 graded reviews were logged. */
export async function updateStreakAfterPractice(now = Date.now()): Promise<void> {
  const [plans, verseCards, passageCards, reviews] = await Promise.all([
    db.plans.toArray(), db.verseCards.toArray(), db.passageCards.toArray(), reviewsToday(now),
  ]);
  const queueCleared = buildQueue({ plans, verseCards, passageCards, now }).items.length === 0;
  if (dayQualifies({ queueCleared, reviewsToday: reviews })) await recordStreakDay(true, now);
}
