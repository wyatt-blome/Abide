import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success";
export type ButtonSize = "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** md = 48px, lg = 64px, xl = 88px (hands-free / gloved use). */
  size?: ButtonSize;
  /** Leading icon. */
  icon?: IconName;
  /** Render only the icon; `aria-label` (or `label`) is then required. */
  iconOnly?: boolean;
  /** Accessible label for icon-only buttons (sets aria-label). */
  label?: string;
  /** Full width. */
  block?: boolean;
  children?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg border-accent",
  secondary: "bg-surface text-fg border-border",
  danger: "bg-danger text-danger-fg border-danger",
  success: "bg-success text-success-fg border-success",
  ghost: "bg-transparent text-fg border-transparent",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-12 min-w-12 px-4 text-[17px] gap-2",
  lg: "min-h-16 min-w-16 px-5 text-[19px] gap-2.5",
  xl: "min-h-[88px] min-w-[88px] px-6 text-[22px] gap-3",
};

const ICON_SIZE: Record<ButtonSize, number> = { md: 22, lg: 28, xl: 36 };

/** Plain button, ≥48px. `type` defaults to "button". */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconOnly, label, block, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      {...rest}
      aria-label={label ?? rest["aria-label"]}
      className={cx(
        "inline-flex items-center justify-center rounded-xl font-semibold select-none",
        "[border-width:var(--border-width)] border-solid",
        "disabled:opacity-50 disabled:cursor-not-allowed active:brightness-90",
        VARIANT[variant],
        SIZE[size],
        iconOnly && "px-0",
        block && "w-full",
        className,
      )}
    >
      {icon ? <Icon name={icon} size={ICON_SIZE[size]} /> : null}
      {iconOnly ? null : children}
    </button>
  );
});
