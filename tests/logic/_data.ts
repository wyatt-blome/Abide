// Loads the generated Bible metadata from disk for logic tests (no fabricated verse counts).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BibleMeta } from "@/lib/meta";
import type { BsbHeading } from "@/db/types";

const root = path.resolve(__dirname, "../..");
let meta: BibleMeta | null = null;
let headings: BsbHeading[] | null = null;

export function loadMeta(): BibleMeta {
  return (meta ??= JSON.parse(readFileSync(path.join(root, "public/bible/meta.json"), "utf8")) as BibleMeta);
}

export function loadHeadings(): BsbHeading[] {
  return (headings ??= JSON.parse(readFileSync(path.join(root, "public/bible/bsb/headings.json"), "utf8")) as BsbHeading[]);
}

/** BSB chapter text for a book, if the generated file exists. */
export function loadBook(book: string): Record<string, string[]> {
  return JSON.parse(readFileSync(path.join(root, `public/bible/bsb/${book}.json`), "utf8"));
}
