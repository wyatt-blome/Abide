import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ActionBarProps {
  children: ReactNode;
  className?: string;
  /** Accessible name for the toolbar. Default "Actions". */
  label?: string;
}

/**
 * Sticky bar for a screen's primary actions, fixed just above the TabBar (thumb zone).
 * Pages that render it get extra bottom padding automatically (.app-main:has(.action-bar)).
 */
export function ActionBar({ children, className, label = "Actions" }: ActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cx(
        "action-bar fixed inset-x-0 z-30 border-t-[length:var(--border-width)] border-border bg-bg",
        "bottom-[calc(var(--tabbar-height)+var(--safe-bottom))]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-[44rem] items-stretch gap-3 px-[max(16px,var(--safe-left))] py-3 [&>*]:flex-1">
        {children}
      </div>
    </div>
  );
}
