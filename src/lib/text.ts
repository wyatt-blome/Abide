// Word tokenization shared by drills (Progressive Hide, First Letters, Type) and scoring.
//
// A display token is a whitespace-separated word with its attached punctuation ("beginning,",
// "“Let"). Each token also carries `norm`, the comparison form (lowercase, quotes unified,
// punctuation stripped) and `core`, the letters/digits used for hiding and first-letter drills.

export interface Token {
  /** Text as displayed, with leading/trailing punctuation kept. */
  display: string;
  /** Leading punctuation (opening quotes, brackets). */
  lead: string;
  /** The word itself (letters, digits, internal apostrophes/hyphens). */
  core: string;
  /** Trailing punctuation (",", ".", closing quotes, em dash). */
  trail: string;
  /** Normalized comparison form ("" for punctuation-only tokens). */
  norm: string;
  /** Index among tokens. */
  index: number;
}

/** Map curly/typographic quotes and primes to ASCII ' and ". */
export function unifyQuotes(s: string): string {
  return s
    .replace(/[‘’‚‛′ʼ`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"');
}

/** Comparison form of a single word: lowercase, quotes unified, all punctuation removed. */
export function normalizeToken(word: string): string {
  return unifyQuotes(word)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics after decomposition
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

function splitToken(raw: string): { lead: string; core: string; trail: string } {
  let i = 0;
  let j = raw.length;
  while (i < j && !WORD_CHAR.test(raw[i])) i++;
  while (j > i && !WORD_CHAR.test(raw[j - 1])) j--;
  return { lead: raw.slice(0, i), core: raw.slice(i, j), trail: raw.slice(j) };
}

/**
 * Split text into display tokens. Whitespace separates tokens; an em dash joining two words
 * ("him—and") also separates them, staying attached to the first word as trailing punctuation.
 * Punctuation-only fragments (a lone "—") are merged into the previous token's trail.
 */
export function tokenize(text: string): Token[] {
  const raws = text
    .replace(/—(?=\S)/g, "— ")
    .split(/\s+/)
    .filter(Boolean);
  const out: Token[] = [];
  for (const raw of raws) {
    const { lead, core, trail } = splitToken(raw);
    if (!core) {
      if (out.length) {
        const prev = out[out.length - 1];
        prev.trail += raw;
        prev.display += raw;
      } else {
        // Leading punctuation-only fragment: kept as its own (unscored) token.
        out.push({ display: raw, lead: raw, core: "", trail: "", norm: "", index: 0 });
      }
      continue;
    }
    out.push({ display: raw, lead, core, trail, norm: normalizeToken(core), index: out.length });
  }
  out.forEach((t, i) => (t.index = i));
  return out;
}

/** Tokens that carry a word (punctuation-only tokens dropped). */
export const wordTokens = (text: string): Token[] => tokenize(text).filter((t) => t.core.length > 0);

/** First letter (or digit) of a token's word, keeping its punctuation: "“Let" → "“L". */
export function firstLetterOf(t: Token): string {
  if (!t.core) return t.display;
  return `${t.lead}${Array.from(t.core)[0]}${t.trail}`;
}

/** First-letter rendering of a passage: "In the beginning, God" → "I t b, G". */
export function firstLetters(text: string): string {
  return tokenize(text).map(firstLetterOf).join(" ");
}

export const wordCount = (text: string): number => wordTokens(text).length;

// ---------------------------------------------------------------- numbers → words

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function below1000(n: number): string[] {
  const out: string[] = [];
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)], "hundred");
    n %= 100;
    if (n === 0) return out;
  }
  if (n < 20) out.push(ONES[n]);
  else {
    out.push(TENS[Math.floor(n / 10)]);
    if (n % 10) out.push(ONES[n % 10]);
  }
  return out;
}

/**
 * Spell a non-negative integer as words: 3 → ["three"], 40 → ["forty"], 153 → ["one","hundred",
 * "fifty","three"], 144000 → ["one","hundred","forty","four","thousand"]. No "and" (matches how
 * the BSB spells numbers, e.g. "one hundred fifty-three"). Numbers ≥ 10^12 stay as digits.
 */
export function numberToWords(n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n >= 1e12) return [String(n)];
  if (n === 0) return ["zero"];
  const scales: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  const out: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) {
      out.push(...below1000(Math.floor(n / v)), name);
      n %= v;
    }
  }
  if (n > 0) out.push(...below1000(n));
  return out;
}
