// Guard for the hard rule: no developer-typed theology/commentary/quotes in the app.
// The checks live in scripts/lib/content-lint.ts (shared with the prebuild CLI
// scripts/lint-content.ts); see that file for the full rule list:
//   1. src/ + content/: no literal, and no combined text (+ chains, template literals,
//      [..].join(), adjacent JSX text), over 160 chars;
//   2. content/: only .ts files; every string is an id, URL, reference, setting or short title
//      (no trailing sentence punctuation, no prose of function words);
//   3. library/packs/*.json display fields are label-shaped (≤ 160 chars, no multi-sentence prose).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentShape, formatViolation, labelProblem, lintManifest, lintRepo, lintSource } from "../scripts/lib/content-lint";

const ROOT = path.resolve(__dirname, "..");
const PROSE = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ";

describe("lint guard on the repository", () => {
  const report = lintRepo({ root: ROOT });
  it("finds the source files", () => {
    expect(report.files).toBeGreaterThan(50);
  });
  it("src/, content/ and library/packs have no violations", () => {
    expect(report.violations.map(formatViolation)).toEqual([]);
  });
});

describe("lint guard self-tests (bypasses that must fail)", () => {
  it("(a) content/ may hold only .ts files", () => {
    const r = lintRepo({ root: path.join(__dirname, "fixtures", "lint"), srcDirs: [], contentDir: path.join(__dirname, "fixtures", "lint", "content"), packsDir: "/nonexistent" });
    expect(r.violations.map((v) => `${path.basename(v.file)} ${v.reason}`)).toEqual(["notes.md content/ may hold only .ts files"]);
  });

  it("(b) content shapes: accepts ids/URLs/titles, rejects sentences", () => {
    for (const ok of ["https://ccel.org/ccel/henry/mhc1", "romans-8", "ROM", "ROM.8.28", "Rom 8:28-30", "canonical", "The City of God",
      "St. Augustine's Confessions", "Vol. 2", "Grace Abounding to the Chief of Sinners"])
      expect(contentShape(ok), ok).not.toBeNull();
    for (const bad of ["Lorem ipsum dolor sit amet. Consectetur adipiscing elit.", "Is this a question?", "He said “lorem”", "Lorem: ipsum dolor",
      "Lorem ipsum dolor sit amet.", "Lorem ipsum!", "lorem is the ipsum of the dolor", "Lorem ipsum was in the dolor and amet"])
      expect(contentShape(bad), bad).toBeNull();
  });

  it("(c) measures + chains, templates, [].join() and adjacent JSX text", () => {
    const piece = JSON.stringify(PROSE); // 78 chars each, under the limit alone
    const cases: [string, string, string][] = [
      ["plus.ts", `export const a = ${piece} + ${piece} + ${piece};`, "combined + chain"],
      ["tpl.ts", "const x = 1;\nexport const a = `" + PROSE + "${x}" + PROSE + "${x}" + PROSE + "`;", "combined template"],
      ["join.ts", `export const a = [${piece}, ${piece}, ${piece}].join(" ");`, "combined [].join()"],
      ["jsx.tsx", `export const A = () => <p>${PROSE}{" "}${PROSE}{" "}${PROSE}</p>;`, "combined JSX text"],
    ];
    for (const [file, code, kind] of cases) {
      const v = lintSource(file, code, { content: false });
      expect(v.map((x) => x.kind), file).toContain(kind);
    }
    expect(lintSource("ok.tsx", `export const A = () => <p>Lorem {" "} ipsum</p>;`, { content: false })).toEqual([]);
    expect(lintSource("ok.ts", `import x from "${"a".repeat(200)}"; export const b = x;`, { content: false })).toEqual([]);
  });

  it("(d) pack display fields must be label-shaped", () => {
    expect(labelProblem("Creeds.json (SourceUrl: archive.org humbleadviceofas200west, 1647)")).toBeNull();
    expect(labelProblem("NPNF1-02, trans. Dods")).toBeNull();
    expect(labelProblem("Preface to the Letter of St. Paul to the Romans")).toBeNull();
    expect(labelProblem("   ")).toMatch(/blank/);
    expect(labelProblem("Lorem ipsum dolor sit amet. Consectetur adipiscing elit.")).toMatch(/sentence/);
    expect(labelProblem("x".repeat(161))).toMatch(/longer/);
    const v = lintManifest("p.json", {
      author: "Placeholder", title: "Lorem", edition: "Lorem ipsum. Dolor sit amet consectetur.", ocrNote: " ",
      parserOptions: { headings: [{ label: "Lorem ipsum dolor sit amet. Sed do eiusmod tempor." }] },
      alternateSources: [{ url: "https://example.org", note: "y".repeat(200) }],
    });
    expect(v.map((x) => x.kind).sort()).toEqual(["manifest alternateSources[0].note", "manifest edition", "manifest ocrNote", "manifest parserOptions.headings[0].label"]);
  });
});
