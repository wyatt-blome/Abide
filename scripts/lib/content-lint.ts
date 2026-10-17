// Content lint: the static half of the hard rule ("no developer-typed theology, commentary,
// quote, heading or summary reaches the app"). Shared by tests/lint-guard.test.ts and the
// prebuild CLI scripts/lint-content.ts, so both apply exactly the same checks.
//
//  1. src/ and content/: no string literal, template literal or JSX text longer than 160 chars,
//     and no COMBINED text longer than 160 chars built from short pieces:
//       - a `+` concatenation chain (sum of its string/template pieces),
//       - a template literal with substitutions (sum of its literal parts),
//       - `[...].join(…)` on an array literal (sum of its string elements),
//       - the direct text children of one JSX element (JsxText plus {"…"} / {`…`} siblings).
//  2. content/ holds only .ts files (anything else, e.g. .json/.md/.txt/.tsx, fails), and every
//     string literal in it must look like a URL, id/slug, book code/verse key, reference,
//     setting token or short title. A short title is ≤ 80 chars, ≤ 12 words, has no quotation
//     marks, no "!"/"?", no "; "/": ", no ". X" sentence break (short abbreviations such as
//     "St." or "Vol." excepted), does not END in ". ! ?", and does not read as prose: 3 or more lowercase English function
//     words ("the", "and", "of", …) together with any other lowercase word (Title Case titles
//     such as "Grace Abounding to the Chief of Sinners" keep only the small words lowercase). Template literals and JSX text in content/ are
//     checked the same way.
//  3. library/packs/*.json display fields (author, title, edition, ocrNote, every "label" and
//     "note" value, introLocator) must be label-shaped: non-blank, ≤ 160 chars, one line, no
//     multi-sentence prose.
// Module specifiers in import/export statements are ignored. tests/ and public/ are not scanned.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { labelProblem } from "./label-shape";

export const MAX_LITERAL = 160;

export interface Violation { file: string; line: number; kind: string; text: string; reason: string }

export interface Lit { file: string; line: number; text: string; kind: string }

/** All files under dir (recursively). */
export function walkAll(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walkAll(p, out);
    else out.push(p);
  }
  return out;
}

const isTsSource = (f: string) => /\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f);

function isModuleSpecifier(n: ts.Node): boolean {
  const p = n.parent;
  return !!p && (
    ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) ||
    (ts.isCallExpression(p) && (p.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(p.expression) && p.expression.text === "require"))) ||
    (ts.isLiteralTypeNode(p) && !!p.parent && ts.isImportTypeNode(p.parent))
  );
}

const jsxNorm = (s: string) => s.replace(/\s+/g, " ");

/** Text a node contributes when it is a string-ish leaf; null otherwise. */
function leafText(n: ts.Node): string | null {
  if (ts.isParenthesizedExpression(n)) return leafText(n.expression);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => s.literal.text).join("");
  return null;
}

/** Flatten a `+` chain into its operands. */
function plusOperands(n: ts.Expression, out: ts.Expression[] = []): ts.Expression[] {
  const e = ts.isParenthesizedExpression(n) ? n.expression : n;
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    plusOperands(e.left, out);
    plusOperands(e.right, out);
  } else out.push(e);
  return out;
}

/**
 * Every literal of a TS/TSX source, plus the combined pieces (kind "combined …") whose total
 * length must also stay within the limit.
 */
export function literalsOf(file: string, code: string, rel = file): { lits: Lit[]; combined: Lit[] } {
  const src = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lits: Lit[] = [];
  const combined: Lit[] = [];
  const lineOf = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const add = (to: Lit[], n: ts.Node, text: string, kind: string) => to.push({ file: rel, line: lineOf(n), text, kind });
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) && !isModuleSpecifier(n)) add(lits, n, n.text, "string");
    else if (ts.isNoSubstitutionTemplateLiteral(n)) add(lits, n, n.text, "template");
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) add(lits, n, n.text, "template part");
    else if (ts.isJsxText(n) && n.text.trim()) add(lits, n, jsxNorm(n.text).trim(), "jsx text");

    if (ts.isTemplateExpression(n)) add(combined, n, leafText(n)!, "combined template");
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const p = n.parent && ts.isParenthesizedExpression(n.parent) ? n.parent.parent : n.parent;
      const isRoot = !(p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.PlusToken);
      if (isRoot) {
        const pieces = plusOperands(n).map(leafText).filter((t): t is string => t !== null);
        if (pieces.length) add(combined, n, pieces.join(""), "combined + chain");
      }
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "join") {
      const target = ts.isParenthesizedExpression(n.expression.expression) ? n.expression.expression.expression : n.expression.expression;
      if (ts.isArrayLiteralExpression(target)) {
        const pieces = target.elements.map(leafText).filter((t): t is string => t !== null);
        const sep = n.arguments[0] ? leafText(n.arguments[0]) ?? "" : ",";
        if (pieces.length) add(combined, n, pieces.join(sep), "combined [].join()");
      }
    }
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      let text = "";
      let count = 0;
      for (const c of n.children) {
        if (ts.isJsxText(c)) { text += jsxNorm(c.text); count++; }
        else if (ts.isJsxExpression(c) && c.expression) {
          const t = leafText(c.expression);
          if (t !== null) { text += t; count++; }
        }
      }
      if (count > 1) add(combined, n, text.replace(/\s+/g, " ").trim(), "combined JSX text");
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return { lits, combined };
}

// ---------------------------------------------------------------- content/ shapes

const SHAPES: [string, RegExp][] = [
  ["url", /^https?:\/\/\S+$/],
  ["id", /^[a-z0-9][a-z0-9._/:-]{0,79}$/],
  ["book code / verse key", /^[1-3A-Z]{3}(\.\d+(\.\d+)?)?(-[1-3A-Z]{3}\.\d+(\.\d+)?)?$/],
  ["reference", /^(?:[1-3] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)?\.? \d+(?::\d+)?(?:[-–]\d+(?::\d+)?)?(?:[;,] ?\d+(?::\d+)?(?:[-–]\d+)?)*$/],
  ["setting", /^[A-Za-z][A-Za-z0-9]{0,39}$/],
  ["empty", /^\s*$/],
];

/** Lowercase English function words: three of them in one string reads as prose, not a label. */
export const FUNCTION_WORDS = new Set([
  "the", "and", "of", "that", "he", "his", "him", "she", "her", "to", "in", "is", "was", "for", "with", "who", "which",
  "it", "its", "we", "our", "us", "they", "them", "their", "you", "your", "be", "are", "were", "been", "this", "these",
  "those", "not", "but", "by", "from", "as", "at", "on", "or", "an", "a", "so", "if", "then", "than", "shall", "will",
  "hath", "doth", "unto", "upon", "thy", "thee", "thou", "ye", "all", "into", "what", "when", "where", "there",
]);

export function functionWordCount(s: string): number {
  return (s.match(/\p{L}+/gu) ?? []).filter((w) => w === w.toLowerCase() && FUNCTION_WORDS.has(w)).length;
}

/**
 * Prose test for content/ strings: ≥ 3 lowercase function words AND at least one lowercase
 * word that is not a function word. Title Case strings ("Grace Abounding to the Chief of
 * Sinners") keep only the small words lowercase, so they read as titles; a sentence ("lorem
 * ipsum is the dolor of the amet") has lowercase content words too.
 */
export function readsAsProse(s: string): boolean {
  const words = s.match(/\p{L}+/gu) ?? [];
  const lower = words.filter((w) => w === w.toLowerCase() && /\p{Ll}/u.test(w));
  const fw = lower.filter((w) => FUNCTION_WORDS.has(w)).length;
  return fw >= 3 && lower.some((w) => !FUNCTION_WORDS.has(w));
}

export function isShortTitle(s: string): boolean {
  const t = s.trim();
  if (t.length > 80 || t.split(/\s+/).length > 12) return false;
  if (/["“”]/.test(t)) return false;
  if (/[!?]/.test(t)) return false;
  if (/[;:] /.test(t)) return false;
  if (/[.!?]["'’”)\]]*$/.test(t)) return false; // trailing sentence punctuation
  // ". X" is sentence punctuation unless the word before is a short abbreviation (St., Vol., Rev.)
  for (const m of t.matchAll(/(\S+)\. [A-Z]/g)) if (!/^[A-Z][a-z]{0,3}$|^[A-Z]$/.test(m[1])) return false;
  if (readsAsProse(t)) return false;
  return true;
}

/** The allowed shape a content/ string has, or null. */
export function contentShape(s: string): string | null {
  for (const [name, re] of SHAPES) if (re.test(s)) return name;
  return isShortTitle(s) ? "short title" : null;
}

export { labelProblem } from "./label-shape";

// ---------------------------------------------------------------- whole-repo checks

export interface LintOptions { root: string; srcDirs?: string[]; contentDir?: string; packsDir?: string }

/** Violations of rules 1 and 2 for one source file given as text (used by tests on snippets). */
export function lintSource(rel: string, code: string, opts: { content: boolean }): Violation[] {
  const out: Violation[] = [];
  const { lits, combined } = literalsOf(rel, code, rel);
  for (const l of lits)
    if (l.text.length > MAX_LITERAL) out.push({ ...l, reason: `${l.kind} longer than ${MAX_LITERAL} chars (${l.text.length})` });
  for (const l of combined)
    if (l.text.length > MAX_LITERAL) out.push({ ...l, reason: `${l.kind} totals ${l.text.length} chars (> ${MAX_LITERAL})` });
  if (opts.content) {
    for (const l of lits) if (contentShape(l.text) === null) out.push({ ...l, reason: "content/ string is not an id, URL, reference, setting or short title" });
  }
  return out;
}

/** Violations of rule 3 for one manifest object. */
export function lintManifest(rel: string, json: unknown): Violation[] {
  const out: Violation[] = [];
  const m = json as Record<string, unknown>;
  const check = (key: string, v: unknown) => {
    const why = labelProblem(v);
    if (why) out.push({ file: rel, line: 0, kind: `manifest ${key}`, text: String(v ?? ""), reason: why });
  };
  for (const k of ["author", "title", "edition"]) check(k, m[k]);
  if (m.ocrNote !== undefined) check("ocrNote", m.ocrNote);
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if ((k === "label" || k === "note" || k === "introLocator" || k === "locator") && typeof x === "string") check(`${p}.${k}`.replace(/^\./, ""), x);
        else walk(x, `${p}.${k}`);
      }
  };
  walk({ parserOptions: m.parserOptions, alternateSources: m.alternateSources, mirrorEditions: m.mirrorEditions }, "");
  if (m.mirrorEditions && typeof m.mirrorEditions === "object") for (const [u, v] of Object.entries(m.mirrorEditions)) check(`mirrorEditions[${u}]`, v);
  return out;
}

export interface LintReport { files: number; violations: Violation[] }

export function lintRepo(o: LintOptions): LintReport {
  const root = o.root;
  const srcDirs = o.srcDirs ?? [path.join(root, "src")];
  const contentDir = o.contentDir ?? path.join(root, "content");
  const packsDir = o.packsDir ?? path.join(root, "library", "packs");
  const violations: Violation[] = [];
  let files = 0;
  const rel = (p: string) => path.relative(root, p);
  for (const d of srcDirs)
    for (const f of walkAll(d).filter(isTsSource)) {
      files++;
      violations.push(...lintSource(rel(f), readFileSync(f, "utf8"), { content: false }));
    }
  for (const f of walkAll(contentDir)) {
    if (!/\.ts$/.test(f) || /\.d\.ts$/.test(f)) {
      violations.push({ file: rel(f), line: 0, kind: "file", text: path.basename(f), reason: "content/ may hold only .ts files" });
      continue;
    }
    files++;
    violations.push(...lintSource(rel(f), readFileSync(f, "utf8"), { content: true }));
  }
  if (existsSync(packsDir))
    for (const f of readdirSync(packsDir).filter((x) => x.endsWith(".json")).sort()) {
      files++;
      const p = path.join(packsDir, f);
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(p, "utf8"));
      } catch (e) {
        violations.push({ file: rel(p), line: 0, kind: "manifest", text: "", reason: `invalid JSON: ${(e as Error).message}` });
        continue;
      }
      violations.push(...lintManifest(rel(p), json));
    }
  return { files, violations };
}

export function formatViolation(v: Violation): string {
  return `${v.file}${v.line ? `:${v.line}` : ""} (${v.kind}) ${v.reason}: ${JSON.stringify(v.text.slice(0, 70))}${v.text.length > 70 ? "…" : ""}`;
}
