// npm prebuild step: the hard-rule lint (scripts/lib/content-lint.ts) as a CLI.
// Same checks as tests/lint-guard.test.ts: long/combined literals in src/ and content/, content/
// shapes and file types, and label-shaped display fields in library/packs/*.json.
// Prints every violation as file:line and exits 1 when there is any.
import { pathToFileURL } from "node:url";
import { ROOT } from "./lib/fetch";
import { formatViolation, lintRepo } from "./lib/content-lint";

export function main(): number {
  const r = lintRepo({ root: ROOT });
  if (!r.violations.length) {
    console.log(`lint-content: OK — ${r.files} files`);
    return 0;
  }
  console.error(`lint-content: FAILED — ${r.violations.length} violation(s):`);
  for (const v of r.violations) console.error(`  ${formatViolation(v)}`);
  return 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) process.exit(main());
