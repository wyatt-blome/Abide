// Load the verses of a range in any translation (bundled BSB/WEB/KJV, or ESV with the user's key).

import type { TranslationId, VerseRange } from "@/db/types";
import { getRangeVerses, loadMeta, type BundledTranslation, type RangeVerse } from "@/lib/bible";
import { esvAvailable, esvNotice, fetchEsvChapter, type EsvChapter, type EsvSettings } from "@/lib/esv";
import { iterateRange } from "@/lib/meta";

export interface LoadedPassage {
  translation: TranslationId;
  verses: RangeVerse[];
  /** ESV copyright notice (from the API, or the fallback label). */
  notice?: string;
}

export const BUNDLED: BundledTranslation[] = ["BSB", "WEB", "KJV"];

/** Translations the user can pick right now. */
export function availableTranslations(s: EsvSettings): TranslationId[] {
  return esvAvailable(s) ? [...BUNDLED, "ESV"] : [...BUNDLED];
}

/** ESV falls back to the BSB when it is off or has no key. */
export function effectiveTranslation(t: TranslationId | null | undefined, s: EsvSettings): TranslationId {
  if (t === "ESV") return esvAvailable(s) ? "ESV" : "BSB";
  return t && BUNDLED.includes(t as BundledTranslation) ? t : "BSB";
}

export async function loadPassage(translation: TranslationId, range: VerseRange, s: EsvSettings): Promise<LoadedPassage> {
  const t = effectiveTranslation(translation, s);
  if (t !== "ESV") return { translation: t, verses: await getRangeVerses(t as BundledTranslation, range) };
  const meta = await loadMeta();
  const refs = iterateRange(meta, range);
  const chapters = [...new Set(refs.map((r) => `${r.book}.${r.chapter}`))];
  const loaded = new Map<string, EsvChapter>();
  for (const c of chapters) {
    const [book, ch] = c.split(".");
    loaded.set(c, await fetchEsvChapter(book, Number(ch), s.esvKey ?? ""));
  }
  const verses: RangeVerse[] = refs.map((ref) => ({
    key: `${ref.book}.${ref.chapter}.${ref.verse}`,
    ref,
    text: loaded.get(`${ref.book}.${ref.chapter}`)?.verses[ref.verse] ?? "",
  }));
  return { translation: "ESV", verses, notice: esvNotice([...loaded.values()]) };
}

/** Text shown for a verse slot with no text in a translation. */
export const noTextLabel = (t: TranslationId): string => `(no text in ${t})`;
