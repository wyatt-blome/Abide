// License checks run on the downloaded files themselves (never on what a manifest claims):
//  - proofText must occur (after whitespace normalization) in a raw file of the pack or in the
//    fetched proofUrl page ("Rights: Public Domain" in CCEL headers, "Public domain in the USA"
//    on Gutenberg ebook pages, the PD Mark on archive.org item pages, "CC-BY" in OpenBible data,
//    "SourceAttribution": "Public Domain" in Creeds.json);
//  - basis "published-before-1931" additionally needs a publication / print-basis year < 1931
//    found in the source header (first 30,000 chars) — e.g. CCEL "Print Basis: … 1890".
import { normalizeWs } from "./normalize";

export function containsProof(text: string, proofText: string): boolean {
  return normalizeWs(text).includes(normalizeWs(proofText));
}

const YEAR_PATTERNS: RegExp[] = [
  /Print Basis:[^\n]*?\b(1[4-9]\d\d)\b/i,
  /\b(?:First |Originally )?(?:published|publication date|date of publication|printed|imprint)\b[^\n]{0,100}?\b(1[4-9]\d\d)\b/i,
  /\bCopyright,?\s*(?:©\s*)?(1[4-9]\d\d)\b/i,
  /\b(?:London|Edinburgh|New York|Philadelphia|Boston|Chicago|Oxford|Cambridge|Glasgow|Toronto|Grand Rapids)[^\n]{0,80}?\b(1[4-9]\d\d)\b/,
];

/** Earliest plausible publication year stated in the header, or null. */
export function findPublicationYear(text: string, pattern?: string): number | null {
  const head = text.slice(0, 30000);
  const pats = pattern ? [new RegExp(pattern, "i")] : YEAR_PATTERNS;
  const years: number[] = [];
  for (const re of pats) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(head))) years.push(Number(m[1]));
  }
  return years.length ? Math.min(...years) : null;
}
