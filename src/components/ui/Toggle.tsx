"use client";

import { useId } from "react";
import { cx } from "./cx";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label (also the switch's accessible name). */
  label: string;
  /** Optional plain helper text under the label. */
  description?: string;
  disabled?: boolean;
  className?: string;
}

/** On/off switch (role="switch", aria-checked). The whole row is the tap target. */
export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className={cx("flex min-h-12 items-center gap-3", className)}>
      <div className="flex-1">
        <label htmlFor={id} className="block font-semibold">
          {label}
        </label>
        {description ? (
          <p id={descId} className="text-[15px] text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-12 w-[76px] shrink-0 items-center rounded-full p-1",
          "[border-width:var(--border-width)] border-solid disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-border bg-surface-strong",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "flex h-9 w-9 items-center justify-center rounded-full bg-bg text-[15px] font-bold text-fg shadow transition-transform",
            checked ? "translate-x-7" : "translate-x-0",
          )}
        >
          {checked ? "✓" : ""}
        </span>
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
