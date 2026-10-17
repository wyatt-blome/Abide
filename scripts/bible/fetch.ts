// Fetch helper for the Bible build: ordered URL list (spec primary first, then mirrors),
// on-disk cache in .cache/sources/bible/, sha256 of the raw bytes, and a log of the URL used.
//
// Node 22's global fetch does not honor HTTPS_PROXY on its own. In order we try:
//   1. undici's EnvHttpProxyAgent as the dispatcher (when HTTPS_PROXY is set and undici resolves),
//   2. plain global fetch (works when NODE_USE_ENV_PROXY=1 or no proxy is needed),
//   3. spawning `curl` (honors HTTPS_PROXY and the system CA bundle).

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CACHE_DIR = path.resolve(process.cwd(), ".cache/sources/bible");

export interface Fetched {
  url: string;
  bytes: Uint8Array;
  sha256: string;
  fromCache: boolean;
}

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

let dispatcherPromise: Promise<unknown | undefined> | null = null;
function getDispatcher(): Promise<unknown | undefined> {
  if (!dispatcherPromise) {
    dispatcherPromise = (async () => {
      const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
      if (!proxy) return undefined;
      try {
        const modName = "undici";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const undici: any = await import(modName);
        if (undici?.EnvHttpProxyAgent) return new undici.EnvHttpProxyAgent();
        if (undici?.ProxyAgent) return new undici.ProxyAgent(proxy);
      } catch {
        /* undici not resolvable: fall through */
      }
      return undefined;
    })();
  }
  return dispatcherPromise;
}

async function viaFetch(url: string): Promise<Uint8Array> {
  const dispatcher = await getDispatcher();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const init: any = { redirect: "follow", headers: { "user-agent": "abide-build-bible/1.0" } };
  if (dispatcher) init.dispatcher = dispatcher;
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function viaCurl(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-sS", "-L", "--fail", "--max-time", "300", url],
      { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`curl: ${String(stderr || err.message).trim()}`));
        else resolve(new Uint8Array(stdout));
      },
    );
  });
}

/** Download one URL (no cache), trying fetch then curl. */
export async function download(url: string): Promise<Uint8Array> {
  const errors: string[] = [];
  try {
    return await viaFetch(url);
  } catch (e) {
    errors.push(`fetch: ${(e as Error).message}`);
    // A real HTTP status from the server (e.g. 404) will not change with curl.
    if (/^HTTP 404/.test((e as Error).message)) throw new Error(errors.join("; "));
  }
  try {
    return await viaCurl(url);
  } catch (e) {
    errors.push((e as Error).message);
  }
  throw new Error(errors.join("; "));
}

const safeName = (url: string): string => url.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9._-]+/g, "_");

/**
 * Try each URL in order; return the first that succeeds. Raw bytes are cached per URL in
 * CACHE_DIR, so re-runs are offline and deterministic. Logs which URL was used.
 */
export async function fetchFirst(label: string, urls: string[], opts: { quiet?: boolean } = {}): Promise<Fetched> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const failures: string[] = [];
  for (const url of urls) {
    const file = path.join(CACHE_DIR, safeName(url));
    if (existsSync(file)) {
      const bytes = new Uint8Array(readFileSync(file));
      if (!opts.quiet) console.log(`[fetch] ${label}: cache ${url}`);
      return { url, bytes, sha256: sha256(bytes), fromCache: true };
    }
  }
  for (const url of urls) {
    try {
      const bytes = await download(url);
      writeFileSync(path.join(CACHE_DIR, safeName(url)), bytes);
      if (!opts.quiet) console.log(`[fetch] ${label}: ${url} (${bytes.length} bytes)`);
      return { url, bytes, sha256: sha256(bytes), fromCache: false };
    } catch (e) {
      failures.push(`${url}: ${(e as Error).message}`);
      if (!opts.quiet) console.warn(`[fetch] ${label}: failed ${url} -> ${(e as Error).message}`);
    }
  }
  throw new Error(`[fetch] ${label}: all sources failed:\n  ${failures.join("\n  ")}`);
}

/** Run async jobs with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
