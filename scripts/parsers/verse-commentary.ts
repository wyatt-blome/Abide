// verse-commentary: commentaries arranged book → chapter → verse, where the work's own headings
// or paragraph-start verse numbers say which verses a passage expounds:
//   Henry      "CHAPTER VIII." … "Verses 1–5"           (+ book intro before chapter 1)
//   Wesley NT  "Verse 28." / "28. And we know …"
//   Luther Gal "VERSE 20."
//   Calvin     "28. And we know …" under "CHAPTER 8" headings
// Each section maps to its heading's range (mappingMethod "heading"). Book intros (rule level
// "book" with intro: true) are cut at a paragraph boundary and flagged isBookIntro.
// parserOptions: headings (HeadingRule[]), bodyStart, bodyEnd, minChars, sectionMaxChars,
//   alsoInline: true → additionally map paragraphs by their inline citations.
import { type EmitOptions, inlineExcerpts, sectionExcerpts } from "./emit";
import { type StructureOptions, prepareStructure } from "./structure";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export type VerseCommentaryOptions = StructureOptions & EmitOptions & { alsoInline?: boolean };

export const parseVerseCommentary: ExcerptParser = (files, opts, ctx) => {
  const o = opts as VerseCommentaryOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const prep = prepareStructure(f, o, ctx);
    for (const sec of prep.sections) {
      out.push(...sectionExcerpts(prep, sec, o, o.mappingMethod ?? "heading"));
      if (o.alsoInline && !sec.ranges.length) out.push(...inlineExcerpts(prep, sec, o, ctx));
    }
  }
  return out;
};
