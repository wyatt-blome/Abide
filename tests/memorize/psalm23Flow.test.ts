import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { STARTER_BY_ID } from "../../content/starters";
import { db } from "@/db/db";
import { clearAllData, createMemoryPlan, recordVerseReview } from "@/db/repo";
import { addDays, localMidnight, todayISO } from "@/lib/isoDate";
import { loadPassageData } from "@/lib/planActions";
import { buildQueue } from "@/lib/queue";
import { useDiskBible } from "./_bible";

const T0 = new Date(2026, 2, 9, 9, 0, 0).getTime();

beforeAll(() => useDiskBible());
beforeEach(async () => {
  await clearAllData();
});

describe("Psalm 23 flow (logic level)", () => {
  it("starter → chunk 1 introduced → graded Good → due tomorrow or later, not today", async () => {
    const s = STARTER_BY_ID["psalm-23"];
    const data = await loadPassageData(s.range, "BSB");
    const plan = await createMemoryPlan(
      { title: s.title, range: s.range, translation: "BSB", pace: s.pace, chunkSize: s.chunkSize, starterId: s.id, startDate: todayISO(T0) },
      data,
      T0,
    );
    expect(plan.chunks.flat()).toHaveLength(6);
    expect(plan.chunksIntroduced).toBe(1);
    const cards = await db.verseCards.where("planId").equals(plan.id).toArray();
    expect(cards.map((c) => c.key).sort()).toEqual([...plan.chunks[0]].sort());
    expect(cards.every((c) => c.reps === 0)).toBe(true);

    // The new chunk is in today's queue.
    const q = buildQueue({ plans: [plan], verseCards: cards, passageCards: [], now: T0 });
    expect(q.items.map((i) => i.kind)).toEqual(["new"]);

    const at = T0 + 5 * 60_000;
    for (const c of cards) await recordVerseReview(c.id, 4, { mode: "typeFirst", accuracy: 0.95, durationMs: 20_000 }, at);
    const after = await db.verseCards.where("planId").equals(plan.id).toArray();
    const tomorrow = localMidnight(addDays(todayISO(T0), 1));
    for (const c of after) {
      expect(c.reps).toBe(1);
      expect(c.due).toBeGreaterThanOrEqual(tomorrow);
    }
    const p2 = (await db.plans.get(plan.id))!;
    const q2 = buildQueue({ plans: [p2], verseCards: after, passageCards: await db.passageCards.toArray(), now: at });
    expect(q2.items).toHaveLength(0);
    expect(await db.reviewLogs.count()).toBe(cards.length);
  });
});
