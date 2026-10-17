// npm run build:bible
//
// Builds the bundled Bible data in public/bible/ from downloaded public-domain sources:
//   public/bible/{bsb,web,kjv}/{BOOK}.json   { "1": ["v1", "v2", ...], ... }  ("" = no text)
//   public/bible/meta.json                    BSB chapter/verse grid + empty BSB verses
//   public/bible/bsb/headings.json            BsbHeading[] parsed from the BSB USFM (\s1 \s2 \ms \d)
//   public/bible/sources.json                 URL used + sha256 per raw file + license line
//
// Nothing here types Bible text or headings: every string comes out of a downloaded file.
// Each source has the spec's primary URL first, then an ordered mirror list (see DECISIONS.md).

import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { BOOKS, BOOK_CODES } from "../src/lib/books";
import type { BsbHeading } from "../src/db/types";
import { fetchFirst, mapLimit, sha256, type Fetched } from "./bible/fetch";
import { parseUsfm, type UsfmParse } from "./bible/usfm";
import { collapse, parseScrollmapperJson, parseUsfx, parseVpl, type VerseTable } from "./bible/parsers";

const OUT = path.resolve(process.cwd(), "public/bible");

// ---------------------------------------------------------------- sources

const SRC = {
  bsbJson: ["https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/BSB.json"],
  bsbUsfmZip: ["https://ebible.org/Scriptures/engbsb_usfm.zip"],
  /** Paratext numbering: OT 01–39, NT 41–67 (40 is skipped). */
  bsbUsfmBook: (code: string): string[] => {
    const i = BOOK_CODES.indexOf(code);
    const nn = String(i < 39 ? i + 1 : i + 2).padStart(2, "0");
    return [`https://raw.githubusercontent.com/usfm-bible/examples.bsb/main/${nn}${code}BSB.usfm`];
  },
  web: ["https://ebible.org/Scriptures/engwebp_vpl.zip", "https://raw.githubusercontent.com/seven1m/open-bibles/master/eng-web.usfx.xml"],
  kjv: ["https://ebible.org/Scriptures/eng-kjv_vpl.zip", "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json"],
  licenseReadme: ["https://raw.githubusercontent.com/seven1m/open-bibles/master/README.md"],
};

/** Verses the BSB leaves empty (text only in footnotes). Spec acceptance list. */
const EXPECTED_BSB_EMPTY = [
  "MAT.17.21", "MAT.18.11", "MAT.23.14", "MRK.7.16", "MRK.9.44", "MRK.9.46", "MRK.11.26", "MRK.15.28",
  "LUK.17.36", "LUK.23.17", "JHN.5.4", "ACT.8.37", "ACT.15.34", "ACT.24.7", "ACT.28.29", "ROM.16.24",
];

/** Spec expectations, asserted against the data. */
const EXPECT = { total: 31102, nonEmpty: 31086, psaPro: 3376, psa: 2461, pro: 915, nt: 7957, otRest: 19769 };

// ---------------------------------------------------------------- helpers

function fail(msg: string): never {
  console.error(`\n[build-bible] FAILED: ${msg}\n`);
  process.exit(1);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

function unzipText(bytes: Uint8Array, pick: (name: string) => boolean): Map<string, string> {
  const files = unzipSync(bytes, { filter: (f) => pick(f.name) });
  const out = new Map<string, string>();
  for (const [name, data] of Object.entries(files)) out.set(name, strFromU8(data));
  return out;
}

interface SourceRecord {
  url: string;
  sha256: string;
  bytes: number;
}
const rec = (f: Fetched): SourceRecord => ({ url: f.url, sha256: f.sha256, bytes: f.bytes.length });

function dirSize(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const s = statSync(p);
    n += s.isDirectory() ? dirSize(p) : s.size;
  }
  return n;
}

// ---------------------------------------------------------------- main

async function main() {
  console.log("[build-bible] start");

  // ---------- BSB verse text (JSON) ----------
  const bsbJsonF = await fetchFirst("BSB JSON", SRC.bsbJson);
  const markupSeen = new Set<string>();
  const bsbParsed = parseScrollmapperJson(strFromU8(bsbJsonF.bytes), (t) => {
    if (/[\\<>{}[\]]/.test(t)) markupSeen.add(t.slice(0, 60));
    return collapse(t);
  });
  assert(bsbParsed.unmappedBooks.length === 0, `BSB JSON has unmapped books: ${bsbParsed.unmappedBooks.join(", ")}`);
  assert(bsbParsed.table.size === 66, `BSB JSON has ${bsbParsed.table.size} books, expected 66`);
  if (markupSeen.size) console.warn(`[build-bible] BSB JSON verses containing markup-like characters: ${markupSeen.size}`);

  // ---------- BSB USFM (headings) ----------
  const usfmRecords: Record<string, SourceRecord> = {};
  const usfmByBook = new Map<string, string>();
  let usfmZip: SourceRecord | null = null;
  try {
    const z = await fetchFirst("BSB USFM zip", SRC.bsbUsfmZip);
    if (!isZip(z.bytes)) throw new Error("not a zip");
    const files = unzipText(z.bytes, (n) => /\.usfm$|\.sfm$/i.test(n));
    for (const [, txt] of files) {
      const id = /\\id\s+([A-Z0-9]{3})/.exec(txt)?.[1];
      if (id && BOOK_CODES.includes(id)) usfmByBook.set(id, txt);
    }
    assert(usfmByBook.size === 66, `BSB USFM zip has ${usfmByBook.size} canonical books`);
    usfmZip = rec(z);
  } catch (e) {
    console.warn(`[build-bible] BSB USFM zip unavailable (${(e as Error).message.split("\n")[0]}); using per-book mirror`);
    usfmByBook.clear();
    await mapLimit(BOOK_CODES, 8, async (code) => {
      const f = await fetchFirst(`BSB USFM ${code}`, SRC.bsbUsfmBook(code), { quiet: true });
      usfmByBook.set(code, strFromU8(f.bytes));
      usfmRecords[code] = rec(f);
    });
    console.log(`[fetch] BSB USFM: ${Object.keys(usfmRecords).length} books from ${SRC.bsbUsfmBook("GEN")[0].replace(/01GENBSB\.usfm$/, "{NN}{BOOK}BSB.usfm")}`);
  }

  const usfm = new Map<string, UsfmParse>();
  const unknownMarkers = new Set<string>();
  const orphanHeadings: string[] = [];
  for (const code of BOOK_CODES) {
    const p = parseUsfm(usfmByBook.get(code)!, code);
    usfm.set(code, p);
    p.unknownMarkers.forEach((m) => unknownMarkers.add(m));
    for (const o of p.orphanHeadings) orphanHeadings.push(`${code} \\${o.marker}`);
  }
  if (unknownMarkers.size) console.warn(`[build-bible] USFM markers treated as verse paragraphs: ${[...unknownMarkers].join(" ")}`);
  if (orphanHeadings.length) console.warn(`[build-bible] headings with no following verse (dropped): ${orphanHeadings.join(", ")}`);

  // ---------- BSB grid (from the JSON; versification of the app) ----------
  interface BookGrid { code: string; name: string; chapters: number; verses: number[] }
  const grid: BookGrid[] = [];
  const bsbOut = new Map<string, string[][]>(); // book -> chapters[] -> verses[]
  let insertedEmptySlots = 0;
  for (const b of BOOKS) {
    const t = bsbParsed.table.get(b.code);
    assert(t, `BSB JSON missing book ${b.code}`);
    const chNums = [...t.keys()].sort((x, y) => x - y);
    const nCh = chNums[chNums.length - 1];
    assert(chNums.length === nCh, `${b.code}: chapter numbering has gaps`);
    const verses: number[] = [];
    const chapters: string[][] = [];
    for (let c = 1; c <= nCh; c++) {
      const vm = t.get(c)!;
      const maxV = Math.max(...vm.keys());
      const arr: string[] = [];
      for (let v = 1; v <= maxV; v++) {
        if (!vm.has(v)) insertedEmptySlots++;
        arr.push(vm.get(v) ?? "");
      }
      verses.push(maxV);
      chapters.push(arr);
    }
    grid.push({ code: b.code, name: b.name, chapters: nCh, verses });
    bsbOut.set(b.code, chapters);
  }

  // ---------- Psalm superscriptions: the JSON prepends the \d text to verse 1; USFM keeps it apart ----------
  // When a \d heading sits on verse 1 and the JSON verse 1 begins with exactly that text, the
  // superscription is removed from the verse (it is shown as the \d heading instead).
  let superscriptionsMoved = 0;
  const superscriptionNotPrefix: string[] = [];
  for (const code of BOOK_CODES) {
    const p = usfm.get(code)!;
    for (const h of p.headings) {
      if (h.level !== "d" || h.verse !== 1) continue;
      const arr = bsbOut.get(code)![h.chapter - 1];
      const v1 = arr[0];
      // The USFM uses U+02BC for apostrophes where the JSON uses U+2019 (same length, one code unit).
      const apos = (x: string) => x.replace(/\u02BC/g, "\u2019");
      if (apos(v1).startsWith(apos(h.text) + " ")) {
        arr[0] = v1.slice(h.text.length + 1).trim();
        superscriptionsMoved++;
      } else if (v1 !== "") {
        superscriptionNotPrefix.push(`${code}.${h.chapter}.1`);
      }
    }
  }
  console.log(`[build-bible] superscriptions moved from verse 1 to \\d heading: ${superscriptionsMoved}; \\d not a verse-1 prefix: ${superscriptionNotPrefix.length} ${superscriptionNotPrefix.slice(0, 10).join(" ")}`);

  // ---------- cross-check BSB JSON vs USFM verse text (logged, not fatal) ----------
  // Case-insensitive (the JSON prints \nd "Lord" as "LORD"), apostrophe- and whitespace-normalized.
  const norm = (s: string) => s.replace(/\u02BC/g, "\u2019").replace(/\s+/g, " ").trim().toLowerCase();
  let usfmCompared = 0;
  let usfmMismatch = 0;
  const usfmMismatchSamples: string[] = [];
  let usfmMissingVerse = 0;
  let usfmExtraVerse = 0;
  for (const g of grid) {
    const p = usfm.get(g.code)!;
    const chapters = bsbOut.get(g.code)!;
    for (let c = 1; c <= g.chapters; c++) {
      const um = p.verses.get(c) ?? new Map<number, string>();
      for (let v = 1; v <= g.verses[c - 1]; v++) {
        const j = chapters[c - 1][v - 1];
        const u = um.get(v);
        if (u === undefined) {
          if (j !== "") usfmMissingVerse++;
          continue;
        }
        usfmCompared++;
        if (norm(u) !== norm(j)) {
          usfmMismatch++;
          if (usfmMismatchSamples.length < 8) usfmMismatchSamples.push(`${g.code}.${c}.${v}`);
        }
      }
      for (const v of um.keys()) if (v > g.verses[c - 1]) usfmExtraVerse++;
    }
    for (const c of p.verses.keys()) if (c > g.chapters) usfmExtraVerse += p.verses.get(c)!.size;
  }
  console.log(
    `[build-bible] BSB JSON vs USFM: compared ${usfmCompared}, text differs ${usfmMismatch} (${usfmMismatchSamples.join(" ")}), ` +
      `USFM lacks ${usfmMissingVerse} non-empty JSON verses, USFM has ${usfmExtraVerse} verses outside the JSON grid`,
  );

  // ---------- BSB assertions ----------
  const totalVerses = grid.reduce((n, g) => n + g.verses.reduce((a, b) => a + b, 0), 0);
  const emptyBsb: string[] = [];
  let nonEmpty = 0;
  for (const g of grid) {
    bsbOut.get(g.code)!.forEach((arr, ci) =>
      arr.forEach((t, vi) => {
        if (t === "") emptyBsb.push(`${g.code}.${ci + 1}.${vi + 1}`);
        else nonEmpty++;
      }),
    );
  }
  const sumBooks = (codes: (c: string) => boolean) =>
    grid.filter((g) => codes(g.code)).reduce((n, g) => n + g.verses.reduce((a, b) => a + b, 0), 0);
  const ntCodes = new Set(BOOKS.filter((b) => b.testament === "NT").map((b) => b.code));
  const psa = sumBooks((c) => c === "PSA");
  const pro = sumBooks((c) => c === "PRO");
  const nt = sumBooks((c) => ntCodes.has(c));
  const otRest = sumBooks((c) => !ntCodes.has(c) && c !== "PSA" && c !== "PRO");
  console.log(`[build-bible] BSB totals: verses ${totalVerses}, non-empty ${nonEmpty}, empty ${emptyBsb.length}, PSA ${psa}, PRO ${pro}, NT ${nt}, OT rest ${otRest}; inserted empty slots ${insertedEmptySlots}`);

  assert(totalVerses === EXPECT.total, `BSB total verses ${totalVerses} != ${EXPECT.total}`);
  assert(
    emptyBsb.length === EXPECTED_BSB_EMPTY.length && EXPECTED_BSB_EMPTY.every((k) => emptyBsb.includes(k)),
    `BSB empty verses differ from spec list: got [${emptyBsb.join(", ")}]`,
  );
  assert(nonEmpty === EXPECT.nonEmpty, `BSB non-empty verses ${nonEmpty} != ${EXPECT.nonEmpty}`);
  assert(psa === EXPECT.psa && pro === EXPECT.pro && psa + pro === EXPECT.psaPro, `PSA ${psa} / PRO ${pro} != ${EXPECT.psa} / ${EXPECT.pro}`);
  assert(nt === EXPECT.nt, `NT verses ${nt} != ${EXPECT.nt}`);
  assert(otRest === EXPECT.otRest, `OT (excluding PSA/PRO) verses ${otRest} != ${EXPECT.otRest}`);

  // ---------- headings ----------
  const headings: BsbHeading[] = [];
  let headingsOffGrid = 0;
  for (const g of grid) {
    for (const h of usfm.get(g.code)!.headings) {
      if (h.chapter < 1 || h.chapter > g.chapters || h.verse < 1 || h.verse > g.verses[h.chapter - 1]) {
        headingsOffGrid++;
        continue;
      }
      headings.push(h);
    }
  }
  const hasHeading = (book: string, c: number, v: number, level: string, text: string) =>
    headings.some((h) => h.book === book && h.chapter === c && h.verse === v && h.level === level && h.text === text);
  // Acceptance checks given by the user (strings allowed here only as assertions).
  assert(hasHeading("PSA", 1, 1, "s1", "The Two Paths"), "acceptance: PSA 1:1 s1 heading missing");
  assert(hasHeading("MAT", 1, 1, "s1", "The Genealogy of Jesus"), "acceptance: MAT 1:1 s1 heading missing");
  assert(hasHeading("PSA", 1, 1, "ms", "BOOK I"), "acceptance: PSA 1:1 ms heading missing");
  const headingResidue = headings.filter((h) => /[\\|*]/.test(h.text));
  assert(headingResidue.length === 0, `heading text has USFM residue: ${headingResidue.slice(0, 3).map((h) => h.text).join(" / ")}`);
  const levelCounts = headings.reduce<Record<string, number>>((a, h) => ((a[h.level] = (a[h.level] ?? 0) + 1), a), {});
  console.log(`[build-bible] headings: ${headings.length} ${JSON.stringify(levelCounts)}, off-grid dropped ${headingsOffGrid}`);

  // ---------- WEB ----------
  const webF = await fetchFirst("WEB", SRC.web);
  let webTable: VerseTable;
  let webFormat: string;
  if (isZip(webF.bytes)) {
    const files = unzipText(webF.bytes, (n) => /_vpl\.txt$/i.test(n));
    const txt = [...files.values()][0];
    assert(txt, "WEB zip has no *_vpl.txt");
    const p = parseVpl(txt, (t) => collapse(t.replace(/¶/g, "")));
    webTable = p.table;
    webFormat = "eBible VPL";
    console.log(`[build-bible] WEB VPL skipped non-canonical books: ${[...p.skippedBooks].join(" ")}`);
  } else {
    const p = parseUsfx(strFromU8(webF.bytes));
    webTable = p.table;
    webFormat = "USFX XML";
    console.log(`[build-bible] WEB USFX skipped non-canonical books: ${[...p.skippedBooks].join(" ")}; ranged verse ids: ${p.rangedVerses}`);
  }

  // ---------- KJV ----------
  const kjvF = await fetchFirst("KJV", SRC.kjv);
  let kjvTable: VerseTable;
  let kjvFormat: string;
  let kjvBracketed = 0;
  let kjvAcrostic = 0;
  const kjvClean = (t: string, book?: string, ch?: number): string => {
    let s = t;
    // Psalm 119 stanza labels ("<Hebrew letter> <NAME>.") are headings, not verse text.
    if (book === "PSA" && ch === 119) {
      const m = /^[א-ת]\s+[A-Z]+\.\s*/.exec(s);
      if (m) {
        s = s.slice(m[0].length);
        kjvAcrostic++;
      }
    }
    // Brackets mark words supplied by the translators (printed in italics): keep the words, drop the marks.
    if (/[[\]]/.test(s)) kjvBracketed++;
    s = s.replace(/[[\]]/g, "").replace(/[{}]/g, "").replace(/¶/g, "");
    // Strong's tags, if a source ever carries them (e.g. "<H1234>" or "{H1234}").
    s = s.replace(/<\/?[A-Za-z][^>]*>/g, "").replace(/\b[HG]\d{1,5}\b/g, "");
    return collapse(s);
  };
  if (isZip(kjvF.bytes)) {
    const files = unzipText(kjvF.bytes, (n) => /_vpl\.txt$/i.test(n));
    const txt = [...files.values()][0];
    assert(txt, "KJV zip has no *_vpl.txt");
    const p = parseVpl(txt);
    // apply book-aware clean after parse
    for (const [b, chs] of p.table) for (const [c, vs] of chs) for (const [v, t] of vs) vs.set(v, kjvClean(t, b, c));
    kjvTable = p.table;
    kjvFormat = "eBible VPL";
    console.log(`[build-bible] KJV VPL skipped non-canonical books: ${[...p.skippedBooks].join(" ")}`);
  } else {
    const p = parseScrollmapperJson(strFromU8(kjvF.bytes), (t, b, c) => kjvClean(t, b, c));
    kjvTable = p.table;
    kjvFormat = "scrollmapper JSON";
    if (p.unmappedBooks.length) console.log(`[build-bible] KJV JSON skipped books: ${p.unmappedBooks.join(", ")}`);
  }
  console.log(`[build-bible] KJV: verses with [] removed ${kjvBracketed}, Ps 119 stanza labels removed ${kjvAcrostic}`);

  // ---------- map WEB/KJV onto the BSB grid ----------
  interface MapStats { missing: number; missingKeys: string[]; extra: number; extraKeys: string[]; emptyInSource: number }
  const mapToGrid = (t: VerseTable): { out: Map<string, string[][]>; stats: MapStats } => {
    const out = new Map<string, string[][]>();
    const stats: MapStats = { missing: 0, missingKeys: [], extra: 0, extraKeys: [], emptyInSource: 0 };
    for (const g of grid) {
      const src = t.get(g.code);
      const chapters: string[][] = [];
      for (let c = 1; c <= g.chapters; c++) {
        const arr: string[] = [];
        for (let v = 1; v <= g.verses[c - 1]; v++) {
          const s = src?.get(c)?.get(v);
          if (s === undefined) {
            stats.missing++;
            stats.missingKeys.push(`${g.code}.${c}.${v}`);
          } else if (s === "") stats.emptyInSource++;
          arr.push(s ?? "");
        }
        chapters.push(arr);
      }
      if (src) {
        for (const [c, vs] of src)
          for (const v of vs.keys())
            if (c > g.chapters || v > g.verses[c - 1]) {
              stats.extra++;
              stats.extraKeys.push(`${g.code}.${c}.${v}`);
            }
      }
      out.set(g.code, chapters);
    }
    return { out, stats };
  };
  const web = mapToGrid(webTable);
  const kjv = mapToGrid(kjvTable);
  for (const [name, m] of [["WEB", web], ["KJV", kjv]] as const) {
    console.log(
      `[build-bible] ${name} vs BSB grid: missing ${m.stats.missing} [${m.stats.missingKeys.slice(0, 20).join(" ")}${m.stats.missing > 20 ? " …" : ""}], ` +
        `extra (dropped) ${m.stats.extra} [${m.stats.extraKeys.slice(0, 20).join(" ")}${m.stats.extra > 20 ? " …" : ""}], empty in source ${m.stats.emptyInSource}`,
    );
  }

  // residue checks for WEB/KJV
  for (const [name, m] of [["WEB", web], ["KJV", kjv]] as const) {
    let bad = 0;
    const samples: string[] = [];
    for (const [b, chs] of m.out)
      chs.forEach((arr, ci) =>
        arr.forEach((t, vi) => {
          if (/[\\<>[\]{}]|\b[HG]\d{2,5}\b/.test(t)) {
            bad++;
            if (samples.length < 5) samples.push(`${b}.${ci + 1}.${vi + 1}: ${t.slice(0, 60)}`);
          }
        }),
      );
    assert(bad === 0, `${name} has ${bad} verses with residual markup: ${samples.join(" | ")}`);
  }
  for (const [name, m] of [["BSB", { out: bsbOut }], ["WEB", web], ["KJV", kjv]] as const) {
    const p23 = m.out.get("PSA")![22];
    assert(p23.length === 6 && p23.every((t) => t.length > 0), `${name} Psalm 23 is not 6 non-empty verses`);
  }

  // ---------- license lines (from the open-bibles README table, a downloaded file) ----------
  const licenses: Record<string, { status: string; proofUrl: string; proofText: string }> = {};
  try {
    const r = await fetchFirst("license README", SRC.licenseReadme);
    const md = strFromU8(r.bytes);
    for (const [t, file] of [["BSB", "eng-bsb.usfx.xml"], ["WEB", "eng-web.usfx.xml"], ["KJV", "eng-kjv.osis.xml"]] as const) {
      const row = md.split("\n").find((l) => l.includes(`| ${file} `) || l.includes(`|${file}|`));
      if (row) {
        const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
        licenses[t] = { status: cells[cells.length - 1], proofUrl: r.url, proofText: collapse(row) };
      }
    }
  } catch (e) {
    console.warn(`[build-bible] license README unavailable: ${(e as Error).message.split("\n")[0]}`);
  }

  // ---------- write ----------
  rmSync(OUT, { recursive: true, force: true });
  for (const t of ["bsb", "web", "kjv"]) mkdirSync(path.join(OUT, t), { recursive: true });
  const writeBook = (dir: string, code: string, chapters: string[][]) => {
    const obj: Record<string, string[]> = {};
    chapters.forEach((arr, i) => (obj[String(i + 1)] = arr));
    writeFileSync(path.join(OUT, dir, `${code}.json`), JSON.stringify(obj));
  };
  for (const code of BOOK_CODES) {
    writeBook("bsb", code, bsbOut.get(code)!);
    writeBook("web", code, web.out.get(code)!);
    writeBook("kjv", code, kjv.out.get(code)!);
  }
  const meta = { books: grid, totalVerses, emptyVerses: { BSB: emptyBsb } };
  writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta));
  writeFileSync(path.join(OUT, "bsb", "headings.json"), JSON.stringify(headings));

  const generatedFileHash = (p: string) => sha256(new Uint8Array(readFileSync(p)));
  const sources = {
    generatedBy: "scripts/build-bible.ts",
    BSB: {
      name: "Berean Standard Bible",
      text: { format: "scrollmapper JSON", ...rec(bsbJsonF) },
      headings: usfmZip
        ? { format: "USFM zip", ...usfmZip }
        : { format: "USFM per book", files: BOOK_CODES.map((c) => ({ book: c, ...usfmRecords[c] })) },
      license: licenses.BSB ?? null,
      notes: { superscriptionsMovedToHeading: superscriptionsMoved, emptyVerses: emptyBsb.length },
    },
    WEB: {
      name: "World English Bible",
      text: { format: webFormat, ...rec(webF) },
      license: licenses.WEB ?? null,
      mapping: { missing: web.stats.missing, extraDropped: web.stats.extra },
    },
    KJV: {
      name: "King James Version",
      text: { format: kjvFormat, ...rec(kjvF) },
      license: licenses.KJV ?? null,
      mapping: { missing: kjv.stats.missing, extraDropped: kjv.stats.extra },
    },
    outputs: { meta: generatedFileHash(path.join(OUT, "meta.json")), headings: generatedFileHash(path.join(OUT, "bsb", "headings.json")) },
  };
  writeFileSync(path.join(OUT, "sources.json"), JSON.stringify(sources));

  for (const t of ["bsb", "web", "kjv"]) console.log(`[build-bible] public/bible/${t}: ${(dirSize(path.join(OUT, t)) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[build-bible] done: ${totalVerses} verses, ${headings.length} headings`);
}

main().catch((e) => fail((e as Error).stack ?? String(e)));
