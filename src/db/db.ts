// Dexie 4 schema. Importable in Node tests when "fake-indexeddb/auto" is imported first.
//
// The database name is deliberately not derived from APP_NAME: renaming the app must not orphan
// existing on-device data.

import Dexie, { type EntityTable } from "dexie";
import type {
  BookLog, BookPlan, LibraryCacheEntry, LinkOut, MemoryPlan, PassageCard, ReadingDay, ReadingPlan,
  ReviewLog, Settings, Streak, UserNote, VerseCard,
} from "@/db/types";

export const DB_NAME = "scripture-memory-reading";

export class AbideDB extends Dexie {
  plans!: EntityTable<MemoryPlan, "id">;
  verseCards!: EntityTable<VerseCard, "id">;
  passageCards!: EntityTable<PassageCard, "id">;
  reviewLogs!: EntityTable<ReviewLog, "id">;
  readingPlans!: EntityTable<ReadingPlan, "id">;
  readingDays!: EntityTable<ReadingDay, "id">;
  bookPlans!: EntityTable<BookPlan, "id">;
  bookLogs!: EntityTable<BookLog, "id">;
  userNotes!: EntityTable<UserNote, "id">;
  linkOuts!: EntityTable<LinkOut, "id">;
  settings!: EntityTable<Settings, "id">;
  streak!: EntityTable<Streak, "id">;
  libraryCache!: EntityTable<LibraryCacheEntry, "id">;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      plans: "id, status, updatedAt",
      verseCards: "id, planId, due, key, [planId+key]",
      passageCards: "id, planId, due",
      reviewLogs: "id, cardId, at",
      readingPlans: "id, updatedAt",
      readingDays: "id, planId, date, dayIndex, [planId+dayIndex]",
      bookPlans: "id, status",
      bookLogs: "id, bookId, date",
      userNotes: "id, bookId, *verseKeys, updatedAt",
      linkOuts: "id, *verseKeys, updatedAt",
      settings: "id",
      streak: "id",
      libraryCache: "id, packId",
    });
  }
}

export const db = new AbideDB();

/** Every table name, in a stable order. */
export const TABLE_NAMES = [
  "plans", "verseCards", "passageCards", "reviewLogs", "readingPlans", "readingDays", "bookPlans",
  "bookLogs", "userNotes", "linkOuts", "settings", "streak", "libraryCache",
] as const;
export type TableName = (typeof TABLE_NAMES)[number];
