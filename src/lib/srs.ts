// FSRS-4.5 spaced-repetition scheduler (pure).
//
// Model (Free Spaced Repetition Scheduler v4.5, open-spaced-repetition):
//   Retrievability after t days with stability S:  R(t, S) = (1 + FACTOR · t / S) ^ DECAY
//   with DECAY = −0.5 and FACTOR = 19/81, chosen so that R(S, S) = 0.9 exactly.
//   Interval for a desired retention r:  I(r, S) = S / FACTOR · (r^(1/DECAY) − 1)   (= S at r = 0.9)
//
//   First review (rating G ∈ 1..4 = Again/Hard/Good/Easy):
//     S0(G) = w[G−1]
//     D0(G) = w4 − (G − 3) · w5, clamped to [1, 10]
//   Later reviews:
//     D' = D − w6 · (G − 3);  D'' = w7 · D0(3) + (1 − w7) · D'  (mean reversion), clamped [1, 10]
//     success (G ≥ 2):  S' = S · (1 + e^w8 · (11 − D) · S^−w9 · (e^(w10·(1−R)) − 1) · hard · easy)
//                       hard = w15 if G = 2 else 1;  easy = w16 if G = 4 else 1
//     lapse (G = 1):    S' = w11 · D^−w12 · ((S + 1)^w13 − 1) · e^(w14·(1−R))
//                       clamped to ≤ S (as FSRS-5 does) so a lapse never increases stability.
//   The difficulty update uses the pre-review D for the stability formulas (as in the reference).
//
// The default weights below are the published FSRS-4.5 defaults (ts-fsrs 3.x / py-fsrs 2.x
// `default_w`, 17 parameters).
//
// App mapping: grade 1 → Again, 2 → Hard, 3 and 4 → Good, 5 → Easy.
// Scheduling granularity: due = now + round(interval) days, minimum 1 day for any passing grade.
// Again → due now + 10 minutes, so the card resurfaces in the same day's queue (the queue counts
// anything due before local midnight as due today). Lapses are counted only for cards that had
// been learned (reps > 0); failing a brand-new card is not a lapse.

import type { SrsState } from "@/db/types";
import { DAY_MS } from "@/lib/isoDate";

export const FSRS_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072,
  0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const REQUEST_RETENTION = 0.9;
export const MAX_INTERVAL_DAYS = 36500;
export const AGAIN_DELAY_MS = 10 * 60 * 1000;

export type AppGrade = 1 | 2 | 3 | 4 | 5;
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export function ratingFromGrade(grade: AppGrade): Rating {
  if (grade <= 1) return 1;
  if (grade === 2) return 2;
  if (grade <= 4) return 3;
  return 4;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const w = FSRS_W;

export function newState(now: number): SrsState {
  return { stability: 0, difficulty: 0, due: now, reps: 0, lapses: 0 };
}

/** R(t, S): probability of recall after `elapsedDays` with stability `stability`. */
export function forgettingCurve(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

/** Current retrievability of a card (1 right after review; 0 for a never-reviewed card). */
export function retrievability(state: SrsState, now: number): number {
  if (state.reps === 0 || state.lastReviewed === undefined) return 0;
  return forgettingCurve((now - state.lastReviewed) / DAY_MS, state.stability);
}

/** Interval (fractional days) for a stability at the requested retention. */
export function intervalDays(stability: number, retention = REQUEST_RETENTION): number {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

const initStability = (r: Rating) => Math.max(w[r - 1], 0.1);
const initDifficulty = (r: Rating) => clamp(w[4] - (r - 3) * w[5], 1, 10);

function nextDifficulty(d: number, r: Rating): number {
  const dPrime = d - w[6] * (r - 3);
  return clamp(w[7] * initDifficulty(3) + (1 - w[7]) * dPrime, 1, 10);
}

function recallStability(d: number, s: number, rr: number, r: Rating): number {
  const hard = r === 2 ? w[15] : 1;
  const easy = r === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - rr)) - 1) * hard * easy);
}

function forgetStability(d: number, s: number, rr: number): number {
  const sf = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - rr));
  return Math.min(sf, s);
}

/** Pure FSRS-4.5 review. Returns a new state; the input is not mutated. */
export function review(state: SrsState, grade: AppGrade, now: number): SrsState {
  const r = ratingFromGrade(grade);
  let stability: number;
  let difficulty: number;
  let lapses = state.lapses;

  if (state.reps === 0 || state.stability <= 0) {
    stability = initStability(r);
    difficulty = initDifficulty(r);
  } else {
    const elapsed = state.lastReviewed === undefined ? 0 : (now - state.lastReviewed) / DAY_MS;
    const rr = forgettingCurve(elapsed, state.stability);
    difficulty = nextDifficulty(state.difficulty, r);
    if (r === 1) {
      stability = forgetStability(state.difficulty, state.stability, rr);
      lapses += 1;
    } else {
      stability = recallStability(state.difficulty, state.stability, rr, r);
    }
  }
  stability = Math.max(stability, 0.01);

  const due =
    r === 1
      ? now + AGAIN_DELAY_MS
      : now + clamp(Math.round(intervalDays(stability)), 1, MAX_INTERVAL_DAYS) * DAY_MS;

  return { ...state, stability, difficulty, due, reps: state.reps + 1, lapses, lastReviewed: now };
}

/** Whole-day interval a passing grade would produce right now (for "next review in N days" hints). */
export function previewIntervalDays(state: SrsState, grade: AppGrade, now: number): number {
  const next = review(state, grade, now);
  return Math.round((next.due - now) / DAY_MS);
}
