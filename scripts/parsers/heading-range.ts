// heading-range: works divided into units whose heading (or the text line printed under it)
// states the passage — homilies ("Homily XV. Matt. iv. 23"), tractates ("Tractate I. Chapter I.
// 1-5"), sermons (text line "—Romans viii. 28"), Spurgeon's Treasury ("PSALM XXIII" →
// "EXPOSITION" → "Verse 1."), Morning and Evening entries (the entry's verse).
// The unit's text, under each (sub-)heading, is excerpted and mapped to that range.
// parserOptions: headings (HeadingRule[] — use level "unit" with refFromLine/refLookahead for
//   sermon texts, "chapter"/"verse"/"label" for Treasury-style sub-headings), mappingMethod
//   ("heading" | "sermonText" | "entryVerse"), locatorFromRange, minChars, sectionMaxChars.
import { type EmitOptions, sectionExcerpts } from "./emit";
import { type StructureOptions, prepareStructure } from "./structure";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export type HeadingRangeOptions = StructureOptions & EmitOptions;

export const parseHeadingRange: ExcerptParser = (files, opts, ctx) => {
  const o = opts as HeadingRangeOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const prep = prepareStructure(f, o, ctx);
    for (const sec of prep.sections) out.push(...sectionExcerpts(prep, sec, o, o.mappingMethod ?? "heading", (s) => ctx.log(`[${ctx.packId}] ${s}`)));
  }
  return out;
};
