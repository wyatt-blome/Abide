"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Visible title; also the dialog's accessible name. */
  title: string;
  children?: ReactNode;
  /** Bottom-of-sheet actions (thumb zone), e.g. <Button>s. */
  footer?: ReactNode;
  /** Tap on the backdrop closes the sheet. Default true. */
  dismissOnBackdrop?: boolean;
  /** Element to focus on open (defaults to the first focusable element in the body, then the close button). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

const FOCUSABLE_CONTROLS = ["a[href]", "area[href]", "button:not([disabled])", 'input:not([disabled]):not([type="hidden"])'];
const FOCUSABLE_OTHER = ["select:not([disabled])", "textarea:not([disabled])", '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]'];
const FOCUSABLE = [...FOCUSABLE_CONTROLS, ...FOCUSABLE_OTHER].join(", ");

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** Bottom sheet modal: role="dialog", aria-modal, focus trap, Escape closes, focus restored on close. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
  initialFocusRef,
  className,
}: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ?? (bodyRef.current ? focusables(bodyRef.current)[0] : undefined) ?? closeRef.current;
    target?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = focusables(panel);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
    };
  }, [open, initialFocusRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden="true"
        data-testid="sheet-backdrop"
        className="absolute inset-0 bg-[var(--overlay)]"
        onClick={() => dismissOnBackdrop && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "sheet-panel bordered relative z-10 flex max-h-[88dvh] w-full max-w-[44rem] flex-col rounded-t-3xl bg-bg",
          "pb-[var(--safe-bottom)]",
          className,
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <h2 id={titleId} className="flex-1 text-[20px] font-bold">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="tap inline-flex items-center justify-center rounded-xl text-fg"
          >
            <Icon name="close" label="Close" />
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {children}
        </div>
        {footer ? (
          <div className="flex gap-3 border-t-[length:var(--border-width)] border-border px-4 py-3 [&>*]:flex-1">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
