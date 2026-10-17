"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export interface TabDef {
  href: string;
  label: string;
  icon: IconName;
}

export const TABS: readonly TabDef[] = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/memorize", label: "Memorize", icon: "cards" },
  { href: "/read", label: "Read", icon: "book" },
  { href: "/library", label: "Library", icon: "library" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function isTabActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Fixed bottom navigation: 5 tabs, icon + label, ≥48px targets, aria-current="page" on the active tab. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t-[length:var(--border-width)] border-border bg-bg pb-[var(--safe-bottom)]"
    >
      <ul className="mx-auto flex h-[var(--tabbar-height)] max-w-[44rem] px-[var(--safe-left)]">
        {TABS.map((tab) => {
          const active = isTabActive(tab.href, pathname);
          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "tap flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px]",
                  active ? "font-bold text-accent" : "font-semibold text-muted",
                )}
              >
                <Icon name={tab.icon} size={26} strokeWidth={active ? 2.75 : 2.25} />
                <span className={cx(active && "underline decoration-2 underline-offset-4")}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
