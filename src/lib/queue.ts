// Daily memorization queue (pure).
//
// Order: overdue verse reviews (oldest due first) → verse reviews due today (plan order, then
// passage order) → passage run-throughs due today → new chunks.
//
// "Due today" = due at or before the end of the local day, so cards scheduled N days out come up
// any time on that calendar day and an Again (due +10 min) stays in today's queue.
// "Overdue" = due before the start of the local day.
//
// New chunks: VerseCards are created lazily when a chunk is introduced (see repo.introduceDueChunks),
// with reps = 0. A card with reps = 0 is "new"; its chunk shows as a New item with a cumulative
// build-up: day N learns chunk N, then runs through chunks 1..N.
//
// Pace (per plan, from lastIntroducedAt's local date):
//   daily         → 1 chunk per day
//   everyOtherDay → 1 chunk when ≥ 2 days since the last introduction
//   twicePerDay   → 2 chunks per day (introduced together in the day's batch)
// No chunk is introduced while the plan still has an unlearned new chunk, while > 40 reviews are due
// (auto-pause), or beyond settings.dailyNewLimit chunks per day across all plans.
//
// Time estimate: 25 s per verse review, 60 s per new chunk plus 6 s per run-through verse,
// 6 s per verse of a passage run. Rounded up to whole minutes.

import type { MemoryPlan, PassageCard, VerseCard, VerseKey, VerseRange } from "@/db/types";
import { diffDays, endOfLocalDay, startOfLocalDay, todayISO } from "@/lib/isoDate";
import { fromKey } from "@/lib/refs";
import { review, type AppGrade } from "@/lib/srs";

export const AUTO_PAUSE_THRESHOLD = 40;
export const REVIEW_SECONDS = 25;
export const NEW_CHUNK_SECONDS = 60;
export const RUN_THROUGH_SECONDS_PER_VERSE = 6;
export const PASSAGE_SECONDS_PER_VERSE = 6;

export type QueueItem =
  | { kind: "review"; planId: string; card: VerseCard; overdue: boolean }
  | { kind: "passage"; planId: string; card: PassageCard; keys: VerseKey[] }
  | {
      kind: "new"; planId: string; chunkIndex: number; keys: VerseKey[];
      /** Keys of chunks 1..N for the cumulative run-through (empty for the first chunk). */
      runThrough: VerseKey[];
      cards: VerseCard[];
    };

export interface QueueSummary {
  overdue: number;
  dueToday: number;
  /** overdue + dueToday verse reviews. */
  reviews: number;
  passageRuns: number;
  newChunks: number;
  minutes: number;
  /** New chunks held back because more than AUTO_PAUSE_THRESHOLD reviews are due. */
  newPaused: boolean;
}

export interface DailyQueue { items: QueueItem[]; summary: QueueSummary }

export interface QueueInput {
  plans: MemoryPlan[];
  verseCards: VerseCard[];
  passageCards: PassageCard[];
  now: number;
}

/** Plans whose cards appear in the queue (paused plans are skipped entirely). */
const queueable = (p: MemoryPlan) => p.status !== "paused";

function positionIndex(plan: MemoryPlan): Map<VerseKey, { chunk: number; pos: number }> {
  const m = new Map<VerseKey, { chunk: number; pos: number }>();
  let pos = 0;
  plan.chunks.forEach((c, ci) => c.forEach((k) => m.set(k, { chunk: ci, pos: pos++ })));
  return m;
}

/** Verse reviews due by end of today (reps > 0), across queueable plans. */
export function countDueReviews(input: QueueInput): number {
  const end = endOfLocalDay(input.now);
  const ok = new Set(input.plans.filter(queueable).map((p) => p.id));
  return (
    input.verseCards.filter((c) => ok.has(c.planId) && c.reps > 0 && c.due <= end).length +
    input.passageCards.filter((c) => ok.has(c.planId) && c.due <= end).length
  );
}

export function buildQueue(input: QueueInput): DailyQueue {
  const { plans, verseCards, passageCards, now } = input;
  const dayStart = startOfLocalDay(now);
  const dayEnd = endOfLocalDay(now);
  const planOrder = new Map(plans.map((p, i) => [p.id, i]));
  const byId = new Map(plans.filter(queueable).map((p) => [p.id, p]));
  const pos = new Map([...byId.values()].map((p) => [p.id, positionIndex(p)]));

  const overdue: QueueItem[] = [];
  const due: QueueItem[] = [];
  const newCards = new Map<string, VerseCard[]>(); // `${planId}#${chunk}` → cards

  for (const c of verseCards) {
    const plan = byId.get(c.planId);
    if (!plan) continue;
    if (c.reps === 0) {
      const at = pos.get(plan.id)!.get(c.key);
      if (!at) continue;
      const k = `${plan.id}#${at.chunk}`;
      newCards.set(k, [...(newCards.get(k) ?? []), c]);
      continue;
    }
    if (c.due > dayEnd) continue;
    const item: QueueItem = { kind: "review", planId: plan.id, card: c, overdue: c.due < dayStart };
    (c.due < dayStart ? overdue : due).push(item);
  }

  const cardPos = (it: QueueItem) =>
    it.kind === "review" ? pos.get(it.planId)!.get(it.card.key)?.pos ?? 0 : 0;
  overdue.sort((a, b) => (a as { card: VerseCard }).card.due - (b as { card: VerseCard }).card.due || cardPos(a) - cardPos(b));
  due.sort((a, b) => (planOrder.get(a.planId)! - planOrder.get(b.planId)!) || cardPos(a) - cardPos(b));

  const passages: QueueItem[] = passageCards
    .filter((c) => byId.has(c.planId) && c.due <= dayEnd)
    .sort((a, b) => planOrder.get(a.planId)! - planOrder.get(b.planId)!)
    .map((c) => ({ kind: "passage", planId: c.planId, card: c, keys: byId.get(c.planId)!.chunks.flat() }));

  const news: QueueItem[] = [...newCards.entries()]
    .map(([k, cards]) => {
      const [planId, ci] = k.split("#");
      const plan = byId.get(planId)!;
      const chunkIndex = Number(ci);
      const order = pos.get(planId)!;
      cards.sort((a, b) => order.get(a.key)!.pos - order.get(b.key)!.pos);
      return {
        kind: "new" as const, planId, chunkIndex, cards,
        keys: plan.chunks[chunkIndex],
        runThrough: chunkIndex > 0 ? plan.chunks.slice(0, chunkIndex + 1).flat() : [],
      };
    })
    .sort((a, b) => planOrder.get(a.planId)! - planOrder.get(b.planId)! || a.chunkIndex - b.chunkIndex);

  const items = [...overdue, ...due, ...passages, ...news];
  return { items, summary: summarize(items, countDueReviews(input) > AUTO_PAUSE_THRESHOLD) };
}

export function summarize(items: QueueItem[], newPaused = false): QueueSummary {
  let overdue = 0, dueToday = 0, passageRuns = 0, newChunks = 0, seconds = 0;
  for (const it of items) {
    if (it.kind === "review") {
      if (it.overdue) overdue++; else dueToday++;
      seconds += REVIEW_SECONDS;
    } else if (it.kind === "passage") {
      passageRuns++;
      seconds += it.keys.length * PASSAGE_SECONDS_PER_VERSE;
    } else {
      newChunks++;
      seconds += NEW_CHUNK_SECONDS + it.runThrough.length * RUN_THROUGH_SECONDS_PER_VERSE;
    }
  }
  return {
    overdue, dueToday, reviews: overdue + dueToday, passageRuns, newChunks,
    minutes: Math.ceil(seconds / 60), newPaused,
  };
}

/** "12 due · 1 new · ~9 min" (UI label). */
export function formatSummary(s: QueueSummary): string {
  const parts = [`${s.reviews + s.passageRuns} due`, `${s.newChunks} new`, `~${s.minutes} min`];
  return parts.join(" · ");
}

export interface NewChunkContext {
  /** Reviews due today across all plans (see countDueReviews). */
  dueReviews: number;
  /** Chunks already introduced today across all plans. */
  introducedToday: number;
  dailyNewLimit: number;
  /** The plan still has cards with reps = 0 (its last chunk is not yet learned). */
  pendingNew: boolean;
}

/** How many new chunks this plan may introduce today (0 when paced out, paused, or capped). */
export function newChunksAllowedToday(plan: MemoryPlan, now: number, ctx: NewChunkContext): number {
  if (plan.status !== "active") return 0;
  const remaining = plan.chunks.length - plan.chunksIntroduced;
  if (remaining <= 0) return 0;
  const today = todayISO(now);
  if (plan.startDate && today < plan.startDate) return 0;
  if (ctx.dueReviews > AUTO_PAUSE_THRESHOLD) return 0;
  if (ctx.pendingNew) return 0;
  const last = plan.lastIntroducedAt !== undefined ? todayISO(plan.lastIntroducedAt) : null;
  let pace: number;
  switch (plan.pace) {
    case "daily": pace = last === today ? 0 : 1; break;
    case "everyOtherDay": pace = last !== null && diffDays(last, today) < 2 ? 0 : 1; break;
    case "twicePerDay": pace = last === today ? 0 : 2; break;
  }
  return Math.max(0, Math.min(pace, remaining, ctx.dailyNewLimit - ctx.introducedToday));
}

export const isNewPaused = (dueReviews: number): boolean => dueReviews > AUTO_PAUSE_THRESHOLD;

export interface BuildUpLabel {
  /** Verses being learned today. */
  learning: VerseRange;
  /** Cumulative run-through range (chunk 1 .. N), null on the first chunk. */
  runThrough: VerseRange | null;
}

const keysRange = (keys: VerseKey[]): VerseRange => ({ start: fromKey(keys[0]), end: fromKey(keys[keys.length - 1]) });

/** Data for "Learning v.7–8 · run-through v.1–8". The UI formats it. */
export function buildUpLabel(plan: MemoryPlan, chunkIndex: number): BuildUpLabel {
  const learning = keysRange(plan.chunks[chunkIndex]);
  const runThrough = chunkIndex > 0 ? keysRange(plan.chunks.slice(0, chunkIndex + 1).flat()) : null;
  return { learning, runThrough };
}

/**
 * Passage run-through. Every verse in the run gets a grade; the passage card is reviewed once:
 * the rounded mean of the verse grades, capped at Hard (2) when any verse lapsed (grade 1) — the
 * passage was mostly there, and the weak verse goes back to verse-level review. Each lapsed verse's
 * own card is also reviewed with Again, so it reappears in the verse queue. Verses graded ≥ 2 keep
 * their own schedule. Returns the new passage card and only the verse cards that changed.
 */
export function applyPassageRun(
  passageCard: PassageCard,
  verseCards: VerseCard[],
  perVerseGrades: Record<VerseKey, AppGrade>,
  now: number,
): { passageCard: PassageCard; verseCards: VerseCard[]; passageGrade: AppGrade } {
  const grades = Object.values(perVerseGrades);
  const mean = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 1;
  let passageGrade = Math.min(5, Math.max(1, Math.round(mean))) as AppGrade;
  const anyLapse = grades.some((g) => g <= 1);
  if (anyLapse) passageGrade = Math.min(passageGrade, 2) as AppGrade;
  if (!grades.length) passageGrade = 1;

  const updatedPassage: PassageCard = { ...passageCard, ...review(passageCard, passageGrade, now), updatedAt: now };
  const changed: VerseCard[] = [];
  for (const c of verseCards) {
    const g = perVerseGrades[c.key];
    if (g !== undefined && g <= 1) changed.push({ ...c, ...review(c, 1, now), updatedAt: now });
  }
  return { passageCard: updatedPassage, verseCards: changed, passageGrade };
}
