"use client";

import type { TranslationId, VerseRange } from "@/db/types";
import { formatRange } from "@/lib/refs";
import { Sheet } from "@/components/ui";
import { SL } from "./labels";
import { SourcesPanel } from "./SourcesPanel";

export interface SourcesSheetProps {
  open: boolean;
  onClose: () => void;
  range: VerseRange;
  translation: TranslationId;
}

/** The Sources panel in a bottom sheet (Reader, Today, Memorize). */
export function SourcesSheet({ open, onClose, range, translation }: SourcesSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={`${SL.sourcesTitle} · ${formatRange(range)}`}>
      {open ? <SourcesPanel range={range} translation={translation} /> : null}
    </Sheet>
  );
}
