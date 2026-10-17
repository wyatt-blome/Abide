// npx tsx scripts/make-fixtures.ts
//
// Cuts REAL snippets from cached source files (.cache/sources/, filled by build-library) into
// tests/fixtures/real/{parser}.txt, so parser tests can also run against genuine layouts.
// Nothing is typed: every line comes from the cached file, cut by line numbers/regex below.
// Pieces are joined with "\n"; a sidecar {parser}.meta.json records pack, file, sha256 and the
// pieces taken. A parser whose source is not cached is skipped (its tests then use only the
// synthetic fixture).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CACHE_DIR, ROOT, cachePath } from "./lib/fetch";
import { sha256 } from "./lib/hash";
import { loadManifests } from "./lib/manifest";
import { rawToText } from "./lib/source-text";

interface Piece { from: "start" | "last" | string; lines: number }
interface Spec {
  parser: string; pack: string; rawIndex?: number; file?: string;
  /** line-based pieces for text sources */
  pieces?: Piece[];
  /** JSON sources: keep Metadata and the first N Data items (values are not altered) */
  jsonItems?: number;
}

/** Candidate packs per parser, first cached one wins. */
const SPECS: Spec[][] = [
  [{ parser: "creed-json-proofs", pack: "heidelberg-catechism", jsonItems: 4 }],
  [{ parser: "creed-json-inline", pack: "canons-of-dort", jsonItems: 1 }],
  [{ parser: "openbible-crossrefs", pack: "openbible", pieces: [{ from: "start", lines: 60 }] }],
  [
    { parser: "ccel-txt", pack: "augustine-city-of-god", pieces: [{ from: "start", lines: 80 }, { from: "^Book XIV\\.?$", lines: 400 }, { from: "last:^\\s*Indexes\\s*$", lines: 200 }] },
    { parser: "ccel-txt", pack: "calvin-institutes", pieces: [{ from: "start", lines: 80 }, { from: "^Chapter 1\\.", lines: 300 }, { from: "last:^\\s*Indexes\\s*$", lines: 200 }] },
  ],
  [{ parser: "verse-commentary", pack: "henry-commentary", rawIndex: 0, pieces: [{ from: "start", lines: 60 }, { from: "^An Exposition", lines: 500 }] },
   { parser: "verse-commentary", pack: "wesley-notes-nt", pieces: [{ from: "start", lines: 60 }, { from: "^(?:CHAPTER|Chapter) (?:I|1)\\.?$", lines: 400 }] }],
  [{ parser: "heading-range", pack: "spurgeon-treasury-of-david", rawIndex: 0, pieces: [{ from: "start", lines: 40 }, { from: "^PSALM (?:I|1)\\.?$", lines: 400 }] },
   { parser: "heading-range", pack: "augustine-tractates-john", pieces: [{ from: "start", lines: 60 }, { from: "^Tractate I\\.?$", lines: 400 }] }],
  [{ parser: "inline-citation", pack: "murray-abide-in-christ", pieces: [{ from: "start", lines: 400 }] },
   { parser: "inline-citation", pack: "owen-mortification", pieces: [{ from: "start", lines: 500 }] }],
  [{ parser: "html-chapters", pack: "machen-christianity-liberalism", pieces: [{ from: "start", lines: 400 }] }],
];

function cut(text: string, pieces: Piece[]): { out: string; taken: { start: number; lines: number }[] } | null {
  const lines = text.split("\n");
  const taken: { start: number; lines: number }[] = [];
  const parts: string[] = [];
  for (const p of pieces) {
    let start: number;
    if (p.from === "start") start = 0;
    else if (p.from.startsWith("last:")) {
      const re = new RegExp(p.from.slice(5));
      start = -1;
      for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) { start = i; break; }
    } else {
      const re = new RegExp(p.from);
      start = lines.findIndex((l) => re.test(l.trim()));
    }
    if (start < 0) return null;
    parts.push(lines.slice(start, start + p.lines).join("\n"));
    taken.push({ start, lines: Math.min(p.lines, lines.length - start) });
  }
  return { out: parts.join("\n"), taken };
}

export function makeFixtures(cacheDir = DEFAULT_CACHE_DIR, outDir = path.join(ROOT, "tests", "fixtures", "real")): string[] {
  const manifests = new Map(loadManifests(path.join(ROOT, "library", "packs")).flatMap((l) => (l.manifest ? [[l.id, l.manifest]] : [])));
  const lockPath = path.join(ROOT, "library", "sources.lock.json");
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : { packs: {} };
  mkdirSync(outDir, { recursive: true });
  const made: string[] = [];
  for (const candidates of SPECS) {
    let done = false;
    for (const s of candidates) {
      const m = manifests.get(s.pack);
      if (!m) continue;
      const i = s.rawIndex ?? 0;
      const url = lock.packs?.[s.pack]?.files?.[i]?.url ?? m.rawUrls[i];
      const p = cachePath(cacheDir, s.pack, i, url);
      if (!existsSync(p)) continue;
      const buf = new Uint8Array(readFileSync(p));
      const text = rawToText(buf);
      let out: string;
      let taken: unknown;
      if (s.jsonItems) {
        const json = JSON.parse(text) as { Metadata: unknown; Data: unknown[] };
        out = JSON.stringify({ Metadata: json.Metadata, Data: json.Data.slice(0, s.jsonItems) }, null, 2);
        taken = { jsonItems: s.jsonItems };
      } else {
        const c = cut(text, s.pieces ?? []);
        if (!c) { console.log(`make-fixtures: ${s.parser}: pattern not found in ${s.pack}, trying next`); continue; }
        out = c.out;
        taken = c.taken;
      }
      writeFileSync(path.join(outDir, `${s.parser}.txt`), out);
      writeFileSync(
        path.join(outDir, `${s.parser}.meta.json`),
        JSON.stringify({ parser: s.parser, pack: s.pack, rawIndex: i, url, sourceSha256: sha256(buf), taken, note: "cut by scripts/make-fixtures.ts" }, null, 2) + "\n",
      );
      console.log(`make-fixtures: ${s.parser} ← ${s.pack} (${url})`);
      made.push(s.parser);
      done = true;
      break;
    }
    if (!done) console.log(`make-fixtures: ${candidates[0].parser}: no cached source, skipped`);
  }
  return made;
}

if (require.main === module) makeFixtures();
