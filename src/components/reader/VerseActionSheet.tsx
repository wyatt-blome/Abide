"use client";

import { Icon, Sheet, type IconName } from "@/components/ui";
import type { VerseRange } from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import { formatRange } from "@/lib/refs";

export type VerseAction = "memorize" | "sources" | "note" | "link" | "selectFrom" | "listenFrom";

export interface VerseActionSheetProps {
  range: VerseRange | null;
  meta: BibleMeta;
  onClose: () => void;
  onAction: (action: VerseAction, range: VerseRange) => void;
  /** Offer "Select a range from here" (single verse, chapter mode). */
  canSelectRange?: boolean;
  canListen?: boolean;
}

const ACTIONS: { action: VerseAction; label: string; icon: IconName }[] = [
  { action: "memorize", label: "Memorize this", icon: "cards" },
  { action: "sources", label: "Sources", icon: "library" },
  { action: "note", label: "Add note", icon: "edit" },
  { action: "link", label: "Add link", icon: "external" },
];

export function VerseActionSheet({ range, meta, onClose, onAction, canSelectRange, canListen }: VerseActionSheetProps) {
  const single = !!range && range.start.book === range.end.book && range.start.chapter === range.end.chapter && range.start.verse === range.end.verse;
  const extra: { action: VerseAction; label: string; icon: IconName }[] = [
    ...(canListen ? [{ action: "listenFrom" as const, label: "Listen from here", icon: "speaker" as const }] : []),
    ...(canSelectRange && single ? [{ action: "selectFrom" as const, label: "Select a range from here", icon: "list" as const }] : []),
  ];
  const btn = "bordered flex min-h-14 w-full items-center gap-3 rounded-xl bg-surface px-4 text-left text-[19px] font-bold";
  return (
    <Sheet open={!!range} onClose={onClose} title={range ? formatRange(range, meta) : ""}>
      {range ? (
        <div className="flex flex-col gap-2">
          {[...ACTIONS, ...extra].map((a) => (
            <button key={a.action} type="button" className={btn} onClick={() => onAction(a.action, range)}>
              <Icon name={a.icon} size={26} />
              {a.label}
            </button>
          ))}
          {canSelectRange ? (
            <p className="pt-1 text-[15px] text-muted">Tip: press and hold a verse, then tap another verse to pick a range.</p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
