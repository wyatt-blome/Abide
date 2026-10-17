// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const params = { current: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => params.current,
  usePathname: () => "/memorize/practice",
}));

import { db } from "@/db/db";
import { clearAllData, createMemoryPlan } from "@/db/repo";
import type { VerseRange } from "@/db/types";
import { loadHeadings, loadMeta } from "@/lib/bible";
import { loadPassageData } from "@/lib/planActions";
import { parseRangeId, rangeId, rangeToKeys } from "@/lib/refs";
import { HEADING_CAPTION, storyHeadings } from "@/components/practice/HeadingsDrill";
import { planForRange, rangeHeadingsSpec } from "@/components/practice/RangePractice";
import { recordAttempt } from "@/components/practice/record";
import { headingsDrillHref } from "@/components/sources/SourcesPanel";
import PracticePage from "@/app/memorize/practice/page";
import { useDiskBible } from "./_bible";

const ROM8: VerseRange = { start: { book: "ROM", chapter: 8, verse: 1 }, end: { book: "ROM", chapter: 8, verse: 39 } };

beforeAll(() => useDiskBible());
beforeEach(async () => {
  await clearAllData();
});
afterEach(cleanup);

describe("rangeId / parseRangeId", () => {
  it("round-trips and rejects malformed or reversed ids", () => {
    expect(rangeId(ROM8)).toBe("ROM.8.1-ROM.8.39");
    expect(parseRangeId("ROM.8.1-ROM.8.39")).toEqual(ROM8);
    expect(parseRangeId("1CO.13.4-1CO.13.7")?.start.book).toBe("1CO");
    const v28 = { book: "ROM", chapter: 8, verse: 28 };
    expect(parseRangeId("ROM.8.28")).toEqual({ start: v28, end: v28 });
    for (const bad of ["", "ROM.8", "XYZ.1.1-XYZ.1.2", "ROM.8.39-ROM.8.1", "ROM.0.1-ROM.8.2", "ROM.8.1-ROM.8.2-ROM.8.3"]) {
      expect(parseRangeId(bad)).toBeNull();
    }
  });
});

describe("Sources Outline drill link", () => {
  it("resolves: the URL's range parameter parses back to the panel's range", () => {
    const href = headingsDrillHref(ROM8);
    expect(href).toBe("/memorize/practice?mode=headings&range=ROM.8.1-ROM.8.39");
    const url = new URL(href, "https://app.local");
    expect(url.pathname).toBe("/memorize/practice");
    expect(url.searchParams.get("mode")).toBe("headings");
    expect(parseRangeId(url.searchParams.get("range"))).toEqual(ROM8);
  });

  it("free drill: BSB verses of the range and its headings, nothing recorded", async () => {
    const meta = await loadMeta();
    const spec = await rangeHeadingsSpec(ROM8);
    expect(spec.planId).toBe("");
    expect(spec.defaultMode).toBe("headings");
    expect(spec.verses.map((v) => v.key)).toEqual(rangeToKeys(meta, ROM8, true));
    const headings = await loadHeadings();
    const expected = headings.filter((h) => h.book === "ROM" && h.chapter === 8);
    expect(spec.headings).toEqual(expected);
    expect(storyHeadings(spec.headings).length).toBeGreaterThan(0);

    const perVerse = Object.fromEntries(spec.verses.map((v) => [v.key, 1]));
    const result = await recordAttempt({ planId: "", kind: "verses", verses: spec.verses, outcome: { mode: "headings", perVerse }, durationMs: 1000 });
    expect(result.rows).toHaveLength(spec.verses.length);
    expect(await db.reviewLogs.count()).toBe(0);
    expect(await db.verseCards.count()).toBe(0);
    expect(await db.streak.count()).toBe(0);
  });

  it("picks a plan whose range contains the range (active first)", async () => {
    const plan = await createMemoryPlan(
      { title: "Romans 8", range: ROM8, translation: "BSB", pace: "daily", chunkSize: 2 },
      await loadPassageData(ROM8, "BSB"),
    );
    expect(planForRange([plan], ROM8)?.id).toBe(plan.id);
    expect(planForRange([plan], { start: ROM8.start, end: { book: "ROM", chapter: 9, verse: 1 } })).toBeNull();
    expect(planForRange([{ ...plan, status: "paused" }], ROM8)).toBeNull();
  });

  it("the practice page opens the headings drill for the link without a plan", async () => {
    params.current = new URL(headingsDrillHref(ROM8), "https://app.local").searchParams;
    render(<PracticePage />);
    await waitFor(() => expect(screen.getAllByText(HEADING_CAPTION).length).toBeGreaterThan(0));
    expect(screen.queryByText("Choose what to practice")).toBeNull();
  });
});
