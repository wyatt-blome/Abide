// npm run build:library [-- --only=id1,id2] [--strict] [--include-large]
//
// manifests (library/packs/*.json) → validate (zod) → fetch raw files (rawUrls, then mirrors;
// cached in .cache/sources/{packId}/{n}-{basename}) → license check → parse → self-verify →
// public/library/index.json + public/library/{packId}/{BOOK}.json, library/sources.lock.json,
// library/build-report.json, library-build.log.
//
// Exit codes: 1 when a fetched pack fails its license check, a manifest is invalid, the
// default-on budget (50 MB) is exceeded, or (--strict) any pack could not be fetched.
// Unreachable sources are skipped with a warning (exit 0); nothing is ever fabricated.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CrossRef, Excerpt, SourceWork } from "../src/db/types";
import { BOOK_CODES, bookIndex } from "../src/lib/books";
import type { ExcerptShard, CrossRefShard, LibraryExcerpt, LibraryIndex, LibraryWork } from "../src/lib/library";
import { type BibleMeta, booksOfRange, cmpRef, loadMeta, rangeProblem } from "./lib/bible-meta";
import { bookFromName } from "./lib/citations";
import { DEFAULT_CACHE_DIR, FetchError, ROOT, fetchUrl, getSource } from "./lib/fetch";
import { hash8, sha256 } from "./lib/hash";
import { containsProof, findPublicationYear } from "./lib/license";
import { type Manifest, loadManifests } from "./lib/manifest";
import { rawToText } from "./lib/source-text";
import { SourceView, checkDisplay, checkExcerpt } from "./lib/verify-core";
import { PARSERS } from "./parsers";
import { crossrefShards } from "./parsers/openbible-crossrefs";
import type { ParsedExcerpt, RawFile } from "./parsers/types";

export const BUDGET_BYTES = 50 * 1024 * 1024;

export interface LockFile { url: string; fetchedFrom: string; sha256: string; bytes: number; fetchedAt: string }
export interface Lock { version: 1; packs: Record<string, { files: LockFile[] }> }

export interface BuildOptions {
  packsDir?: string; outDir?: string; lockPath?: string; reportPath?: string; logPath?: string;
  cacheDir?: string; metaPath?: string; only?: string[]; strict?: boolean; includeLarge?: boolean;
  budgetBytes?: number; quiet?: boolean;
}

export interface BuiltPack {
  id: string; title: string; excerpts: number; sections: number; crossrefs: number; books: number;
  sizeBytes: number; defaultEnabled: boolean; largePack: boolean; fetchedFrom: string[];
}
export interface BuildReport {
  generatedAt: string; budgetBytes: number; defaultOnBytes: number;
  built: BuiltPack[]; skipped: { id: string; reason: string }[]; rejected: { id: string; reason: string }[];
  exitCode: number; errors: string[];
}

/** An index.json work as written by the build (primaryUrls: the manifest's rawUrls). */
export type BuiltWork = LibraryWork & { primaryUrls?: string[] };

/** Edition label for files fetched from mirrors: manifest.mirrorEditions[url], else "edition (copy at host/path)". */
function editionFor(m: Manifest, mirrorsUsed: string[]): string {
  const named = mirrorsUsed.map((u) => m.mirrorEditions?.[u]).filter((e): e is string => !!e);
  if (named.length) return [...new Set(named)].join("; ");
  const where = [...new Set(mirrorsUsed.map((u) => { try { const x = new URL(u); return `${x.hostname}/${x.pathname.split("/").filter(Boolean).slice(0, 2).join("/")}`; } catch { return u; } }))];
  return `${m.edition} (copy at ${where.join(", ")})`;
}

const PATHS = {
  packsDir: path.join(ROOT, "library", "packs"),
  outDir: path.join(ROOT, "public", "library"),
  lockPath: path.join(ROOT, "library", "sources.lock.json"),
  reportPath: path.join(ROOT, "library", "build-report.json"),
  logPath: path.join(ROOT, "library-build.log"),
};

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

class SkipPack extends Error {
  constructor(message: string, public kind: "skipped" | "rejected") {
    super(message);
  }
}

/** Calvin-style volume maps: derive bookScope for volumes with [] from the volumeMapSource page. */
async function deriveVolumeMap(m: Manifest, log: (s: string) => void): Promise<string[][] | undefined> {
  if (!m.bookScope || !m.bookScope.some((b) => b.length === 0) || !m.volumeMapSource) return m.bookScope;
  let html: string;
  try {
    html = rawToText(await fetchUrl(m.volumeMapSource));
  } catch (e) {
    log(`[${m.id}] volume map source unreachable (${(e as Error).message}); volumes without a known map are skipped`);
    return m.bookScope;
  }
  return m.bookScope.map((scope, i) => {
    if (scope.length) return scope;
    const slug = m.rawUrls[i].split("/").filter(Boolean).slice(-3, -2)[0] ?? "";
    // link text next to the volume's slug, e.g. <a href="/ccel/calvin/calcom38.html">Commentary on Romans</a>
    const re = new RegExp(`${slug}[^>]*>([^<]{3,200})<`, "i");
    const mm = re.exec(html);
    if (!mm) { log(`[${m.id}] no entry for ${slug} on volume map page`); return []; }
    const books = new Set<string>();
    for (const name of mm[1].split(/,|\band\b|\bon\b|\bupon\b|–|-|:/i)) {
      const code = bookFromName(name.replace(/^\s*(Commentary|Commentaries|Volume \d+|Vol\. \d+|the|of|Book of)\s*/gi, "").trim());
      if (code) books.add(code);
    }
    log(`[${m.id}] ${slug} → ${[...books].join(",") || "(none)"} from "${mm[1].trim()}"`);
    return [...books];
  });
}

/** html-chapters discovery: chapter links on the home page matching parserOptions.discoverLinks. */
function discoverLinks(m: Manifest, homeHtml: string): string[] {
  const pat = m.parserOptions.discoverLinks;
  if (typeof pat !== "string") return [];
  const re = new RegExp(`href=["']([^"']*${pat}[^"']*)["']`, "gi");
  const out: string[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(homeHtml))) {
    const u = new URL(mm[1].split("#")[0], m.rawUrls[0]).toString();
    if (!out.includes(u) && !m.rawUrls.includes(u)) out.push(u);
  }
  return out;
}

/**
 * The copy of an excerpt stored in book B's shard lists only the verseRanges that touch B (an
 * excerpt citing 30 proof texts in 20 books would otherwise be stored 20 times with all 30).
 * The union over shards is the full mapping; text, id and verification fields are identical.
 */
function forShard(ex: LibraryExcerpt, book: string): LibraryExcerpt {
  const rs = ex.verseRanges.filter((r) => booksOfRange(r).includes(book));
  return rs.length === ex.verseRanges.length ? ex : { ...ex, verseRanges: rs };
}

function urlFor(m: Manifest, anchor?: string): string {
  if (!m.urlTemplate) return m.sourcePage;
  if (m.urlTemplate.includes("{anchor}") && !anchor) return m.sourcePage;
  return m.urlTemplate.replace("{page}", m.sourcePage).replace("{anchor}", anchor ?? "");
}

export async function buildLibrary(o: BuildOptions = {}): Promise<BuildReport> {
  const packsDir = o.packsDir ?? PATHS.packsDir;
  const outDir = o.outDir ?? PATHS.outDir;
  const lockPath = o.lockPath ?? PATHS.lockPath;
  const reportPath = o.reportPath ?? PATHS.reportPath;
  const logPath = o.logPath ?? PATHS.logPath;
  const cacheDir = o.cacheDir ?? DEFAULT_CACHE_DIR;
  const budget = o.budgetBytes ?? BUDGET_BYTES;
  const generatedAt = new Date().toISOString();
  const logLines: string[] = [];
  const log = (s: string) => logLines.push(s);
  const say = (s: string) => {
    log(s);
    if (!o.quiet) console.log(s);
  };

  const meta: BibleMeta = await loadMeta(o.metaPath);
  const loaded = loadManifests(packsDir);
  const lock = readJson<Lock>(lockPath, { version: 1, packs: {} });
  const prevIndex = readJson<LibraryIndex | null>(path.join(outDir, "index.json"), null);
  const report: BuildReport = { generatedAt, budgetBytes: budget, defaultOnBytes: 0, built: [], skipped: [], rejected: [], exitCode: 0, errors: [] };

  const selected = loaded.filter((l) => !o.only || o.only.includes(l.id));
  if (o.only) for (const id of o.only) if (!loaded.some((l) => l.id === id)) report.errors.push(`--only: unknown pack "${id}"`);

  const newWorks: BuiltWork[] = [];
  const shardFiles = new Map<string, Map<string, string>>(); // packId -> BOOK -> json
  const newLock: Record<string, { files: LockFile[] }> = {};

  for (const l of selected) {
    if (!l.manifest) {
      report.rejected.push({ id: l.id, reason: l.error! });
      say(`✗ ${l.id}: ${l.error}`);
      continue;
    }
    const m = l.manifest;
    if (m.largePack && !o.includeLarge) {
      report.skipped.push({ id: m.id, reason: "largePack (build with --include-large)" });
      say(`- ${m.id}: skipped (largePack; use --include-large)`);
      continue;
    }
    try {
      // ---- volume map & fetch
      const scope = await deriveVolumeMap(m, log);
      let urls = m.rawUrls.map((u, i) => ({ url: u, mirrors: m.mirrors?.[i] ?? [], scope: scope?.[i] }));
      if (scope) {
        const unmapped = urls.filter((u) => !u.scope?.length);
        if (unmapped.length) log(`[${m.id}] ${unmapped.length} volume(s) without a book map skipped: ${unmapped.map((u) => u.url).join(", ")}`);
        urls = urls.filter((u) => u.scope?.length);
        if (!urls.length) throw new SkipPack("no volume has a known book map", "skipped");
      }
      const prevFiles = lock.packs[m.id]?.files ?? [];
      const files: { url: string; text: string; buf: Uint8Array; lf: LockFile }[] = [];
      const fetchOne = async (u: { url: string; mirrors: string[] }, n: number) => {
        const prev = prevFiles.find((p) => p.url === u.url);
        // the lockfile's last working URL is tried first only while it is still url or a mirror
        const hint = prev && [u.url, ...u.mirrors].includes(prev.fetchedFrom) ? prev.fetchedFrom : undefined;
        let got;
        try {
          got = await getSource({ cacheDir, packId: m.id, rawIndex: n, url: u.url, mirrors: u.mirrors, fetchedFromHint: hint });
        } catch (e) {
          const fe = e as FetchError;
          const why = fe.kind === "blocked" ? "blocked by network proxy (HTTP 403)" : fe.message;
          throw new SkipPack(`source unreachable: ${u.url} (${why})`, "skipped");
        }
        const fetchedAt = prev && prev.sha256 === got.sha256 ? prev.fetchedAt : generatedAt;
        const text = rawToText(got.buf);
        const bad = (text.match(/\uFFFD/g) ?? []).length;
        if (bad) log(`[${m.id}] ${got.fetchedFrom}: ${bad} U+FFFD replacement character(s) after UTF-8 decoding; excerpts containing one are dropped`);
        log(`[${m.id}] file ${n}: ${got.fromCache ? "cached copy of" : "downloaded"} ${got.fetchedFrom}${got.fetchedFrom !== u.url ? ` (mirror of ${u.url})` : ""}`);
        files.push({ url: u.url, text, buf: got.buf, lf: { url: u.url, fetchedFrom: got.fetchedFrom, sha256: got.sha256, bytes: got.bytes, fetchedAt } });
      };
      for (let i = 0; i < urls.length; i++) await fetchOne(urls[i], i);
      if (m.parser === "html-chapters") {
        const extra = discoverLinks(m, files[0].text);
        for (const u of extra) {
          urls.push({ url: u, mirrors: [], scope: undefined });
          await fetchOne(urls[urls.length - 1], urls.length - 1);
        }
      }

      // ---- license
      const lic = m.license;
      let proofFound = files.some((f) => containsProof(f.text, lic.proofText));
      if (!proofFound && !m.rawUrls.includes(lic.proofUrl)) {
        try {
          proofFound = containsProof(rawToText(await fetchUrl(lic.proofUrl)), lic.proofText);
        } catch (e) {
          const fe = e as FetchError;
          if (fe.kind === "blocked" || fe.kind === "network")
            throw new SkipPack(`license proof page unreachable: ${lic.proofUrl} (${fe.message})`, "skipped");
        }
      }
      if (!proofFound) throw new SkipPack(`license check failed: "${lic.proofText}" not found in the raw files or at ${lic.proofUrl}`, "rejected");
      if (lic.basis === "published-before-1931") {
        const year = files.map((f) => findPublicationYear(f.text, lic.yearPattern)).filter((y): y is number => y !== null).sort()[0];
        if (!year || year >= 1931)
          throw new SkipPack(`license check failed: basis published-before-1931 but no publication year < 1931 found in the source header (found ${year ?? "none"})`, "rejected");
        log(`[${m.id}] publication year from header: ${year}`);
      }

      // ---- parse
      const parser = PARSERS[m.parser];
      const rawFiles: RawFile[] = files.map((f, i) => ({ text: f.text, rawIndex: i, url: f.url }));
      const ctx = { meta, packId: m.id, bookScope: scope ? urls.map((u) => u.scope ?? []) : undefined, log };
      const books = new Map<string, unknown[]>();
      let excerptCount = 0;
      let sectionCount = 0;
      let crossrefCount = 0;
      if (parser.kind === "crossrefs") {
        const xs: CrossRef[] = parser.parse(rawFiles, m.parserOptions, ctx);
        crossrefCount = xs.length;
        for (const [b, list] of crossrefShards(xs)) books.set(b, list);
      } else if (!m.listedOnly) {
        const parsed: ParsedExcerpt[] = parser.parse(rawFiles, m.parserOptions, ctx);
        const views = rawFiles.map((f) => new SourceView(f.text));
        const ids = new Set<string>();
        const bySection = new Map<string, string>();
        const out: LibraryExcerpt[] = [];
        for (const p of parsed) {
          if (!p.locator?.trim()) { log(`[${m.id}] excerpt at file ${p.rawIndex} offset ${p.charOffset} has no locator from the source structure; dropped`); continue; }
          const why = checkExcerpt(p, views[p.rawIndex]) ?? checkDisplay(p);
          if (why) { log(`[${m.id}] excerpt failed verification (${why}) at ${p.locator}; dropped`); continue; }
          const ranges = p.verseRanges.filter((r) => {
            const bad = rangeProblem(meta, r);
            if (bad) log(`[${m.id}] ${p.locator}: range dropped (${bad})`);
            return !bad;
          });
          if (!ranges.length) continue;
          let n = 0;
          let id: string;
          do {
            id = `${m.id}:${hash8(`${p.rawIndex}|${(p.sourcePaths ?? []).join(",")}|${p.charOffset}|${p.text.length}|${p.isSection ? "s" : ""}|${n++}`)}`;
          } while (ids.has(id));
          ids.add(id);
          const ex: LibraryExcerpt = {
            id, workId: m.id, text: p.text, locator: p.locator, url: urlFor(m, p.anchor),
            verseRanges: ranges, mappingMethod: p.mappingMethod, type: p.type ?? m.types[0], era: m.era,
            charOffset: p.charOffset, verbatimHash: sha256(p.text), rawIndex: p.rawIndex,
          };
          if (p.isBookIntro) ex.isBookIntro = true;
          if (p.truncatedStart) ex.truncatedStart = true;
          if (p.truncatedEnd) ex.truncatedEnd = true;
          if (p.sourcePaths) { ex.sourcePaths = p.sourcePaths; ex.partOffsets = p.partOffsets; }
          if (p.sourceTransform) ex.sourceTransform = p.sourceTransform;
          if (p.isSection) { ex.fullSection = true; if (p.sectionKey) bySection.set(p.sectionKey, id); }
          (ex as LibraryExcerpt & { _key?: string })._key = p.sectionKey;
          out.push(ex);
        }
        for (const ex of out) {
          const k = (ex as LibraryExcerpt & { _key?: string })._key;
          delete (ex as LibraryExcerpt & { _key?: string })._key;
          if (k && !ex.fullSection && bySection.has(k)) ex.sectionId = bySection.get(k);
        }
        for (const ex of out) {
          if (ex.fullSection) sectionCount++;
          else excerptCount++;
          const bs = new Set(ex.verseRanges.flatMap(booksOfRange));
          for (const b of bs) {
            if (!books.has(b)) books.set(b, []);
            books.get(b)!.push(ex);
          }
        }
        for (const list of books.values())
          (list as Excerpt[]).sort((a, b) => cmpRef(a.verseRanges[0].start, b.verseRanges[0].start) || a.rawIndex - b.rawIndex || a.charOffset - b.charOffset);
        if (!excerptCount) throw new SkipPack("parser produced no mapped excerpts (check parserOptions against the source layout)", "skipped");
      }

      // ---- serialize shards (sizes counted before anything is written)
      const shard = new Map<string, string>();
      let size = 0;
      for (const [b, list] of [...books.entries()].sort((a, c) => bookIndex(a[0]) - bookIndex(c[0]))) {
        const body = parser.kind === "crossrefs"
          ? ({ workId: m.id, book: b, crossrefs: list as CrossRef[] } satisfies CrossRefShard)
          : ({ workId: m.id, book: b, excerpts: (list as LibraryExcerpt[]).map((ex) => forShard(ex, b)) } satisfies ExcerptShard);
        const json = JSON.stringify(body);
        shard.set(b, json);
        size += Buffer.byteLength(json);
      }
      shardFiles.set(m.id, shard);
      // rawUrls = the URLs the files were actually fetched from (a mirror when the primary was
      // unreachable), primaryUrls = the manifest's rawUrls; the edition names the mirror's copy.
      const fetched = files.map((f) => f.lf.fetchedFrom);
      const viaMirror = fetched.filter((u, i) => u !== files[i].url);
      const edition = viaMirror.length ? editionFor(m, viaMirror) : m.edition;
      const work: BuiltWork = {
        id: m.id, author: m.author, title: m.title, edition, era: m.era, types: m.types,
        sourcePage: m.sourcePage, rawUrls: fetched, primaryUrls: files.map((f) => f.url), rawSha256: files.map((f) => f.lf.sha256),
        license: { status: lic.status, proofUrl: lic.proofUrl, proofText: lic.proofText, basis: lic.basis },
        parser: m.parser, parserOptions: m.parserOptions, defaultEnabled: m.defaultEnabled, largePack: m.largePack,
        packSizeBytes: size, excerptCount, crossrefCount,
      };
      if (m.ocr) { work.ocr = true; work.ocrNote = m.ocrNote; }
      if (m.listedOnly) work.listedOnly = true;
      newWorks.push(work);
      newLock[m.id] = { files: files.map((f) => f.lf) };
      report.built.push({
        id: m.id, title: m.title, excerpts: excerptCount, sections: sectionCount, crossrefs: crossrefCount, books: books.size,
        sizeBytes: size, defaultEnabled: m.defaultEnabled, largePack: m.largePack, fetchedFrom: files.map((f) => f.lf.fetchedFrom),
      });
      say(`✓ ${m.id}: ${excerptCount ? `${excerptCount} excerpts (+${sectionCount} full sections)` : crossrefCount ? `${crossrefCount} cross references` : "listed (not indexed)"}, ${books.size} books, ${(size / 1024).toFixed(0)} KiB`);
    } catch (e) {
      if (e instanceof SkipPack) {
        (e.kind === "rejected" ? report.rejected : report.skipped).push({ id: m.id, reason: e.message });
        say(`${e.kind === "rejected" ? "✗" : "-"} ${m.id}: ${e.kind} — ${e.message}`);
      } else {
        report.rejected.push({ id: m.id, reason: `build error: ${(e as Error).stack ?? e}` });
        say(`✗ ${m.id}: build error — ${(e as Error).message}`);
      }
    }
  }

  // ---- merge with packs outside this run's selection (--only)
  const selectedIds = new Set(selected.map((l) => l.id));
  const keptWorks = (prevIndex?.works ?? []).filter((w) => !selectedIds.has(w.id) && loaded.some((l) => l.id === w.id) && existsSync(path.join(outDir, w.id)));
  const works = [...keptWorks, ...newWorks].sort((a, b) => a.id.localeCompare(b.id));
  report.defaultOnBytes = works.filter((w) => w.defaultEnabled).reduce((n, w) => n + w.packSizeBytes, 0);
  if (report.defaultOnBytes >= budget) {
    report.errors.push(`default-on packs total ${(report.defaultOnBytes / 1048576).toFixed(1)} MB, budget is < ${(budget / 1048576).toFixed(0)} MB; nothing written`);
  }
  if (report.rejected.length) report.errors.push(`${report.rejected.length} pack(s) rejected: ${report.rejected.map((r) => r.id).join(", ")}`);
  const networkSkips = report.skipped.filter((s) => !s.reason.startsWith("largePack"));
  if (o.strict && networkSkips.length) report.errors.push(`--strict: ${networkSkips.length} pack(s) skipped`);
  report.exitCode = report.errors.length ? 1 : 0;

  const budgetOk = report.defaultOnBytes < budget;
  if (budgetOk) {
    mkdirSync(outDir, { recursive: true });
    for (const l of selected) rmSync(path.join(outDir, l.id), { recursive: true, force: true });
    for (const [id, shard] of shardFiles) {
      mkdirSync(path.join(outDir, id), { recursive: true });
      for (const [b, json] of shard) writeFileSync(path.join(outDir, id, `${b}.json`), json);
    }
    const books: Record<string, string[]> = {};
    for (const w of works) {
      const shard = shardFiles.get(w.id);
      books[w.id] = shard ? [...shard.keys()] : (prevIndex?.books[w.id] ?? []);
      books[w.id].sort((a, b) => BOOK_CODES.indexOf(a) - BOOK_CODES.indexOf(b));
    }
    const prevSkipped = (prevIndex?.skipped ?? []).filter((s) => !selectedIds.has(s.id));
    const index: LibraryIndex = {
      generatedAt, works, books,
      skipped: [...prevSkipped, ...report.skipped, ...report.rejected].sort((a, b) => a.id.localeCompare(b.id)),
    };
    writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index));
    const packs: Lock["packs"] = {};
    for (const [id, v] of Object.entries(lock.packs)) if (!selectedIds.has(id) && works.some((w) => w.id === id)) packs[id] = v;
    Object.assign(packs, newLock);
    const sortedPacks = Object.fromEntries(Object.entries(packs).sort(([a], [b]) => a.localeCompare(b)));
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, JSON.stringify({ version: 1, packs: sortedPacks } satisfies Lock, null, 2) + "\n");
  }
  for (const e of report.errors) say(`ERROR: ${e}`);
  if (networkSkips.length && !o.strict) say(`WARNING: ${networkSkips.length} pack(s) skipped because their sources could not be fetched (see build-report.json)`);
  say(`default-on total: ${(report.defaultOnBytes / 1048576).toFixed(2)} MB (budget < ${(budget / 1048576).toFixed(0)} MB)`);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(logPath, [`# library build ${generatedAt}`, ...logLines, ""].join("\n"));
  return report;
}

export function parseArgs(argv: string[]): BuildOptions {
  const o: BuildOptions = {};
  for (const a of argv) {
    if (a.startsWith("--only=")) o.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--strict") o.strict = true;
    else if (a === "--include-large") o.includeLarge = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

// Run when executed directly (not when imported by tests).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) {
  buildLibrary(parseArgs(process.argv.slice(2)))
    .then((r) => process.exit(r.exitCode))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

export type { SourceWork };
