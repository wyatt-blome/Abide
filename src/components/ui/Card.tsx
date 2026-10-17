import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Default "section". */
  as?: "section" | "div" | "article" | "li";
  /** Optional small heading shown at the top of the card (a UI label). */
  title?: string;
  children?: ReactNode;
}

/** Plain surface with a theme-aware border (thick in sunlight). */
export function Card({ as: Tag = "section", title, className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx("bordered rounded-2xl bg-surface p-4", className)} {...rest}>
      {title ? <h2 className="mb-2 text-[15px] font-bold uppercase tracking-wide text-muted">{title}</h2> : null}
      {children}
    </Tag>
  );
}
