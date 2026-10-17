// Turning sections (see structure.ts) into verbatim excerpts.
//  - sectionExcerpts: the section is mapped by its heading. Excerpt = opening of the section cut
//    at sentence boundaries (book intros: at a paragraph boundary) ≤ 1,500 chars; when that is
//    shorter than the section, a second "full section" excerpt (≤ 12,000 chars, isSection) is
//    emitted and linked through sectionKey.
//  - inlineExcerpts: each paragraph's own printed citations map it. Excerpt = the sentences around
//    the citation (≤ 1,500); the full paragraph is the section excerpt when cut.
import type { Excerpt, VerseRange } from "../../src/db/types";
import type { BibleMeta } from "../lib/bible-meta";
import { dedupeRanges } from "../lib/bible-meta";
import { type CitationContext, findCitations } from "../lib/citations";
import { MAX_EXCERPT, MAX_SECTION, type Window, windowAround, windowFromStart, windowParagraphs } from "../lib/cut";
import type { Prepared, Section } from "./structure";
import type { ParseCtx, ParsedExcerpt } from "./types";

export interface EmitOptions {
  mappingMethod?: Excerpt["mappingMethod"];
  /** Minimum excerpt length; shorter sections/paragraphs are skipped. */
  minChars?: number;
  maxChars?: number;
  sectionMaxChars?: number;
  /** Emit full-section excerpts (default true). */
  fullSections?: boolean;
}

function full(text: string, s: number, e: number, max: number): Window | null {
  return windowFromStart(text, s, e, max);
}

const noLog = () => {};

export function sectionExcerpts(
  prep: Prepared, sec: Section, o: EmitOptions, method: Excerpt["mappingMethod"], log: (s: string) => void = noLog,
): ParsedExcerpt[] {
  const text = prep.nm.text;
  const max = Math.min(o.maxChars ?? MAX_EXCERPT, MAX_EXCERPT);
  if (!sec.ranges.length || sec.end - sec.start < (o.minChars ?? 40)) return [];
  const paraEnds = sec.paras.map(([, e]) => e);
  const w = sec.isIntro ? windowParagraphs(text, sec.start, sec.end, paraEnds, max) : windowFromStart(text, sec.start, sec.end, max);
  if (!w) {
    log(`${sec.locator || "?"}: first sentence/clause longer than ${max} chars; section not excerpted (no word-level cut)`);
    return [];
  }
  const key = `${sec.rawIndex}:${sec.start}`;
  const base = {
    rawIndex: sec.rawIndex, locator: sec.locator, verseRanges: sec.ranges, mappingMethod: method,
    isBookIntro: sec.isIntro || undefined, anchor: sec.anchor,
  };
  const out: ParsedExcerpt[] = [{
    ...base, charOffset: w.start, text: text.slice(w.start, w.end),
    truncatedEnd: w.truncatedEnd || undefined, sectionKey: w.truncatedEnd ? key : undefined,
  }];
  if (w.truncatedEnd && o.fullSections !== false) {
    const f = full(text, sec.start, sec.end, Math.min(o.sectionMaxChars ?? MAX_SECTION, MAX_SECTION));
    if (!f) log(`${sec.locator || "?"}: no full-section excerpt (no sentence end within the section limit)`);
    else out.push({ ...base, charOffset: f.start, text: text.slice(f.start, f.end), truncatedEnd: f.truncatedEnd || undefined, sectionKey: key, isSection: true });
  }
  return out;
}

/** Citations in each paragraph of the section. `confirm` (scripture index) filters ranges. */
export function inlineExcerpts(
  prep: Prepared, sec: Section, o: EmitOptions, ctx: ParseCtx,
  confirm?: (r: VerseRange) => boolean,
): ParsedExcerpt[] {
  const text = prep.nm.text;
  const meta: BibleMeta = ctx.meta;
  const out: ParsedExcerpt[] = [];
  const max = Math.min(o.maxChars ?? MAX_EXCERPT, MAX_EXCERPT);
  const context: CitationContext = sec.context;
  for (const [ps, pe] of sec.paras) {
    if (pe - ps < (o.minChars ?? 40)) continue;
    const para = text.slice(ps, pe);
    const cites = findCitations(para, meta, context);
    let last: ParsedExcerpt | null = null;
    let sectionKey: string | undefined;
    for (const c of cites) {
      for (const p of c.problems) ctx.log(`[${ctx.packId}] ${sec.locator || "?"}: "${c.text}" ${p}`);
      let ranges = c.ranges;
      if (confirm) {
        const kept = ranges.filter(confirm);
        if (kept.length < ranges.length) ctx.log(`[${ctx.packId}] ${sec.locator || "?"}: "${c.text}" not in the work's scripture index, dropped`);
        ranges = kept;
      }
      if (!ranges.length) continue;
      const w = windowAround(text, ps, pe, ps + c.index, ps + c.end, max);
      if (!w) {
        ctx.log(`[${ctx.packId}] ${sec.locator || "?"}: "${c.text}" sits in a clause longer than ${max} chars; dropped (no word-level cut)`);
        continue;
      }
      if (last && last.charOffset === w.start && last.text.length === w.end - w.start) {
        last.verseRanges = dedupeRanges([...last.verseRanges, ...ranges]);
        continue;
      }
      const cut = w.truncatedStart || w.truncatedEnd;
      if (cut) sectionKey ??= `${sec.rawIndex}:${ps}`;
      last = {
        rawIndex: sec.rawIndex, charOffset: w.start, text: text.slice(w.start, w.end), locator: sec.locator,
        verseRanges: dedupeRanges(ranges), mappingMethod: o.mappingMethod ?? "inlineCitation",
        truncatedStart: w.truncatedStart || undefined, truncatedEnd: w.truncatedEnd || undefined,
        sectionKey: cut ? sectionKey : undefined, anchor: sec.anchor,
      };
      out.push(last);
    }
    const f = sectionKey && o.fullSections !== false ? full(text, ps, pe, Math.min(o.sectionMaxChars ?? MAX_SECTION, MAX_SECTION)) : null;
    if (sectionKey && o.fullSections !== false && !f) ctx.log(`[${ctx.packId}] ${sec.locator || "?"}: no full-section excerpt for a paragraph (no sentence end within the limit)`);
    if (sectionKey && f) {
      const all = dedupeRanges(out.filter((x) => x.sectionKey === sectionKey).flatMap((x) => x.verseRanges));
      out.push({
        rawIndex: sec.rawIndex, charOffset: f.start, text: text.slice(f.start, f.end), locator: sec.locator,
        verseRanges: all, mappingMethod: o.mappingMethod ?? "inlineCitation", truncatedEnd: f.truncatedEnd || undefined,
        sectionKey, isSection: true, anchor: sec.anchor,
      });
    }
  }
  return out;
}
