// npm run verify (also `prebuild`): independent check that every excerpt under public/library is
// a verbatim slice of its source.
//
// For each pack in public/library/index.json:
//   1. every raw file listed in the lockfile is read from .cache/sources/{packId}/{n}-{basename};
//      if the cache is missing it is re-downloaded from the lockfile URL (fetchedFrom first);
//      its sha256 must equal the lockfile's and the index's rawSha256 (network/hash failure → fail);
//   2. every excerpt of every shard must: carry the required fields (id, workId, text, locator,
//      url, verseRanges, mappingMethod, verbatimHash, rawIndex, charOffset) and the work must have
//      author, title, edition and sourcePage; sha256(text) === verbatimHash; text occurs verbatim at
//      charOffset in normalizeWs(source) (JSON: in each decoded field; HTML: in htmlToText) — see
//      scripts/lib/verify-core.ts. Nothing but whitespace normalization is applied.
// Files are processed one raw file at a time, so memory stays bounded by the largest source.
// On failure the offending excerpt IDs are printed and the process exits 1.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExcerptShard, LibraryExcerpt, LibraryIndex, LibraryWork } from "../src/lib/library";
import type { Lock } from "./build-library";
import { DEFAULT_CACHE_DIR, ROOT, cachePath, getSource } from "./lib/fetch";
import { sha256 } from "./lib/hash";
import { rawToText } from "./lib/source-text";
import { SourceView, checkExcerpt } from "./lib/verify-core";

export interface VerifyOptions { outDir?: string; lockPath?: string; cacheDir?: string; quiet?: boolean; offline?: boolean }
export interface VerifyFailure { id: string; packId: string; reason: string }
export interface VerifyResult { ok: boolean; checked: number; packs: number; failures: VerifyFailure[] }

const REQUIRED_EXCERPT: (keyof LibraryExcerpt)[] = [
  "id", "workId", "text", "locator", "url", "verseRanges", "mappingMethod", "verbatimHash", "rawIndex", "charOffset", "type", "era",
];
const REQUIRED_WORK: (keyof LibraryWork)[] = ["author", "title", "edition", "sourcePage", "license"];

export async function verifyAll(o: VerifyOptions = {}): Promise<VerifyResult> {
  const outDir = o.outDir ?? path.join(ROOT, "public", "library");
  const lockPath = o.lockPath ?? path.join(ROOT, "library", "sources.lock.json");
  const cacheDir = o.cacheDir ?? DEFAULT_CACHE_DIR;
  const failures: VerifyFailure[] = [];
  const res: VerifyResult = { ok: true, checked: 0, packs: 0, failures };
  const indexPath = path.join(outDir, "index.json");
  if (!existsSync(indexPath)) {
    if (!o.quiet) console.log("verify: no public/library/index.json — nothing to verify");
    return res;
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as LibraryIndex;
  const lock: Lock = existsSync(lockPath) ? (JSON.parse(readFileSync(lockPath, "utf8")) as Lock) : { version: 1, packs: {} };

  for (const work of index.works) {
    res.packs++;
    const fail = (id: string, reason: string) => failures.push({ id, packId: work.id, reason });
    for (const k of REQUIRED_WORK) if (!work[k]) fail(work.id, `work is missing required field "${k}"`);
    const dir = path.join(outDir, work.id);
    const shardFiles = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
    const expected = index.books[work.id] ?? [];
    for (const b of expected) if (!shardFiles.includes(`${b}.json`)) fail(work.id, `shard ${b}.json listed in index but missing`);
    if (work.parser === "openbible-crossrefs" || work.listedOnly) {
      // no excerpt text; the raw file hash is still checked below
    }
    // group excerpts by rawIndex (dedupe copies stored in several book shards)
    const byRaw = new Map<number, Map<string, LibraryExcerpt>>();
    for (const f of shardFiles) {
      const shard = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ExcerptShard;
      if (shard.workId !== work.id) fail(`${work.id}/${f}`, `shard workId "${shard.workId}" does not match`);
      for (const ex of shard.excerpts ?? []) {
        const missing = REQUIRED_EXCERPT.filter((k) => ex[k] === undefined || ex[k] === null || ex[k] === "");
        if (missing.length) { fail(ex.id ?? `${work.id}/${f}`, `missing required field(s): ${missing.join(", ")}`); continue; }
        if (ex.workId !== work.id) { fail(ex.id, "workId does not match its pack"); continue; }
        if (!ex.verseRanges.length) { fail(ex.id, "no verseRanges"); continue; }
        const m = byRaw.get(ex.rawIndex) ?? new Map<string, LibraryExcerpt>();
        const prev = m.get(ex.id);
        if (prev && (prev.text !== ex.text || prev.charOffset !== ex.charOffset)) fail(ex.id, "differs between shards");
        m.set(ex.id, ex);
        byRaw.set(ex.rawIndex, m);
      }
    }
    const lockFiles = lock.packs[work.id]?.files ?? [];
    for (let i = 0; i < work.rawUrls.length; i++) {
      const lf = lockFiles[i];
      const exs = byRaw.get(i);
      byRaw.delete(i);
      if (!lf || lf.url !== work.rawUrls[i]) {
        fail(`${work.id}#raw${i}`, `lockfile has no entry for ${work.rawUrls[i]}`);
        for (const ex of exs?.values() ?? []) fail(ex.id, "source file not in lockfile");
        continue;
      }
      if (work.rawSha256[i] !== lf.sha256) fail(`${work.id}#raw${i}`, "index rawSha256 differs from lockfile sha256");
      let buf: Uint8Array;
      const p = cachePath(cacheDir, work.id, i, lf.url);
      try {
        if (existsSync(p)) buf = new Uint8Array(readFileSync(p));
        else {
          if (!o.quiet) console.log(`verify: ${work.id}: cache missing, downloading ${lf.fetchedFrom}`);
          buf = (await getSource({ cacheDir, packId: work.id, rawIndex: i, url: lf.url, fetchedFromHint: lf.fetchedFrom, offline: o.offline })).buf;
        }
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
      if (!exs) continue;
      const view = new SourceView(rawToText(buf));
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
  }
  res.ok = failures.length === 0;
  if (!o.quiet) {
    if (res.ok) console.log(`verify: OK — ${res.checked} excerpts in ${res.packs} packs are verbatim`);
    else {
      console.error(`verify: FAILED — ${failures.length} problem(s):`);
      for (const f of failures.slice(0, 200)) console.error(`  ${f.id}: ${f.reason}`);
      if (failures.length > 200) console.error(`  … and ${failures.length - 200} more`);
    }
  }
  return res;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) {
  verifyAll()
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
