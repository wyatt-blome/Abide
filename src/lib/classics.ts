// Bundled classics (content/classics.ts): download on demand, keep in Cache Storage, split into
// sections, and pick today's entries of a date-locked devotional.
//
// - Downloads are plain in-browser fetches of the URLs in content/classics.ts. Gutenberg, CCEL and
//   archive.org may refuse cross-origin requests from a browser (CORS); the app has no backend, so
//   no same-origin proxy is provided. A failed download shows DOWNLOAD_FAILED (UI label).
// - The raw files are stored in Cache Storage (`caches.open("abide-classics")`) keyed by URL; when
//   Cache Storage is unavailable they are kept in memory for the session.
// - Everything here is structural: Gutenberg header/footer by the "*** START OF" / "*** END OF"
//   marker lines, sections by heading-line patterns, devotional entries by their date heading lines.
//   No text is written or summarized.

import type { ClassicInfo } from "../../content/classics";

export const CLASSICS_CACHE = "abide-classics";
export const DOWNLOAD_FAILED = "Couldn't download this text. Check your connection.";

export class ClassicDownloadError extends Error {
  constructor(public readonly url?: string) {
    super(DOWNLOAD_FAILED);
    this.name = "ClassicDownloadError";
  }
}

export const gutenbergTextUrl = (id: number): string => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;

export const normalizeNewlines = (s: string): string => s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

// ---------------------------------------------------------------- Gutenberg header/footer

const START_RE = /^\s*\*{3}\s*START OF\b/i;
const END_RE = /^\s*\*{3}\s*END OF\b/i;

/**
 * Keep only the text between the "*** START OF ..." and "*** END OF ..." marker lines (both
 * excluded). A missing marker leaves that end of the file as it is.
 */
export function stripGutenberg(raw: string): string {
  const lines = normalizeNewlines(raw).split("\n");
  const s = lines.findIndex((l) => START_RE.test(l));
  const from = s >= 0 ? s + 1 : 0;
  let to = lines.length;
  for (let i = from; i < lines.length; i++) {
    if (END_RE.test(lines[i])) {
      to = i;
      break;
    }
  }
  return lines.slice(from, to).join("\n").replace(/^\s*\n/, "").trim();
}

// ---------------------------------------------------------------- paragraphs & sections

/** Split on blank lines; wrapped lines are joined with spaces. */
export function paragraphsOf(body: string): string[] {
  return body
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export interface ClassicSection {
  index: number;
  /** The section's own heading line from the source, or a UI label ("Opening", "Part 3"). */
  title: string;
  paragraphs: string[];
}

const HEADING_RES: RegExp[] = [
  /^(?:CHAPTER|BOOK|PART|SECTION|STAGE)\s+(?:[IVXLCDM]+|\d+|[A-Z]+)\b.{0,70}$/,
  /^(?:Chapter|Book|Part|Section)\s+(?:[IVXLCDM]+|\d+)\b.{0,70}$/,
  /^[IVXLCDM]+\.?$/,
];

const MAX_HEADING_LEN = 80;
/** Sections with less body text than this are merged into the next one (e.g. contents lists). */
export const MIN_SECTION_CHARS = 400;
/** Size of the fallback parts when a text has no usable headings. */
export const FALLBACK_PART_CHARS = 12_000;

export function isHeadingLine(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= MAX_HEADING_LEN && HEADING_RES.some((re) => re.test(t));
}

/**
 * Split a text into sections at heading lines (CHAPTER / BOOK / PART / SECTION + number, or a Roman
 * numeral on its own line) that follow a blank line. Tiny sections (contents lists, front matter)
 * merge forward. With fewer than 3 headings the text is cut into ~12k-character parts at paragraph
 * boundaries.
 */
export function splitSections(text: string): ClassicSection[] {
  const lines = normalizeNewlines(text).split("\n");
  const marks: { line: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isHeadingLine(lines[i]) && (i === 0 || lines[i - 1].trim() === "")) marks.push({ line: i, title: lines[i].trim() });
  }

  type Raw = { title: string; body: string };
  const raw: Raw[] = [];
  const head = lines.slice(0, marks[0]?.line ?? lines.length).join("\n");
  if (head.trim()) raw.push({ title: "Opening", body: head });
  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].line : lines.length;
    raw.push({ title: m.title, body: lines.slice(m.line + 1, end).join("\n") });
  });

  if (marks.length < 3) return fallbackParts(text);

  // Merge tiny sections forward (the merged section keeps the larger section's heading).
  const merged: Raw[] = [];
  let carry = "";
  for (const r of raw) {
    const size = r.body.replace(/\s+/g, "").length;
    if (size < MIN_SECTION_CHARS) {
      carry += `${carry ? "\n\n" : ""}${r.title === "Opening" ? "" : r.title}\n\n${r.body}`;
      continue;
    }
    merged.push({ title: r.title, body: carry ? `${carry}\n\n${r.body}` : r.body });
    carry = "";
  }
  if (carry.trim()) {
    if (merged.length) merged[merged.length - 1].body += `\n\n${carry}`;
    else merged.push({ title: "Opening", body: carry });
  }
  const out = merged
    .map((r) => ({ title: r.title, paragraphs: paragraphsOf(r.body) }))
    .filter((s) => s.paragraphs.length > 0);
  return out.length ? out.map((s, index) => ({ index, ...s })) : fallbackParts(text);
}

function fallbackParts(text: string): ClassicSection[] {
  const paras = paragraphsOf(normalizeNewlines(text));
  const out: ClassicSection[] = [];
  let cur: string[] = [];
  let size = 0;
  const flush = () => {
    if (!cur.length) return;
    out.push({ index: out.length, title: `Part ${out.length + 1}`, paragraphs: cur });
    cur = [];
    size = 0;
  };
  for (const p of paras) {
    cur.push(p);
    size += p.length;
    if (size >= FALLBACK_PART_CHARS) flush();
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- date-locked devotional entries

export type Period = "morning" | "evening";

export interface DatedEntry {
  month: number; // 1–12
  day: number; // 1–31
  period: Period;
  /** The entry's date heading line(s) from the source. */
  heading: string;
  paragraphs: string[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH = `(${MONTHS.join("|")})`;
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const SEP = "[\\s,.:;\\u2013\\u2014-]+";
const PERIOD = "(morning|evening)";
const PERIOD_FIRST = new RegExp(`^${PERIOD}${SEP}${MONTH}\\s+${DAY}\\.?$`, "i");
const DATE_FIRST = new RegExp(`^${MONTH}\\s+${DAY}${SEP}${PERIOD}\\.?$`, "i");
const DATE_ONLY = new RegExp(`^${MONTH}\\s+${DAY}\\.?$`, "i");
const PERIOD_ONLY = new RegExp(`^${PERIOD}\\.?$`, "i");
/** A "Morning"/"Evening" line may follow its date line by at most this many lines. */
const PERIOD_LOOKAHEAD = 4;

const monthNum = (s: string) => MONTHS.indexOf(s.toLowerCase()) + 1;
const periodOf = (s: string): Period => (s.toLowerCase() === "morning" ? "morning" : "evening");

/**
 * Parse entries headed "Morning, January 1" / "January 1st — Evening", or a date line followed
 * within a few lines by a line that is just "Morning" / "Evening".
 */
export function parseDatedEntries(text: string): DatedEntry[] {
  const lines = normalizeNewlines(text).split("\n");
  const starts: { headStart: number; bodyStart: number; month: number; day: number; period: Period; heading: string }[] = [];
  let pendingDate: { line: number; month: number; day: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.length > 60) continue;
    let m = PERIOD_FIRST.exec(t);
    if (m) {
      starts.push({ headStart: i, bodyStart: i + 1, month: monthNum(m[2]), day: Number(m[3]), period: periodOf(m[1]), heading: t });
      pendingDate = null;
      continue;
    }
    m = DATE_FIRST.exec(t);
    if (m) {
      starts.push({ headStart: i, bodyStart: i + 1, month: monthNum(m[1]), day: Number(m[2]), period: periodOf(m[3]), heading: t });
      pendingDate = null;
      continue;
    }
    m = DATE_ONLY.exec(t);
    if (m) {
      pendingDate = { line: i, month: monthNum(m[1]), day: Number(m[2]) };
      continue;
    }
    m = PERIOD_ONLY.exec(t);
    if (m && pendingDate && i - pendingDate.line <= PERIOD_LOOKAHEAD) {
      const heading = lines.slice(pendingDate.line, i + 1).map((l) => l.trim()).filter(Boolean).join(", ");
      starts.push({ headStart: pendingDate.line, bodyStart: i + 1, month: pendingDate.month, day: pendingDate.day, period: periodOf(m[1]), heading });
      pendingDate = null;
    }
  }

  return starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].headStart : lines.length;
    return {
      month: s.month,
      day: s.day,
      period: s.period,
      heading: s.heading,
      paragraphs: paragraphsOf(lines.slice(s.bodyStart, end).join("\n")),
    };
  }).filter((e) => e.month >= 1 && e.day >= 1 && e.day <= 31);
}

const textSize = (e: DatedEntry) => e.paragraphs.reduce((n, p) => n + p.length, 0);

/**
 * Today's morning and evening entries for a "YYYY-MM-DD" date. When a date appears more than once
 * (e.g. a contents list), the entry with the most text wins.
 */
export function entriesForDate(entries: DatedEntry[], iso: string): { morning?: DatedEntry; evening?: DatedEntry } {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const pick = (period: Period) =>
    entries
      .filter((e) => e.month === month && e.day === day && e.period === period && e.paragraphs.length > 0)
      .sort((a, b) => textSize(b) - textSize(a))[0];
  return { morning: pick("morning"), evening: pick("evening") };
}

// ---------------------------------------------------------------- download & Cache Storage

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const memory = new Map<string, string>();

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined") return null;
    return await caches.open(CLASSICS_CACHE);
  } catch {
    return null;
  }
}

/** One raw file: Cache Storage first, then the network (stored on success). */
export async function fetchRawText(url: string, fetchImpl?: FetchLike): Promise<string> {
  const mem = memory.get(url);
  if (mem !== undefined) return mem;
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) return await hit.text();
    } catch {
      // fall through to the network
    }
  }
  const doFetch: FetchLike = fetchImpl ?? ((u, init) => fetch(u, init));
  let text: string;
  try {
    const res = await doFetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    text = await res.text();
  } catch {
    throw new ClassicDownloadError(url);
  }
  if (!text.trim()) throw new ClassicDownloadError(url);
  if (cache) {
    try {
      await cache.put(url, new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    } catch {
      memory.set(url, text);
    }
  } else {
    memory.set(url, text);
  }
  return text;
}

/** Structural clean-up of the raw files of one work, joined in order. */
export function processClassicText(classic: Pick<ClassicInfo, "format">, raws: string[]): string {
  const parts = classic.format === "gutenberg" ? raws.map(stripGutenberg) : raws.map((r) => normalizeNewlines(r).trim());
  return parts.join("\n\n");
}

/** Download (or read from cache) and clean every file of a work. Throws ClassicDownloadError. */
export async function loadClassicText(classic: ClassicInfo, fetchImpl?: FetchLike): Promise<string> {
  const raws: string[] = [];
  for (const url of classic.textUrls) raws.push(await fetchRawText(url, fetchImpl));
  return processClassicText(classic, raws);
}

export async function isClassicCached(classic: ClassicInfo): Promise<boolean> {
  const cache = await openCache();
  for (const url of classic.textUrls) {
    if (memory.has(url)) continue;
    if (!cache) return false;
    try {
      if (!(await cache.match(url))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function removeClassicText(classic: ClassicInfo): Promise<void> {
  const cache = await openCache();
  for (const url of classic.textUrls) {
    memory.delete(url);
    try {
      await cache?.delete(url);
    } catch {
      // ignore
    }
  }
}

export type ClassicContent =
  | { kind: "sections"; sections: ClassicSection[] }
  | { kind: "dated"; entries: DatedEntry[] };

export function parseClassic(classic: Pick<ClassicInfo, "dateLocked">, text: string): ClassicContent {
  return classic.dateLocked ? { kind: "dated", entries: parseDatedEntries(text) } : { kind: "sections", sections: splitSections(text) };
}
