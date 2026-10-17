"use client";

import { useId } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Visible label; also used for "Decrease {label}" / "Increase {label}". */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** Display formatter, e.g. (v) => `${v.toFixed(1)}×`. */
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

function roundTo(value: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(value.toFixed(decimals));
}

/** − value + with big 56px buttons. */
export function Stepper({
  value,
  onChange,
  label,
  min = -Infinity,
  max = Infinity,
  step = 1,
  format = (v) => String(v),
  disabled,
  className,
}: StepperProps) {
  const id = useId();
  const set = (v: number) => onChange(roundTo(Math.min(max, Math.max(min, v)), step));
  const btn = cx(
    "inline-flex h-14 w-14 items-center justify-center rounded-xl bg-surface text-fg",
    "[border-width:var(--border-width)] border-solid border-border disabled:opacity-40",
  );
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <span id={`${id}-label`} className="font-semibold">
        {label}
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="flex items-center gap-3">
        <button
          type="button"
          className={btn}
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
        >
          <Icon name="minus" size={28} />
        </button>
        <output aria-live="polite" className="min-w-16 text-center text-[22px] font-bold tabular-nums">
          {format(value)}
        </output>
        <button
          type="button"
          className={btn}
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= max}
          onClick={() => set(value + step)}
        >
          <Icon name="plus" size={28} />
        </button>
      </div>
    </div>
  );
}
