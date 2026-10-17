// Whitespace normalization shared by every parser and by the verifier.
//
// normalizeWs(s) does exactly two things and NOTHING else:
//   1. joins a line-wrap hyphenation: a letter, "-", optional spaces/tabs, a line break,
//      optional spaces/tabs, then a LOWERCASE letter  ("exam-\nple" -> "example");
//   2. collapses every run of whitespace (JS \s set: space, tab, CR, LF, VT, FF, NBSP, U+1680,
//      U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF) to one ASCII space.
// It does not trim, change case, quotes, dashes or anything else.
//
// "charOffset" everywhere in the library means: a UTF-16 code-unit index into
// normalizeWs(sourceText) of the raw file (or of the JSON field value / HTML text for those
// source kinds, see source-text.ts). An excerpt is valid iff
//   normalizeWs(sourceText).startsWith(excerpt.text, excerpt.charOffset).

function isWsCode(c: number): boolean {
  return (
    c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0xa0 || c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f ||
    c === 0x205f || c === 0x3000 || c === 0xfeff
  );
}

const LETTER = /\p{L}/u;
const LOWER = /\p{Ll}/u;

export interface Normalized {
  /** normalizeWs(raw) */
  text: string;
  /** n2r[i] = index in raw of the character that produced text[i]; n2r[text.length] = raw.length. */
  n2r: Int32Array;
}

/**
 * If raw[i] is a hyphen that ends a line-wrapped word, return the index of the letter that
 * continues the word on the next line; otherwise -1.
 */
function hyphenJoinTarget(raw: string, i: number, prevOut: string | undefined): number {
  if (prevOut === undefined || !LETTER.test(prevOut)) return -1;
  let j = i + 1;
  while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
  if (raw[j] === "\r") j++;
  if (raw[j] !== "\n") return -1;
  j++;
  while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
  if (j >= raw.length || !LOWER.test(raw[j])) return -1;
  return j;
}

/** normalizeWs plus an index map back to the raw string (used by parsers for structure). */
export function normalizeWithMap(raw: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const c = raw.charCodeAt(i);
    if (c === 0x2d /* - */) {
      const j = hyphenJoinTarget(raw, i, out.length ? out[out.length - 1] : undefined);
      if (j >= 0) { i = j; continue; }
    }
    if (isWsCode(c)) {
      let j = i + 1;
      while (j < n && isWsCode(raw.charCodeAt(j))) j++;
      out.push(" ");
      map.push(i);
      i = j;
      continue;
    }
    out.push(raw[i]);
    map.push(i);
    i++;
  }
  const n2r = new Int32Array(map.length + 1);
  for (let k = 0; k < map.length; k++) n2r[k] = map[k];
  n2r[map.length] = n;
  return { text: out.join(""), n2r };
}

export function normalizeWs(raw: string): string {
  return normalizeWithMap(raw).text;
}

/**
 * Smallest normalized index whose raw origin is >= rawIndex (binary search over the monotonic
 * n2r map). Use it to translate raw structural positions (line/paragraph starts) to offsets.
 */
export function rawToNorm(nm: Normalized, rawIndex: number): number {
  let lo = 0;
  let hi = nm.text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nm.n2r[mid] < rawIndex) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Shrink [s, e) of normalized text so it neither starts nor ends with a space. */
export function trimSpan(text: string, s: number, e: number): [number, number] {
  while (s < e && text[s] === " ") s++;
  while (e > s && text[e - 1] === " ") e--;
  return [s, e];
}
