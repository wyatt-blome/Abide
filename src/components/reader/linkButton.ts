import { cx } from "@/components/ui";

/** Classes that make a <Link> look like a <Button> (same sizes and variants). */
export function linkButtonClass(variant: "primary" | "secondary" = "secondary", size: "md" | "lg" = "md", extra?: string): string {
  return cx(
    "inline-flex items-center justify-center rounded-xl font-semibold select-none",
    "[border-width:var(--border-width)] border-solid",
    variant === "primary" ? "bg-accent text-accent-fg border-accent" : "bg-surface text-fg border-border",
    size === "lg" ? "min-h-16 px-5 text-[19px] gap-2.5" : "min-h-12 px-4 text-[17px] gap-2",
    extra,
  );
}
