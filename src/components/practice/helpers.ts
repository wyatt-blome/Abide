// Pure helpers shared by the drills, the practice page and Hands-Free.

import type { VerseKey, VerseRange, VerseRef } from "@/db/types";
import { getVerseText } from "@/lib/bible";
import { BOOK_BY_CODE } from "@/lib/books";
import { diffDays, todayISO } from "@/lib/isoDate";
import { bundledTranslation } from "@/lib/planActions";
import type { BuildUpLabel } from "@/lib/queue";
import { formatRange, formatRef, fromKey } from "@/lib/refs";
import { align, gradeFromAccuracy, normalizeWords, PEEK_PENALTY, score, type AlignmentOp, type Grade } from "@/lib/scoring";
import { normalizeToken, numberToWords, tokenize } from "@/lib/text";
import type { TranslationId } from "@/db/types";
import { ASSISTED_MODES, type DrillMode, type PracticeVerse } from "./types";

/** Labels for a set of verses: "v.3" (one chapter), "5:12" (one book), else "Romans 8:28". */
export function verseLabels(refs: VerseRef[]): string[] {
  const books = new Set(refs.map((r) => r.book));
  const chapters = new Set(refs.map((r) => `${r.book}.${r.chapter}`));
  return refs.map((r) => (chapters.size <= 1 ? `v.${r.verse}` : books.size <= 1 ? `${r.chapter}:${r.verse}` : formatRef(r)));
}

/** Load verse texts for keys; verses with no text are dropped (they are skipped in drills). */
export async function loadPracticeVerses(keys: VerseKey[], translation: TranslationId): Promise<PracticeVerse[]> {
  const t = bundledTranslation(translation);
  const texts = await Promise.all(keys.map((k) => getVerseText(t, k)));
  const refs = keys.map(fromKey);
  const labels = verseLabels(refs);
  return keys
    .map((key, i) => ({ key, ref: refs[i], text: texts[i], label: labels[i] }))
    .filter((v) => v.text.trim().length > 0);
}

export interface MultiScore {
  perVerse: Record<VerseKey, number>;
  ops: AlignmentOp[];
  /** Target word index where each verse starts (for grouping the diff view). */
  verseStarts: number[];
  matched: number;
  total: number;
}

/**
 * Score one attempt against several verses: the verse texts are concatenated, aligned once with
 * the attempt, and matches are counted per verse. A single verse uses scoring.score() directly.
 */
export function scoreVerses(verses: PracticeVerse[], attempt: string, peeks: Record<VerseKey, number> = {}): MultiScore {
  if (verses.length === 1) {
    const v = verses[0];
    const r = score(v.text, attempt, peeks[v.key] ?? 0);
    return { perVerse: { [v.key]: r.accuracy }, ops: r.ops, verseStarts: [0], matched: r.matched, total: r.targetWords };
  }
  const targetWords: string[] = [];
  const verseStarts: number[] = [];
  const owner: number[] = [];
  verses.forEach((v, vi) => {
    verseStarts.push(targetWords.length);
    for (const w of normalizeWords(v.text)) {
      targetWords.push(w);
      owner.push(vi);
    }
  });
  const ops = align(targetWords, normalizeWords(attempt));
  const matchedBy = verses.map(() => 0);
  const totalBy = verses.map(() => 0);
  owner.forEach((vi) => totalBy[vi]++);
  for (const o of ops) if (o.op === "match") matchedBy[owner[o.ti]]++;
  const perVerse: Record<VerseKey, number> = {};
  verses.forEach((v, vi) => {
    const raw = totalBy[vi] ? matchedBy[vi] / totalBy[vi] : 1;
    perVerse[v.key] = Math.max(0, raw - PEEK_PENALTY * (peeks[v.key] ?? 0));
  });
  const matched = matchedBy.reduce((a, b) => a + b, 0);
  return { perVerse, ops, verseStarts, matched, total: targetWords.length };
}

/** Accuracy of a self-checked, assisted drill (Progressive Hide, First Letters): 1 − peek penalty. */
export function peekAccuracy(text: string, peeks: number): number {
  return score(text, text, peeks).accuracy;
}

/** Grade for an attempt; assisted modes (text visible) are capped at 4 = FSRS Good. */
export function gradeFor(mode: DrillMode, accuracy: number): Grade {
  const g = gradeFromAccuracy(accuracy);
  return ASSISTED_MODES.includes(mode) ? (Math.min(g, 4) as Grade) : g;
}

/**
 * The letter to type for a word: its first letter, case and punctuation ignored. A number is
 * typed by the first letter of its spoken form ("40" → "f" for "forty").
 */
export function expectedLetter(core: string): string {
  const n = normalizeToken(core);
  const digits = /^\d+/.exec(n);
  if (digits) return numberToWords(Number(digits[0]))[0]?.[0] ?? "";
  return n[0] ?? "";
}

/** "v.7–8" within one chapter, "5:48–6:2" across chapters, full reference across books. */
export function formatSpan(range: VerseRange): string {
  const { start: s, end: e } = range;
  if (s.book !== e.book) return formatRange(range);
  if (s.chapter === e.chapter) return s.verse === e.verse ? `v.${s.verse}` : `v.${s.verse}–${e.verse}`;
  return `${s.chapter}:${s.verse}–${e.chapter}:${e.verse}`;
}

/** "Learning v.7–8 · run-through v.1–8" (UI label from queue.buildUpLabel). */
export function formatBuildUp(b: BuildUpLabel): string {
  const learn = `Learning ${formatSpan(b.learning)}`;
  return b.runThrough ? `${learn} · run-through ${formatSpan(b.runThrough)}` : learn;
}

/** "Later today", "Tomorrow", "In 5 days", or a date. */
export function formatNextDue(due: number, now = Date.now()): string {
  const d = diffDays(todayISO(now), todayISO(due));
  if (d <= 0) return "Later today";
  if (d === 1) return "Tomorrow";
  if (d < 60) return `In ${d} days`;
  return new Date(due).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const GRADE_LABEL: Record<Grade, string> = { 1: "Missed", 2: "Shaky", 3: "Fair", 4: "Good", 5: "Perfect" };

/** First half of a verse by words (rounded up), punctuation kept: for "I finish it". */
export function firstHalf(text: string): string {
  const toks = tokenize(text);
  const words = toks.filter((t) => t.core).length;
  const keep = Math.ceil(words / 2);
  const out: string[] = [];
  let n = 0;
  for (const t of toks) {
    if (t.core) n++;
    out.push(t.display);
    if (n >= keep) break;
  }
  return out.join(" ");
}

export const bookName = (code: string): string => BOOK_BY_CODE[code]?.name ?? code;
