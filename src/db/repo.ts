// Small data helpers over Dexie: settings/streak singletons, updatedAt stamping, derived verseKeys,
// memory-plan creation and lazy chunk introduction.
//
// VerseCards are created LAZILY: a plan stores its chunks; `introduceDueChunks` creates the cards for
// the next chunk(s) when pace allows (reps = 0 → shown as a New item). This keeps the queue honest
// (no hundreds of "new" cards for Matthew 5–7) and lets pace/auto-pause decide day by day.
// When the last chunk is introduced, a PassageCard (full run-through) is created, first due
// tomorrow; single-chunk plans get no passage card (the verse cards are the whole passage).

import { db, TABLE_NAMES } from "@/db/db";
import type {
  LinkOut, MemoryPlan, PassageCard, PracticeMode, ReviewLog, Settings, Streak, TranslationId, UserNote,
  VerseCard, VerseKey, VerseRange,
} from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import { chunkPassage, DEFAULT_CHUNK_SIZE, type ChunkVerse } from "@/lib/chunking";
import { addDays, localMidnight, todayISO } from "@/lib/isoDate";
import { countDueReviews, newChunksAllowedToday, applyPassageRun } from "@/lib/queue";
import { keysCovered } from "@/lib/refs";
import { newState, review, type AppGrade } from "@/lib/srs";
import { emptyStreak, updateStreak } from "@/lib/streak";

export const newId = (): string => crypto.randomUUID();

export const DEFAULT_SETTINGS: Settings = {
  id: "singleton",
  translation: "BSB",
  fontScale: 1,
  theme: "system",
  ttsRate: 1,
  handsFreePauseSec: 8,
  reminderTime: "07:00",
  graceWeekday: 0,
  readingVersesPerMin: 7,
  enabledPacks: [],
  dailyNewLimit: 3,
  updatedAt: 0,
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get("singleton");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), id: "singleton" };
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<Settings> {
  return db.transaction("rw", db.settings, async () => {
    const next: Settings = { ...(await getSettings()), ...patch, id: "singleton", updatedAt: Date.now() };
    await db.settings.put(next);
    return next;
  });
}

export async function getStreak(): Promise<Streak> {
  return (await db.streak.get("singleton")) ?? emptyStreak();
}

/** Record today's activity on the streak (see lib/streak.ts for the rules). */
export async function recordStreakDay(qualifies: boolean, now = Date.now()): Promise<Streak> {
  return db.transaction("rw", db.streak, db.settings, async () => {
    const [streak, settings] = await Promise.all([getStreak(), getSettings()]);
    const next = updateStreak(streak, todayISO(now), qualifies, settings.graceWeekday, now);
    if (next !== streak) await db.streak.put(next);
    return next;
  });
}

/** Put a record, stamping updatedAt = now. */
export async function put<T extends { updatedAt?: number }>(
  table: { put(obj: T): Promise<unknown> },
  obj: T,
  now = Date.now(),
): Promise<T> {
  const stamped = { ...obj, updatedAt: now };
  await table.put(stamped);
  return stamped;
}

// ---------------------------------------------------------------- notes & link-outs

export type UserNoteInput = Omit<UserNote, "id" | "createdAt" | "updatedAt" | "verseKeys"> & {
  id?: string; createdAt?: number;
};

export async function saveUserNote(input: UserNoteInput, meta: BibleMeta, now = Date.now()): Promise<UserNote> {
  const note: UserNote = {
    ...input,
    id: input.id ?? newId(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    verseKeys: keysCovered(meta, input.verseRanges),
  };
  await db.userNotes.put(note);
  return note;
}

export type LinkOutInput = Omit<LinkOut, "id" | "createdAt" | "updatedAt" | "verseKeys"> & {
  id?: string; createdAt?: number;
};

/** Throws unless the link has a stated reference and at least one verse range. */
export function validateLinkOut(input: Pick<LinkOut, "statedReference" | "verseRanges">): void {
  if (!input.statedReference || !input.statedReference.trim()) {
    throw new Error("A link needs the reference as stated on the page.");
  }
  if (!Array.isArray(input.verseRanges) || input.verseRanges.length < 1) {
    throw new Error("A link needs at least one verse range.");
  }
}

export async function saveLinkOut(input: LinkOutInput, meta: BibleMeta, now = Date.now()): Promise<LinkOut> {
  validateLinkOut(input);
  const link: LinkOut = {
    ...input,
    statedReference: input.statedReference.trim(),
    id: input.id ?? newId(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    verseKeys: keysCovered(meta, input.verseRanges),
  };
  await db.linkOuts.put(link);
  return link;
}

// ---------------------------------------------------------------- memory plans

export interface CreateMemoryPlanOptions {
  title: string;
  range: VerseRange;
  translation: TranslationId;
  pace: MemoryPlan["pace"];
  starterId?: string;
  /** YYYY-MM-DD; default today. */
  startDate?: string;
  /** Verses per chunk, 1–3 (default 2). */
  chunkSize?: number;
}

export interface PassageData {
  /** Every verse of the range in order, with its text in the plan's translation ("" = no text). */
  verses: ChunkVerse[];
  /** VerseKeys where a BSB heading starts. */
  headingStarts?: Set<VerseKey> | VerseKey[];
  /** BSB empty verses (meta.emptyVerses.BSB), skipped even when another translation has text. */
  emptyKeys?: Set<VerseKey> | VerseKey[];
}

/** Create a plan (chunks computed now), then introduce today's chunk(s) if pace allows. */
export async function createMemoryPlan(opts: CreateMemoryPlanOptions, data: PassageData, now = Date.now()): Promise<MemoryPlan> {
  const chunks = chunkPassage(data.verses, data.headingStarts, opts.chunkSize ?? DEFAULT_CHUNK_SIZE, data.emptyKeys);
  if (!chunks.length) throw new Error("The passage has no verses to learn.");
  const plan: MemoryPlan = {
    id: newId(),
    title: opts.title,
    translation: opts.translation,
    range: opts.range,
    chunks,
    chunksIntroduced: 0,
    pace: opts.pace,
    status: "active",
    starterId: opts.starterId,
    createdAt: now,
    updatedAt: now,
    startDate: opts.startDate ?? todayISO(now),
  };
  await db.plans.put(plan);
  await introduceDueChunks(now);
  return (await db.plans.get(plan.id)) ?? plan;
}

/**
 * Introduce today's new chunks across active plans (oldest plan first), creating their VerseCards.
 * Idempotent within a day. Respects pace, the > 40 due auto-pause and settings.dailyNewLimit.
 * "Introduced today" for the daily limit counts each plan introduced today as its pace batch
 * (1, or 2 for twicePerDay), since introduction happens in one batch per plan per day.
 */
export async function introduceDueChunks(now = Date.now()): Promise<{ planId: string; chunkIndex: number }[]> {
  return db.transaction("rw", [db.plans, db.verseCards, db.passageCards, db.settings], async () => {
    const [settings, plans, verseCards, passageCards] = await Promise.all([
      getSettings(), db.plans.toArray(), db.verseCards.toArray(), db.passageCards.toArray(),
    ]);
    plans.sort((a, b) => a.createdAt - b.createdAt);
    const today = todayISO(now);
    const dueReviews = countDueReviews({ plans, verseCards, passageCards, now });
    let introducedToday = plans
      .filter((p) => p.lastIntroducedAt !== undefined && todayISO(p.lastIntroducedAt) === today)
      .reduce((n, p) => n + (p.pace === "twicePerDay" ? 2 : 1), 0);

    const introduced: { planId: string; chunkIndex: number }[] = [];
    for (const plan of plans) {
      const planCards = verseCards.filter((c) => c.planId === plan.id);
      const allowed = newChunksAllowedToday(plan, now, {
        dueReviews, introducedToday, dailyNewLimit: settings.dailyNewLimit, pendingNew: planCards.some((c) => c.reps === 0),
      });
      if (allowed <= 0) continue;
      const existing = new Set(planCards.map((c) => c.key));
      const next: MemoryPlan = { ...plan };
      for (let i = 0; i < allowed; i++) {
        const chunkIndex = next.chunksIntroduced;
        const cards: VerseCard[] = next.chunks[chunkIndex]
          .filter((k) => !existing.has(k))
          .map((key) => ({ id: newId(), planId: plan.id, key, ...newState(now), updatedAt: now }));
        await db.verseCards.bulkPut(cards);
        next.chunksIntroduced++;
        introduced.push({ planId: plan.id, chunkIndex });
      }
      next.lastIntroducedAt = now;
      next.updatedAt = now;
      introducedToday += allowed;
      await db.plans.put(next);

      const finished = next.chunksIntroduced >= next.chunks.length;
      if (finished && next.chunks.length > 1 && !passageCards.some((p) => p.planId === plan.id)) {
        const card: PassageCard = {
          id: newId(), planId: plan.id, ...newState(now), due: localMidnight(addDays(today, 1)), updatedAt: now,
        };
        await db.passageCards.put(card);
      }
    }
    return introduced;
  });
}

export interface ReviewMeta { mode: PracticeMode; accuracy: number; durationMs: number }

/** Grade a verse card (FSRS) and log the review. */
export async function recordVerseReview(cardId: string, grade: AppGrade, info: ReviewMeta, now = Date.now()): Promise<VerseCard> {
  return db.transaction("rw", db.verseCards, db.reviewLogs, async () => {
    const card = await db.verseCards.get(cardId);
    if (!card) throw new Error(`No verse card ${cardId}`);
    const next: VerseCard = { ...card, ...review(card, grade, now), updatedAt: now };
    await db.verseCards.put(next);
    const log: ReviewLog = { id: newId(), cardId, cardType: "verse", grade, at: now, ...info };
    await db.reviewLogs.put(log);
    return next;
  });
}

/** A Hands-Free "heard" log: no grade effect, the card stays due. */
export async function recordHeard(cardId: string, cardType: "verse" | "passage", durationMs: number, now = Date.now()): Promise<void> {
  await db.reviewLogs.put({ id: newId(), cardId, cardType, mode: "handsFree", grade: 1, accuracy: 0, durationMs, at: now, heard: true });
}

/** Grade a passage run-through (see queue.applyPassageRun) and log it. */
export async function recordPassageRun(
  passageCardId: string,
  perVerseGrades: Record<VerseKey, AppGrade>,
  info: ReviewMeta,
  now = Date.now(),
): Promise<PassageCard> {
  return db.transaction("rw", db.passageCards, db.verseCards, db.reviewLogs, async () => {
    const pc = await db.passageCards.get(passageCardId);
    if (!pc) throw new Error(`No passage card ${passageCardId}`);
    const cards = await db.verseCards.where("planId").equals(pc.planId).toArray();
    const res = applyPassageRun(pc, cards, perVerseGrades, now);
    await db.passageCards.put(res.passageCard);
    if (res.verseCards.length) await db.verseCards.bulkPut(res.verseCards);
    await db.reviewLogs.put({ id: newId(), cardId: pc.id, cardType: "passage", grade: res.passageGrade, at: now, ...info });
    return res.passageCard;
  });
}

/** Number of graded (non-"heard") reviews logged today. */
export async function reviewsToday(now = Date.now()): Promise<number> {
  const start = localMidnight(todayISO(now));
  return db.reviewLogs.where("at").aboveOrEqual(start).filter((l) => !l.heard).count();
}

/** Delete every record in every table (including the library cache). */
export async function clearAllData(): Promise<void> {
  await db.transaction("rw", TABLE_NAMES.map((t) => db.table(t)), async () => {
    await Promise.all(TABLE_NAMES.map((t) => db.table(t).clear()));
  });
}
