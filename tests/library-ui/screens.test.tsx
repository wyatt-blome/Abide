// @vitest-environment jsdom
// Smoke tests: the Library and Settings screens render over real data without errors.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { db } from "@/db/db";
import { getSettings } from "@/db/repo";
import { NO_PACKS, effectivePackIds, togglePack } from "@/lib/enabledPacks";
import { AppProviders } from "@/components/providers/AppProviders";
import { HowToAdd } from "@/components/library/HowToAdd";
import { LibraryManager } from "@/components/library/LibraryManager";
import { parseMarkdown } from "@/components/library/Markdown";
import { MyLibrary } from "@/components/library/MyLibrary";
import { NoteSearch } from "@/components/library/NoteSearch";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { AUTHOR_SITES } from "../../content/links";
import { ROOT, readIndex, useDiskData } from "./_setup";

const realFetch = globalThis.fetch;
beforeAll(() => {
  useDiskData();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    try {
      const body = readFileSync(path.join(ROOT, "public", u.replace(/^\//, "")));
      return new Response(body, { status: 200 });
    } catch {
      return new Response("", { status: 404 });
    }
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});
afterEach(cleanup);

const wrap = (node: ReactNode) => render(<AppProviders>{node}</AppProviders>);

describe("enabled packs", () => {
  it("treats [] as defaults and stores a sentinel when everything is off", () => {
    expect(effectivePackIds([], ["a", "b"])).toEqual(["a", "b"]);
    expect(togglePack([], ["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(togglePack(["a"], [], "a", false)).toEqual([NO_PACKS]);
    expect(effectivePackIds([NO_PACKS], ["a"])).toEqual([]);
  });
});

describe("Library screens", () => {
  it("My Library lists the official author pages with Open links", async () => {
    wrap(<MyLibrary />);
    for (const site of AUTHOR_SITES) expect((await screen.findAllByText(site.author)).length).toBeGreaterThan(0);
    const opens = screen.getAllByRole("link", { name: /^Open/ });
    expect(opens.length).toBe(AUTHOR_SITES.reduce((n, s) => n + s.pages.length, 0));
    for (const a of opens) expect(a.getAttribute("rel")).toContain("noopener");
    fireEvent.click(screen.getAllByRole("button", { name: "Save a link-out" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Save a link" });
    expect((within(dialog).getByLabelText("Web address") as HTMLInputElement).value).toBe(AUTHOR_SITES[0].pages[0].url);
  });

  it("Library manager shows built and skipped works and toggles a pack", async () => {
    const index = readIndex();
    wrap(<LibraryManager />);
    for (const w of index.works) expect(await screen.findByText(w.title)).toBeTruthy();
    expect(screen.getAllByText(/^Not built: /).length).toBe(index.skipped.length);
    const belgic = index.works.find((w) => w.id === "belgic-confession")!;
    const sw = screen.getByRole("switch", { name: `Use ${belgic.title}` });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    await waitFor(async () => expect((await getSettings()).enabledPacks).toContain(belgic.id));
    const defaults = index.works.filter((w) => w.defaultEnabled).map((w) => w.id);
    for (const id of defaults) expect((await getSettings()).enabledPacks).toContain(id);
  });

  it("How to add renders the pack README without raw HTML", async () => {
    const md = readFileSync(path.join(ROOT, "library/packs/README.md"), "utf8");
    const blocks = parseMarkdown(md);
    expect(blocks.some((b) => b.kind === "table")).toBe(true);
    expect(blocks.some((b) => b.kind === "code")).toBe(true);
    wrap(<HowToAdd />);
    const firstHeading = /^#\s+(.*)$/m.exec(md)![1];
    expect(await screen.findByText(firstHeading)).toBeTruthy();
  });

  it("Search by verse renders the picker", async () => {
    wrap(<NoteSearch />);
    expect(await screen.findByText("Passages to search")).toBeTruthy();
  });
});

describe("Settings screen", () => {
  it("renders every section and reads the name verse from the BSB", async () => {
    await db.settings.clear();
    wrap(<SettingsScreen />);
    for (const t of ["Reading", "Listening", "Memorize", "Sources library", "ESV (bring your own key)", "Reminders", "Backup", "About"]) {
      expect(await screen.findByText(t)).toBeTruthy();
    }
    const bsb = JSON.parse(readFileSync(path.join(ROOT, "public/bible/bsb/JHN.json"), "utf8")) as Record<string, string[]>;
    await waitFor(() => expect(screen.getAllByText(bsb["15"][3]).length).toBeGreaterThan(0));
    expect(document.getElementById("backup")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Increase Text size" }));
    await waitFor(async () => expect((await getSettings()).fontScale).toBeCloseTo(1.1));
  });
});
