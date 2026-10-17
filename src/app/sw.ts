/// <reference lib="webworker" />
// Service worker source. Bundled by @serwist/next into public/sw.js at `next build --webpack`.
// Offline strategy is described in next.config.ts and DECISIONS.md ("App shell / PWA").
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const manifest: (PrecacheEntry | string)[] = self.__SW_MANIFEST ?? [];

function revisionOf(url: string): string {
  for (const e of manifest) {
    if (typeof e !== "string" && e.url === url && e.revision) return e.revision.slice(0, 12);
  }
  return "0";
}

/** Runtime cache names carry the dataset hash so a rebuilt bible/library gets a fresh cache. */
const BIBLE_CACHE_PREFIX = "abide-bible-";
const LIBRARY_CACHE_PREFIX = "abide-library-";
const BIBLE_CACHE = BIBLE_CACHE_PREFIX + revisionOf("/bible/meta.json");
const LIBRARY_CACHE = LIBRARY_CACHE_PREFIX + revisionOf("/library/index.json");

/** Precached static routes (URLs without a file extension), e.g. "/", "/read". */
const precachedRoutes = manifest
  .map((e) => (typeof e === "string" ? e : e.url))
  .filter((u) => u.startsWith("/") && !u.startsWith("/_next/") && !/\.[a-z0-9]+$/i.test(u));

const okOnly = new CacheableResponsePlugin({ statuses: [200] });

const appCaching: RuntimeCaching[] = [
  // ESV API responses are never cached by the SW (license terms; key stays on device).
  {
    matcher: ({ url }) => url.hostname === "api.esv.org",
    handler: new NetworkOnly(),
  },
  // Bible book files: /bible/{bsb|web|kjv}/{BOOK}.json — immutable per dataset hash.
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && /^\/bible\/.+\.json$/.test(url.pathname),
    handler: new CacheFirst({ cacheName: BIBLE_CACHE, plugins: [okOnly] }),
  },
  // Library shards: /library/{packId}/{BOOK}.json — cache-first; large packs land here only
  // when the library code fetches them (i.e. when the pack is enabled).
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && /^\/library\/.+\.json$/.test(url.pathname),
    handler: new CacheFirst({ cacheName: LIBRARY_CACHE, plugins: [okOnly] }),
  },
];

const isDocument = (request: Request) => request.destination === "document" || request.mode === "navigate";

const serwist = new Serwist({
  precacheEntries: manifest,
  precacheOptions: { cleanupOutdatedCaches: true },
  // Updates wait until the person taps "Update" (UpdateBanner → messageSkipWaiting).
  skipWaiting: false,
  // First install takes control immediately so the offline warm-up runs through this worker.
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [...appCaching, ...defaultCache],
  fallbacks: {
    entries: [
      // "/read?book=PSA&chapter=23" offline → the precached "/read" shell (client reads the query).
      ...precachedRoutes.map((route) => ({
        url: route,
        matcher: ({ request }: { request: Request }) => isDocument(request) && new URL(request.url).pathname === route,
      })),
      // Any other page offline → the Today shell rather than the browser's offline page.
      ...(precachedRoutes.includes("/")
        ? [{ url: "/", matcher: ({ request }: { request: Request }) => isDocument(request) }]
        : []),
    ],
  },
});

// Drop runtime caches from older bible/library datasets.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (k) =>
              (k.startsWith(BIBLE_CACHE_PREFIX) && k !== BIBLE_CACHE) ||
              (k.startsWith(LIBRARY_CACHE_PREFIX) && k !== LIBRARY_CACHE),
          )
          .map((k) => caches.delete(k)),
      ),
    ),
  );
});

serwist.addEventListeners();
