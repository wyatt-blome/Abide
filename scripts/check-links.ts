// npm run check-links [-- --strict]
//
// Checks every URL the library depends on: manifest rawUrls / mirrors / sourcePage / proofUrl /
// volumeMapSource / alternateSources, lockfile url + fetchedFrom, and every https:// URL in
// content/**/*.ts. HEAD first, then a 1-byte ranged GET for servers that refuse HEAD.
//
// Classification: "ok"; "blocked" = the sandbox egress proxy refused the CONNECT (HTTP 403 from
// the proxy, not from the site); "not-found" = real HTTP 404/410; "error" = other status/network.
// Writes library/link-report.json. A pack is "marked for drop" when none of the URLs it could be
// fetched from works (blocked or failed). Exit code 1 only for real failures (not proxy blocks)
// affecting packs that are BUILT (present in public/library/index.json); --strict also counts
// proxy blocks.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { LibraryIndex } from "../src/lib/library";
import type { Lock } from "./build-library";
import { ROOT } from "./lib/fetch";
import { loadManifests } from "./lib/manifest";

export type LinkKind = "ok" | "blocked" | "not-found" | "error";
export interface LinkResult { url: string; kind: LinkKind; status?: number; detail?: string; usedBy: string[] }

function curl(args: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code: code ?? 1, out, err }));
    p.on("error", (e) => resolve({ code: 127, out: "", err: String(e) }));
  });
}

export async function checkUrl(url: string): Promise<Omit<LinkResult, "usedBy">> {
  if (url.startsWith("file://")) return { url, kind: "ok" };
  const base = ["-sS", "-o", "/dev/null", "-L", "--max-time", "30", "-w", "%{http_code}", "-A", "AbideLinkCheck/1.0"];
  let r = await curl([...base, "-I", url]);
  let status = Number(r.out.trim()) || 0;
  if (r.code === 56 || /CONNECT tunnel failed, response 403/.test(r.err))
    return { url, kind: "blocked", status: 403, detail: "sandbox proxy refused CONNECT (403)" };
  if (status === 405 || status === 403 || status === 400 || status === 0) {
    r = await curl([...base, "-r", "0-0", url]);
    status = Number(r.out.trim()) || 0;
  }
  if (status >= 200 && status < 400) return { url, kind: "ok", status };
  if (status === 403) {
    // the sandbox's TLS-terminating proxy answers some hosts with its own 403 JSON body
    const g = await curl(["-sS", "-L", "--max-time", "30", "-r", "0-2000", url]);
    if (/not enabled for this session|agent ?proxy|egress/i.test(g.out))
      return { url, kind: "blocked", status: 403, detail: "sandbox proxy policy (403 body from the proxy, not the site)" };
  }
  if (status === 404 || status === 410) return { url, kind: "not-found", status };
  return { url, kind: "error", status, detail: r.err.trim().slice(0, 200) || undefined };
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

export async function checkLinks(o: { strict?: boolean; quiet?: boolean; concurrency?: number } = {}) {
  const used = new Map<string, Set<string>>();
  const record = (url: string | undefined, by: string) => {
    if (!url) return;
    if (!used.has(url)) used.set(url, new Set());
    used.get(url)!.add(by);
  };
  const manifests = loadManifests(path.join(ROOT, "library", "packs"));
  const fetchable = new Map<string, string[][]>(); // packId -> per rawUrl: [url, ...mirrors]
  for (const l of manifests) {
    const m = l.manifest;
    if (!m) continue;
    m.rawUrls.forEach((u, i) => {
      record(u, `${m.id}:rawUrls[${i}]`);
      for (const mu of m.mirrors?.[i] ?? []) record(mu, `${m.id}:mirrors[${i}]`);
    });
    fetchable.set(m.id, m.rawUrls.map((u, i) => [u, ...(m.mirrors?.[i] ?? [])]));
    record(m.sourcePage, `${m.id}:sourcePage`);
    record(m.license.proofUrl, `${m.id}:proofUrl`);
    record(m.volumeMapSource, `${m.id}:volumeMapSource`);
    for (const a of m.alternateSources ?? []) record(a.url, `${m.id}:alternateSources`);
  }
  const lockPath = path.join(ROOT, "library", "sources.lock.json");
  const lock: Lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : { version: 1, packs: {} };
  for (const [id, p] of Object.entries(lock.packs))
    for (const f of p.files) { record(f.url, `${id}:lock.url`); record(f.fetchedFrom, `${id}:lock.fetchedFrom`); }
  for (const file of walk(path.join(ROOT, "content"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/https:\/\/[^\s"'`<>)\]]+/g)) record(m[0], path.relative(ROOT, file));
  }

  const urls = [...used.keys()].sort();
  const results: LinkResult[] = [];
  const conc = o.concurrency ?? 8;
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < urls.length) {
      const u = urls[next++];
      results.push({ ...(await checkUrl(u)), usedBy: [...used.get(u)!].sort() });
    }
  }));
  results.sort((a, b) => a.url.localeCompare(b.url));
  const byUrl = new Map(results.map((r) => [r.url, r]));

  const indexPath = path.join(ROOT, "public", "library", "index.json");
  const built = new Set(existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as LibraryIndex).works.map((w) => w.id) : []);
  // a pack is droppable when some raw file has no working URL (primary or mirror)
  const packsToDrop: { id: string; reason: string; built: boolean }[] = [];
  for (const [id, files] of fetchable) {
    const dead = files.filter((alts) => !alts.some((u) => byUrl.get(u)?.kind === "ok"));
    if (dead.length) {
      const kinds = new Set(dead.flatMap((alts) => alts.map((u) => byUrl.get(u)?.kind)));
      packsToDrop.push({ id, built: built.has(id), reason: `${dead.length} raw file(s) unreachable (${[...kinds].join("/")})` });
    }
  }
  const failures = results.filter((r) => r.kind !== "ok");
  const builtFailures = failures.filter((r) => r.usedBy.some((u) => built.has(u.split(":")[0])) && (o.strict || r.kind !== "blocked"));
  const report = {
    checkedAt: new Date().toISOString(),
    totals: Object.fromEntries((["ok", "blocked", "not-found", "error"] as LinkKind[]).map((k) => [k, results.filter((r) => r.kind === k).length])),
    packsToDrop, builtPackFailures: builtFailures.map((r) => r.url), results,
  };
  writeFileSync(path.join(ROOT, "library", "link-report.json"), JSON.stringify(report, null, 2) + "\n");
  if (!o.quiet) {
    console.log(`check-links: ${results.length} URLs — ${JSON.stringify(report.totals)}`);
    for (const r of failures) {
      const note = r.kind === "blocked" ? "BLOCKED by sandbox proxy (403 on CONNECT, not a site error)" : r.kind === "not-found" ? `NOT FOUND (HTTP ${r.status})` : `ERROR ${r.status ?? ""} ${r.detail ?? ""}`;
      console.log(`  ${note}: ${r.url}  [${r.usedBy.slice(0, 3).join(", ")}${r.usedBy.length > 3 ? ", …" : ""}]`);
    }
    for (const p of packsToDrop) console.log(`  pack ${p.id}${p.built ? " (BUILT)" : ""} marked for drop: ${p.reason}`);
    if (builtFailures.length) console.log(`check-links: ${builtFailures.length} failing URL(s) affect built packs`);
  }
  return { ...report, exitCode: builtFailures.length ? 1 : 0 };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) {
  checkLinks({ strict: process.argv.includes("--strict") })
    .then((r) => process.exit(r.exitCode))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
