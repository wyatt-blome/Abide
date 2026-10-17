import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import {
  clearAllData, createMemoryPlan, DEFAULT_SETTINGS, getSettings, getStreak, introduceDueChunks, newId,
  recordPassageRun, recordStreakDay, recordVerseReview, saveLinkOut, saveUserNote, updateSettings,
} from "@/db/repo";
import { headingStartKeys } from "@/lib/chunking";
import { DAY_MS } from "@/lib/isoDate";
import { buildQueue } from "@/lib/queue";
import { rangeToKeys, ref } from "@/lib/refs";
import { loadBook, loadHeadings, loadMeta } from "./_data";

const meta = loadMeta();
const R = (b: string, c1: number, v1: number, c2: number, v2: number) => ({ start: ref(b, c1, v1), end: ref(b, c2, v2) });
const T0 = new Date(2026, 2, 9, 9, 0, 0).getTime(); // Monday 09:00 local

function passageData(range: ReturnType<typeof R>) {
  const text = loadBook(range.start.book);
  return {
    verses: rangeToKeys(meta, range).map((key) => {
      const [, c, v] = key.split(".").map(Number);
      return { key, text: text[String(c)][v - 1] ?? "" };
    }),
    headingStarts: headingStartKeys(loadHeadings()),
    emptyKeys: meta.emptyVerses.BSB,
  };
}

beforeEach(async () => {
  await clearAllData();
});

describe("settings & streak", () => {
  it("defaults and patching", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    const s = await updateSettings({ graceWeekday: 6, dailyNewLimit: 5 });
    expect(s.graceWeekday).toBe(6);
    expect((await getSettings()).dailyNewLimit).toBe(5);
    expect((await getSettings()).updatedAt).toBeGreaterThan(0);
  });
  it("streak singleton", async () => {
    expect((await getStreak()).current).toBe(0);
    await recordStreakDay(true, T0);
    await recordStreakDay(true, T0 + DAY_MS);
    expect((await getStreak()).current).toBe(2);
  });
  it("newId is a uuid", () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("notes and link-outs", () => {
  it("derives verseKeys for notes (multi-entry index)", async () => {
    const n = await saveUserNote({ kind: "quote", text: "lorem ipsum", verseRanges: [R("ROM", 8, 28, 8, 30)] }, meta, T0);
    expect(n.verseKeys).toEqual(["ROM.8.28", "ROM.8.29", "ROM.8.30"]);
    expect((await db.userNotes.where("verseKeys").equals("ROM.8.29").toArray()).map((x) => x.id)).toEqual([n.id]);
  });
  it("link-outs need a stated reference and ≥ 1 range", async () => {
    const base = { url: "https://example.org/a", title: "Lorem", site: "example.org" };
    await expect(saveLinkOut({ ...base, statedReference: "  ", verseRanges: [R("PSA", 23, 1, 23, 6)] }, meta)).rejects.toThrow();
    await expect(saveLinkOut({ ...base, statedReference: "Psalm 23", verseRanges: [] }, meta)).rejects.toThrow();
    const l = await saveLinkOut({ ...base, statedReference: "Psalm 23", verseRanges: [R("PSA", 23, 1, 23, 6)] }, meta);
    expect(l.verseKeys).toHaveLength(6);
    expect(await db.linkOuts.where("verseKeys").equals("PSA.23.4").count()).toBe(1);
  });
});

describe("memory plans", () => {
  it("creates chunks, introduces the first chunk lazily, then one per day", async () => {
    const plan = await createMemoryPlan({ title: "Psalm 23", range: R("PSA", 23, 1, 23, 6), translation: "BSB", pace: "daily", starterId: "psalm-23" }, passageData(R("PSA", 23, 1, 23, 6)), T0);
    expect(plan.chunks.flat()).toEqual(rangeToKeys(meta, R("PSA", 23, 1, 23, 6)));
    expect(plan.chunksIntroduced).toBe(1);
    expect(await db.verseCards.count()).toBe(plan.chunks[0].length);
    // Idempotent on the same day.
    expect(await introduceDueChunks(T0 + 3600_000)).toEqual([]);
    // Unlearned new cards block the next chunk.
    expect(await introduceDueChunks(T0 + DAY_MS)).toEqual([]);

    // Learn chunk 1.
    for (const c of await db.verseCards.toArray()) await recordVerseReview(c.id, 4, { mode: "recall", accuracy: 0.95, durationMs: 1000 }, T0 + 60_000);
    expect(await db.reviewLogs.count()).toBe(plan.chunks[0].length);
    expect(await introduceDueChunks(T0 + DAY_MS)).toEqual([{ planId: plan.id, chunkIndex: 1 }]);

    const plans = await db.plans.toArray();
    const q = buildQueue({ plans, verseCards: await db.verseCards.toArray(), passageCards: [], now: T0 + DAY_MS });
    const nw = q.items.find((i) => i.kind === "new");
    expect(nw && nw.kind === "new" && nw.runThrough).toEqual(plan.chunks.slice(0, 2).flat());
  });

  it("creates a passage card after the last chunk and applies passage runs", async () => {
    const range = R("PSA", 23, 1, 23, 6);
    const plan = await createMemoryPlan({ title: "Psalm 23", range, translation: "BSB", pace: "twicePerDay", chunkSize: 3 }, passageData(range), T0);
    expect(plan.chunks).toHaveLength(2);
    expect(plan.chunksIntroduced).toBe(2);
    const pcs = await db.passageCards.toArray();
    expect(pcs).toHaveLength(1);
    expect(pcs[0].due).toBeGreaterThan(T0);
    const keys = plan.chunks.flat();
    for (const c of await db.verseCards.toArray()) await recordVerseReview(c.id, 3, { mode: "recall", accuracy: 0.85, durationMs: 1 }, T0);
    const grades = Object.fromEntries(keys.map((k, i) => [k, i === 2 ? 1 : 5])) as Record<string, 1 | 5>;
    await recordPassageRun(pcs[0].id, grades, { mode: "recall", accuracy: 0.8, durationMs: 1 }, T0 + 4 * DAY_MS);
    const lapsed = await db.verseCards.where("[planId+key]").equals([plan.id, keys[2]]).first();
    expect(lapsed!.lapses).toBe(1);
  });

  it("respects the daily new limit and the > 40 due auto-pause", async () => {
    await updateSettings({ dailyNewLimit: 1 });
    const range = R("PSA", 23, 1, 23, 6);
    await createMemoryPlan({ title: "a", range, translation: "BSB", pace: "daily" }, passageData(range), T0);
    const b = await createMemoryPlan({ title: "b", range: R("PSA", 1, 1, 1, 6), translation: "BSB", pace: "daily" }, passageData(R("PSA", 1, 1, 1, 6)), T0 + 1);
    expect(b.chunksIntroduced).toBe(0);

    for (const due of [40, 41]) {
      await clearAllData();
      const c = await createMemoryPlan({ title: "c", range, translation: "BSB", pace: "daily" }, passageData(range), T0);
      // Replace the unlearned first chunk with `due` learned cards that are all due.
      await db.verseCards.clear();
      await db.verseCards.bulkPut(Array.from({ length: due }, (_, i) => ({
        id: `x${i}`, planId: c.id, key: `PSA.23.${(i % 6) + 1}`, stability: 2, difficulty: 5, due: T0, reps: 2, lapses: 0, updatedAt: 0,
      })));
      expect((await introduceDueChunks(T0 + DAY_MS)).length).toBe(due > 40 ? 0 : 1);
    }
  });
});
