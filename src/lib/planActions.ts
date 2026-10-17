// Memory-plan actions used by the Memorize UI: loading passage data for chunking, the "Ad hoc" plan
// ("Memorize this" from the reader), pause/resume/delete and the mastered check.
//
// Ad hoc plan: one plan (starterId = AD_HOC_ID) collects verses picked while reading. Adding a range
// appends chunks for verses not already in it (heading-aware, same chunk rules as a new plan) and
// moves the plan's startDate to tomorrow, so the new verses start tomorrow; existing cards keep
// their schedules. A mastered Ad hoc plan becomes active again when verses are added.

import { db } from "@/db/db";
import { createMemoryPlan, type PassageData } from "@/db/repo";
import type { MemoryPlan, TranslationId, VerseKey, VerseRange } from "@/db/types";
import { getRangeVerses, headingsInRange, loadHeadings, loadMeta, type BundledTranslation } from "@/lib/bible";
import { chunkPassage, DEFAULT_CHUNK_SIZE, headingStartKeys, type ChunkVerse } from "@/lib/chunking";
import { addDays, todayISO, type ISODate } from "@/lib/isoDate";
import { isPlanMastered } from "@/lib/progress";
import { compareRefs } from "@/lib/refs";

export const AD_HOC_ID = "ad-hoc";
export const AD_HOC_TITLE = "Ad hoc";

/** Memory plans use bundled text; ESV (BYOK, not stored offline) falls back to the BSB. */
export function bundledTranslation(t: TranslationId | undefined): BundledTranslation {
  return t === "WEB" || t === "KJV" ? t : "BSB";
}

export const tomorrowISO = (now = Date.now()): ISODate => addDays(todayISO(now), 1);

/** Verses (with text), heading starts and BSB empty verses for a range — input for chunking. */
export async function loadPassageData(range: VerseRange, translation: TranslationId): Promise<PassageData & { verses: ChunkVerse[] }> {
  const [verses, headings, meta] = await Promise.all([
    getRangeVerses(bundledTranslation(translation), range),
    loadHeadings(),
    loadMeta(),
  ]);
  return {
    verses: verses.map((v) => ({ key: v.key, text: v.text })),
    headingStarts: headingStartKeys(headingsInRange(headings, range)),
    emptyKeys: meta.emptyVerses.BSB,
  };
}

/** Chunks for the verses of `data` that the plan does not have yet (pure). */
export function chunksToAppend(
  plan: Pick<MemoryPlan, "chunks">,
  data: PassageData,
  chunkSize = DEFAULT_CHUNK_SIZE,
): { chunks: VerseKey[][]; skipped: VerseKey[] } {
  const have = new Set(plan.chunks.flat());
  const skipped = data.verses.filter((v) => have.has(v.key)).map((v) => v.key);
  const fresh = data.verses.filter((v) => !have.has(v.key));
  return { chunks: chunkPassage(fresh, data.headingStarts, chunkSize, data.emptyKeys), skipped };
}

function unionRange(a: VerseRange, b: VerseRange): VerseRange {
  return {
    start: compareRefs(a.start, b.start) <= 0 ? a.start : b.start,
    end: compareRefs(a.end, b.end) >= 0 ? a.end : b.end,
  };
}

export async function findAdHocPlan(): Promise<MemoryPlan | undefined> {
  const plans = await db.plans.toArray();
  return plans.find((p) => p.starterId === AD_HOC_ID);
}

export interface AddResult {
  plan: MemoryPlan;
  /** Verses added as new chunks. */
  added: number;
  /** Verses already in the plan (left as they are). */
  skipped: number;
  created: boolean;
}

export interface AddOptions {
  translation: TranslationId;
  chunkSize?: number;
  pace?: MemoryPlan["pace"];
}

/** Add a range to the Ad hoc plan (created on first use), starting tomorrow. */
export async function addToAdHocPlan(range: VerseRange, data: PassageData, opts: AddOptions, now = Date.now()): Promise<AddResult> {
  const existing = await findAdHocPlan();
  const startDate = tomorrowISO(now);
  if (!existing) {
    const plan = await createMemoryPlan(
      {
        title: AD_HOC_TITLE, range, translation: opts.translation, pace: opts.pace ?? "daily",
        starterId: AD_HOC_ID, startDate, chunkSize: opts.chunkSize,
      },
      data,
      now,
    );
    return { plan, added: plan.chunks.flat().length, skipped: 0, created: true };
  }
  const { chunks, skipped } = chunksToAppend(existing, data, opts.chunkSize);
  if (!chunks.length) return { plan: existing, added: 0, skipped: skipped.length, created: false };
  const next: MemoryPlan = {
    ...existing,
    chunks: [...existing.chunks, ...chunks],
    range: unionRange(existing.range, range),
    startDate: existing.startDate && existing.startDate > startDate ? existing.startDate : startDate,
    status: existing.status === "mastered" ? "active" : existing.status,
    updatedAt: now,
  };
  await db.plans.put(next);
  return { plan: next, added: chunks.flat().length, skipped: skipped.length, created: false };
}

/** Create a separate plan for a range, starting tomorrow (the "Memorize this" new-plan option). */
export async function createPlanStartingTomorrow(
  range: VerseRange,
  title: string,
  data: PassageData,
  opts: AddOptions,
  now = Date.now(),
): Promise<MemoryPlan> {
  return createMemoryPlan(
    { title, range, translation: opts.translation, pace: opts.pace ?? "daily", startDate: tomorrowISO(now), chunkSize: opts.chunkSize },
    data,
    now,
  );
}

export async function setPlanStatus(planId: string, status: MemoryPlan["status"], now = Date.now()): Promise<void> {
  await db.plans.update(planId, { status, updatedAt: now });
}

/** Delete a plan with its verse/passage cards and their review logs. */
export async function deletePlan(planId: string): Promise<void> {
  await db.transaction("rw", [db.plans, db.verseCards, db.passageCards, db.reviewLogs], async () => {
    const vc = await db.verseCards.where("planId").equals(planId).primaryKeys();
    const pc = await db.passageCards.where("planId").equals(planId).primaryKeys();
    const ids = [...vc, ...pc] as string[];
    if (ids.length) await db.reviewLogs.where("cardId").anyOf(ids).delete();
    await db.verseCards.bulkDelete(vc as string[]);
    await db.passageCards.bulkDelete(pc as string[]);
    await db.plans.delete(planId);
  });
}

/** Mark an active plan mastered when it meets the mastered rule (see lib/progress.ts). */
export async function markMasteredIfDone(planId: string, now = Date.now()): Promise<boolean> {
  const plan = await db.plans.get(planId);
  if (!plan || plan.status !== "active" || plan.chunksIntroduced < plan.chunks.length) return false;
  const [verseCards, passageCards] = await Promise.all([
    db.verseCards.where("planId").equals(planId).toArray(),
    db.passageCards.where("planId").equals(planId).toArray(),
  ]);
  const ids = [...verseCards, ...passageCards].map((c) => c.id);
  const logs = ids.length ? await db.reviewLogs.where("cardId").anyOf(ids).toArray() : [];
  const done = isPlanMastered({ plan, verseCards, passageCard: passageCards[0], logs });
  if (done) await setPlanStatus(planId, "mastered", now);
  return done;
}
