// Label shape: what a display field (pack author/title/edition/ocrNote, an excerpt locator, a
// heading label) may look like. Shared by the content lint (scripts/lib/content-lint.ts), the
// build and the verifier (scripts/lib/verify-core.ts). A label names something; it is never prose.

export const MAX_LABEL = 160;

const LABEL_ABBREV = /^(?:[A-Z]|[A-Z][a-z]{0,3}|trans|transl|ed|eds|vol|vols|no|nos|repr|rev|pt|ch|chap|bk|cf|viz|ca|ff|pp|p|v|vv|ver|art|sect|etc|[ivxlc]+|[IVXLC]+|\d+)$/;

/** null when s is label-shaped (non-blank, ≤ 160 chars, one line, not multi-sentence prose). */
export function labelProblem(s: unknown, max = MAX_LABEL): string | null {
  if (typeof s !== "string") return "not a string";
  if (!s.trim()) return "blank or whitespace-only";
  if (s.length > max) return `longer than ${max} chars (${s.length})`;
  if (/[\r\n\t]/.test(s)) return "contains a line break or tab";
  for (const m of s.matchAll(/(\S+?)[.!?]["'’”)\]]*\s+["'‘“(]?\p{Lu}/gu)) {
    const w = m[1].replace(/^[("'‘“[]+/, "");
    if (!LABEL_ABBREV.test(w)) return `reads as more than one sentence (after "${m[1]}")`;
  }
  return null;
}

