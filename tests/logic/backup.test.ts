import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { APP_NAME, BACKUP_SCHEMA_VERSION } from "@/config";
import { db } from "@/db/db";
import { clearAllData, put, updateSettings } from "@/db/repo";
import { BACKUP_TABLES, backupFilename, backupToJson, exportBackup, importBackup, parseBackup, previewBackup } from "@/lib/backup";

const range = { start: { book: "ROM", chapter: 8, verse: 28 }, end: { book: "ROM", chapter: 8, verse: 28 } };

async function seed() {
  await db.plans.put({ id: "p1", title: "T", translation: "BSB", range, chunks: [["ROM.8.28"]], chunksIntroduced: 1, pace: "daily", status: "active", createdAt: 1, updatedAt: 100 });
  await db.verseCards.put({ id: "v1", planId: "p1", key: "ROM.8.28", stability: 3, difficulty: 5, due: 5, reps: 1, lapses: 0, updatedAt: 100 });
  await db.reviewLogs.put({ id: "l1", cardId: "v1", cardType: "verse", mode: "recall", grade: 4, accuracy: 0.95, durationMs: 1000, at: 50 });
  await db.userNotes.put({ id: "n1", kind: "note", text: "lorem ipsum", verseRanges: [range], verseKeys: ["ROM.8.28"], createdAt: 10, updatedAt: 100 });
  await db.bookLogs.put({ id: "bl1", bookId: "b1", date: "2026-03-02", from: 1, to: 7 });
  await db.libraryCache.put({ id: "pack/ROM", packId: "pack", book: "ROM", data: {}, fetchedAt: 1 });
  await updateSettings({ fontScale: 1.4 });
}

describe("backup", () => {
  beforeEach(async () => {
    await clearAllData();
    await seed();
  });

  it("exports every table except libraryCache with metadata", async () => {
    const b = await exportBackup(123);
    expect(b.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(b.exportedAt).toBe(123);
    expect(b.appName).toBe(APP_NAME);
    expect(Object.keys(b.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    expect("libraryCache" in b.tables).toBe(false);
    expect(previewBackup(b)).toMatchObject({ plans: 1, verseCards: 1, reviewLogs: 1, userNotes: 1, settings: 1, streak: 0 });
    expect(backupFilename("2026-10-17")).toBe(`${APP_NAME}-backup-2026-10-17.json`);
  });

  it("the exported settings row carries this export's lastBackupAt (not the previous one)", async () => {
    await db.settings.update("singleton", { lastBackupAt: 1000 });
    const b = await exportBackup(5000, { stampLastBackup: true });
    expect(b.tables.settings?.[0].lastBackupAt).toBe(5000);
    // Dexie is untouched by the export itself (the UI stamps it after a successful save).
    expect((await db.settings.get("singleton"))?.lastBackupAt).toBe(1000);
    expect((await exportBackup(6000)).tables.settings?.[0].lastBackupAt).toBe(1000);
  });

  it("export → clear → import (replace) restores everything", async () => {
    const before = await exportBackup(1);
    const json = backupToJson(before);
    await clearAllData();
    expect(await db.plans.count()).toBe(0);
    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importBackup(parsed.backup, "replace");
    const after = await exportBackup(1);
    expect(after).toEqual(before);
    // the multi-entry index still works after import
    expect(await db.userNotes.where("verseKeys").equals("ROM.8.28").count()).toBe(1);
  });

  it("replace drops local records not in the file", async () => {
    const b = await exportBackup(1);
    await db.plans.put({ ...(await db.plans.get("p1"))!, id: "p2" });
    await importBackup(b, "replace");
    expect(await db.plans.get("p2")).toBeUndefined();
  });

  it("merge: newer updatedAt wins, older loses, local-only records stay, createdAt/at fallbacks", async () => {
    const b = await exportBackup(1);
    b.tables.plans = [
      { ...b.tables.plans![0], title: "newer", updatedAt: 200 },
      { ...b.tables.plans![0], id: "p3", title: "incoming only", updatedAt: 1 },
    ];
    b.tables.userNotes = [{ ...b.tables.userNotes![0], text: "older", updatedAt: 50 }];
    b.tables.bookLogs = [{ id: "bl2", bookId: "b1", date: "2026-03-03", from: 8, to: 14 }];
    await db.plans.put({ ...(await db.plans.get("p1"))!, id: "p-local", updatedAt: 5 });
    const res = await importBackup(b, "merge");
    expect((await db.plans.get("p1"))!.title).toBe("newer");
    expect((await db.plans.get("p3"))!.title).toBe("incoming only");
    expect(await db.plans.get("p-local")).toBeTruthy();
    expect((await db.userNotes.get("n1"))!.text).toBe("lorem ipsum");
    expect(await db.bookLogs.count()).toBe(2);
    expect(res.written.plans).toBe(2);
    expect(res.written.userNotes).toBe(0);
  });

  it("rejects invalid files", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup({ schemaVersion: 1, exportedAt: 1, appName: "x", tables: { plans: [{ title: "no id" }] } }).ok).toBe(false);
    expect(parseBackup({ schemaVersion: 999, exportedAt: 1, appName: "x", tables: {} }).ok).toBe(false);
    const ok = parseBackup({ schemaVersion: 1, exportedAt: 1, appName: "x", tables: { plans: [], unknownTable: [{ id: "a" }] } });
    expect(ok.ok && Object.keys(ok.backup.tables)).toEqual(["plans"]);
  });

  it("put stamps updatedAt", async () => {
    const saved = await put(db.bookLogs, { id: "bl9", bookId: "b", date: "2026-01-01", from: 1, to: 2 }, 777);
    expect(saved.updatedAt).toBe(777);
    expect((await db.bookLogs.get("bl9"))!.updatedAt).toBe(777);
  });
});
