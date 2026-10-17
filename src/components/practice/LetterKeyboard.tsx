"use client";

// On-screen A–Z keyboard for the Type First Letters drill. Alphabetical, 4 rows on a 7-column grid
// (a–g, h–n, o–u, v–z + Hint spanning 2 columns), full width, 56px tall. At a 360px viewport each
// key is (360 − 2·2px padding − 6·2px gaps) / 7 ≈ 49px wide, so every key is ≥ 48px. No text input
// is focused, so the OS keyboard never opens.

import { cx, Icon } from "@/components/ui";

export const KEY_ROWS: string[][] = [
  ["a", "b", "c", "d", "e", "f", "g"],
  ["h", "i", "j", "k", "l", "m", "n"],
  ["o", "p", "q", "r", "s", "t", "u"],
  ["v", "w", "x", "y", "z"],
];

/** Grid geometry (keep in step with the Tailwind classes below). */
export const KEYBOARD_COLUMNS = 7;
export const HINT_SPAN = 2;
export const KEY_GAP_PX = 2; // gap-0.5
export const KEYBOARD_PAD_X_PX = 2; // px-0.5
export const KEY_HEIGHT_PX = 56; // h-14

/** Width of one letter key at a viewport width (the keyboard is full-bleed up to 44rem). */
export function keyWidthAt(viewportPx: number): number {
  const inner = Math.min(viewportPx - 2 * KEYBOARD_PAD_X_PX, 44 * 16);
  return (inner - (KEYBOARD_COLUMNS - 1) * KEY_GAP_PX) / KEYBOARD_COLUMNS;
}

export interface LetterKeyboardProps {
  onKey: (letter: string) => void;
  onHint: () => void;
  disabled?: boolean;
  /** Label of the hint key. Default "Hint". */
  hintLabel?: string;
}

const keyCls = cx(
  "flex h-14 min-w-0 items-center justify-center rounded-lg bg-surface text-[24px] font-bold text-fg",
  "[border-width:var(--border-width)] border-solid border-border active:bg-surface-strong disabled:opacity-40",
);

export function LetterKeyboard({ onKey, onHint, disabled, hintLabel = "Hint" }: LetterKeyboardProps) {
  return (
    <div
      role="group"
      aria-label="Letter keyboard"
      className={cx(
        "fixed inset-x-0 z-30 border-t-[length:var(--border-width)] border-border bg-bg px-0.5 pt-1.5 pb-1.5",
        "bottom-[calc(var(--tabbar-height)+var(--safe-bottom))]",
      )}
    >
      <div className="mx-auto flex max-w-[44rem] flex-col gap-0.5">
        {KEY_ROWS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-0.5">
            {row.map((k) => (
              <button
                key={k}
                type="button"
                className={keyCls}
                disabled={disabled}
                aria-label={`Letter ${k.toUpperCase()}`}
                onClick={() => onKey(k)}
              >
                {k.toUpperCase()}
              </button>
            ))}
            {ri === KEY_ROWS.length - 1 ? (
              <button
                type="button"
                className={cx(keyCls, "col-span-2 text-[15px]")}
                disabled={disabled}
                aria-label={`${hintLabel}: show the word`}
                onClick={onHint}
              >
                <Icon name="lightbulb" size={22} />
                <span className="sr-only">{hintLabel}</span>
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Height to reserve under the drill so the fixed keyboard never covers text:
 * 4 × 56px keys + 3 × 2px gaps + 12px padding + border ≈ 244px, plus 16px breathing room.
 */
export const KEYBOARD_SPACER_CLASS = "h-[260px]";
