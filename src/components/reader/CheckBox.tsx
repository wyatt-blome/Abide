"use client";

import { cx, Icon } from "@/components/ui";

export interface CheckBoxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Genesis 1–3". */
  label: string;
  /** Show the label text next to the box. */
  showLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Big (56px) check box: ✓ on a filled box when checked, empty box otherwise. */
export function CheckBox({ checked, onChange, label, showLabel, disabled, className }: CheckBoxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("inline-flex min-h-14 min-w-14 items-center gap-3 rounded-xl disabled:opacity-50", className)}
    >
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg [border-width:3px] border-solid",
          checked ? "border-success bg-success text-success-fg" : "border-border bg-bg text-fg",
        )}
      >
        {checked ? <Icon name="check" size={28} strokeWidth={3} /> : null}
      </span>
      {showLabel ? <span className="text-left font-semibold">{label}</span> : null}
    </button>
  );
}
