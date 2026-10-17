// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/memorize/practice",
}));

import { STARTER_BY_ID } from "../../content/starters";
import { db } from "@/db/db";
import { clearAllData, createMemoryPlan, introduceDueChunks, recordVerseReview } from "@/db/repo";
import { DAY_MS } from "@/lib/isoDate";
import { loadPassageData } from "@/lib/planActions";
import { wordTokens } from "@/lib/text";
import { expectedLetter, loadPracticeVerses } from "@/components/practice/helpers";
import { PlanPractice } from "@/components/practice/PlanPractice";
import { useDiskBible } from "./_bible";

beforeAll(() => useDiskBible());
beforeEach(async () => {
  await clearAllData();
});
afterEach(cleanup);

describe("PlanPractice", () => {
  it("keeps the Summary after recording a new chunk (default target does not flip to the run-through)", async () => {
    const s = STARTER_BY_ID["psalm-23"];
    const t0 = Date.now() - 3 * DAY_MS;
    const plan = await createMemoryPlan(
      { title: s.title, range: s.range, translation: "BSB", pace: "daily", chunkSize: 2 },
      await loadPassageData(s.range, "BSB"),
      t0,
    );
    for (const c of await db.verseCards.where("planId").equals(plan.id).toArray()) {
      await recordVerseReview(c.id, 4, { mode: "typeFirst", accuracy: 1, durationMs: 1000 }, t0 + 60_000);
    }
    await introduceDueChunks(t0 + 2 * DAY_MS);
    const p = (await db.plans.get(plan.id))!;
    expect(p.chunksIntroduced).toBe(2);

    render(<PlanPractice planId={plan.id} target={null} mode="typeFirst" />);
    await waitFor(() => expect(screen.getByText(/Chunk 2/)).toBeTruthy());
    const verses = await loadPracticeVerses(p.chunks[1], "BSB");
    for (const v of verses) for (const t of wordTokens(v.text)) fireEvent.keyDown(window, { key: expectedLetter(t.core) });
    await waitFor(() => expect(screen.getByRole("list", { name: "Results per verse" })).toBeTruthy());
    // Let the live queries pick up the recorded cards (hasNew → false), then check again.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.getByRole("list", { name: "Results per verse" })).toBeTruthy();
    const cards = await db.verseCards.where("planId").equals(plan.id).toArray();
    expect(cards.every((c) => c.reps > 0)).toBe(true);
  });
});
