// Cutting excerpts out of normalized source text at the ORIGINAL's sentence boundaries.
//
// An excerpt is always a contiguous slice of normalizeWs(source). It is at most MAX_EXCERPT
// characters, starts at a sentence start and ends at a sentence end of the original. Nothing is
// ever added: when the slice is shorter than its paragraph/section the excerpt gets
// truncatedStart / truncatedEnd flags and the UI draws "…" outside the verbatim text.
//
// A sentence boundary is a space that follows ".", "!" or "?" (optionally followed by closing
// quotes/brackets) and precedes an uppercase letter, an opening quote or bracket. It is NOT a
// boundary when the word before the period is an abbreviation (Mr., St., ver., ch., cf., viz.),
// a book abbreviation (Rom., Matt.), a single letter, or a roman numeral ("Rom. viii. 28"), or
// when a digit follows ("ver. 5").
//
// There is no word-level cut. When one sentence alone is longer than the limit, the excerpt ends
// at the last clause stop (";" or ":" of the original) that fits; when not even that exists the
// window functions return null and the caller drops the excerpt and logs it. Every excerpt
// flagged truncatedEnd therefore ends with ". ! ? ; :" (+ closing quotes/brackets), which the
// verifier re-checks (endsAtBoundary).
import { trimSpan } from "./normalize";

export const MAX_EXCERPT = 1500;
export const MAX_SECTION = 12000;

const ABBREV = new Set([
  "mr", "mrs", "dr", "st", "ver", "vers", "vv", "v", "ch", "chap", "cf", "viz", "ibid", "ib", "id", "ie", "eg",
  "p", "pp", "vol", "vols", "ed", "eds", "trans", "no", "nos", "sect", "sec", "art", "q", "ans", "comp", "fol",
  "lib", "cap", "op", "cit", "esq", "rev", "messrs", "sr", "jr", "lit", "al", "etc", "ps", "psa", "gen", "ex",
  "exod", "lev", "num", "deut", "josh", "judg", "sam", "kgs", "chron", "neh", "esth", "prov", "eccl", "eccles",
  "cant", "isa", "jer", "lam", "ezek", "dan", "hos", "obad", "mic", "nah", "hab", "zeph", "hag", "zech", "mal",
  "matt", "mat", "mk", "lk", "jn", "rom", "cor", "gal", "eph", "ephes", "phil", "col", "thess", "tim", "tit",
  "philem", "heb", "jas", "pet", "apoc", "s", "ss", "fr", "bp", "abp", "gr", "heb", "lat", "sc", "scil",
]);

function isRomanToken(w: string): boolean {
  return /^[ivxlc]+$/.test(w) || /^[IVXLC]+$/.test(w);
}

/**
 * Indices (exclusive ends) of sentence ends within [s, e) of normalized text. Always includes e.
 * A numbered-list marker ("… repentance. 4. From …") belongs to the NEXT sentence: the boundary
 * is before "4.", never after it.
 */
export function sentenceEnds(text: string, s: number, e: number): number[] {
  const ends: number[] = [];
  for (let i = s; i < e; i++) {
    if (text[i] !== " ") continue;
    // walk back over closing quotes/brackets
    let j = i - 1;
    while (j >= s && /["'’”)\]]/.test(text[j])) j--;
    if (j < s || !/[.!?]/.test(text[j])) continue;
    const next = text[i + 1];
    const listMarkerNext = /^\d{1,3}\. [\p{Lu}"'‘“(]/u.test(text.slice(i + 1, i + 7));
    if (next === undefined || (!/[\p{Lu}"'‘“(\[]/u.test(next) && !listMarkerNext)) continue;
    if (text[j] === ".") {
      // the word before the period
      let k = j - 1;
      while (k >= s && /[\p{L}]/u.test(text[k])) k--;
      const word = text.slice(k + 1, j);
      if (word.length === 1 && /\p{L}/u.test(word)) continue;
      if (ABBREV.has(word.toLowerCase())) continue;
      if (isRomanToken(word) && word.length <= 6) {
        // "viii. And" in "Rom. viii. And": numeral after a book abbreviation is not a sentence end
        const before = text.slice(Math.max(s, k - 8), k + 1);
        if (/[A-Z][a-z]{1,6}\.\s$/.test(before)) continue;
      }
      // "4." of "… end. 4. Next …" is a list marker, not the end of a sentence
      if (!word && /(?:^|[.!?;:]["'’”)\]]* )\d{1,3}$/.test(text.slice(Math.max(s, j - 8), j))) continue;
    }
    ends.push(i);
  }
  ends.push(e);
  return ends;
}

/**
 * Clause ends within [s, e): sentence ends plus every space after ";" or ":" (the original's own
 * punctuation). Used only when a single sentence is longer than the limit, so an excerpt still
 * ends where the source has a stop and is never cut between two words.
 */
export function clauseEnds(text: string, s: number, e: number): number[] {
  const set = new Set(sentenceEnds(text, s, e));
  for (let i = s + 1; i < e; i++) if (text[i] === " " && /[;:]/.test(text[i - 1])) set.add(i);
  return [...set].sort((a, b) => a - b);
}

export interface Window { start: number; end: number; truncatedStart: boolean; truncatedEnd: boolean }

function spans(text: string, s: number, ends: number[]): [number, number][] {
  const out: [number, number][] = [];
  let a = s;
  for (const b of ends) {
    const [x, y] = trimSpan(text, a, b);
    if (y > x) out.push([x, y]);
    a = b;
  }
  return out;
}

/** Sentences of [s, e) as trimmed spans. */
export function sentences(text: string, s: number, e: number): [number, number][] {
  return spans(text, s, sentenceEnds(text, s, e));
}

/** Clauses (sentences split further at "; " and ": ") of [s, e) as trimmed spans. */
export function clauses(text: string, s: number, e: number): [number, number][] {
  return spans(text, s, clauseEnds(text, s, e));
}

/** Contiguous units containing [fs, fe): one unit before the focus when it fits, then forward, then backward. */
function grow(units: [number, number][], fs: number, fe: number, max: number): [number, number] | null {
  if (!units.length) return null;
  let a = units.findIndex(([, y]) => y > fs);
  if (a < 0) a = units.length - 1;
  let b = units.findIndex(([, y]) => y >= fe);
  if (b < 0) b = units.length - 1;
  if (b < a) b = a;
  if (units[b][1] - units[a][0] > max) return null;
  if (a > 0 && units[b][1] - units[a - 1][0] <= max) a--;
  while (b + 1 < units.length && units[b + 1][1] - units[a][0] <= max) b++;
  while (a > 0 && units[b][1] - units[a - 1][0] <= max) a--;
  return [units[a][0], units[b][1]];
}

/**
 * The window of whole sentences inside segment [s, e) that contains [fs, fe) (a citation),
 * starting one sentence before the focus when it fits, then growing forward, then backward.
 * When the sentence(s) holding the focus alone exceed max, whole clauses (cut at the source's
 * own ";"/":") are used instead. null when even the clause holding the focus is too long: the
 * caller drops the excerpt and logs it (there is no word-level cut).
 */
export function windowAround(text: string, s: number, e: number, fs: number, fe: number, max = MAX_EXCERPT): Window | null {
  [s, e] = trimSpan(text, s, e);
  if (e - s <= max) return { start: s, end: e, truncatedStart: false, truncatedEnd: false };
  const w = grow(sentences(text, s, e), fs, fe, max) ?? grow(clauses(text, s, e), fs, fe, max);
  if (!w) return null;
  return { start: w[0], end: w[1], truncatedStart: w[0] > s, truncatedEnd: w[1] < e };
}

/**
 * Opening of a segment: as many whole sentences from s as fit in max; if the first sentence alone
 * is longer, as many whole clauses (ending at ";"/":") as fit. null when not even the first
 * clause fits (no word-level cut).
 */
export function windowFromStart(text: string, s: number, e: number, max = MAX_EXCERPT): Window | null {
  [s, e] = trimSpan(text, s, e);
  if (e - s <= max) return { start: s, end: e, truncatedStart: false, truncatedEnd: false };
  for (const units of [sentences(text, s, e), clauses(text, s, e)]) {
    let b = -1;
    while (b + 1 < units.length && units[b + 1][1] - s <= max) b++;
    if (b >= 0) return { start: s, end: units[b][1], truncatedStart: false, truncatedEnd: units[b][1] < e };
  }
  return null;
}

/**
 * Opening of a segment cut at a PARAGRAPH boundary (Henry's book intros): the longest run of
 * whole paragraphs from s that fits; if the first paragraph alone is too long, sentence cut.
 * `paraEnds` are normalized indices where paragraphs end.
 */
export function windowParagraphs(text: string, s: number, e: number, paraEnds: number[], max = MAX_EXCERPT): Window | null {
  [s, e] = trimSpan(text, s, e);
  if (e - s <= max) return { start: s, end: e, truncatedStart: false, truncatedEnd: false };
  let best = -1;
  for (const pe of paraEnds) {
    const [, y] = trimSpan(text, s, pe);
    // a paragraph cut must still end at the source's own stop (see endsAtBoundary)
    if (y > s && y - s <= max && y <= e && endsAtBoundary(text.slice(s, y))) best = Math.max(best, y);
  }
  if (best > s) return { start: s, end: best, truncatedStart: false, truncatedEnd: best < e };
  return windowFromStart(text, s, e, max);
}

/** Text ends where the source has a stop: ". ! ? ; :" optionally followed by closing quotes/brackets. */
export function endsAtBoundary(text: string): boolean {
  return /[.!?;:]["'’”)\]]*$/.test(text);
}
