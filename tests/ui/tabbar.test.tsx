// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { isTabActive, TabBar, TABS } from "@/components/ui/TabBar";

afterEach(cleanup);

describe("TabBar", () => {
  it("renders the 5 tabs with labels and ≥48px targets", () => {
    render(<TabBar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(5);
    expect(Array.from(links).map((a) => a.textContent)).toEqual(["Today", "Memorize", "Read", "Library", "Settings"]);
    expect(Array.from(links).map((a) => a.getAttribute("href"))).toEqual(["/", "/memorize", "/read", "/library", "/settings"]);
    for (const a of Array.from(links)) expect(a.className).toMatch(/\btap\b/);
    expect(TABS).toHaveLength(5);
  });

  it("marks the active tab with aria-current", () => {
    pathname = "/read";
    render(<TabBar />);
    expect(screen.getByRole("link", { name: "Read" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Today" }).getAttribute("aria-current")).toBeNull();
  });

  it("matches nested routes but Today only at /", () => {
    expect(isTabActive("/", "/")).toBe(true);
    expect(isTabActive("/", "/read")).toBe(false);
    expect(isTabActive("/memorize", "/memorize/plan")).toBe(true);
    expect(isTabActive("/read", "/reading")).toBe(false);
  });
});
