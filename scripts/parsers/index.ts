// Parser registry: manifest.parser -> implementation.
import type { ParserId } from "../../src/db/types";
import { parseCcelTxt } from "./ccel-txt";
import { parseCreedJson } from "./creed-json-proofs";
import { parseHeadingRange } from "./heading-range";
import { parseHtmlChapters } from "./html-chapters";
import { parseInlineCitation } from "./inline-citation";
import { parseOpenBibleCrossrefs } from "./openbible-crossrefs";
import type { CrossRefParser, ExcerptParser } from "./types";
import { parseVerseCommentary } from "./verse-commentary";

export type ParserEntry =
  | { kind: "excerpts"; parse: ExcerptParser; sourceKind: "text" | "json" | "html" }
  | { kind: "crossrefs"; parse: CrossRefParser; sourceKind: "text" };

export const PARSERS: Record<ParserId, ParserEntry> = {
  "ccel-txt": { kind: "excerpts", parse: parseCcelTxt, sourceKind: "text" },
  "verse-commentary": { kind: "excerpts", parse: parseVerseCommentary, sourceKind: "text" },
  "heading-range": { kind: "excerpts", parse: parseHeadingRange, sourceKind: "text" },
  "inline-citation": { kind: "excerpts", parse: parseInlineCitation, sourceKind: "text" },
  "creed-json-proofs": { kind: "excerpts", parse: parseCreedJson, sourceKind: "json" },
  "html-chapters": { kind: "excerpts", parse: parseHtmlChapters, sourceKind: "html" },
  "openbible-crossrefs": { kind: "crossrefs", parse: parseOpenBibleCrossrefs, sourceKind: "text" },
};

export type { CrossRefParser, ExcerptParser, ParsedExcerpt, ParseCtx, RawFile } from "./types";
