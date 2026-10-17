// CCEL plain-text layout helpers. A CCEL ".../cache/{work}.txt" file is a text rendering of the
// ThML edition: header ("Title:", "Print Basis:", "Rights: Public Domain"), "Table of Contents",
// body, then back matter starting at the last "Indexes" line (scripture/subject indexes) and a
// "References" list of link targets.

/** Raw [start, end) of the body: after the TOC's closing rule line, before the last "Indexes". */
export function ccelBodyRange(raw: string): [number, number] {
  let start = 0;
  const toc = /^\s*Table of Contents\s*$/m.exec(raw);
  if (toc && toc.index < raw.length * 0.5) {
    const after = raw.slice(toc.index);
    const rule = /^\s*_{10,}\s*$/m.exec(after);
    if (rule) start = toc.index + rule.index + rule[0].length;
  }
  let end = raw.length;
  const re = /^\s*Indexes\s*$/gm;
  let m: RegExpExecArray | null;
  let lastIdx = -1;
  while ((m = re.exec(raw))) lastIdx = m.index;
  if (lastIdx > start) end = lastIdx;
  return [start, end];
}
