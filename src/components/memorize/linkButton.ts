// Class names for a <Link> that looks like a <Button> (avoids nesting a button inside a link).
import { cx } from "@/components/ui";

export type LinkButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT: Record<LinkButtonVariant, string> = {
  primary: "bg-accent text-accent-fg border-accent",
  secondary: "bg-surface text-fg border-border",
  ghost: "bg-transparent text-fg border-transparent",
};

export function linkButtonClass(variant: LinkButtonVariant = "secondary", size: "md" | "lg" = "md", extra?: string): string {
  return cx(
    "inline-flex items-center justify-center rounded-xl font-semibold select-none no-underline",
    "[border-width:var(--border-width)] border-solid active:brightness-90",
    size === "lg" ? "min-h-16 px-5 text-[19px] gap-2.5" : "min-h-12 px-4 text-[17px] gap-2",
    VARIANT[variant],
    extra,
  );
}
