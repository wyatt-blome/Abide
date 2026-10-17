import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Offline strategy (see DECISIONS.md "App shell / PWA"):
// - Precache: Next build assets (automatic), every static route's HTML, the web manifest,
//   icons, /bible/meta.json, /bible/bsb/headings.json and /library/index.json.
// - Bible book files and library shards are cached at runtime (cache-first) into caches whose
//   names carry a content hash of public/bible and public/library. The SW reads those hashes from
//   the precache revisions of meta.json / index.json, so a rebuilt dataset gets a fresh cache.
// - The client warms the bible cache (all three translations) and default-on library packs
//   after the first load (src/components/providers/offlineWarmup.ts).
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const APP_DIR = path.join(ROOT, "src", "app");

/** Changes on every build: route HTML embeds build-specific chunk names. */
const BUILD_REVISION = randomUUID();

type PrecacheEntry = { url: string; revision: string };

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

function hashFile(file: string): string {
  return createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

/** One hash over every file (path + bytes) in a directory tree. */
function hashTree(dir: string): string | null {
  const files = walk(dir);
  if (files.length === 0) return null;
  const h = createHash("md5");
  for (const f of files) {
    h.update(path.relative(dir, f));
    h.update(fs.readFileSync(f));
  }
  return h.digest("hex");
}

/** Static App Router routes ("/", "/memorize", ...) found from page files. Dynamic segments are skipped. */
function staticRoutes(): string[] {
  const routes = new Set<string>();
  for (const file of walk(APP_DIR)) {
    if (!/^page\.(tsx|ts|jsx|js|mdx)$/.test(path.basename(file))) continue;
    const segments = path.relative(APP_DIR, path.dirname(file)).split(path.sep).filter(Boolean);
    // Route groups "(x)" are transparent; dynamic "[x]", private "_x", parallel "@x" and
    // intercepting "(..)x" segments cannot be precached as fixed URLs.
    const urlSegments = segments.filter((s) => !/^\([^.)][^)]*\)$/.test(s));
    if (urlSegments.some((s) => /^[[_@(]/.test(s))) continue;
    routes.add("/" + urlSegments.join("/"));
  }
  return [...routes].sort();
}

function precacheEntries(): PrecacheEntry[] {
  const entries: PrecacheEntry[] = [];

  for (const route of staticRoutes()) entries.push({ url: route, revision: BUILD_REVISION });
  entries.push({ url: "/manifest.webmanifest", revision: BUILD_REVISION });
  const favicon = path.join(APP_DIR, "favicon.ico");
  if (fs.existsSync(favicon)) entries.push({ url: "/favicon.ico", revision: hashFile(favicon) });

  for (const file of walk(path.join(PUBLIC_DIR, "icons"))) {
    entries.push({ url: "/" + path.relative(PUBLIC_DIR, file).split(path.sep).join("/"), revision: hashFile(file) });
  }

  const bibleDir = path.join(PUBLIC_DIR, "bible");
  const bibleRev = hashTree(bibleDir);
  if (bibleRev) {
    // meta.json's revision doubles as the bible dataset version read by the SW.
    if (fs.existsSync(path.join(bibleDir, "meta.json"))) entries.push({ url: "/bible/meta.json", revision: bibleRev });
    const headings = path.join(bibleDir, "bsb", "headings.json");
    if (fs.existsSync(headings)) entries.push({ url: "/bible/bsb/headings.json", revision: hashFile(headings) });
  } else {
    console.warn("[abide] public/bible is empty: the bible will not be available offline in this build.");
  }

  const libraryDir = path.join(PUBLIC_DIR, "library");
  const libraryRev = hashTree(libraryDir);
  if (libraryRev && fs.existsSync(path.join(libraryDir, "index.json"))) {
    entries.push({ url: "/library/index.json", revision: libraryRev });
  }

  return entries;
}

const isDev = process.env.NODE_ENV === "development";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
  register: true,
  // A rancher on spotty coverage must not lose a recitation because the signal came back.
  reloadOnOnline: false,
  cacheOnNavigation: false,
  // Computed lazily only when building (dev is disabled and never reads public/bible).
  additionalPrecacheEntries: isDev ? [] : precacheEntries(),
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
});

const nextConfig: NextConfig = {
  // The app is entirely client-rendered over IndexedDB. cacheComponents/partialPrefetching are
  // left off: every route prerenders to a plain static HTML shell that the SW precaches.
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  // `next build --webpack` / `next dev --webpack` (Serwist needs webpack). Tailwind v4 runs as a
  // pre-loader on CSS using the already-installed @tailwindcss/turbopack loader (webpack loader API).
  webpack(config) {
    config.module = config.module ?? {};
    config.module.rules = config.module.rules ?? [];
    // Matched via `resource` (not `test`): a top-level `test` matching .css makes Next disable
    // its built-in CSS handling. As a pre-loader it runs before Next's postcss/css loaders.
    config.module.rules.push({
      resource: (file: string) => /\.css$/.test(file) && !/[\\/]node_modules[\\/]/.test(file),
      enforce: "pre",
      use: [{ loader: "@tailwindcss/turbopack" }],
    });
    return config;
  },
  // Plain `next dev` (Turbopack) still gets Tailwind; Serwist is disabled in dev anyway.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
