// html-chapters: a work published as HTML pages (Machen, Christianity and Liberalism on CCEL:
// home.html plus chapter pages discovered from its links at build time).
//
// Source text for HTML is htmlToText(raw) — markup removed, entities decoded, block tags turned
// into paragraph breaks, words untouched (scripts/lib/source-text.ts). Excerpts carry
// sourceTransform "html-text" so the verifier applies the same transform before checking.
// Headings: <h1>-<h4> become their own paragraphs; parserOptions.headings label them (e.g.
// "^(?:Chapter|CHAPTER) ([IVX]+)"). Paragraphs are mapped by their inline citations.
import { htmlToText } from "../lib/source-text";
import { type EmitOptions, inlineExcerpts } from "./emit";
import { type StructureOptions, prepareStructure } from "./structure";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export type HtmlOptions = StructureOptions & EmitOptions;

export const parseHtmlChapters: ExcerptParser = (files, opts, ctx) => {
  const o = opts as HtmlOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const text = htmlToText(f.text);
    const prep = prepareStructure({ ...f, text }, { ...o, gutenberg: false }, ctx);
    for (const sec of prep.sections)
      for (const x of inlineExcerpts(prep, sec, o, ctx)) out.push({ ...x, sourceTransform: "html-text" });
  }
  return out;
};
