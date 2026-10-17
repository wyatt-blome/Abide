// @vitest-environment jsdom
// SourcesPanel for Romans 8: every visible text node must be sourced (excerpt text, BSB heading or
// verse, citation field value, the user's own note) or a fixed UI label from SOURCES_UI_LABELS.
import "fake-indexeddb/auto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
import { saveUserNote } from "@/db/repo";
import type { VerseRange } from "@/db/types";
import { getRangeVerses, headingsInRange, loadHeadings, loadMeta } from "@/lib/bible";
import { BOOK_CODES } from "@/lib/books";
import { crossRefsForRange, defaultEnabledPackIds, excerptsForRange, loadLibraryIndex } from "@/lib/library";
import { formatRange, formatRanges, formatRef, fromKey } from "@/lib/refs";
import { AppProviders } from "@/components/providers/AppProviders";
import { SourcesPanel } from "@/components/sources/SourcesPanel";
import { SL, SOURCES_UI_LABELS, SOURCES_UI_LABEL_PATTERNS } from "@/components/sources/labels";
import { bibleProjectLinksForRange } from "../../content/bibleproject";
import { readShard, textNodes, useDiskData } from "./_setup";

const r = (book: string, chapter: number, verse: number) => ({ book, chapter, verse });
const ROM8: VerseRange = { start: r("ROM", 8, 1), end: r("ROM", 8, 39) };
// Structural placeholder text (not content).
const NOTE_TEXT = "Lorem ipsum dolor sit amet placeholder note";

beforeAll(async () => {
  useDiskData();
  await db.userNotes.clear();
  await db.linkOuts.clear();
  await db.settings.clear();
  const meta = await loadMeta();
  await saveUserNote({ kind: "note", text: NOTE_TEXT, verseRanges: [{ start: r("ROM", 8, 28), end: r("ROM", 8, 28) }] }, meta);
});

afterEach(cleanup);

function renderPanel(range: VerseRange) {
  return render(
    <AppProviders>
      <SourcesPanel range={range} translation="BSB" />
    </AppProviders>,
  );
}

async function settled(panel: HTMLElement) {
  await waitFor(
    () => {
      expect(within(panel).queryAllByText(SL.loading)).toHaveLength(0);
      expect(panel.querySelectorAll("article[data-excerpt-id]").length).toBeGreaterThan(0);
    },
    { timeout: 20000 },
  );
}

describe("SourcesPanel (Romans 8)", () => {
  it("shows only sourced text and fixed UI labels", async () => {
    renderPanel(ROM8);
    const panel = await screen.findByTestId("sources-panel");
    await settled(panel);
    await screen.findByText(NOTE_TEXT);

    const meta = await loadMeta();
    const index = await loadLibraryIndex();
    const packs = await defaultEnabledPackIds();
    const excerpts = await excerptsForRange(ROM8, packs);
    const xrefs = await crossRefsForRange(ROM8);
    const notes = await db.userNotes.toArray();

    const allowed = new Set<string>(SOURCES_UI_LABELS);
    for (const x of excerpts) {
      allowed.add(x.text.trim());
      for (const p of x.text.split("\n")) allowed.add(p.trim());
      allowed.add(x.locator);
      allowed.add(formatRanges(x.verseRanges, meta));
    }
    for (const w of index.works) for (const f of [w.author, w.title, w.edition]) allowed.add(f);
    for (const h of headingsInRange(await loadHeadings(), ROM8)) allowed.add(h.text);
    for (const x of xrefs) {
      allowed.add(formatRange(x.to, meta));
      allowed.add(formatRef(fromKey(x.from)));
      for (const v of await getRangeVerses("BSB", x.to)) allowed.add(v.text.trim());
    }
    for (const n of notes) {
      allowed.add(n.text.trim());
      allowed.add(formatRanges(n.verseRanges, meta));
    }
    for (const l of bibleProjectLinksForRange(ROM8, BOOK_CODES)) {
      allowed.add(l.title);
      allowed.add(l.url);
    }
    const isVerseNumber = (t: string) => /^\d{1,3}$/.test(t);

    const texts = textNodes(panel);
    expect(texts.length).toBeGreaterThan(20);
    const unsourced = texts.filter(
      (t) => !allowed.has(t) && !isVerseNumber(t) && !SOURCES_UI_LABEL_PATTERNS.some((re) => re.test(t)),
    );
    expect(unsourced).toEqual([]);

    // Non-vacuous: every indexed excerpt rendered as a card, cross-reference verse text is shown,
    // and the BSB headings of Romans 8 are present.
    expect(panel.querySelectorAll("article[data-excerpt-id]").length).toBe(excerpts.length);
    const topXref = (await getRangeVerses("BSB", xrefs[0].to, { skipEmpty: true }))[0].text;
    expect(texts).toContain(topXref.trim());
    for (const h of headingsInRange(await loadHeadings(), ROM8)) expect(texts).toContain(h.text);

    // A text node that is not sourced would be caught.
    const probe = document.createElement("span");
    probe.textContent = "Lorem ipsum unsourced probe";
    panel.appendChild(probe);
    expect(textNodes(panel).filter((t) => !allowed.has(t) && !isVerseNumber(t))).toContain("Lorem ipsum unsourced probe");
    probe.remove();

    // The seeded note is shown with its "from my reading" label.
    const noteEl = screen.getByText(NOTE_TEXT).closest("li")!;
    expect(within(noteEl).getByText(SL.fromMyReadingTag)).toBeTruthy();
    expect(within(noteEl).getByText(SL.enteredByMe)).toBeTruthy();

    // Every excerpt card carries a full citation line with a Source link to the excerpt url.
    for (const card of Array.from(panel.querySelectorAll<HTMLElement>("article[data-excerpt-id]"))) {
      const line = within(card).getByTestId("citation-line");
      const link = within(line).getByRole("link");
      const ex = excerpts.find((x) => x.id === card.dataset.excerptId)!;
      expect(link.getAttribute("href")).toBe(ex.url);
      expect(line.textContent).toContain(ex.locator);
    }

    // Outline and drill link, Henry not built → no-intro label, OpenBible attribution.
    expect(screen.getByText(SL.noBookIntro)).toBeTruthy();
    expect(screen.getAllByText(SL.headingSource).length).toBeGreaterThan(0);
    const drill = screen.getByText(SL.storyDrill).closest("a")!;
    expect(drill.getAttribute("href")).toBe(`/memorize/practice?mode=headings&range=${encodeURIComponent("ROM.8.1-ROM.8.39")}`);
    expect(screen.getByText(SL.crossRefsAttribution)).toBeTruthy();
  });

  it("opens the full verified section in a sheet", async () => {
    const shard = readShard("westminster-larger-catechism", "ROM");
    const ex = shard.excerpts.find((x) => x.sectionId && !x.fullSection)!;
    const full = shard.excerpts.find((x) => x.id === ex.sectionId)!;
    const proof = ex.verseRanges[0];
    renderPanel({ start: proof.start, end: proof.start });
    const panel = await screen.findByTestId("sources-panel");
    await settled(panel);
    const card = panel.querySelector<HTMLElement>(`article[data-excerpt-id="${ex.id}"]`)!;
    fireEvent.click(within(card).getByRole("button", { name: SL.readFullSection }));
    const dialog = await screen.findByRole("dialog", { name: SL.fullSectionTitle });
    const parts = full.text.split("\n").filter(Boolean);
    await waitFor(() =>
      expect(Array.from(dialog.querySelectorAll("[data-verbatim]")).map((n) => n.textContent)).toEqual(parts),
    );
    expect(within(dialog).getByTestId("citation-line").textContent).toContain(full.locator);
  });

  it("shows a Heidelberg answer on one of its proof verses", async () => {
    const shard = readShard("heidelberg-catechism", "ROM");
    const ex = shard.excerpts.find((x) => !x.fullSection && x.text.split("\n").length === 2 && x.verseRanges.length > 0)!;
    const proof = ex.verseRanges[0];
    const verse: VerseRange = { start: proof.start, end: proof.start };
    renderPanel(verse);
    const panel = await screen.findByTestId("sources-panel");
    await settled(panel);
    const [, answer] = ex.text.split("\n");
    const node = await within(panel).findByText(answer);
    expect(node.getAttribute("data-verbatim")).toBe("true");
    const card = node.closest("article")!;
    expect(within(card).getByText(SL.answer)).toBeTruthy();
    expect(within(card).getByText(ex.locator)).toBeTruthy();
  });

  it("captions a Psalm superscription as such, separately from the section heading (Psalm 23)", async () => {
    const PSA23: VerseRange = { start: r("PSA", 23, 1), end: r("PSA", 23, 6) };
    const sup = headingsInRange(await loadHeadings(), PSA23).filter((h) => h.level === "d");
    expect(sup.length).toBeGreaterThan(0);
    renderPanel(PSA23);
    const panel = await screen.findByTestId("sources-panel");
    await within(panel).findByText(sup[0].text, undefined, { timeout: 20000 });
    expect(within(panel).getAllByText(SL.superscriptionSource)).toHaveLength(sup.length);
    const sup0 = within(panel).getByText(sup[0].text);
    expect(sup0.nextElementSibling?.textContent).toBe(SL.superscriptionSource);
  });
});
