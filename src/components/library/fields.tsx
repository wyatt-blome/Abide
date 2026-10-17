"use client";

// Plain, large form fields (≥48px) shared by the Library and Settings screens.

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui";

const control = "bordered min-h-12 w-full rounded-xl bg-bg px-3 text-[18px] text-fg";

export function TextField({
  label,
  hint,
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-muted">
          {hint}
        </p>
      ) : null}
      <input id={id} className={control} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {error ? (
        <p id={`${id}-err`} role="alert" className="font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-muted">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        rows={5}
        className={cx(control, "reading py-2")}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-muted">
          {hint}
        </p>
      ) : null}
      <select id={id} className={control} aria-describedby={hint ? `${id}-hint` : undefined} {...rest}>
        {children}
      </select>
    </div>
  );
}

export function CheckboxRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={cx("bordered flex min-h-12 items-center gap-3 rounded-xl bg-surface px-3 py-2", disabled && "opacity-50")}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-7 w-7 shrink-0 accent-[var(--accent)]"
        />
        <span className="font-semibold">{label}</span>
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-[15px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Small inline status line with a ✓/✗ icon (never color alone). */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 font-semibold text-danger">
      <span aria-hidden="true">✗</span>
      <span>{children}</span>
    </p>
  );
}
