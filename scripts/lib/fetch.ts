// Download helpers: proxy-aware fetch, ordered mirrors, on-disk cache.
//
// Node's built-in fetch ignores HTTPS_PROXY unless the process was started with
// NODE_USE_ENV_PROXY=1, so when a proxy is configured (or always, when curl exists) we spawn
// curl, which honours HTTPS_PROXY and the CA bundle env vars. Without curl we fall back to
// undici's EnvHttpProxyAgent, then to plain fetch.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./hash";

export const ROOT = path.resolve(__dirname, "..", "..");
export const DEFAULT_CACHE_DIR = path.join(ROOT, ".cache", "sources");

export class FetchError extends Error {
  constructor(
    message: string,
    /** "blocked" = refused by the sandbox egress proxy (HTTP 403 on CONNECT); "http" = server status. */
    public kind: "blocked" | "http" | "network" | "file",
    public status?: number,
  ) {
    super(message);
  }
}

export interface Fetched { buf: Uint8Array; fetchedFrom: string }

let curlAvailable: boolean | undefined;
function hasCurl(): boolean {
  if (curlAvailable === undefined) {
    const r = spawnSync("curl", ["--version"], { stdio: "ignore" });
    curlAvailable = r.status === 0;
  }
  return curlAvailable;
}

function curlGet(url: string, timeoutSec: number): Uint8Array {
  const r = spawnSync(
    "curl",
    ["-sS", "-L", "--fail-with-body", "--max-time", String(timeoutSec), "-A", "AbideLibraryBuilder/1.0", "-w", "\n%{http_code}", url],
    { maxBuffer: 1024 * 1024 * 1024, encoding: "buffer" },
  );
  const out = r.stdout ?? Buffer.alloc(0);
  // the last line written by -w is the HTTP status
  const nl = out.lastIndexOf(0x0a);
  const status = Number(out.subarray(nl + 1).toString("utf8"));
  const body = out.subarray(0, Math.max(0, nl));
  const stderr = (r.stderr ?? Buffer.alloc(0)).toString("utf8").trim();
  if (r.status === 0 && status >= 200 && status < 300) return new Uint8Array(body);
  if (/CONNECT tunnel failed, response 403/.test(stderr) || r.status === 56)
    throw new FetchError(`blocked by proxy (403 on CONNECT): ${url}`, "blocked", 403);
  if (status >= 400) throw new FetchError(`HTTP ${status}: ${url}`, "http", status);
  throw new FetchError(`curl exit ${r.status}: ${stderr || "unknown error"} (${url})`, "network");
}

async function nodeGet(url: string): Promise<Uint8Array> {
  let dispatcher: unknown;
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    try {
      // undici ships with the repo's dependency tree; EnvHttpProxyAgent reads HTTPS_PROXY.
      const undici = (await import("undici")) as unknown as { EnvHttpProxyAgent: new () => unknown };
      dispatcher = new undici.EnvHttpProxyAgent();
    } catch {
      dispatcher = undefined;
    }
  }
  const res = await fetch(url, { dispatcher, redirect: "follow" } as RequestInit);
  if (res.status === 403 && dispatcher) throw new FetchError(`HTTP 403 (possibly proxy): ${url}`, "blocked", 403);
  if (!res.ok) throw new FetchError(`HTTP ${res.status}: ${url}`, "http", res.status);
  return new Uint8Array(await res.arrayBuffer());
}

/** GET one URL (https:// or file://). Throws FetchError. */
export async function fetchUrl(url: string, timeoutSec = 300): Promise<Uint8Array> {
  if (url.startsWith("file://")) {
    const p = fileURLToPath(url);
    if (!existsSync(p)) throw new FetchError(`file not found: ${p}`, "file");
    return new Uint8Array(readFileSync(p));
  }
  if (hasCurl()) return curlGet(url, timeoutSec);
  try {
    return await nodeGet(url);
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new FetchError(`${(e as Error).message} (${url})`, "network");
  }
}

/** Try url then each mirror in order. Returns the first success; error lists every attempt. */
export async function fetchWithMirrors(url: string, mirrors: string[] = [], onAttempt?: (url: string) => void): Promise<Fetched> {
  const errors: FetchError[] = [];
  for (const u of [url, ...mirrors]) {
    try {
      onAttempt?.(u);
      return { buf: await fetchUrl(u), fetchedFrom: u };
    } catch (e) {
      errors.push(e instanceof FetchError ? e : new FetchError(String(e), "network"));
    }
  }
  const allBlocked = errors.every((e) => e.kind === "blocked");
  const err = new FetchError(errors.map((e) => e.message).join(" | "), allBlocked ? "blocked" : errors[errors.length - 1].kind);
  throw err;
}

/** Cache file name: `{n}-{basename}` where basename is the URL path's last segment. */
export function cachePath(cacheDir: string, packId: string, rawIndex: number, url: string): string {
  let base = "index";
  try {
    const u = new URL(url);
    const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    if (seg) base = seg;
  } catch {
    /* keep default */
  }
  base = base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return path.join(cacheDir, packId, `${rawIndex}-${base}`);
}

export interface CachedSource extends Fetched { sha256: string; bytes: number; fromCache: boolean }

/**
 * Return the cached copy of rawUrls[rawIndex] if present (and, when expectSha is given, its hash
 * matches); otherwise download and write the cache.
 *
 * Order (for both the cache lookup and the download): fetchedFromHint (the URL the lockfile says
 * worked last time; it need not be url or a mirror), then url, then mirrors. A cache file is
 * named after the URL it was actually downloaded from (`{n}-{basename of fetchedFrom}`), so a
 * mirror's TSV is never stored under the primary's ".zip" name, and `fetchedFrom` of a cache hit
 * is the URL whose name matched.
 */
export async function getSource(opts: {
  cacheDir: string; packId: string; rawIndex: number; url: string; mirrors?: string[];
  expectSha?: string; fetchedFromHint?: string; offline?: boolean; onAttempt?: (url: string) => void;
}): Promise<CachedSource> {
  const order = [...new Set([...(opts.fetchedFromHint ? [opts.fetchedFromHint] : []), opts.url, ...(opts.mirrors ?? [])])];
  for (const u of order) {
    const p = cachePath(opts.cacheDir, opts.packId, opts.rawIndex, u);
    if (!existsSync(p)) continue;
    const buf = new Uint8Array(readFileSync(p));
    const h = sha256(buf);
    if (!opts.expectSha || opts.expectSha === h) return { buf, fetchedFrom: u, sha256: h, bytes: buf.length, fromCache: true };
  }
  if (opts.offline) throw new FetchError(`not cached (offline): ${order.join(" | ")}`, "network");
  const got = await fetchWithMirrors(order[0], order.slice(1), opts.onAttempt);
  const p = cachePath(opts.cacheDir, opts.packId, opts.rawIndex, got.fetchedFrom);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, got.buf);
  return { ...got, sha256: sha256(got.buf), bytes: got.buf.length, fromCache: false };
}
