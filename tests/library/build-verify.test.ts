// End-to-end: build a temporary library from SYNTHETIC fixtures (file:// rawUrls), verify it,
// then tamper with it and check that the verifier names the offending excerpt.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildLibrary } from "../../scripts/build-library";
import { cachePath } from "../../scripts/lib/fetch";
import { verifyAll } from "../../scripts/verify-excerpts";
import { endsAtBoundary } from "../../scripts/lib/cut";
import { configureLibrary, crossRefsForRange, excerptsForRange, loadLibraryIndex, sectionFor } from "../../src/lib/library";
import type { ExcerptShard, LibraryIndex } from "../../src/lib/library";

const SYN = path.join(__dirname, "..", "fixtures", "synthetic");
let dir: string;
let P: { packsDir: string; outDir: string; lockPath: string; reportPath: string; logPath: string; cacheDir: string };

const lic = (proofText: string, extra: Record<string, unknown> = {}) => ({
  status: "public-domain", proofUrl: "https://example.org/proof", proofText, basis: "rights-statement", ...extra,
});
function manifest(id: string, file: string, over: Record<string, unknown>) {
  const m = {
    id, author: "Placeholder Author", title: `Placeholder ${id}`, edition: "synthetic fixture", era: "c19",
    types: ["commentary"], rawUrls: [pathToFileURL(path.join(dir, "src", file)).href], sourcePage: "https://example.org/work",
    license: lic("Rights: Public Domain"), defaultEnabled: false, largePack: false, ...over,
  } as Record<string, unknown> & { rawUrls: string[]; license: { proofUrl: string } };
  // the proof is looked for in the raw file itself (no network in tests)
  if (m.license.proofUrl === "https://example.org/proof") m.license = { ...m.license, proofUrl: m.rawUrls[0] };
  return m;
}
function writePack(m: Record<string, unknown>) {
  writeFileSync(path.join(P.packsDir, `${m.id}.json`), JSON.stringify(m, null, 2));
}

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "abide-lib-"));
  P = {
    packsDir: path.join(dir, "packs"), outDir: path.join(dir, "out"), lockPath: path.join(dir, "sources.lock.json"),
    reportPath: path.join(dir, "build-report.json"), logPath: path.join(dir, "build.log"), cacheDir: path.join(dir, "cache"),
  };
  for (const d of ["packs", "src"]) mkdirSync(path.join(dir, d), { recursive: true });
  for (const f of readdirSync(SYN)) copyFileSync(path.join(SYN, f), path.join(dir, "src", f));
  writePack(manifest("t-creed", "creed-json-proofs.json", {
    types: ["catechism"], parser: "creed-json-proofs", defaultEnabled: true,
    license: lic('"SourceAttribution": "Public Domain"'),
    parserOptions: { mode: "proofs", textFields: ["Question", "Answer"], locator: "Q. {Number}" },
  }));
  writePack(manifest("t-ccel", "ccel-txt.txt", {
    parser: "ccel-txt",
    parserOptions: { headings: [{ pattern: "^Book ([IVXLC]+)\\.?$", level: "unit", label: "Book $1" }, { pattern: "^Chapter (\\d+)\\.", level: "label", label: "ch. $1" }] },
  }));
  writePack(manifest("t-verse", "verse-commentary.txt", {
    parser: "verse-commentary", bookScope: [["ROM"]],
    parserOptions: {
      locatorFromRange: true, maxChars: 300,
      headings: [
        { pattern: "^An Exposition,? [Ww]ith Practical Observations,? [Oo]f (.{3,120})$", level: "book", book: "$1", intro: true },
        { pattern: "^Chapter (\\d+)$", level: "chapter" },
        { pattern: "^Verses? (\\d+)(?:-(\\d+))?$", level: "verse", verseEnd: "$2" },
      ],
    },
  }));
  writePack(manifest("t-html", "html-chapters.html", {
    parser: "html-chapters",
    parserOptions: { headings: [{ pattern: "^(?:CHAPTER|Chapter) ([IVX]+|\\d+)\\.?(.{0,80})$", level: "unit", label: "ch. $1" }] },
    license: lic("SYNTHETIC FIXTURE", { basis: "published-before-1931" }),
  }));
  writePack(manifest("openbible", "openbible-crossrefs.txt", {
    types: ["crossref"], era: "modern", parser: "openbible-crossrefs", defaultEnabled: true,
    license: { status: "CC-BY", proofUrl: "https://example.org/cc", proofText: "CC-BY", basis: "cc-by" },
    parserOptions: { minVotes: 3 },
  }));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("build + verify", () => {
  it("builds every fixture pack and the verifier passes", async () => {
    const r = await buildLibrary({ ...P, quiet: true });
    expect(r.rejected).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.exitCode).toBe(0);
    expect(r.built.map((b) => b.id).sort()).toEqual(["openbible", "t-ccel", "t-creed", "t-html", "t-verse"]);
    const index = JSON.parse(readFileSync(path.join(P.outDir, "index.json"), "utf8")) as LibraryIndex;
    expect(index.books["t-creed"]).toEqual(["PSA", "ROM", "1CO"]);
    const work = index.works.find((w) => w.id === "t-creed")!;
    expect(work.rawSha256).toHaveLength(1);
    expect(work.packSizeBytes).toBeGreaterThan(0);
    const shard = JSON.parse(readFileSync(path.join(P.outDir, "t-creed", "ROM.json"), "utf8")) as ExcerptShard;
    expect(shard.excerpts[0].id).toMatch(/^t-creed:[0-9a-f]{8}$/);
    // shard copies list only the ranges touching that book
    expect(shard.excerpts[0].verseRanges.every((r) => r.start.book === "ROM")).toBe(true);
    const v = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect(v.failures).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(5);
  });

  it("is stable: rebuilding yields the same ids", async () => {
    const before = readFileSync(path.join(P.outDir, "t-ccel", "ROM.json"), "utf8");
    await buildLibrary({ ...P, quiet: true, only: ["t-ccel"] });
    expect(readFileSync(path.join(P.outDir, "t-ccel", "ROM.json"), "utf8")).toBe(before);
    const index = JSON.parse(readFileSync(path.join(P.outDir, "index.json"), "utf8")) as LibraryIndex;
    expect(index.works.map((w) => w.id).sort()).toEqual(["openbible", "t-ccel", "t-creed", "t-html", "t-verse"]);
  });

  it("fails and names the excerpt when one character is changed", async () => {
    const f = path.join(P.outDir, "t-verse", "ROM.json");
    const orig = readFileSync(f, "utf8");
    const shard = JSON.parse(orig) as ExcerptShard;
    const victim = shard.excerpts.find((e) => !e.fullSection)!;
    victim.text = victim.text.replace(/o/, "0");
    writeFileSync(f, JSON.stringify(shard));
    const v = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect(v.ok).toBe(false);
    expect(v.failures.map((x) => x.id)).toContain(victim.id);
    writeFileSync(f, orig);
    expect((await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true })).ok).toBe(true);
  });

  it("fails when the text still matches its hash but not the source (offset/text tamper)", async () => {
    const f = path.join(P.outDir, "t-creed", "ROM.json");
    const orig = readFileSync(f, "utf8");
    const shard = JSON.parse(orig) as ExcerptShard;
    shard.excerpts[0].charOffset += 1;
    writeFileSync(f, JSON.stringify(shard));
    const v = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect(v.failures.map((x) => x.id)).toContain(shard.excerpts[0].id);
    writeFileSync(f, orig);
  });

  it("fails on a source-file hash mismatch, and re-downloads a missing cache", async () => {
    const lock = JSON.parse(readFileSync(P.lockPath, "utf8"));
    const url = lock.packs["t-ccel"].files[0].url as string;
    const cached = cachePath(P.cacheDir, "t-ccel", 0, url);
    const orig = readFileSync(cached);
    writeFileSync(cached, Buffer.concat([orig, Buffer.from(" ")]));
    const v = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect(v.ok).toBe(false);
    expect(v.failures.some((x) => x.packId === "t-ccel" && /hash/.test(x.reason))).toBe(true);
    rmSync(cached);
    const v2 = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect(v2.ok).toBe(true); // fetched again from the lockfile URL (file://), hash checked
  });

  it("rejects a pack whose proofText is not in the source (exit 1, others still built)", async () => {
    writePack(manifest("t-badlicense", "inline-citation.txt", { parser: "inline-citation", license: lic("No such rights statement") }));
    const r = await buildLibrary({ ...P, quiet: true, only: ["t-badlicense", "t-ccel"] });
    expect(r.rejected.map((x) => x.id)).toEqual(["t-badlicense"]);
    expect(r.rejected[0].reason).toMatch(/license check failed/);
    expect(r.built.map((b) => b.id)).toEqual(["t-ccel"]);
    expect(r.exitCode).toBe(1);
    rmSync(path.join(P.packsDir, "t-badlicense.json"));
  });

  it("rejects published-before-1931 packs without a pre-1931 year in the header", async () => {
    writePack(manifest("t-badyear", "inline-citation.txt", {
      parser: "inline-citation", license: lic("SYNTHETIC FIXTURE", { basis: "published-before-1931" }),
    }));
    const r = await buildLibrary({ ...P, quiet: true, only: ["t-badyear"] });
    expect(r.rejected[0]?.reason).toMatch(/publication year/);
    rmSync(path.join(P.packsDir, "t-badyear.json"));
  });

  it("rejects an invalid manifest (bad URL) and skips an unreachable source", async () => {
    writePack({ ...manifest("t-badurl", "inline-citation.txt", { parser: "inline-citation" }), rawUrls: ["http://insecure example/x.txt"] });
    writePack({ ...manifest("t-missing", "inline-citation.txt", { parser: "inline-citation" }), rawUrls: [pathToFileURL(path.join(dir, "nope.txt")).href] });
    const r = await buildLibrary({ ...P, quiet: true, only: ["t-badurl", "t-missing"] });
    expect(r.rejected.map((x) => x.id)).toEqual(["t-badurl"]);
    expect(r.rejected[0].reason).toMatch(/rawUrls/);
    expect(r.skipped.map((x) => x.id)).toEqual(["t-missing"]);
    expect(r.skipped[0].reason).toMatch(/unreachable/);
    rmSync(path.join(P.packsDir, "t-badurl.json"));
    const r2 = await buildLibrary({ ...P, quiet: true, only: ["t-missing"] });
    expect(r2.exitCode).toBe(0);
    const r3 = await buildLibrary({ ...P, quiet: true, only: ["t-missing"], strict: true });
    expect(r3.exitCode).toBe(1);
    rmSync(path.join(P.packsDir, "t-missing.json"));
    const index = JSON.parse(readFileSync(path.join(P.outDir, "index.json"), "utf8")) as LibraryIndex;
    expect(index.skipped.map((s) => s.id)).toContain("t-missing");
  });

  it("enforces the default-on budget without writing anything", async () => {
    const before = readFileSync(path.join(P.outDir, "index.json"), "utf8");
    const r = await buildLibrary({ ...P, quiet: true, only: ["t-creed"], budgetBytes: 1000 });
    expect(r.exitCode).toBe(1);
    expect(r.errors.join()).toMatch(/budget/);
    expect(readFileSync(path.join(P.outDir, "index.json"), "utf8")).toBe(before);
  });

  it("serves the built library through the client loader", async () => {
    configureLibrary({
      basePath: "",
      cache: null,
      fetchJson: async (u) => JSON.parse(readFileSync(path.join(P.outDir, u.replace(/^\//, "")), "utf8")),
    });
    const index = await loadLibraryIndex();
    expect(index.works.length).toBe(5);
    const rom828 = { start: { book: "ROM", chapter: 8, verse: 28 }, end: { book: "ROM", chapter: 8, verse: 28 } };
    const xs = await excerptsForRange(rom828, ["t-creed", "t-ccel", "t-verse"]);
    expect(xs.map((x) => `${x.workId} ${x.locator}`)).toEqual(["t-ccel Book I, ch. 1", "t-creed Q. 1", "t-verse Rom 8:28–30", "t-verse Rom 8", "t-verse Romans, Introduction"]);
    // most specific first: single verses, then Rom 8:28-30, the chapter, the whole-book intro
    expect(xs[xs.length - 1].isBookIntro).toBe(true);
    expect(xs.some((x) => x.fullSection)).toBe(false);
    const intro = xs[xs.length - 1];
    const full = await sectionFor(intro);
    expect(full?.fullSection).toBe(true);
    const xr = await crossRefsForRange({ start: { book: "GEN", chapter: 1, verse: 1 }, end: { book: "GEN", chapter: 1, verse: 1 } });
    expect(xr.map((x) => x.votes)).toEqual([70, 50]);
  });

  it("drops (and logs) excerpts without a locator from the source structure", async () => {
    writePack(manifest("t-noloc", "html-chapters.html", { parser: "html-chapters", license: lic("SYNTHETIC FIXTURE", { basis: "published-before-1931" }) }));
    const r = await buildLibrary({ ...P, quiet: true, only: ["t-noloc"] });
    expect(r.skipped.map((x) => x.id)).toEqual(["t-noloc"]);
    expect(readFileSync(P.logPath, "utf8")).toMatch(/\[t-noloc\] excerpt at file 0 offset \d+ has no locator/);
    rmSync(path.join(P.packsDir, "t-noloc.json"));
  });
});

describe("verify: fresh cache, mirrors and structural checks", () => {
  it("records the mirror actually fetched and re-downloads from it into an empty cache", async () => {
    const primary = pathToFileURL(path.join(dir, "gone", "cross-references.zip")).href;
    const mirror = pathToFileURL(path.join(dir, "src", "openbible-crossrefs.txt")).href;
    writePack(manifest("openbible", "openbible-crossrefs.txt", {
      types: ["crossref"], era: "modern", parser: "openbible-crossrefs", defaultEnabled: true, rawUrls: [primary], mirrors: [[mirror]],
      mirrorEditions: { [mirror]: "Placeholder data, mirror copy" },
      license: { status: "CC-BY", proofUrl: mirror, proofText: "CC-BY", basis: "cc-by" }, parserOptions: { minVotes: 3 },
    }));
    const r = await buildLibrary({ ...P, quiet: true, only: ["openbible"] });
    expect(r.built.map((b) => b.id)).toEqual(["openbible"]);
    const index = JSON.parse(readFileSync(path.join(P.outDir, "index.json"), "utf8")) as LibraryIndex;
    const w = index.works.find((x) => x.id === "openbible") as LibraryIndex["works"][number] & { primaryUrls: string[] };
    expect(w.rawUrls).toEqual([mirror]);
    expect(w.primaryUrls).toEqual([primary]);
    expect(w.edition).toBe("Placeholder data, mirror copy");
    const lock = JSON.parse(readFileSync(P.lockPath, "utf8"));
    expect(lock.packs.openbible.files[0]).toMatchObject({ url: primary, fetchedFrom: mirror });
    // cache file named after the URL actually fetched
    expect(existsSync(cachePath(P.cacheDir, "openbible", 0, mirror))).toBe(true);
    expect(existsSync(cachePath(P.cacheDir, "openbible", 0, primary))).toBe(false);

    // fresh clone: no cache at all -> every pack re-downloads (fetchedFrom first) and passes
    const aside = `${P.cacheDir}.aside`;
    renameSync(P.cacheDir, aside);
    const v = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect(v.failures).toEqual([]);
    expect(v.downloaded).toContain(mirror);
    expect(v.downloaded.length).toBe(index.works.length);
    expect(v.crossrefsChecked).toBeGreaterThan(0);
    rmSync(P.cacheDir, { recursive: true, force: true });
    renameSync(aside, P.cacheDir);
  });

  it("fails when cross-reference rows differ from the source", async () => {
    const f = path.join(P.outDir, "openbible", "GEN.json");
    const orig = readFileSync(f, "utf8");
    const shard = JSON.parse(orig);
    shard.crossrefs[0].votes += 1;
    writeFileSync(f, JSON.stringify(shard));
    const v = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect(v.failures.map((x) => `${x.id} ${x.reason}`).join()).toMatch(/openbible\/GEN\.json cross references row 0/);
    writeFileSync(f, orig);
  });

  it("fails on unlisted pack dirs, missing index.json, count mismatches and nothing checked", async () => {
    const ok = () => verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
    expect((await ok()).ok).toBe(true);
    mkdirSync(path.join(P.outDir, "t-rogue"));
    expect((await ok()).failures.map((x) => x.id)).toContain("t-rogue");
    rmSync(path.join(P.outDir, "t-rogue"), { recursive: true });

    const indexPath = path.join(P.outDir, "index.json");
    const orig = readFileSync(indexPath, "utf8");
    renameSync(indexPath, `${indexPath}.aside`);
    const noIndex = await ok();
    expect(noIndex.ok).toBe(false);
    expect(noIndex.failures[0].reason).toMatch(/no index\.json/);
    renameSync(`${indexPath}.aside`, indexPath);

    const index = JSON.parse(orig) as LibraryIndex;
    index.works.find((w) => w.id === "t-creed")!.excerptCount += 1;
    writeFileSync(indexPath, JSON.stringify(index));
    expect((await ok()).failures.map((x) => x.reason).join()).toMatch(/excerptCount is \d+ but the shards hold/);

    // every shard emptied: nothing would be checked
    const emptied = JSON.parse(orig) as LibraryIndex;
    const saved = new Map<string, string>();
    for (const w of emptied.works) {
      if (w.id === "openbible") continue;
      for (const b of emptied.books[w.id]) {
        const f = path.join(P.outDir, w.id, `${b}.json`);
        saved.set(f, readFileSync(f, "utf8"));
        writeFileSync(f, JSON.stringify({ workId: w.id, book: b, excerpts: [] }));
      }
    }
    writeFileSync(indexPath, orig);
    const none = await ok();
    expect(none.checked).toBe(0);
    expect(none.failures.map((x) => x.reason).join()).toMatch(/works list excerpts but none was checked/);
    for (const [f, t] of saved) writeFileSync(f, t);
    expect((await ok()).ok).toBe(true);
  });

  it("fails on U+FFFD, over-long text, mid-sentence truncation and a blank locator", async () => {
    const f = path.join(P.outDir, "t-verse", "ROM.json");
    const orig = readFileSync(f, "utf8");
    const { sha256 } = await import("../../scripts/lib/hash");
    const cases: [string, (e: ExcerptShard["excerpts"][number]) => void, RegExp][] = [
      ["fffd", (e) => { e.text = e.text.replace(/o/, "\uFFFD"); e.verbatimHash = sha256(e.text); }, /U\+FFFD/],
      ["long", (e) => { e.text = e.text + " " + "x".repeat(1600); e.verbatimHash = sha256(e.text); }, /limit 1500/],
      ["midword", (e) => { e.text = e.text.slice(0, e.text.lastIndexOf(" ") + 3); e.truncatedEnd = true; e.verbatimHash = sha256(e.text); }, /does not end at a sentence/],
      ["locator", (e) => { e.locator = "  "; }, /locator blank/],
    ];
    for (const [name, mutate, re] of cases) {
      const shard = JSON.parse(orig) as ExcerptShard;
      const victim = shard.excerpts.find((e) => !e.fullSection)!;
      mutate(victim);
      writeFileSync(f, JSON.stringify(shard));
      const v = await verifyAll({ outDir: P.outDir, lockPath: P.lockPath, cacheDir: P.cacheDir, quiet: true });
      expect(v.failures.filter((x) => x.id === victim.id).map((x) => x.reason).join(), name).toMatch(re);
      writeFileSync(f, orig);
    }
  });
});

// Regression for the audit: the shipped library never ends a truncated excerpt mid-sentence.
const REAL_OUT = path.join(__dirname, "..", "..", "public", "library");
describe.skipIf(!existsSync(path.join(REAL_OUT, "index.json")))("public/library (built)", () => {
  it("every truncatedEnd excerpt ends at the source's own stop", () => {
    const index = JSON.parse(readFileSync(path.join(REAL_OUT, "index.json"), "utf8")) as LibraryIndex;
    const bad: string[] = [];
    for (const w of index.works)
      for (const b of index.books[w.id] ?? []) {
        const shard = JSON.parse(readFileSync(path.join(REAL_OUT, w.id, `${b}.json`), "utf8")) as ExcerptShard;
        for (const e of shard.excerpts ?? []) if (e.truncatedEnd && !endsAtBoundary(e.text)) bad.push(e.id);
      }
    expect(bad).toEqual([]);
  });
});
