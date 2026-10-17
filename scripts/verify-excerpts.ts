// npm run verify (also `prebuild`): independent check that every excerpt under public/library is
// a verbatim slice of its source, and that nothing was left unchecked.
//
// Structure: public/library may hold only index.json, README.md, packs-summary.json and one
// directory per index work; a public/library without index.json fails. Each work's shard files
// must equal index.books[work]. The non-section excerpts counted (unique ids) must equal
// work.excerptCount, the cross-reference rows work.crossrefCount, and when any work has
// excerptCount > 0 at least one excerpt must have been checked.
//
// For each pack in public/library/index.json:
//   1. every raw file listed in the lockfile is read from the cache (.cache/sources/{packId}/
//      {n}-{basename of the URL it was fetched from}); if missing it is re-downloaded from the
//      lockfile's fetchedFrom first, then its url (the URL tried is logged); its sha256 must
//      equal the lockfile's and the index's rawSha256, index rawUrls/primaryUrls must match the
//      lockfile's fetchedFrom/url (network/hash failure → fail);
//   2. every excerpt of every shard must: carry the required fields; the work must have author,
//      title, edition (label-shaped) and sourcePage; sha256(text) === verbatimHash; text occurs
//      verbatim at charOffset in normalizeWs(source) (JSON: in each decoded field; HTML: in
//      htmlToText); length, truncation, U+FFFD and locator rules — see scripts/lib/verify-core.ts;
//   3. cross references are re-derived from the cached source with the same parser and options
//      and every shard is compared row by row.
// Files are processed one raw file at a time, so memory stays bounded by the largest source.
// On failure the offending excerpt IDs are printed and the process exits 1.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CrossRef } from "../src/db/types";
import type { CrossRefShard, ExcerptShard, LibraryExcerpt, LibraryIndex } from "../src/lib/library";
import type { BuiltWork, Lock } from "./build-library";
import { loadMeta } from "./lib/bible-meta";
import { DEFAULT_CACHE_DIR, ROOT, getSource } from "./lib/fetch";
import { sha256 } from "./lib/hash";
import { labelProblem } from "./lib/label-shape";
import { rawToText } from "./lib/source-text";
import { SourceView, checkDisplay, checkExcerpt } from "./lib/verify-core";
import { PARSERS } from "./parsers";
import { crossrefShards } from "./parsers/openbible-crossrefs";

export interface VerifyOptions { outDir?: string; lockPath?: string; cacheDir?: string; metaPath?: string; quiet?: boolean; offline?: boolean }
export interface VerifyFailure { id: string; packId: string; reason: string }
export interface VerifyResult { ok: boolean; checked: number; crossrefsChecked: number; packs: number; failures: VerifyFailure[]; downloaded: string[] }

const REQUIRED_EXCERPT: (keyof LibraryExcerpt)[] = [
  "id", "workId", "text", "locator", "url", "verseRanges", "mappingMethod", "verbatimHash", "rawIndex", "charOffset", "type", "era",
];
const REQUIRED_WORK: (keyof BuiltWork)[] = ["author", "title", "edition", "sourcePage", "license"];
/** Files allowed at the root of public/library besides one directory per work. */
const ROOT_FILES = new Set(["index.json", "README.md", "packs-summary.json"]);

const sameRow = (a: CrossRef, b: CrossRef) => JSON.stringify(a) === JSON.stringify(b);

export async function verifyAll(o: VerifyOptions = {}): Promise<VerifyResult> {
  const outDir = o.outDir ?? path.join(ROOT, "public", "library");
  const lockPath = o.lockPath ?? path.join(ROOT, "library", "sources.lock.json");
  const cacheDir = o.cacheDir ?? DEFAULT_CACHE_DIR;
  const failures: VerifyFailure[] = [];
  const res: VerifyResult = { ok: true, checked: 0, crossrefsChecked: 0, packs: 0, failures, downloaded: [] };
  const say = (s: string) => { if (!o.quiet) console.log(s); };
  const indexPath = path.join(outDir, "index.json");
  const done = () => {
    res.ok = failures.length === 0;
    if (!o.quiet) {
      if (res.ok) console.log(`verify: OK — ${res.checked} excerpts and ${res.crossrefsChecked} cross references in ${res.packs} packs are verbatim`);
      else {
        console.error(`verify: FAILED — ${failures.length} problem(s):`);
        for (const f of failures.slice(0, 200)) console.error(`  ${f.id}: ${f.reason}`);
        if (failures.length > 200) console.error(`  … and ${failures.length - 200} more`);
      }
    }
    return res;
  };
  if (!existsSync(outDir)) {
    say("verify: no public/library — nothing to verify");
    return done();
  }
  if (!existsSync(indexPath)) {
    failures.push({ id: "index.json", packId: "-", reason: `${outDir} exists but has no index.json; its contents cannot be verified` });
    return done();
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as LibraryIndex & { works: BuiltWork[] };
  const lock: Lock = existsSync(lockPath) ? (JSON.parse(readFileSync(lockPath, "utf8")) as Lock) : { version: 1, packs: {} };
  const workIds = new Set(index.works.map((w) => w.id));
  for (const f of readdirSync(outDir)) {
    const isDir = statSync(path.join(outDir, f)).isDirectory();
    if (isDir && !workIds.has(f)) failures.push({ id: f, packId: f, reason: "directory in public/library is not a work in index.json (unverified content)" });
    if (!isDir && !ROOT_FILES.has(f)) failures.push({ id: f, packId: "-", reason: "unexpected file at the root of public/library" });
  }
  let meta: Awaited<ReturnType<typeof loadMeta>> | undefined;

  for (const work of index.works) {
    res.packs++;
    const fail = (id: string, reason: string) => failures.push({ id, packId: work.id, reason });
    for (const k of REQUIRED_WORK) if (!work[k]) fail(work.id, `work is missing required field "${k}"`);
    for (const k of ["author", "title", "edition", "ocrNote"] as const) {
      if (work[k] === undefined && k === "ocrNote") continue;
      const why = labelProblem(work[k]);
      if (why) fail(work.id, `work ${k} is not label-shaped: ${why}`);
    }
    const dir = path.join(outDir, work.id);
    const shardFiles = existsSync(dir) ? readdirSync(dir).sort() : [];
    const expected = index.books[work.id] ?? [];
    for (const b of expected) if (!shardFiles.includes(`${b}.json`)) fail(work.id, `shard ${b}.json listed in index but missing`);
    for (const f of shardFiles) if (!expected.includes(f.replace(/\.json$/, "")) || !f.endsWith(".json")) fail(`${work.id}/${f}`, "file not listed in index.books (unverified content)");
    const isCrossrefs = PARSERS[work.parser]?.kind === "crossrefs";

    // ---- read shards (excerpts grouped by rawIndex, copies across book shards deduped)
    const byRaw = new Map<number, Map<string, LibraryExcerpt>>();
    const shardRows = new Map<string, CrossRef[]>();
    const nonSection = new Set<string>();
    for (const f of shardFiles.filter((x) => x.endsWith(".json"))) {
      const shard = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ExcerptShard & Partial<CrossRefShard>;
      if (shard.workId !== work.id) fail(`${work.id}/${f}`, `shard workId "${shard.workId}" does not match`);
      if (shard.book !== f.replace(/\.json$/, "")) fail(`${work.id}/${f}`, `shard book "${shard.book}" does not match its file name`);
      if (isCrossrefs) {
        if (shard.excerpts?.length) fail(`${work.id}/${f}`, "cross-reference pack shard holds excerpts");
        shardRows.set(shard.book, shard.crossrefs ?? []);
        continue;
      }
      if (shard.crossrefs?.length) fail(`${work.id}/${f}`, "excerpt pack shard holds cross references");
      for (const ex of shard.excerpts ?? []) {
        const missing = REQUIRED_EXCERPT.filter((k) => ex[k] === undefined || ex[k] === null || ex[k] === "");
        if (missing.length) { fail(ex.id ?? `${work.id}/${f}`, `missing required field(s): ${missing.join(", ")}`); continue; }
        if (ex.workId !== work.id) { fail(ex.id, "workId does not match its pack"); continue; }
        if (!ex.verseRanges.length) { fail(ex.id, "no verseRanges"); continue; }
        const disp = checkDisplay(ex);
        if (disp) fail(ex.id, disp);
        if (!ex.fullSection) nonSection.add(ex.id);
        const m = byRaw.get(ex.rawIndex) ?? new Map<string, LibraryExcerpt>();
        const prev = m.get(ex.id);
        if (prev && (prev.text !== ex.text || prev.charOffset !== ex.charOffset || prev.verbatimHash !== ex.verbatimHash)) fail(ex.id, "differs between shards");
        m.set(ex.id, ex);
        byRaw.set(ex.rawIndex, m);
      }
    }
    if (!isCrossrefs && nonSection.size !== work.excerptCount)
      fail(work.id, `index excerptCount is ${work.excerptCount} but the shards hold ${nonSection.size} distinct non-section excerpts`);

    // ---- source files
    const lockFiles = lock.packs[work.id]?.files ?? [];
    const primary = work.primaryUrls ?? work.rawUrls;
    if (primary.length !== work.rawUrls.length) fail(work.id, "index primaryUrls and rawUrls differ in length");
    const texts: { text: string; rawIndex: number; url: string }[] = [];
    for (let i = 0; i < work.rawUrls.length; i++) {
      const lf = lockFiles[i];
      const exs = byRaw.get(i);
      byRaw.delete(i);
      if (!lf || lf.url !== primary[i] || lf.fetchedFrom !== work.rawUrls[i]) {
        fail(`${work.id}#raw${i}`, `lockfile has no entry for ${primary[i]} fetched from ${work.rawUrls[i]}`);
        for (const ex of exs?.values() ?? []) fail(ex.id, "source file not in lockfile");
        continue;
      }
      if (work.rawSha256[i] !== lf.sha256) fail(`${work.id}#raw${i}`, "index rawSha256 differs from lockfile sha256");
      let buf: Uint8Array;
      try {
        const got = await getSource({
          cacheDir, packId: work.id, rawIndex: i, url: lf.fetchedFrom, mirrors: lf.url !== lf.fetchedFrom ? [lf.url] : [], offline: o.offline,
          onAttempt: (u) => say(`verify: ${work.id}: file ${i} not cached, downloading ${u}`),
        });
        if (!got.fromCache) {
          res.downloaded.push(got.fetchedFrom);
          say(`verify: ${work.id}: file ${i} downloaded from ${got.fetchedFrom}`);
        }
        buf = got.buf;
      } catch (e) {
        fail(`${work.id}#raw${i}`, `source file unavailable: ${(e as Error).message}`);
        for (const ex of exs?.values() ?? []) fail(ex.id, "source file unavailable");
        continue;
      }
      if (sha256(buf) !== lf.sha256) {
        fail(`${work.id}#raw${i}`, `source file hash ${sha256(buf).slice(0, 12)}… does not match lockfile ${lf.sha256.slice(0, 12)}…`);
        for (const ex of exs?.values() ?? []) fail(ex.id, "source file hash mismatch");
        continue;
      }
      const text = rawToText(buf);
      if (isCrossrefs) { texts.push({ text, rawIndex: i, url: lf.url }); continue; }
      if (!exs) continue;
      const view = new SourceView(text);
      for (const ex of exs.values()) {
        res.checked++;
        let why: string | null;
        try {
          why = checkExcerpt(ex, view);
        } catch (e) {
          why = `cannot read source: ${(e as Error).message}`;
        }
        if (why) fail(ex.id, why);
      }
    }
    for (const [i, exs] of byRaw) for (const ex of exs.values()) fail(ex.id, `rawIndex ${i} is not a source file of the work`);

    // ---- cross references: re-derive every shard from the source and compare row by row
    if (isCrossrefs) {
      const total = [...shardRows.values()].reduce((n, l) => n + l.length, 0);
      if (total !== work.crossrefCount) fail(work.id, `index crossrefCount is ${work.crossrefCount} but the shards hold ${total} rows`);
      if (texts.length === work.rawUrls.length) {
        meta ??= await loadMeta(o.metaPath);
        const entry = PARSERS[work.parser] as { parse: (f: typeof texts, opts: Record<string, unknown>, ctx: unknown) => CrossRef[] };
        const expectedShards = crossrefShards(entry.parse(texts, work.parserOptions ?? {}, { meta, packId: work.id, log: () => {} }));
        for (const b of new Set([...expectedShards.keys(), ...shardRows.keys()])) {
          const want = expectedShards.get(b) ?? [];
          const got = shardRows.get(b) ?? [];
          let bad = want.length !== got.length ? `has ${got.length} rows, the source gives ${want.length}` : "";
          if (!bad) {
            const k = want.findIndex((w, j) => !sameRow(w, got[j]));
            if (k >= 0) bad = `row ${k} ${JSON.stringify(got[k])} differs from the source's ${JSON.stringify(want[k])}`;
          }
          if (bad) fail(`${work.id}/${b}.json`, `cross references ${bad}`);
          res.crossrefsChecked += got.length;
        }
      }
    }
  }
  const anyExcerpts = index.works.some((w) => w.excerptCount > 0);
  if (anyExcerpts && res.checked === 0) failures.push({ id: "index.json", packId: "-", reason: "works list excerpts but none was checked" });
  return done();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) {
  verifyAll()
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
