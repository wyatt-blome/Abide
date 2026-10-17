"use client";

// On-screen A–Z keyboard for the Type First Letters drill. Alphabetical, 3 rows × 9 keys (the 27th
// is Hint), full width, 64px tall, so every key is as large as a phone allows. No text input is
// focused, so the OS keyboard never opens.

import { cx, Icon } from "@/components/ui";

export const KEY_ROWS: string[][] = [
  ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
  ["j", "k", "l", "m", "n", "o", "p", "q", "r"],
  ["s", "t", "u", "v", "w", "x", "y", "z"],
];

export interface LetterKeyboardProps {
  onKey: (letter: string) => void;
  onHint: () => void;
  disabled?: boolean;
  /** Label of the hint key. Default "Hint". */
  hintLabel?: string;
}

const keyCls = cx(
  "flex h-16 min-w-0 flex-1 items-center justify-center rounded-lg bg-surface text-[24px] font-bold text-fg",
  "[border-width:var(--border-width)] border-solid border-border active:bg-surface-strong disabled:opacity-40",
);

export function LetterKeyboard({ onKey, onHint, disabled, hintLabel = "Hint" }: LetterKeyboardProps) {
  return (
    <div
      role="group"
      aria-label="Letter keyboard"
      className={cx(
        "fixed inset-x-0 z-30 border-t-[length:var(--border-width)] border-border bg-bg px-1 pt-1.5 pb-1.5",
        "bottom-[calc(var(--tabbar-height)+var(--safe-bottom))]",
      )}
    >
      <div className="mx-auto flex max-w-[44rem] flex-col gap-1">
        {KEY_ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1">
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
                className={cx(keyCls, "text-[15px]")}
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

/** Height to reserve under the drill so the fixed keyboard never covers text. */
export const KEYBOARD_SPACER_CLASS = "h-[228px]";
