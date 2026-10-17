// inline-citation: works whose paragraphs print their own scripture references
// ("(Rom. viii. 28)", "Ps. 23:1"). Each citation maps the sentences around it. Headings (from
// parserOptions.headings) only provide locators and the context for relative "ver. 5" refs.
//
// parserOptions (all optional): headings, bodyStart, bodyEnd, gutenberg, minChars, titlePattern,
//   bookIntro: true | BookCode — the work as a whole introduces ONE book (Luther's Preface to
//   Romans). The book is derived from the work's own title line (titlePattern, default
//   "^Title:\s*(.+)$"): bookInTitle must find exactly one book named in it ("Preface to the
//   Letter of St. Paul to the Romans" → ROM). A BookCode here only RESTRICTS that match (the
//   title must name that book); it never supplies the mapping. When the title names no book, no
//   intro is emitted and the miss is logged. The opening (cut at a paragraph boundary) becomes an
//   isBookIntro excerpt mapped to the whole book (mappingMethod "heading", since it comes from
//   the work's own title), plus the full text as the section excerpt.
import { bookRange } from "../lib/bible-meta";
import { MAX_EXCERPT, MAX_SECTION, windowFromStart, windowParagraphs } from "../lib/cut";
import { type EmitOptions, inlineExcerpts } from "./emit";
import { type StructureOptions, bookFromTitleLines, prepareStructure } from "./structure";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export type InlineOptions = StructureOptions & EmitOptions & { bookIntro?: boolean | string; introLocator?: string };

export const parseInlineCitation: ExcerptParser = (files, opts, ctx) => {
  const o = opts as InlineOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const prep = prepareStructure(f, o, ctx);
    if (o.bookIntro && f.rawIndex === 0 && prep.sections.length) {
      const restrict = typeof o.bookIntro === "string" ? [o.bookIntro] : undefined;
      const { book, title } = bookFromTitleLines(f.text, o.titlePattern, restrict);
      if (!book) {
        ctx.log(`[${ctx.packId}] bookIntro: the title line (${title ? `"${title}"` : "none found"}) names no${restrict ? ` ${restrict[0]}` : ""} book; no book intro emitted`);
      } else {
        ctx.log(`[${ctx.packId}] bookIntro: ${book} from the title line "${title}"`);
        const text = prep.nm.text;
        const paras = prep.sections.flatMap((s) => s.paras);
        const start = paras[0][0];
        const end = paras[paras.length - 1][1];
        const w = windowParagraphs(text, start, end, paras.map(([, e]) => e), Math.min(o.maxChars ?? MAX_EXCERPT, MAX_EXCERPT));
        const key = `intro:${start}`;
        const base = {
          rawIndex: f.rawIndex, locator: o.introLocator ?? prep.sections[0].locator, verseRanges: [bookRange(ctx.meta, book)],
          mappingMethod: "heading" as const, isBookIntro: true,
        };
        if (!w) ctx.log(`[${ctx.packId}] bookIntro: opening sentence longer than the limit; no book intro emitted`);
        else {
          out.push({ ...base, charOffset: w.start, text: text.slice(w.start, w.end), truncatedEnd: w.truncatedEnd || undefined, sectionKey: w.truncatedEnd ? key : undefined });
          const full = w.truncatedEnd ? windowFromStart(text, start, end, Math.min(o.sectionMaxChars ?? MAX_SECTION, MAX_SECTION)) : null;
          if (full) out.push({ ...base, charOffset: full.start, text: text.slice(full.start, full.end), truncatedEnd: full.truncatedEnd || undefined, sectionKey: key, isSection: true });
        }
      }
    }
    for (const sec of prep.sections) out.push(...inlineExcerpts(prep, sec, o, ctx));
  }
  return out;
};
