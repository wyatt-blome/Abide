// creed-json-proofs: confessions and catechisms from Creeds.json
// (github.com/NonlinearFruit/Creeds.json). Shape: { Metadata, Data: [...] } where items are
//   catechism  { Number, Question, Answer, AnswerWithProofs, Proofs: [{Id, References: ["Rom.8.28"]}] }
//   confession { Chapter, Title, Sections: [{ Section, Content, ContentWithProofs, Proofs }] }
//   articles   { Article, Title, Content }            (Belgic; references printed inline)
//   canons     { Chapter, Title, Sections: [{ Section: "A1" | "R1", Content }] }  (Dort; inline)
//
// Verbatim rule for JSON: an excerpt's text is built only from decoded JSON string values. Each
// part i is normalizeWs(value at sourcePaths[i]).slice(partOffsets[i], …); parts are joined with
// "\n" (normalized values never contain "\n", so the UI can split Q and A unambiguously and the
// verifier can check every part against its field). The plain field (Answer / Content) is used,
// not the "WithProofs" variant, so footnote markers "[1]" are not shown.
//
// mode "proofs": verse ranges = union of the item's Proofs references (mappingMethod proofText).
// mode "inline": verse ranges = citations printed in the text, "(Rom. 3:19)" (inlineCitation).
import type { VerseRange } from "../../src/db/types";
import { dedupeRanges } from "../lib/bible-meta";
import { findCitations, parseOsis } from "../lib/citations";
import { MAX_EXCERPT, MAX_SECTION, windowAround, windowFromStart } from "../lib/cut";
import { normalizeWs } from "../lib/normalize";
import type { ExcerptParser, ParsedExcerpt } from "./types";

export interface CreedOptions {
  mode: "proofs" | "inline";
  /** Name of the nested array of an item ("Sections"), if any. */
  nested?: string;
  /** Field names joined into the excerpt, e.g. ["Question", "Answer"] or ["Content"]. */
  textFields: string[];
  /** Locator template: {Field} of the item, {parent.Field} of the enclosing item. */
  locator: string;
  /** Prefix-letter labels for section ids like "A1"/"R1" ({"A": "Article", "R": "Rejection"}). */
  sectionLabels?: Record<string, string>;
  proofsField?: string;
}

type Item = Record<string, unknown>;

function render(tpl: string, item: Item, parent: Item | undefined, labels?: Record<string, string>): string {
  return tpl.replace(/\{(parent\.)?(\w+)\}/g, (_m, p: string | undefined, k: string) => {
    const src = p ? parent : item;
    let v = String(src?.[k] ?? "");
    const lm = labels && /^([A-Z])(\d+)$/.exec(v);
    if (lm && labels[lm[1]]) v = `${labels[lm[1]]} ${lm[2]}`;
    return v;
  });
}

export const parseCreedJson: ExcerptParser = (files, opts, ctx) => {
  const o = opts as unknown as CreedOptions;
  const out: ParsedExcerpt[] = [];
  for (const f of files) {
    const json = JSON.parse(f.text) as { Data: Item[] };
    const units: { item: Item; parent?: Item; path: string }[] = [];
    json.Data.forEach((it, i) => {
      if (o.nested && Array.isArray(it[o.nested]))
        (it[o.nested] as Item[]).forEach((sub, j) => units.push({ item: sub, parent: it, path: `Data.${i}.${o.nested}.${j}` }));
      else units.push({ item: it, path: `Data.${i}` });
    });
    for (const u of units) {
      const locator = render(o.locator, u.item, u.parent, o.sectionLabels);
      const fields = o.textFields.filter((k) => typeof u.item[k] === "string" && (u.item[k] as string).trim());
      if (!fields.length) continue;
      const values = fields.map((k) => normalizeWs(u.item[k] as string));
      // trim each part (offsets into the normalized value)
      const parts = values.map((v) => {
        const s = v.length - v.trimStart().length;
        return { s, e: v.trimEnd().length, v };
      });
      const paths = fields.map((k) => `${u.path}.${k}`);
      const key = `${f.rawIndex}:${u.path}`;

      if (o.mode === "proofs") {
        const problems: string[] = [];
        const refs = ((u.item[o.proofsField ?? "Proofs"] as { References?: string[] }[] | undefined) ?? [])
          .flatMap((p) => p.References ?? []);
        const ranges: VerseRange[] = dedupeRanges(refs.flatMap((r) => parseOsis(r, ctx.meta, problems)));
        for (const p of problems) ctx.log(`[${ctx.packId}] ${locator}: ${p}`);
        if (!ranges.length) continue;
        // Q + A fit → one excerpt; else keep earlier parts whole and cut the last at sentences.
        const total = parts.reduce((n, p) => n + (p.e - p.s), 0) + parts.length - 1;
        const base = { rawIndex: f.rawIndex, locator, verseRanges: ranges, mappingMethod: "proofText" as const, sourcePaths: paths };
        if (total <= MAX_EXCERPT) {
          out.push({ ...base, charOffset: parts[0].s, partOffsets: parts.map((p) => p.s), text: parts.map((p) => p.v.slice(p.s, p.e)).join("\n") });
          continue;
        }
        const head = parts.slice(0, -1);
        const lastP = parts[parts.length - 1];
        const headLen = head.reduce((n, p) => n + (p.e - p.s) + 1, 0);
        const w = windowFromStart(lastP.v, lastP.s, lastP.e, Math.max(200, MAX_EXCERPT - headLen));
        const cutText = [...head.map((p) => p.v.slice(p.s, p.e)), lastP.v.slice(w.start, w.end)].join("\n");
        out.push({ ...base, charOffset: parts[0].s, partOffsets: [...head.map((p) => p.s), w.start], text: cutText, truncatedEnd: true, sectionKey: key });
        const fw = windowFromStart(lastP.v, lastP.s, lastP.e, MAX_SECTION);
        out.push({
          ...base, charOffset: parts[0].s, partOffsets: [...head.map((p) => p.s), fw.start],
          text: [...head.map((p) => p.v.slice(p.s, p.e)), lastP.v.slice(fw.start, fw.end)].join("\n"),
          truncatedEnd: fw.truncatedEnd || undefined, sectionKey: key, isSection: true,
        });
        continue;
      }

      // inline mode: citations printed in each field
      parts.forEach((p, pi) => {
        const cites = findCitations(p.v, ctx.meta);
        const ranges: VerseRange[] = [];
        for (const c of cites) {
          for (const pr of c.problems) ctx.log(`[${ctx.packId}] ${locator}: "${c.text}" ${pr}`);
          ranges.push(...c.ranges);
        }
        if (!ranges.length) return;
        const base = { rawIndex: f.rawIndex, locator, mappingMethod: "inlineCitation" as const, sourcePaths: [paths[pi]] };
        if (p.e - p.s <= MAX_EXCERPT) {
          out.push({ ...base, verseRanges: dedupeRanges(ranges), charOffset: p.s, partOffsets: [p.s], text: p.v.slice(p.s, p.e) });
          return;
        }
        const pkey = `${key}.${pi}`;
        let last: ParsedExcerpt | undefined;
        for (const c of cites) {
          if (!c.ranges.length) continue;
          const w = windowAround(p.v, p.s, p.e, c.index, c.end);
          if (last && last.charOffset === w.start && last.text.length === w.end - w.start) {
            last.verseRanges = dedupeRanges([...last.verseRanges, ...c.ranges]);
            continue;
          }
          last = {
            ...base, verseRanges: dedupeRanges(c.ranges), charOffset: w.start, partOffsets: [w.start], text: p.v.slice(w.start, w.end),
            truncatedStart: w.truncatedStart || undefined, truncatedEnd: w.truncatedEnd || undefined, sectionKey: pkey,
          };
          out.push(last);
        }
        const fw = windowFromStart(p.v, p.s, p.e, MAX_SECTION);
        out.push({
          ...base, verseRanges: dedupeRanges(ranges), charOffset: fw.start, partOffsets: [fw.start], text: p.v.slice(fw.start, fw.end),
          truncatedEnd: fw.truncatedEnd || undefined, sectionKey: pkey, isSection: true,
        });
      });
    }
  }
  return out;
};
