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

/** Indices (exclusive ends) of sentence ends within [s, e) of normalized text. Always includes e. */
export function sentenceEnds(text: string, s: number, e: number): number[] {
  const ends: number[] = [];
  for (let i = s; i < e; i++) {
    if (text[i] !== " ") continue;
    // walk back over closing quotes/brackets
    let j = i - 1;
    while (j >= s && /["'’”)\]]/.test(text[j])) j--;
    if (j < s || !/[.!?]/.test(text[j])) continue;
    const next = text[i + 1];
    if (next === undefined || !/[\p{Lu}"'‘“(\[]/u.test(next)) continue;
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
    }
    ends.push(i);
  }
  ends.push(e);
  return ends;
}

export interface Window { start: number; end: number; truncatedStart: boolean; truncatedEnd: boolean }

/** Sentences of [s, e) as trimmed spans. */
export function sentences(text: string, s: number, e: number): [number, number][] {
  const out: [number, number][] = [];
  let a = s;
  for (const b of sentenceEnds(text, s, e)) {
    const [x, y] = trimSpan(text, a, b);
    if (y > x) out.push([x, y]);
    a = b;
  }
  return out;
}

function wordWindow(text: string, s: number, e: number, focus: number, max: number): [number, number] {
  // fallback when a single sentence exceeds max: cut at spaces (still verbatim, flagged)
  let start = Math.max(s, focus - Math.floor(max / 3));
  if (start > s) {
    const sp = text.indexOf(" ", start);
    start = sp >= 0 && sp < focus ? sp + 1 : start;
  }
  let end = Math.min(e, start + max);
  if (end < e) {
    const sp = text.lastIndexOf(" ", end);
    if (sp > focus) end = sp;
  }
  return trimSpan(text, start, end);
}

/**
 * The window of whole sentences inside segment [s, e) that contains [fs, fe) (a citation),
 * starting one sentence before the focus when it fits, then growing forward, then backward.
 */
export function windowAround(text: string, s: number, e: number, fs: number, fe: number, max = MAX_EXCERPT): Window {
  [s, e] = trimSpan(text, s, e);
  if (e - s <= max) return { start: s, end: e, truncatedStart: false, truncatedEnd: false };
  const ss = sentences(text, s, e);
  let a = ss.findIndex(([, y]) => y > fs);
  if (a < 0) a = ss.length - 1;
  let b = ss.findIndex(([, y]) => y >= fe);
  if (b < 0) b = ss.length - 1;
  if (b < a) b = a;
  if (ss[b][1] - ss[a][0] > max) {
    const [x, y] = wordWindow(text, s, e, fs, max);
    return { start: x, end: y, truncatedStart: x > s, truncatedEnd: y < e };
  }
  if (a > 0 && ss[b][1] - ss[a - 1][0] <= max) a--;
  while (b + 1 < ss.length && ss[b + 1][1] - ss[a][0] <= max) b++;
  while (a > 0 && ss[b][1] - ss[a - 1][0] <= max) a--;
  return { start: ss[a][0], end: ss[b][1], truncatedStart: ss[a][0] > s, truncatedEnd: ss[b][1] < e };
}

/** Opening of a segment: as many whole sentences from s as fit in max. */
export function windowFromStart(text: string, s: number, e: number, max = MAX_EXCERPT): Window {
  [s, e] = trimSpan(text, s, e);
  if (e - s <= max) return { start: s, end: e, truncatedStart: false, truncatedEnd: false };
  const ss = sentences(text, s, e);
  let b = -1;
  while (b + 1 < ss.length && ss[b + 1][1] - s <= max) b++;
  if (b < 0) {
    const [x, y] = wordWindow(text, s, e, s, max);
    return { start: x, end: y, truncatedStart: false, truncatedEnd: y < e };
  }
  return { start: s, end: ss[b][1], truncatedStart: false, truncatedEnd: ss[b][1] < e };
}

/**
 * Opening of a segment cut at a PARAGRAPH boundary (Henry's book intros): the longest run of
 * whole paragraphs from s that fits; if the first paragraph alone is too long, sentence cut.
 * `paraEnds` are normalized indices where paragraphs end.
 */
export function windowParagraphs(text: string, s: number, e: number, paraEnds: number[], max = MAX_EXCERPT): Window {
  [s, e] = trimSpan(text, s, e);
  if (e - s <= max) return { start: s, end: e, truncatedStart: false, truncatedEnd: false };
  let best = -1;
  for (const pe of paraEnds) {
    const [, y] = trimSpan(text, s, pe);
    if (y > s && y - s <= max && y <= e) best = Math.max(best, y);
  }
  if (best > s) return { start: s, end: best, truncatedStart: false, truncatedEnd: best < e };
  return windowFromStart(text, s, e, max);
}
