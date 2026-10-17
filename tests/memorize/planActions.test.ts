import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { clearAllData, introduceDueChunks } from "@/db/repo";
import { addDays, DAY_MS, todayISO } from "@/lib/isoDate";
import {
  AD_HOC_ID, addToAdHocPlan, chunksToAppend, createPlanStartingTomorrow, deletePlan, findAdHocPlan, loadPassageData, tomorrowISO,
} from "@/lib/planActions";
import { ref } from "@/lib/refs";
import { useDiskBible } from "./_bible";

const R = (b: string, c1: number, v1: number, c2: number, v2: number) => ({ start: ref(b, c1, v1), end: ref(b, c2, v2) });
const T0 = new Date(2026, 2, 9, 9, 0, 0).getTime(); // Monday 09:00 local

beforeAll(() => useDiskBible());
beforeEach(async () => {
  await clearAllData();
});

describe("Ad hoc plan (Memorize this)", () => {
  it("creates the Ad hoc plan starting tomorrow; nothing is introduced today", async () => {
    const range = R("ROM", 8, 28, 8, 30);
    const res = await addToAdHocPlan(range, await loadPassageData(range, "BSB"), { translation: "BSB" }, T0);
    expect(res.created).toBe(true);
    expect(res.added).toBe(3);
    expect(res.plan.starterId).toBe(AD_HOC_ID);
    expect(res.plan.startDate).toBe(tomorrowISO(T0));
    expect(res.plan.startDate).toBe(addDays(todayISO(T0), 1));
    expect(await db.verseCards.count()).toBe(0);
    // Tomorrow the first chunk is introduced.
    await introduceDueChunks(T0 + DAY_MS);
    expect((await db.verseCards.toArray()).map((c) => c.key).sort()).toEqual(res.plan.chunks[0].slice().sort());
  });

  it("appends only verses not already in the plan and moves the start to tomorrow", async () => {
    const a = R("ROM", 8, 28, 8, 30);
    await addToAdHocPlan(a, await loadPassageData(a, "BSB"), { translation: "BSB" }, T0);
    // Two days later the first chunk was introduced; then a new overlapping range is added.
    const later = T0 + 2 * DAY_MS;
    await introduceDueChunks(later);
    const b = R("ROM", 8, 29, 8, 32);
    const res = await addToAdHocPlan(b, await loadPassageData(b, "BSB"), { translation: "BSB" }, later);
    expect(res.created).toBe(false);
    expect(res.added).toBe(2);
    expect(res.skipped).toBe(2);
    const flat = res.plan.chunks.flat();
    expect(flat).toEqual(["ROM.8.28", "ROM.8.29", "ROM.8.30", "ROM.8.31", "ROM.8.32"]);
    expect(new Set(flat).size).toBe(flat.length);
    expect(res.plan.range).toEqual(R("ROM", 8, 28, 8, 32));
    expect(res.plan.startDate).toBe(tomorrowISO(later));
    // Only one Ad hoc plan exists.
    expect((await db.plans.toArray()).filter((p) => p.starterId === AD_HOC_ID)).toHaveLength(1);
    // Adding the same verses again adds nothing.
    const again = await addToAdHocPlan(b, await loadPassageData(b, "BSB"), { translation: "BSB" }, later);
    expect(again.added).toBe(0);
    expect((await findAdHocPlan())!.chunks.flat()).toHaveLength(5);
  });

  it("skips BSB empty verses when appending", async () => {
    const plan = { chunks: [["MAT.17.19"]] };
    const range = R("MAT", 17, 19, 17, 22);
    const { chunks, skipped } = chunksToAppend(plan, await loadPassageData(range, "BSB"));
    expect(skipped).toEqual(["MAT.17.19"]);
    expect(chunks.flat()).toEqual(["MAT.17.20", "MAT.17.22"]);
  });

  it("separate plan option starts tomorrow; delete removes cards and logs", async () => {
    const range = R("PSA", 1, 1, 1, 6);
    const plan = await createPlanStartingTomorrow(range, "Psalm 1", await loadPassageData(range, "BSB"), { translation: "BSB" }, T0);
    expect(plan.startDate).toBe(tomorrowISO(T0));
    await introduceDueChunks(T0 + DAY_MS);
    expect(await db.verseCards.where("planId").equals(plan.id).count()).toBeGreaterThan(0);
    await deletePlan(plan.id);
    expect(await db.plans.count()).toBe(0);
    expect(await db.verseCards.count()).toBe(0);
  });
});
