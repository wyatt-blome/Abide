// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { STARTER_BY_ID } from "../../content/starters";
import { db } from "@/db/db";
import { clearAllData, createMemoryPlan } from "@/db/repo";
import { loadPassageData } from "@/lib/planActions";
import { wordTokens } from "@/lib/text";
import { expectedLetter, loadPracticeVerses } from "@/components/practice/helpers";
import { PracticeRunner } from "@/components/practice/PracticeRunner";
import { useDiskBible } from "./_bible";

beforeAll(() => useDiskBible());
beforeEach(async () => {
  await clearAllData();
});
afterEach(cleanup);

describe("PracticeRunner", () => {
  it("Type letters on a new chunk records verse reviews and shows the summary", async () => {
    const s = STARTER_BY_ID["psalm-23"];
    const plan = await createMemoryPlan(
      { title: s.title, range: s.range, translation: "BSB", pace: "daily", chunkSize: 2 },
      await loadPassageData(s.range, "BSB"),
    );
    const verses = await loadPracticeVerses(plan.chunks[0], "BSB");
    expect(verses.map((v) => v.label)).toEqual(["v.1", "v.2"]);
    render(
      <PracticeRunner
        spec={{ planId: plan.id, title: "Psalm 23", verses, pool: verses, record: "verses", headings: [], defaultMode: "typeFirst" }}
        onDone={() => {}}
      />,
    );
    for (const v of verses) for (const t of wordTokens(v.text)) fireEvent.keyDown(window, { key: expectedLetter(t.core) });
    await waitFor(() => expect(screen.getByRole("list", { name: "Results per verse" })).toBeTruthy());
    expect(screen.getAllByText(/Perfect/).length).toBe(2);
    expect(screen.getAllByText(/Next: (Tomorrow|In \d+ days)/).length).toBe(2);
    const cards = await db.verseCards.where("planId").equals(plan.id).toArray();
    expect(cards.every((c) => c.reps === 1)).toBe(true);
    expect(await db.reviewLogs.count()).toBe(2);
  });
});
