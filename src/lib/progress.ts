// Memorization progress (pure): verse maturity, plan progress, mastery and the due forecast.
//
// Maturity of a verse card (shared by the plan heatmap and the Progress page):
//   new      – no card yet (chunk not introduced) or never reviewed (reps = 0).
//   learning – reviewed fewer than 2 times, or recently lapsed: the last review was an Again
//              (srs.lastWasAgain: due again within a day, FSRS Again = +10 min).
//   mature   – the scheduled interval (calendar days from lastReviewed to due) or the FSRS
//              stability is ≥ 21 days.
//   young    – everything else: reviewed and passing, interval < 21 days.
// "Known" verses = young or mature.
//
// A plan is mastered when every verse is mature and the last passage run-through was graded ≥ 4.
// Single-chunk plans have no passage card; there the last review of every verse must be ≥ 4.

import type { MemoryPlan, PassageCard, ReviewLog, SrsState, VerseCard, VerseKey } from "@/db/types";
import { addDays, DAY_MS, diffDays, endOfLocalDay, localMidnight, todayISO, type ISODate } from "@/lib/isoDate";
import { lastWasAgain } from "@/lib/srs";

export type Maturity = "new" | "learning" | "young" | "mature";

export const MATURE_DAYS = 21;
export const MASTERED_MIN_GRADE = 4;

export const MATURITY_ORDER: Maturity[] = ["new", "learning", "young", "mature"];

/** UI labels for the heatmap legend. */
export const MATURITY_LABEL: Record<Maturity, string> = {
  new: "New",
  learning: "Learning",
  young: "Young",
  mature: "Mature",
};

/** Scheduled interval in local calendar days (day of due − day of lastReviewed); 0 when never reviewed. */
export function scheduledIntervalDays(card: SrsState): number {
  if (card.lastReviewed === undefined) return 0;
  return Math.max(0, diffDays(todayISO(card.lastReviewed), todayISO(card.due)));
}

export function classifyCard(card: SrsState | undefined | null): Maturity {
  if (!card || card.reps === 0) return "new";
  const interval = scheduledIntervalDays(card);
  const lapsedRecently = lastWasAgain(card);
  if (card.reps < 2 || lapsedRecently) return "learning";
  if (interval >= MATURE_DAYS || card.stability >= MATURE_DAYS) return "mature";
  return "young";
}

export const isKnown = (m: Maturity): boolean => m === "young" || m === "mature";

/** Every verse of a plan, in plan order. */
export const planKeys = (plan: Pick<MemoryPlan, "chunks">): VerseKey[] => plan.chunks.flat();

export interface VerseMaturity { key: VerseKey; maturity: Maturity; card?: VerseCard }

/** Per-verse maturity for a plan (plan order). */
export function planVerseMaturity(plan: Pick<MemoryPlan, "id" | "chunks">, cards: VerseCard[]): VerseMaturity[] {
  const byKey = new Map(cards.filter((c) => c.planId === plan.id).map((c) => [c.key, c]));
  return planKeys(plan).map((key) => {
    const card = byKey.get(key);
    return { key, maturity: classifyCard(card), card };
  });
}

export type MaturityCounts = Record<Maturity, number>;

export function countMaturity(items: { maturity: Maturity }[]): MaturityCounts {
  const out: MaturityCounts = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const i of items) out[i.maturity]++;
  return out;
}

export interface PlanProgress {
  total: number;
  counts: MaturityCounts;
  known: number;
  /** Verse reviews + passage run due by the end of today. */
  dueToday: number;
  /** Verse cards created so far (chunks introduced). */
  introduced: number;
}

export function planProgress(
  plan: Pick<MemoryPlan, "id" | "chunks">,
  verseCards: VerseCard[],
  passageCards: PassageCard[],
  now: number,
): PlanProgress {
  const items = planVerseMaturity(plan, verseCards);
  const counts = countMaturity(items);
  const end = endOfLocalDay(now);
  const due =
    verseCards.filter((c) => c.planId === plan.id && c.reps > 0 && c.due <= end).length +
    passageCards.filter((c) => c.planId === plan.id && c.due <= end).length;
  return {
    total: items.length,
    counts,
    known: counts.young + counts.mature,
    dueToday: due,
    introduced: items.filter((i) => i.card).length,
  };
}

/** Grade of the most recent graded (non-"heard") log for a card, or undefined. */
export function lastGrade(logs: ReviewLog[], cardId: string): number | undefined {
  let best: ReviewLog | undefined;
  for (const l of logs) {
    if (l.cardId !== cardId || l.heard) continue;
    if (!best || l.at > best.at) best = l;
  }
  return best?.grade;
}

export interface MasteryInput {
  plan: Pick<MemoryPlan, "id" | "chunks">;
  verseCards: VerseCard[];
  passageCard?: PassageCard;
  logs: ReviewLog[];
}

/** Every verse mature + last passage run ≥ 4 (single-chunk plans: every verse's last grade ≥ 4). */
export function isPlanMastered({ plan, verseCards, passageCard, logs }: MasteryInput): boolean {
  const items = planVerseMaturity(plan, verseCards);
  if (!items.length || items.some((i) => i.maturity !== "mature")) return false;
  if (plan.chunks.length > 1) {
    if (!passageCard) return false;
    const g = lastGrade(logs, passageCard.id);
    return g !== undefined && g >= MASTERED_MIN_GRADE;
  }
  return items.every((i) => {
    const g = i.card ? lastGrade(logs, i.card.id) : undefined;
    return g !== undefined && g >= MASTERED_MIN_GRADE;
  });
}

export interface ForecastDay { date: ISODate; count: number }

/**
 * Due counts for the next `days` local days (day 0 = today, which also holds everything overdue),
 * from the cards' current due dates only (no simulated future reviews). Cards with reps = 0 (new,
 * not yet learned) are not reviews and are left out.
 */
export function forecastDue(cards: Pick<SrsState, "due" | "reps">[], now: number, days = 30): ForecastDay[] {
  const today = todayISO(now);
  const out: ForecastDay[] = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), count: 0 }));
  if (!days) return out;
  const ends = out.map((d) => localMidnight(addDays(d.date, 1)) - 1);
  for (const c of cards) {
    if (c.reps === 0) continue;
    const i = ends.findIndex((e) => c.due <= e);
    if (i >= 0) out[i].count++;
  }
  return out;
}
