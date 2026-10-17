// Guard for the hard rule: no developer-typed theology/commentary/quotes in the app.
//
// 1. src/ and content/: no string literal, template literal or JSX text longer than 160 chars.
// 2. content/: every string literal must have the shape of an ID, URL, range or setting —
//    the heuristic allow-list below. Short titles of works and site names are allowed:
//      - URL                https://… / http://… (no spaces)
//      - id / slug / path   lowercase letters, digits, "-", "_", ".", "/", ":" (≤ 80)
//      - book code          GEN … REV, also VerseKeys "ROM.8.28" and "ROM.8.28-ROM.8.30"
//      - reference          "Rom 8:28-30", "Psalm 23", "John 1:1–18; 3:16" (book word + numbers)
//      - setting / enum     a single word or camelCase token (≤ 40)
//      - short title        ≤ 80 chars, ≤ 12 words, no sentence punctuation (no ". X", "!", "?",
//                           ";" or ":" followed by a space, no quotation marks). Abbreviations such
//                           as "St." or "Vol." inside a title are allowed.
//    Anything else (a sentence, a quote, a summary) fails with file:line.
// Module specifiers in import/export statements are ignored. tests/ and public/ are excluded.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const MAX = 160;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p);
  }
  return out;
}

interface Lit { file: string; line: number; text: string; kind: string }

function literals(file: string): Lit[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Lit[] = [];
  const add = (n: ts.Node, text: string, kind: string) =>
    out.push({ file: path.relative(ROOT, file), line: src.getLineAndCharacterOfPosition(n.getStart()).line + 1, text, kind });
  const visit = (n: ts.Node) => {
    const p = n.parent;
    const isModuleSpecifier = !!p && (
      ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) ||
      (ts.isCallExpression(p) && (p.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(p.expression) && p.expression.text === "require"))) ||
      (ts.isLiteralTypeNode(p) && !!p.parent && ts.isImportTypeNode(p.parent))
    );
    if (ts.isStringLiteral(n) && !isModuleSpecifier) add(n, n.text, "string");
    else if (ts.isNoSubstitutionTemplateLiteral(n)) add(n, n.text, "template");
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) add(n, n.text, "template part");
    else if (ts.isJsxText(n) && n.text.trim()) add(n, n.text.replace(/\s+/g, " ").trim(), "jsx text");
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

const SHAPES: [string, RegExp][] = [
  ["url", /^https?:\/\/\S+$/],
  ["id", /^[a-z0-9][a-z0-9._/:-]{0,79}$/],
  ["book code / verse key", /^[1-3A-Z]{3}(\.\d+(\.\d+)?)?(-[1-3A-Z]{3}\.\d+(\.\d+)?)?$/],
  ["reference", /^(?:[1-3] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)?\.? \d+(?::\d+)?(?:[-–]\d+(?::\d+)?)?(?:[;,] ?\d+(?::\d+)?(?:[-–]\d+)?)*$/],
  ["setting", /^[A-Za-z][A-Za-z0-9]{0,39}$/],
  ["empty", /^\s*$/],
];

function isShortTitle(s: string): boolean {
  if (s.length > 80 || s.trim().split(/\s+/).length > 12) return false;
  if (/["“”]/.test(s)) return false;
  if (/[!?]/.test(s)) return false;
  if (/[;:] /.test(s)) return false;
  // ". X" is sentence punctuation unless the word before is a short abbreviation (St., Vol., Rev.)
  for (const m of s.matchAll(/(\S+)\. [A-Z]/g)) if (!/^[A-Z][a-z]{0,3}$|^[A-Z]$/.test(m[1])) return false;
  return true;
}

function contentShape(s: string): string | null {
  for (const [name, re] of SHAPES) if (re.test(s)) return name;
  return isShortTitle(s) ? "short title" : null;
}

describe("lint guard: no long literals in src/ and content/", () => {
  const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "content"))];
  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it(`has no string/template/JSX text over ${MAX} characters`, () => {
    const long = files.flatMap(literals).filter((l) => l.text.length > MAX);
    expect(long.map((l) => `${l.file}:${l.line} (${l.kind}, ${l.text.length} chars) ${l.text.slice(0, 60)}…`)).toEqual([]);
  });
});

describe("lint guard: content/ holds only IDs, URLs, ranges, settings and short titles", () => {
  const files = walk(path.join(ROOT, "content"));
  it("every content string literal matches an allowed shape", () => {
    const bad = files.flatMap(literals).filter((l) => contentShape(l.text) === null);
    expect(bad.map((l) => `${l.file}:${l.line} ${JSON.stringify(l.text.slice(0, 80))}`)).toEqual([]);
  });
  it("heuristic accepts IDs/URLs/titles and rejects sentences (self-test)", () => {
    for (const ok of ["https://ccel.org/ccel/henry/mhc1", "romans-8", "ROM", "ROM.8.28", "Rom 8:28-30", "canonical", "The City of God", "St. Augustine's Confessions", "Vol. 2"])
      expect(contentShape(ok), ok).not.toBeNull();
    for (const bad of ["Lorem ipsum dolor sit amet. Consectetur adipiscing elit.", "Is this a question?", "He said “lorem”", "Lorem: ipsum dolor"])
      expect(contentShape(bad), bad).toBeNull();
  });
});
