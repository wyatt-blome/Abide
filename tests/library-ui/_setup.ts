// Shared setup for library-ui tests: point the Bible and library loaders at the generated files
// on disk (public/bible, public/library). No text here is typed; everything is read from data.
import { readFileSync } from "node:fs";
import path from "node:path";
import { configureBible } from "@/lib/bible";
import { configureLibrary, type ExcerptShard, type LibraryIndex } from "@/lib/library";

export const ROOT = path.resolve(__dirname, "../..");

export function useDiskData(): void {
  configureBible({
    basePath: "/bible",
    fetchJson: async (p) => JSON.parse(readFileSync(path.join(ROOT, "public", p), "utf8")),
  });
  configureLibrary({
    basePath: "/library",
    cache: null,
    fetchJson: async (u) => JSON.parse(readFileSync(path.join(ROOT, "public", u), "utf8")),
  });
}

export function readIndex(): LibraryIndex {
  return JSON.parse(readFileSync(path.join(ROOT, "public/library/index.json"), "utf8")) as LibraryIndex;
}

export function readShard(packId: string, book: string): ExcerptShard {
  return JSON.parse(readFileSync(path.join(ROOT, `public/library/${packId}/${book}.json`), "utf8")) as ExcerptShard;
}

/** Every non-empty text node under `root`, trimmed. */
export function textNodes(root: Node): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  return out;
}
