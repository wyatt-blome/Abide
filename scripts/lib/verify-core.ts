// The single definition of "this excerpt is verbatim", used by build-library (self-check before
// writing) and verify-excerpts (independent re-check from the cached/downloaded raw files).
//
//   text source      check
//   plain text       normalizeWs(rawText).startsWith(ex.text, ex.charOffset)
//   html-text        normalizeWs(htmlToText(rawText)).startsWith(ex.text, ex.charOffset)
//   JSON             ex.text.split("\n")[i] must equal
//                    normalizeWs(field at ex.sourcePaths[i]).slice(partOffsets[i], …) for every i
// plus sha256(ex.text) === ex.verbatimHash (when the excerpt already has one), and:
//   - no U+FFFD (a decoding failure) anywhere in the text;
//   - length ≤ MAX_EXCERPT (1,500), full sections (fullSection / isSection) ≤ MAX_SECTION (12,000);
//   - truncatedEnd → the text ends at the source's own stop (". ! ? ; :" + closing quotes or
//     brackets) and the source continues with a space there (never mid-word);
//   - JSON: every part but the last is its whole (trimmed) field; a last part that stops short of
//     its field's end requires truncatedEnd; truncatedStart iff the first part starts inside its
//     field; a truncatedEnd excerpt whose last part is whole must be missing later fields.
// checkDisplay: locator (and the work's edition/ocrNote/title/author) are label-shaped.
import { labelProblem } from "./label-shape";
import { MAX_EXCERPT, MAX_SECTION, endsAtBoundary } from "./cut";
import { sha256 } from "./hash";
import { normalizeWs } from "./normalize";
import { getJsonPath, htmlToText } from "./source-text";

export interface VerifiableExcerpt {
  id?: string; text: string; charOffset: number; verbatimHash?: string;
  sourcePaths?: string[]; partOffsets?: number[]; sourceTransform?: "html-text";
  truncatedEnd?: boolean; truncatedStart?: boolean;
  /** LibraryExcerpt uses fullSection, ParsedExcerpt isSection. */
  fullSection?: boolean; isSection?: boolean;
  locator?: string;
}

/** Lazily computed views of one raw file's text. */
export class SourceView {
  private normCache?: string;
  private htmlNormCache?: string;
  private jsonCache?: unknown;
  private fieldCache = new Map<string, string | null>();
  constructor(public readonly raw: string) {}
  get norm(): string {
    return (this.normCache ??= normalizeWs(this.raw));
  }
  get htmlNorm(): string {
    return (this.htmlNormCache ??= normalizeWs(htmlToText(this.raw)));
  }
  /** The decoded JSON object at a dotted path (null when absent or not an object). */
  object(path: string): Record<string, unknown> | null {
    this.jsonCache ??= JSON.parse(this.raw);
    const v = getJsonPath(this.jsonCache, path);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  }
  field(path: string): string | null {
    if (!this.fieldCache.has(path)) {
      this.jsonCache ??= JSON.parse(this.raw);
      const v = getJsonPath(this.jsonCache, path);
      this.fieldCache.set(path, typeof v === "string" ? normalizeWs(v) : null);
    }
    return this.fieldCache.get(path)!;
  }
}

/** null when the excerpt is verbatim at its stored position; otherwise the reason. */
export function checkExcerpt(ex: VerifiableExcerpt, src: SourceView): string | null {
  if (!ex.text) return "empty text";
  if (ex.verbatimHash !== undefined && sha256(ex.text) !== ex.verbatimHash) return "sha256(text) does not match verbatimHash";
  if (ex.text.includes("\uFFFD")) return "text contains U+FFFD (source bytes did not decode as UTF-8)";
  const section = !!(ex.fullSection || ex.isSection);
  const limit = section ? MAX_SECTION : MAX_EXCERPT;
  if (ex.text.length > limit) return `text is ${ex.text.length} chars, limit ${limit}${section ? " (full section)" : ""}`;
  if (ex.truncatedEnd && !endsAtBoundary(ex.text)) return "truncatedEnd but the text does not end at a sentence/clause stop (. ! ? ; :)";
  if (ex.sourcePaths?.length) {
    const parts = ex.text.split("\n");
    const offs = ex.partOffsets ?? [ex.charOffset];
    if (parts.length !== ex.sourcePaths.length || offs.length !== parts.length) return "sourcePaths/partOffsets do not match text parts";
    if (offs[0] !== ex.charOffset) return "charOffset differs from partOffsets[0]";
    for (let i = 0; i < parts.length; i++) {
      const v = src.field(ex.sourcePaths[i]);
      if (v === null) return `JSON field ${ex.sourcePaths[i]} not found`;
      if (!parts[i] || !v.startsWith(parts[i], offs[i])) return `text part ${i} not found verbatim at ${ex.sourcePaths[i]}[${offs[i]}]`;
      const lead = v.length - v.trimStart().length;
      const tail = v.trimEnd().length;
      const whole = offs[i] === lead && offs[i] + parts[i].length === tail;
      const last = i === parts.length - 1;
      if (i === 0 && !!ex.truncatedStart !== offs[0] > lead) return `truncatedStart ${!!ex.truncatedStart} but part 0 ${offs[0] > lead ? "starts inside" : "starts at the start of"} ${ex.sourcePaths[0]}`;
      if (!last && !whole) return `part ${i} is not the whole field ${ex.sourcePaths[i]}`;
      if (last && offs[i] + parts[i].length < tail) {
        if (!ex.truncatedEnd) return `part ${i} stops before the end of ${ex.sourcePaths[i]} but truncatedEnd is not set`;
        if (v[offs[i] + parts[i].length] !== " ") return `part ${i} ends mid-word in ${ex.sourcePaths[i]}`;
      }
      if (last && whole && ex.truncatedEnd) {
        // allowed only when later fields of the same item were left out (Question-only excerpt)
        const m = /^(.*)\.([^.]+)$/.exec(ex.sourcePaths[i]);
        const parent = m ? src.object(m[1]) : null;
        const keys = parent ? Object.keys(parent) : [];
        const after = keys.slice(keys.indexOf(m?.[2] ?? "") + 1).filter((k) => typeof parent![k] === "string" && (parent![k] as string).trim() && !/WithProofs$/.test(k));
        if (!after.length) return `truncatedEnd set but the excerpt holds all of ${ex.sourcePaths[i]} and nothing follows it`;
      }
    }
    return null;
  }
  const norm = ex.sourceTransform === "html-text" ? src.htmlNorm : src.norm;
  if (!norm.startsWith(ex.text, ex.charOffset)) return `text not found verbatim at charOffset ${ex.charOffset}`;
  const after = norm[ex.charOffset + ex.text.length];
  if (ex.truncatedEnd && after !== undefined && after !== " ") return "truncatedEnd but the source continues mid-word after the text";
  return null;
}

/** null when the excerpt's display fields are label-shaped. */
export function checkDisplay(ex: { locator?: string }): string | null {
  const why = labelProblem(ex.locator ?? "");
  return why ? `locator ${why}` : null;
}
