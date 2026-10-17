// Client-side warm-up of the service worker's runtime caches after the first load.
// Fetches go through the SW (cache-first rules in src/app/sw.ts), which stores them. Files already
// in Cache Storage are skipped, so the warm-up is cheap on later loads and resumes after a drop.

export const BIBLE_DIRS = ["bsb", "web", "kjv"] as const;

export interface WarmupProgress {
  done: number;
  total: number;
  failed: number;
}

export interface WarmupOptions {
  /** settings.enabledPacks. Packs flagged largePack are never warmed here (the library code fetches them). */
  enabledPacks: string[];
  signal?: AbortSignal;
  onProgress?: (p: WarmupProgress) => void;
  /** Parallel requests. Default 4. */
  concurrency?: number;
}

interface MetaLike {
  books?: { code?: string }[];
}

interface LibraryIndexLike {
  works?: { id: string; defaultEnabled?: boolean; largePack?: boolean }[];
  books?: Record<string, string[]>;
}

export function offlineCacheSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && typeof caches !== "undefined";
}

/** Resolves once a service worker controls this page (first install claims clients), or false on timeout. */
export async function waitForController(timeoutMs = 60_000): Promise<boolean> {
  if (!offlineCacheSupported()) return false;
  if (navigator.serviceWorker.controller) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(Boolean(navigator.serviceWorker.controller));
    }, timeoutMs);
    function onChange() {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(true);
    }
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
  });
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** URLs of every bundled bible book file (all three translations) plus headings. */
export async function bibleUrls(signal?: AbortSignal): Promise<string[]> {
  const meta = await getJson<MetaLike>("/bible/meta.json", signal);
  const codes = (meta?.books ?? []).map((b) => b.code).filter((c): c is string => typeof c === "string");
  const urls = ["/bible/meta.json", "/bible/bsb/headings.json"];
  for (const dir of BIBLE_DIRS) for (const code of codes) urls.push(`/bible/${dir}/${code}.json`);
  return urls;
}

/** Shard URLs for enabled, non-large library packs. Empty enabledPacks → the packs flagged defaultEnabled. */
export async function libraryUrls(enabledPacks: string[], signal?: AbortSignal): Promise<string[]> {
  const index = await getJson<LibraryIndexLike>("/library/index.json", signal);
  if (!index) return [];
  const works = new Map((index.works ?? []).map((w) => [w.id, w]));
  const urls: string[] = [];
  for (const [packId, books] of Object.entries(index.books ?? {})) {
    const work = works.get(packId);
    if (work?.largePack) continue;
    const enabled = enabledPacks.length > 0 ? enabledPacks.includes(packId) : Boolean(work?.defaultEnabled);
    if (!enabled) continue;
    for (const book of books) urls.push(`/library/${packId}/${book}.json`);
  }
  return urls;
}

async function isCached(url: string): Promise<boolean> {
  try {
    return Boolean(await caches.match(url));
  } catch {
    return false;
  }
}

/** Fetch every URL not yet in Cache Storage through the SW. Never throws. */
export async function warmUrls(urls: string[], opts: Omit<WarmupOptions, "enabledPacks"> = {}): Promise<WarmupProgress> {
  const { signal, onProgress, concurrency = 4 } = opts;
  const progress: WarmupProgress = { done: 0, total: urls.length, failed: 0 };
  onProgress?.({ ...progress });
  let next = 0;
  const worker = async () => {
    while (next < urls.length && !signal?.aborted) {
      const url = urls[next++];
      if (!(await isCached(url))) {
        try {
          const res = await fetch(url, { signal });
          if (res.ok) await res.arrayBuffer();
          else progress.failed++;
        } catch {
          if (signal?.aborted) return;
          progress.failed++;
        }
      }
      progress.done++;
      onProgress?.({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return progress;
}

/** Warm the bible (all translations) and enabled small library packs. Requires an active SW. */
export async function warmOfflineCache(opts: WarmupOptions): Promise<WarmupProgress> {
  if (!offlineCacheSupported() || !(await waitForController())) return { done: 0, total: 0, failed: 0 };
  const [bible, library] = await Promise.all([bibleUrls(opts.signal), libraryUrls(opts.enabledPacks, opts.signal)]);
  return warmUrls([...bible, ...library], opts);
}
