import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface PageHeaderProps {
  title: string;
  /** Optional href for a back link (rendered as a 48px "Back" link). */
  backHref?: string;
  backLabel?: string;
  /** Optional small, non-essential trailing content. Essential actions belong in <ActionBar>. */
  trailing?: ReactNode;
}

/** Small page title row. Holds nothing essential (top of screen is hard to reach one-handed). */
export function PageHeader({ title, backHref, backLabel = "Back", trailing }: PageHeaderProps) {
  return (
    <header className="flex min-h-14 items-center gap-2 pt-2">
      {backHref ? (
        <Link href={backHref} className="tap -ml-2 inline-flex items-center justify-center rounded-xl text-fg">
          <Icon name="chevronLeft" label={backLabel} />
        </Link>
      ) : null}
      <h1 className="flex-1 truncate text-[22px] font-bold">{title}</h1>
      {trailing}
    </header>
  );
}
