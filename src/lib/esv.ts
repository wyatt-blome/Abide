// ESV text, bring your own key (off by default).
//
// - Used only when settings.esvEnabled && settings.esvKey (entered by the user in Settings).
// - Requests go straight from the device to api.esv.org with `Authorization: Token <key>`.
// - ESV terms: responses are kept in memory for this session only (a module-level Map, gone on
//   reload). Nothing is written to IndexedDB or Cache Storage, the fetch uses `cache: "no-store"`,
//   and the service worker routes api.esv.org NetworkOnly.
// - One request per chapter (always well under the API's per-query verse limit). Plain text with
//   verse numbers ("[16] For God so loved…"), no headings, footnotes or passage references.
// - The copyright notice is requested from the API (include-copyright) and shown as the API
//   returns it; if none is found, ESV_FALLBACK_NOTICE (a license label) is shown instead.

import type { BookCode } from "@/db/types";
import { BOOK_BY_CODE } from "@/lib/books";

export const ESV_API_URL = "https://api.esv.org/v3/passage/text/";
export const ESV_FALLBACK_NOTICE = "Scripture quotations are from the ESV® Bible";

export const ESV_PARAMS: Readonly<Record<string, string>> = {
  "include-passage-references": "false",
  "include-verse-numbers": "true",
  "include-first-verse-numbers": "true",
  "include-footnotes": "false",
  "include-footnote-body": "false",
  "include-headings": "false",
  "include-short-copyright": "false",
  "include-copyright": "true",
  "include-selahs": "true",
  "indent-paragraphs": "0",
  "indent-poetry": "false",
  "indent-declares": "0",
  "indent-psalm-doxology": "0",
  "line-length": "0",
};

export interface EsvSettings {
  esvEnabled?: boolean;
  esvKey?: string;
}

export function esvAvailable(s: EsvSettings | null | undefined): boolean {
  return Boolean(s?.esvEnabled && s.esvKey && s.esvKey.trim());
}

/** "Psalms 23", "John 3", "Song of Solomon 2". */
export function esvChapterQuery(book: BookCode, chapter: number): string {
  return `${BOOK_BY_CODE[book]?.name ?? book} ${chapter}`;
}

export interface EsvRequest {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

export function buildEsvRequest(query: string, key: string): EsvRequest {
  const params = new URLSearchParams({ q: query, ...ESV_PARAMS });
  return {
    url: `${ESV_API_URL}?${params.toString()}`,
    init: {
      method: "GET",
      headers: { Authorization: `Token ${key.trim()}`, Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
    },
  };
}

export interface EsvChapter {
  /** verse number → text. */
  verses: Record<number, string>;
  /** The copyright notice as returned by the API, or null. */
  copyright: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Split the API's passage text on its "[n]" verse markers; peel off the trailing copyright paragraph. */
export function parseEsvPassage(text: string): EsvChapter {
  const verses: Record<number, string> = {};
  let copyright: string | null = null;
  let body = text.replace(/\r\n?/g, "\n");

  const para = /\n\s*\n([^\n]*\bESV\b[\s\S]*)$/.exec(body);
  if (para) {
    copyright = clean(para[1]);
    body = body.slice(0, para.index);
  } else {
    const short = /\s*(\(ESV\))\s*$/.exec(body);
    if (short) {
      copyright = short[1];
      body = body.slice(0, short.index);
    }
  }

  const re = /\[(\d+)\]/g;
  const marks: { n: number; at: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) marks.push({ n: Number(m[1]), at: m.index, len: m[0].length });
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : body.length;
    const t = clean(body.slice(mk.at + mk.len, end));
    verses[mk.n] = verses[mk.n] ? `${verses[mk.n]} ${t}` : t;
  });
  return { verses, copyright };
}

export class EsvError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "EsvError";
  }
}

/** UI labels for failures. */
export function esvErrorMessage(status?: number): string {
  if (status === 401 || status === 403) return "The ESV key was not accepted. Check it in Settings.";
  if (status === 429) return "Too many ESV requests right now. Try again later.";
  return "Couldn't load the ESV text. Check your connection.";
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Session-only memory (never persisted). */
const session = new Map<string, Promise<EsvChapter>>();

export function clearEsvSession(): void {
  session.clear();
}

export function fetchEsvChapter(book: BookCode, chapter: number, key: string, fetchImpl?: FetchLike): Promise<EsvChapter> {
  const id = `${book}.${chapter}`;
  const hit = session.get(id);
  if (hit) return hit;
  const req = buildEsvRequest(esvChapterQuery(book, chapter), key);
  const doFetch: FetchLike = fetchImpl ?? ((u, init) => fetch(u, init));
  const p = (async () => {
    let res: Response;
    try {
      res = await doFetch(req.url, req.init);
    } catch {
      throw new EsvError(esvErrorMessage());
    }
    if (!res.ok) throw new EsvError(esvErrorMessage(res.status), res.status);
    const json = (await res.json()) as { passages?: unknown };
    const passages = Array.isArray(json.passages) ? json.passages.filter((x): x is string => typeof x === "string") : [];
    return parseEsvPassage(passages.join("\n\n"));
  })();
  session.set(id, p);
  p.catch(() => session.delete(id));
  return p;
}

/** The notice to display under ESV text. */
export function esvNotice(chapters: (EsvChapter | null | undefined)[]): string {
  return chapters.find((c) => c?.copyright)?.copyright ?? ESV_FALLBACK_NOTICE;
}
