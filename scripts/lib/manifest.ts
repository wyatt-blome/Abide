// Pack manifest schema (library/packs/*.json). See library/packs/README.md for every field.
import { z } from "zod";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_CODES } from "../../src/lib/books";

/** https:// for real sources; file:// is accepted so tests can point at local fixtures. */
const sourceUrl = z
  .string()
  .refine((u) => /^https:\/\/[^\s/]+\.[^\s/]+\/\S*$/.test(u) || /^file:\/\/\/\S+$/.test(u), {
    message: "must be an https:// (or file:// in tests) URL without spaces",
  });
const pageUrl = z.string().regex(/^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/, "must be an https:// URL");

const bookCode = z.string().refine((c) => BOOK_CODES.includes(c), { message: "unknown book code" });

export const EraSchema = z.enum(["early", "medievalReformation", "puritan18c", "c19", "c20early", "modern"]);
export const SourceTypeSchema = z.enum([
  "commentary", "sermon", "apologetics", "theology", "confession", "catechism", "devotional", "crossref",
]);
export const ParserIdSchema = z.enum([
  "ccel-txt", "verse-commentary", "heading-range", "inline-citation", "creed-json-proofs", "html-chapters",
  "openbible-crossrefs",
]);

export const LicenseSchema = z.object({
  status: z.enum(["public-domain", "CC-BY"]),
  proofUrl: sourceUrl,
  /** Must occur (after whitespace normalization) in a raw file of the pack or in the proofUrl page. */
  proofText: z.string().min(2),
  basis: z.enum(["rights-statement", "published-before-1931", "pd-mark", "cc-by"]),
  /** published-before-1931: optional regex (group 1 = year) to find the publication year in the header. */
  yearPattern: z.string().optional(),
});

export const ManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, "id must be a lowercase slug"),
    author: z.string().min(2),
    title: z.string().min(1),
    edition: z.string().min(2),
    era: EraSchema,
    types: z.array(SourceTypeSchema).min(1),
    rawUrls: z.array(sourceUrl).min(1),
    /** mirrors[i] = ordered fallback URLs for rawUrls[i] (byte-identical copies). */
    mirrors: z.array(z.array(sourceUrl)).optional(),
    /** Edition label per mirror URL, used as the work's edition when a file came from that mirror. */
    mirrorEditions: z.record(z.string(), z.string().min(2)).optional(),
    sourcePage: pageUrl,
    license: LicenseSchema,
    parser: ParserIdSchema,
    parserOptions: z.record(z.string(), z.unknown()).default({}),
    defaultEnabled: z.boolean(),
    largePack: z.boolean(),
    ocr: z.boolean().optional(),
    /** Note shown with OCR packs, e.g. "OCR text: may contain scanning errors". */
    ocrNote: z.string().optional(),
    /** bookScope[i] = books that rawUrls[i] covers (commentary volumes). */
    bookScope: z.array(z.array(bookCode)).optional(),
    /** Page from which a missing volume->book map is derived at build time (Calvin). */
    volumeMapSource: pageUrl.optional(),
    /** Deep-link template: {page} = sourcePage, {anchor} = parser-provided anchor. */
    urlTemplate: z.string().optional(),
    /** Other editions/files of the same work, listed for reference (checked by check-links, not parsed). */
    alternateSources: z.array(z.object({ url: pageUrl, note: z.string() })).optional(),
    /** Listed in the index but without verse mapping (e.g. no proofs/citations). */
    listedOnly: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .superRefine((m, ctx) => {
    if (m.mirrors && m.mirrors.length > m.rawUrls.length)
      ctx.addIssue({ code: "custom", message: "mirrors has more entries than rawUrls", path: ["mirrors"] });
    if (m.bookScope && m.bookScope.length !== m.rawUrls.length)
      ctx.addIssue({ code: "custom", message: "bookScope must have one entry per rawUrl", path: ["bookScope"] });
    if (m.license.status === "CC-BY" && m.license.basis !== "cc-by")
      ctx.addIssue({ code: "custom", message: "CC-BY status requires basis cc-by", path: ["license"] });
    for (const [k, lim] of [["maxChars", 1500], ["sectionMaxChars", 12000]] as const) {
      const v = m.parserOptions[k];
      if (v !== undefined && (typeof v !== "number" || v < 100 || v > lim))
        ctx.addIssue({ code: "custom", message: `parserOptions.${k} must be a number from 100 to ${lim}`, path: ["parserOptions", k] });
    }
    for (const u of Object.keys(m.mirrorEditions ?? {}))
      if (!(m.mirrors ?? []).some((l) => l.includes(u)))
        ctx.addIssue({ code: "custom", message: `mirrorEditions key is not a mirror URL: ${u}`, path: ["mirrorEditions"] });
    if (m.ocr && !m.ocrNote)
      ctx.addIssue({ code: "custom", message: "ocr packs need an ocrNote", path: ["ocrNote"] });
  });

export type Manifest = z.infer<typeof ManifestSchema>;

export interface LoadedManifest { file: string; manifest?: Manifest; error?: string; id: string }

/** Read and validate every *.json in dir. Invalid files are returned with an error, never thrown. */
export function loadManifests(dir: string): LoadedManifest[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  return files.map((f) => {
    const file = path.join(dir, f);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      return { file, id: f.replace(/\.json$/, ""), error: `invalid JSON: ${(e as Error).message}` };
    }
    const res = ManifestSchema.safeParse(json);
    const rawId = (json as { id?: unknown })?.id;
    const id = typeof rawId === "string" ? rawId : f.replace(/\.json$/, "");
    if (!res.success) {
      const msg = res.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      return { file, id, error: `invalid manifest: ${msg}` };
    }
    if (res.data.id !== f.replace(/\.json$/, ""))
      return { file, id, error: `manifest id "${res.data.id}" does not match file name` };
    return { file, id, manifest: res.data };
  });
}
