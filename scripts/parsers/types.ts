import type { CrossRef, Excerpt, SourceType, VerseRange } from "../../src/db/types";
import type { BibleMeta } from "../lib/bible-meta";

/** One downloaded file of a pack, decoded to text (see scripts/lib/source-text.ts). */
export interface RawFile { text: string; rawIndex: number; url: string }

export interface ParseCtx {
  meta: BibleMeta;
  packId: string;
  /** bookScope[rawIndex] from the manifest (books a commentary volume covers). */
  bookScope?: string[][];
  /** Build log (library-build.log): dropped/ambiguous citations, skipped headings. */
  log: (msg: string) => void;
}

/**
 * What a parser returns. `text` is verbatim: text === normalizeWs(source).slice(charOffset,
 * charOffset + text.length), where source is the raw file text (or, for JSON, the field at
 * sourcePaths[0]; for HTML, htmlToText(raw)). Build-library turns these into Excerpt objects.
 */
export interface ParsedExcerpt {
  rawIndex: number;
  charOffset: number;
  text: string;
  locator: string;
  verseRanges: VerseRange[];
  mappingMethod: Excerpt["mappingMethod"];
  type?: SourceType;
  isBookIntro?: boolean;
  truncatedStart?: boolean;
  truncatedEnd?: boolean;
  /** JSON sources: dotted field paths; text = normalized values (sliced by partOffsets) joined by "\n". */
  sourcePaths?: string[];
  partOffsets?: number[];
  /** HTML sources: source text is htmlToText(raw). */
  sourceTransform?: "html-text";
  /** Excerpts sharing a sectionKey belong together; the one with isSection=true is the full section. */
  sectionKey?: string;
  isSection?: boolean;
  /** Substituted into manifest.urlTemplate as {anchor}. */
  anchor?: string;
}

export type ExcerptParser = (files: RawFile[], opts: Record<string, unknown>, ctx: ParseCtx) => ParsedExcerpt[];
export type CrossRefParser = (files: RawFile[], opts: Record<string, unknown>, ctx: ParseCtx) => CrossRef[];
