// Each parser on its SYNTHETIC fixture (tests/fixtures/synthetic: structural placeholder text,
// not real sources) and, when present, on the REAL fixture cut by scripts/make-fixtures.ts.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type BibleMeta, fmtRange, loadMeta, rangeProblem } from "../../scripts/lib/bible-meta";
import { MAX_EXCERPT } from "../../scripts/lib/cut";
import { loadManifests } from "../../scripts/lib/manifest";
import { SourceView, checkExcerpt } from "../../scripts/lib/verify-core";
import { PARSERS } from "../../scripts/parsers";
import type { CrossRefParser, ExcerptParser, ParsedExcerpt } from "../../scripts/parsers/types";

const SYN = path.join(__dirname, "..", "fixtures", "synthetic");
const REAL = path.join(__dirname, "..", "fixtures", "real");
let meta: BibleMeta;
beforeAll(async () => {
  meta = await loadMeta();
});

function run(parser: keyof typeof PARSERS, file: string, opts: Record<string, unknown>, bookScope?: string[][]) {
  const text = readFileSync(file, "utf8");
  const logs: string[] = [];
  const entry = PARSERS[parser];
  const out = (entry.parse as ExcerptParser)([{ text, rawIndex: 0, url: "file:///fixture" }], opts, { meta, packId: "t", bookScope, log: (s) => logs.push(s) });
  return { text, out, logs };
}

/** Every excerpt is verbatim at its offset, ≤ 1500 chars (non-section), with valid ranges. */
function assertSound(text: string, xs: ParsedExcerpt[]) {
  const view = new SourceView(text);
  for (const x of xs) {
    expect(checkExcerpt(x, view), `${x.locator}: ${x.text.slice(0, 40)}`).toBeNull();
    if (!x.isSection) expect(x.text.length).toBeLessThanOrEqual(MAX_EXCERPT);
    expect(x.verseRanges.length).toBeGreaterThan(0);
    for (const r of x.verseRanges) expect(rangeProblem(meta, r)).toBeNull();
    expect(x.text).not.toMatch(/^\s|\s$/);
  }
}
const fmt = (x: ParsedExcerpt) => x.verseRanges.map((r) => fmtRange(meta, r)).join("; ");

describe("ccel-txt (synthetic)", () => {
  const opts = {
    headings: [
      { pattern: "^Book ([IVXLC]+)\\.?$", level: "unit", label: "Book $1" },
      { pattern: "^Chapter (\\d+)\\.", level: "label", label: "ch. $1" },
    ],
  };
  it("maps inline citations confirmed by the work's scripture index; skips TOC and indexes", () => {
    const { text, out, logs } = run("ccel-txt", path.join(SYN, "ccel-txt.txt"), opts);
    assertSound(text, out);
    expect(out.map((x) => `${x.locator} | ${fmt(x)} | ${x.mappingMethod}`)).toEqual([
      "Book I, ch. 1 | Rom 8:28 | scriptureIndex",
      "Book I, ch. 2 | John 3:16; John 3:17 | scriptureIndex",
    ]);
    expect(out[0].text).toContain("exercitation");
    expect(logs.join("\n")).toMatch(/Gen\. i\. 1" not in the work's scripture index/);
    expect(logs.join("\n")).toMatch(/Ps\. 151:2" invalid range dropped/);
    expect(logs.join("\n")).toMatch(/ver\. 5" relative verse reference without a heading context/);
  });
});

describe("verse-commentary (synthetic)", () => {
  const opts = {
    locatorFromRange: true,
    maxChars: 300,
    headings: [
      { pattern: "^An Exposition,? [Ww]ith Practical Observations,? [Oo]f (.{3,120})$", level: "book", book: "$1", intro: true },
      { pattern: "^(?:CHAPTER|Chapter) (\\d+|[IVXLC]+)\\.?$", level: "chapter" },
      { pattern: "^Verses? (\\d+)(?:\\s*[-\\u2013]\\s*(\\d+))?\\.?$", level: "verse", verseEnd: "$2" },
    ],
  };
  it("maps sections to heading ranges and cuts the book intro at a paragraph boundary", () => {
    const { text, out, logs } = run("verse-commentary", path.join(SYN, "verse-commentary.txt"), opts, [["ROM"]]);
    assertSound(text, out);
    expect(out.map((x) => `${x.locator} | ${fmt(x)} | ${x.isBookIntro ? "intro" : ""}${x.isSection ? " section" : ""}`)).toEqual([
      "Romans, Introduction | Rom 1–16 | intro",
      "Romans, Introduction | Rom 1–16 | intro section",
      "Rom 8 | Rom 8 | ",
      "Rom 8:1–5 | Rom 8:1–5 | ",
      "Rom 8:28–30 | Rom 8:28–30 | ",
    ]);
    const [intro, full] = out;
    expect(intro.truncatedEnd).toBe(true);
    expect(intro.sectionKey).toBe(full.sectionKey);
    expect(full.text.startsWith(intro.text)).toBe(true);
    expect(intro.text.endsWith("consequat.")).toBe(true); // paragraph boundary
    expect(logs.join()).toMatch(/Rom 8:41 is outside the versification/);
  });
});

describe("heading-range (synthetic)", () => {
  const opts = {
    locatorFromRange: true,
    headings: [
      { pattern: "^PSALM ([IVXLC]+|\\d+)\\.?$", level: "chapter", book: "PSA" },
      { pattern: "^EXPOSITION\\.?$", level: "label", label: "Exposition" },
      { pattern: "^EXPLANATORY NOTES AND QUAINT SAYINGS\\.?$", level: "label", label: "Explanatory Notes and Quaint Sayings" },
      { pattern: "^(?:TITLE|SUBJECT|DIVISION)\\.?", level: "label", label: "Introduction", paragraphStart: true },
      { pattern: "^Verses? (\\d+)(?:\\s*[-\\u2013]\\s*(\\d+))?\\.", level: "verse", verseEnd: "$2", paragraphStart: true },
    ],
  };
  it("maps Treasury-style units and keeps the sub-heading in the locator", () => {
    const { text, out, logs } = run("heading-range", path.join(SYN, "heading-range.txt"), opts, [["PSA"]]);
    assertSound(text, out);
    expect(out.map((x) => x.locator)).toEqual([
      "Ps 23, Introduction", "Ps 23:1, Exposition", "Ps 23:2, Exposition", "Ps 23:1, Explanatory Notes and Quaint Sayings",
    ]);
    expect(out.every((x) => !x.text.includes("PROJECT GUTENBERG"))).toBe(true);
    expect(logs.join()).toMatch(/Ps 23:9 is outside/);
  });
});

describe("inline-citation (synthetic)", () => {
  it("maps paragraphs by their own citations and ignores collision words", () => {
    const { text, out, logs } = run("inline-citation", path.join(SYN, "inline-citation.txt"), {
      headings: [{ pattern: "^CHAPTER ([IVXLC]+)\\.?$", level: "unit", label: "ch. $1" }],
    });
    assertSound(text, out);
    expect(out.map((x) => `${x.locator} | ${fmt(x)}`)).toEqual(["ch. I | 1 Cor 15:22; Gal 2:20", "ch. I | Isa 53:5"]);
    expect(logs.join()).toMatch(/ver\. 7/);
  });
  it("emits a whole-book intro for bookIntro works", () => {
    const { text, out } = run("inline-citation", path.join(SYN, "inline-citation.txt"), { bookIntro: "ROM", introLocator: "Preface" });
    assertSound(text, out);
    const intro = out.filter((x) => x.isBookIntro);
    expect(intro.length).toBeGreaterThan(0);
    expect(fmt(intro[0])).toBe("Rom 1–16");
  });
});

describe("creed-json-proofs (synthetic)", () => {
  it("joins Question and Answer verbatim and maps proof texts", () => {
    const { text, out, logs } = run("creed-json-proofs", path.join(SYN, "creed-json-proofs.json"), {
      mode: "proofs", textFields: ["Question", "Answer"], locator: "Q. {Number}",
    });
    assertSound(text, out);
    expect(out).toHaveLength(1); // Q2's proofs are invalid, Q3 has none
    expect(out[0].text.split("\n")).toHaveLength(2);
    expect(out[0].sourcePaths).toEqual(["Data.0.Question", "Data.0.Answer"]);
    expect(fmt(out[0])).toBe("Rom 8:28; Ps 23; 1 Cor 6:19; 1 Cor 6:20");
    expect(logs.join("\n")).toMatch(/Rom\.8\.99/);
    expect(logs.join("\n")).toMatch(/unknown OSIS book/);
  });
  it("maps inline citations in nested sections (Dort-style)", () => {
    const { text, out } = run("creed-json-proofs", path.join(SYN, "creed-json-inline.json"), {
      mode: "inline", nested: "Sections", textFields: ["Content"], locator: "Head {parent.Chapter}, {Section}",
      sectionLabels: { A: "Article", R: "Rejection" },
    });
    assertSound(text, out);
    expect(out.map((x) => `${x.locator} | ${fmt(x)}`)).toEqual(["Head 1, Article 1 | Rom 3:19"]);
    expect(out[0].text).toContain('"consectetur"'); // JSON escape decoded
  });
});

describe("html-chapters (synthetic)", () => {
  it("verifies against the markup-free text", () => {
    const { text, out } = run("html-chapters", path.join(SYN, "html-chapters.html"), {
      headings: [{ pattern: "^(?:CHAPTER|Chapter) ([IVX]+|\\d+)\\.?(.{0,80})$", level: "unit", label: "ch. $1" }],
    });
    assertSound(text, out);
    expect(out).toHaveLength(1);
    expect(out[0].sourceTransform).toBe("html-text");
    expect(out[0].text).toContain("consectetur adipiscing elit (Rom. viii. 28)");
    expect(out[0].text).toContain("labore & dolore");
  });
});

describe("openbible-crossrefs (synthetic)", () => {
  it("keeps valid rows above minVotes and caps per verse", () => {
    const text = readFileSync(path.join(SYN, "openbible-crossrefs.txt"), "utf8");
    const entry = PARSERS["openbible-crossrefs"] as { parse: CrossRefParser };
    const ctx = { meta, packId: "t", log: () => {} };
    const all = entry.parse([{ text, rawIndex: 0, url: "file:///x" }], { minVotes: 3 }, ctx);
    expect(all.map((x) => `${x.from}>${fmtRange(meta, x.to)}:${x.votes}`)).toEqual([
      "GEN.1.1>John 1:1–3:50", "GEN.1.1>Heb 11:3:70", "ROM.8.28>Gen 50:20:40",
    ]);
    const capped = entry.parse([{ text, rawIndex: 0, url: "file:///x" }], { minVotes: 3, maxPerVerse: 1 }, ctx);
    expect(capped.filter((x) => x.from === "GEN.1.1").map((x) => x.votes)).toEqual([70]);
  });
});

// ---------------------------------------------------------------- real fixtures (optional)

const PARSER_OF: Record<string, keyof typeof PARSERS> = { "creed-json-inline": "creed-json-proofs" };
const manifests = new Map(loadManifests(path.join(__dirname, "..", "..", "library", "packs")).flatMap((l) => (l.manifest ? [[l.id, l.manifest]] : [])));
const realNames = ["ccel-txt", "verse-commentary", "heading-range", "inline-citation", "creed-json-proofs", "creed-json-inline", "html-chapters", "openbible-crossrefs"];

describe("real fixtures (cut by scripts/make-fixtures.ts)", () => {
  for (const name of realNames) {
    const file = path.join(REAL, `${name}.txt`);
    const metaFile = path.join(REAL, `${name}.meta.json`);
    const present = existsSync(file) && existsSync(metaFile);
    it.skipIf(!present)(`${name}: parses the real snippet soundly`, () => {
      const info = JSON.parse(readFileSync(metaFile, "utf8")) as { pack: string; rawIndex: number };
      const m = manifests.get(info.pack)!;
      const parser = PARSER_OF[name] ?? (name as keyof typeof PARSERS);
      const scope = m.bookScope ? [m.bookScope[info.rawIndex]] : undefined;
      const { text, out } = run(parser, file, m.parserOptions, scope);
      expect(out.length).toBeGreaterThan(0);
      if (parser !== "openbible-crossrefs") assertSound(text, out);
    });
  }
});
