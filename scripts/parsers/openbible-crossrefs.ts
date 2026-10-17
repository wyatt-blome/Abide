// openbible-crossrefs: OpenBible.info cross references (CC BY), a TSV of
//   From Verse <TAB> To Verse <TAB> Votes        e.g. "Gen.1.1	Prov.8.22-Prov.8.30	59"
// with a header line (the scrollmapper mirror's header ends "#www.openbible.info CC-BY …").
// These are data, not quotations: no excerpt text is produced. Each row becomes
// { from: "GEN.1.1", to: VerseRange, votes }. Rows below parserOptions.minVotes (default 1) and
// rows whose references fall outside the versification are dropped (logged as a count). With
// parserOptions.maxPerVerse, only the N highest-voted rows per "from" verse are kept (ties keep
// file order), which keeps the default-on download small while covering almost every verse.
import type { CrossRef } from "../../src/db/types";
import { parseOsis } from "../lib/citations";
import type { CrossRefParser } from "./types";

export const parseOpenBibleCrossrefs: CrossRefParser = (files, opts, ctx) => {
  const minVotes = typeof opts.minVotes === "number" ? opts.minVotes : 1;
  const out: CrossRef[] = [];
  let bad = 0;
  let low = 0;
  for (const f of files) {
    for (const line of f.text.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || /^From Verse/i.test(line)) continue;
      const cols = line.split("\t");
      if (cols.length < 3) { bad++; continue; }
      const votes = Number(cols[2]);
      if (!Number.isFinite(votes)) { bad++; continue; }
      if (votes < minVotes) { low++; continue; }
      const problems: string[] = [];
      const from = parseOsis(cols[0].trim(), ctx.meta, problems);
      const to = parseOsis(cols[1].trim(), ctx.meta, problems);
      if (problems.length || from.length !== 1 || to.length !== 1) { bad++; continue; }
      const s = from[0].start;
      out.push({ from: `${s.book}.${s.chapter}.${s.verse}`, to: to[0], votes });
    }
  }
  let capped = 0;
  let kept = out;
  const maxPer = typeof opts.maxPerVerse === "number" ? opts.maxPerVerse : 0;
  if (maxPer > 0) {
    const byFrom = new Map<string, CrossRef[]>();
    for (const x of out) {
      const l = byFrom.get(x.from);
      if (l) l.push(x);
      else byFrom.set(x.from, [x]);
    }
    kept = [];
    for (const l of byFrom.values()) {
      const sorted = l.map((x, i) => ({ x, i })).sort((a, b) => b.x.votes - a.x.votes || a.i - b.i).map((y) => y.x);
      kept.push(...sorted.slice(0, maxPer));
      capped += Math.max(0, sorted.length - maxPer);
    }
  }
  ctx.log(`[${ctx.packId}] ${kept.length} cross references kept; ${low} below minVotes=${minVotes}; ${capped} beyond maxPerVerse=${maxPer || "none"}; ${bad} unparseable or outside versification`);
  return kept;
};
