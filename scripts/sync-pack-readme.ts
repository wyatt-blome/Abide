// Copies library/packs/README.md → public/library/README.md (shown on /library/how-to-add) and
// writes public/library/packs-summary.json: the descriptive fields of every pack manifest, so the
// Library manager can show author/title/edition/license for packs that were not built.
// Run by `prebuild` after verify-excerpts; safe to run any time (`npx tsx scripts/sync-pack-readme.ts`).

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const PACKS = path.join(ROOT, "library", "packs");
const OUT = path.join(ROOT, "public", "library");

interface Manifest {
  id: string;
  author: string;
  title: string;
  edition: string;
  era: string;
  types: string[];
  sourcePage: string;
  license: { status: string; basis: string; proofText: string; proofUrl: string };
  defaultEnabled?: boolean;
  largePack?: boolean;
  ocr?: boolean;
  ocrNote?: string;
  listedOnly?: boolean;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const readme = path.join(PACKS, "README.md");
  if (existsSync(readme)) copyFileSync(readme, path.join(OUT, "README.md"));

  const packs = readdirSync(PACKS)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(PACKS, f), "utf8")) as Manifest)
    .map((m) => ({
      id: m.id,
      author: m.author,
      title: m.title,
      edition: m.edition,
      era: m.era,
      types: m.types,
      sourcePage: m.sourcePage,
      license: {
        status: m.license.status,
        basis: m.license.basis,
        proofText: m.license.proofText,
        proofUrl: m.license.proofUrl,
      },
      defaultEnabled: Boolean(m.defaultEnabled),
      largePack: Boolean(m.largePack),
      ...(m.ocr ? { ocr: true } : {}),
      ...(m.ocrNote ? { ocrNote: m.ocrNote } : {}),
      ...(m.listedOnly ? { listedOnly: true } : {}),
    }));
  writeFileSync(path.join(OUT, "packs-summary.json"), JSON.stringify({ packs }) + "\n");
  console.log(`sync-pack-readme: README.md + ${packs.length} pack summaries → public/library/`);
}

main();
