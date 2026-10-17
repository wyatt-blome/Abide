// inline-citation: works whose paragraphs print their own scripture references
// ("(Rom. viii. 28)", "Ps. 23:1"). Each citation maps the sentences around it. Headings (from
// parserOptions.headings) only provide locators and the context for relative "ver. 5" refs.
//
// parserOptions (all optional): headings, bodyStart, bodyEnd, gutenberg, minChars,
//   bookIntro: BookCode — the work as a whole introduces that book (Luther's Preface to Romans):
//   its opening (cut at a paragraph boundary) becomes an isBookIntro excerpt mapped to the whole
//   book, plus the full text as the section excerpt.
import { bookRange } from "../lib/bible-meta";
import { MAX_EXCERPT, MAX_SECTION, windowFromStart, windowParagraphs } from "../lib/cut";
import { type EmitOptions, inlineExcerpts } from "./emit";
import { type StructureOptions, prepareStructure } from "./structure";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export type InlineOptions = StructureOptions & EmitOptions & { bookIntro?: string; introLocator?: string };

export const parseInlineCitation: ExcerptParser = (files, opts, ctx) => {
  const o = opts as InlineOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const prep = prepareStructure(f, o, ctx);
    if (o.bookIntro && f.rawIndex === 0 && prep.sections.length) {
      const text = prep.nm.text;
      const paras = prep.sections.flatMap((s) => s.paras);
      const start = paras[0][0];
      const end = paras[paras.length - 1][1];
      const w = windowParagraphs(text, start, end, paras.map(([, e]) => e), o.maxChars ?? MAX_EXCERPT);
      const key = `intro:${start}`;
      const base = {
        rawIndex: f.rawIndex, locator: o.introLocator ?? prep.sections[0].locator, verseRanges: [bookRange(ctx.meta, o.bookIntro)],
        mappingMethod: "heading" as const, isBookIntro: true,
      };
      out.push({ ...base, charOffset: w.start, text: text.slice(w.start, w.end), truncatedEnd: w.truncatedEnd || undefined, sectionKey: w.truncatedEnd ? key : undefined });
      if (w.truncatedEnd) {
        const full = windowFromStart(text, start, end, o.sectionMaxChars ?? MAX_SECTION);
        out.push({ ...base, charOffset: full.start, text: text.slice(full.start, full.end), truncatedEnd: full.truncatedEnd || undefined, sectionKey: key, isSection: true });
      }
    }
    for (const sec of prep.sections) out.push(...inlineExcerpts(prep, sec, o, ctx));
  }
  return out;
};
