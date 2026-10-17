"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface ChipProps {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Toggleable filter chip: a button with aria-pressed. Selected state shows a ✓, not color alone. */
export function Chip({ pressed, onPressedChange, children, disabled, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange?.(!pressed)}
      className={cx(
        "inline-flex min-h-12 items-center gap-1.5 rounded-full px-4 text-[16px] font-semibold",
        "[border-width:var(--border-width)] border-solid disabled:opacity-50",
        pressed ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg text-fg",
        className,
      )}
    >
      {pressed ? <Icon name="check" size={18} /> : null}
      {children}
    </button>
  );
}

export interface ChipOption<T extends string = string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string = string> {
  /** Accessible group name (role="group"). */
  label: string;
  /** Show the label visibly above the chips. Default false (sr-only). */
  showLabel?: boolean;
  /** Either pass options + selected + onChange ... */
  options?: ChipOption<T>[];
  selected?: T[];
  onChange?: (selected: T[]) => void;
  /** Single-select: pressing a chip selects only it. Default false. */
  single?: boolean;
  /** ... or pass <Chip> children yourself. */
  children?: ReactNode;
  className?: string;
}

export function ChipGroup<T extends string = string>({
  label,
  showLabel,
  options,
  selected = [],
  onChange,
  single,
  children,
  className,
}: ChipGroupProps<T>) {
  const toggle = (value: T, on: boolean) => {
    if (!onChange) return;
    if (single) onChange(on ? [value] : []);
    else onChange(on ? [...selected.filter((v) => v !== value), value] : selected.filter((v) => v !== value));
  };
  return (
    <div className={className}>
      {showLabel ? (
        <span aria-hidden="true" className="mb-1 block text-[15px] font-bold text-muted">
          {label}
        </span>
      ) : null}
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options
          ? options.map((o) => (
              <Chip key={o.value} pressed={selected.includes(o.value)} onPressedChange={(on) => toggle(o.value, on)}>
                {o.label}
              </Chip>
            ))
          : children}
      </div>
    </div>
  );
}
