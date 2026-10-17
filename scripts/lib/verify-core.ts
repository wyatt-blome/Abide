// The single definition of "this excerpt is verbatim", used by build-library (self-check before
// writing) and verify-excerpts (independent re-check from the cached/downloaded raw files).
//
//   text source      check
//   plain text       normalizeWs(rawText).startsWith(ex.text, ex.charOffset)
//   html-text        normalizeWs(htmlToText(rawText)).startsWith(ex.text, ex.charOffset)
//   JSON             ex.text.split("\n")[i] must equal
//                    normalizeWs(field at ex.sourcePaths[i]).slice(partOffsets[i], …) for every i
// plus sha256(ex.text) === ex.verbatimHash (when the excerpt already has one).
import { sha256 } from "./hash";
import { normalizeWs } from "./normalize";
import { getJsonPath, htmlToText } from "./source-text";

export interface VerifiableExcerpt {
  id?: string; text: string; charOffset: number; verbatimHash?: string;
  sourcePaths?: string[]; partOffsets?: number[]; sourceTransform?: "html-text";
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
  if (ex.sourcePaths?.length) {
    const parts = ex.text.split("\n");
    const offs = ex.partOffsets ?? [ex.charOffset];
    if (parts.length !== ex.sourcePaths.length || offs.length !== parts.length) return "sourcePaths/partOffsets do not match text parts";
    if (offs[0] !== ex.charOffset) return "charOffset differs from partOffsets[0]";
    for (let i = 0; i < parts.length; i++) {
      const v = src.field(ex.sourcePaths[i]);
      if (v === null) return `JSON field ${ex.sourcePaths[i]} not found`;
      if (!parts[i] || !v.startsWith(parts[i], offs[i])) return `text part ${i} not found verbatim at ${ex.sourcePaths[i]}[${offs[i]}]`;
    }
    return null;
  }
  const norm = ex.sourceTransform === "html-text" ? src.htmlNorm : src.norm;
  if (!norm.startsWith(ex.text, ex.charOffset)) return `text not found verbatim at charOffset ${ex.charOffset}`;
  return null;
}
