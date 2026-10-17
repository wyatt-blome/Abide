// Recitation scoring: normalize both texts to word lists, align them word-by-word, and grade.
//
// Alignment is a word-level Levenshtein (edit-distance) DP where two words "match" when their
// character similarity is ≥ 0.8 (similarity = 1 − lev(a, b) / max(len a, len b)). Matching words
// cost 0; substitution, insertion (extra attempt word) and deletion (missing target word) cost 1.
// Backtracking yields an op list for the diff view.
//
// accuracy = matched target words / target word count, minus 0.03 per peek (clamped to ≥ 0).
// grade: ≥ .98 → 5, ≥ .92 → 4, ≥ .80 → 3, ≥ .60 → 2, else 1.

import { normalizeToken, numberToWords, unifyQuotes } from "@/lib/text";

export type Grade = 1 | 2 | 3 | 4 | 5;

export type AlignmentOp =
  /** Target word recited (exactly, or within the 0.8 similarity threshold when exact = false). */
  | { op: "match"; target: string; attempt: string; ti: number; ai: number; exact: boolean }
  /** A different word was said in place of the target word. */
  | { op: "sub"; target: string; attempt: string; ti: number; ai: number }
  /** An extra word in the attempt. */
  | { op: "ins"; attempt: string; ai: number }
  /** A target word missing from the attempt. */
  | { op: "del"; target: string; ti: number };

export interface ScoreResult {
  accuracy: number;
  /** Accuracy before the peek penalty. */
  rawAccuracy: number;
  grade: Grade;
  ops: AlignmentOp[];
  matched: number;
  targetWords: number;
}

export const MATCH_SIMILARITY = 0.8;
export const PEEK_PENALTY = 0.03;

/**
 * Text → comparison words: quotes unified, lowercase, hyphens/dashes split words, digits spelled
 * out ("3" → "three", "40" → "forty"), every other punctuation mark removed.
 */
export function normalizeWords(text: string): string[] {
  const spaced = unifyQuotes(text)
    .toLowerCase()
    .replace(/[-‐-―−/]/g, " ")
    // "40," → " 40 " so digit runs become their own tokens; thousands separators removed first.
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/(\d+)/g, " $1 ");
  const out: string[] = [];
  for (const raw of spaced.split(/\s+/)) {
    if (!raw) continue;
    if (/^\d+$/.test(raw)) {
      out.push(...numberToWords(Number(raw)));
      continue;
    }
    const w = normalizeToken(raw);
    if (w) out.push(w);
  }
  return out;
}

/** Character-level Levenshtein distance (two-row DP). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const A = Array.from(a);
  const B = Array.from(b);
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  let cur = new Array<number>(B.length + 1);
  for (let i = 1; i <= A.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[B.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(Array.from(a).length, Array.from(b).length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export const wordsMatch = (a: string, b: string): boolean => a === b || similarity(a, b) >= MATCH_SIMILARITY;

/**
 * Word alignment. dp[i][j] = minimal edits aligning target[0..i) with attempt[0..j).
 * Backtracking from (n, m) prefers match > sub > del > ins on ties, so a near-miss word is reported
 * as a match/substitution in place rather than as a deletion plus an insertion.
 */
export function align(target: string[], attempt: string[]): AlignmentOp[] {
  const n = target.length;
  const m = attempt.length;
  const eq: boolean[][] = target.map((t) => attempt.map((a) => wordsMatch(t, a)));
  const dp: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (eq[i - 1][j - 1] ? 0 : 1),
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      );
    }
  }
  const ops: AlignmentOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && eq[i - 1][j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ops.push({ op: "match", target: target[i - 1], attempt: attempt[j - 1], ti: i - 1, ai: j - 1, exact: target[i - 1] === attempt[j - 1] });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ op: "sub", target: target[i - 1], attempt: attempt[j - 1], ti: i - 1, ai: j - 1 });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ op: "del", target: target[i - 1], ti: i - 1 });
      i--;
    } else {
      ops.push({ op: "ins", attempt: attempt[j - 1], ai: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

export function gradeFromAccuracy(accuracy: number): Grade {
  if (accuracy >= 0.98) return 5;
  if (accuracy >= 0.92) return 4;
  if (accuracy >= 0.8) return 3;
  if (accuracy >= 0.6) return 2;
  return 1;
}

/** Score a recitation attempt against the target text. `peeks` = number of times help was shown. */
export function score(target: string, attempt: string, peeks = 0): ScoreResult {
  const t = normalizeWords(target);
  const a = normalizeWords(attempt);
  const ops = align(t, a);
  const matched = ops.filter((o) => o.op === "match").length;
  const rawAccuracy = t.length === 0 ? (a.length === 0 ? 1 : 0) : matched / t.length;
  const accuracy = Math.max(0, rawAccuracy - PEEK_PENALTY * Math.max(0, peeks));
  return { accuracy, rawAccuracy, grade: gradeFromAccuracy(accuracy), ops, matched, targetWords: t.length };
}
