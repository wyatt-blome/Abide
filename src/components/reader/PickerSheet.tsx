"use client";

import { useState } from "react";
import { clampFontScale, useSettings } from "@/components/providers/AppProviders";
import { ChipGroup, cx, Sheet, Stepper } from "@/components/ui";
import type { TranslationId } from "@/db/types";
import { BOOKS } from "@/lib/books";
import { chapterCount, type BibleMeta } from "@/lib/meta";
import { formatChapter } from "@/lib/refs";
import type { ChapterPos } from "./readerNav";

export const TRANSLATION_NAME: Record<TranslationId, string> = {
  BSB: "Berean Standard Bible",
  WEB: "World English Bible",
  KJV: "King James Version",
  ESV: "English Standard Version",
};

export interface PickerSheetProps {
  open: boolean;
  onClose: () => void;
  meta: BibleMeta;
  current: ChapterPos | null;
  translation: TranslationId;
  translations: TranslationId[];
  onTranslation: (t: TranslationId) => void;
  /** Omit to hide book/chapter picking (portion mode). */
  onPick?: (pos: ChapterPos) => void;
}

/** Book → chapter grid, translation switch and text size. */
export function PickerSheet({ open, onClose, meta, current, translation, translations, onTranslation, onPick }: PickerSheetProps) {
  const { settings, update } = useSettings();
  const [book, setBook] = useState<string | null>(null);
  const close = () => {
    setBook(null);
    onClose();
  };
  const tile = "bordered tap flex items-center justify-center rounded-xl px-2 py-2 text-center font-semibold";

  const books = BOOKS.filter((b) => chapterCount(meta, b.code) > 0);
  const chapters = book ? chapterCount(meta, book) : 0;
  const bookName = book ? BOOKS.find((b) => b.code === book)?.name ?? book : "";

  return (
    <Sheet open={open} onClose={close} title={book ? bookName : onPick ? "Go to" : "Text options"}>
      {book && onPick ? (
        <div className="flex flex-col gap-3">
          <button type="button" className="tap self-start rounded-xl font-semibold underline" onClick={() => setBook(null)}>
            All books
          </button>
          <div role="group" aria-label={`Chapters of ${bookName}`} className="grid grid-cols-5 gap-2">
            {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => {
              const here = current?.book === book && current.chapter === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-current={here ? "true" : undefined}
                  aria-label={formatChapter(book, c)}
                  className={cx(tile, "tabular-nums", here ? "border-accent bg-accent text-accent-fg" : "bg-surface")}
                  onClick={() => {
                    onPick({ book, chapter: c });
                    close();
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {onPick
            ? (["OT", "NT"] as const).map((t) => (
                <div key={t} role="group" aria-label={t === "OT" ? "Old Testament" : "New Testament"}>
                  <p className="mb-2 text-[15px] font-bold uppercase tracking-wide text-muted">
                    {t === "OT" ? "Old Testament" : "New Testament"}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {books
                      .filter((b) => b.testament === t)
                      .map((b) => (
                        <button
                          key={b.code}
                          type="button"
                          aria-current={current?.book === b.code ? "true" : undefined}
                          className={cx(tile, current?.book === b.code ? "border-accent bg-accent text-accent-fg" : "bg-surface")}
                          onClick={() => {
                            if (chapterCount(meta, b.code) === 1) {
                              onPick({ book: b.code, chapter: 1 });
                              close();
                            } else setBook(b.code);
                          }}
                        >
                          {b.name}
                        </button>
                      ))}
                  </div>
                </div>
              ))
            : null}
          <ChipGroup
            label="Translation"
            showLabel
            single
            options={translations.map((t) => ({ value: t, label: t }))}
            selected={[translation]}
            onChange={(sel) => {
              if (sel[0]) onTranslation(sel[0]);
            }}
          />
          <p className="-mt-3 text-[15px] text-muted">{TRANSLATION_NAME[translation]}</p>
          <Stepper
            label="Text size"
            value={clampFontScale(settings.fontScale)}
            min={1}
            max={2}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={(v) => void update({ fontScale: v })}
          />
        </div>
      )}
    </Sheet>
  );
}
