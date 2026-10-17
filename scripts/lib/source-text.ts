// Turning downloaded bytes into the "source text" that parsers read and the verifier re-reads.
// Every function here is deterministic and shared by build and verify, so the two can never
// disagree about what the source said.
//
// Source kinds:
//  - plain text (.txt, OCR djvu.txt, CSV/TSV): UTF-8 decode (invalid bytes -> U+FFFD). A ZIP
//    archive (OpenBible primary) is unpacked and its first .txt entry is decoded the same way.
//  - JSON (Creeds.json): the raw file text is what is hashed; excerpts point at a field
//    (`sourcePaths`, e.g. "Data.0.Answer") and charOffset/partOffsets index into
//    normalizeWs(decoded field value). JSON escapes ("\"", "’") make offsets into the file
//    text meaningless, so the verifier decodes the JSON and checks the field value instead.
//  - HTML (Machen): excerpts carry `sourceTransform: "html-text"`; the source text is
//    htmlToText(raw), which removes markup only (tags, comments, scripts/styles) and decodes
//    character entities. It never rewrites words.
import { unzipSync, strFromU8 } from "fflate";

export function isZip(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Decode raw bytes to text (unzipping a .zip to its first .txt entry). */
export function rawToText(buf: Uint8Array): string {
  if (isZip(buf)) {
    const files = unzipSync(buf);
    const name = Object.keys(files).sort().find((n) => /\.txt$/i.test(n)) ?? Object.keys(files)[0];
    if (!name) throw new Error("empty zip archive");
    return strFromU8(files[name]);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** Read a dotted path ("Data.3.Sections.0.Content") from parsed JSON. */
export function getJsonPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(seg)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[seg];
    else return undefined;
  }
  return cur;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—",
  ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  hellip: "…", copy: "©", para: "¶", sect: "§", middot: "·",
  eacute: "é", egrave: "è", aacute: "á", agrave: "à", oacute: "ó",
  uuml: "ü", ouml: "ö", auml: "ä", ccedil: "ç", aelig: "æ",
  oelig: "œ", laquo: "«", raquo: "»", dagger: "†", Dagger: "‡",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (m, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

const BLOCK_TAGS = /^(p|div|h[1-6]|br|li|ul|ol|tr|td|th|table|blockquote|hr|section|article|pre|dd|dt|dl|center|body|html|head|title)$/i;

/**
 * HTML -> text by removing markup only. Block-level tags become "\n\n" (paragraph breaks the
 * parser can see before whitespace normalization), inline tags vanish, entities are decoded.
 */
export function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<\/?([A-Za-z][A-Za-z0-9]*)\b[^>]*>/g, (_m, tag: string) => (BLOCK_TAGS.test(tag) ? "\n\n" : ""));
  return decodeEntities(s);
}
