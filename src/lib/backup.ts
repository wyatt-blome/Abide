// Backup export/import.
//
// Export: every Dexie table except libraryCache (re-downloadable) →
//   { schemaVersion, exportedAt, appName, tables: { plans: [...], ... } }
// Import (validated with zod): "replace" clears the exported tables first, then writes everything;
// "merge" keeps the newer copy of each record by id: stamp = updatedAt ?? createdAt ?? at ?? 0,
// incoming wins only when strictly newer (ties keep the local copy). Unknown tables are ignored;
// tables missing from the file are left alone in merge mode and emptied in replace mode.

import { z } from "zod";
import { APP_NAME, BACKUP_SCHEMA_VERSION } from "@/config";
import { db, TABLE_NAMES, type TableName } from "@/db/db";
import { todayISO } from "@/lib/isoDate";

export const BACKUP_TABLES = TABLE_NAMES.filter((t) => t !== "libraryCache") as Exclude<TableName, "libraryCache">[];
export type BackupTable = (typeof BACKUP_TABLES)[number];

type Row = { id: string } & Record<string, unknown>;

export interface BackupFile {
  schemaVersion: number;
  exportedAt: number;
  appName: string;
  tables: Partial<Record<BackupTable, Row[]>>;
}

const rowSchema = z.looseObject({ id: z.string().min(1) });

export const backupSchema = z.object({
  schemaVersion: z.number().int().positive().max(BACKUP_SCHEMA_VERSION),
  exportedAt: z.number(),
  appName: z.string(),
  tables: z
    .record(z.string(), z.array(rowSchema))
    .transform((t) => {
      const out: Partial<Record<BackupTable, Row[]>> = {};
      for (const name of BACKUP_TABLES) if (t[name]) out[name] = t[name] as Row[];
      return out;
    }),
});

export const backupFilename = (date: string = todayISO(), appName = APP_NAME): string => `${appName}-backup-${date}.json`;

/**
 * Snapshot every backed-up table. With `stampLastBackup`, the settings row inside the file carries
 * `lastBackupAt = now` (the time of this export), so restoring it does not bring back an older stamp;
 * the caller writes the same stamp to Dexie once the export succeeded.
 */
export async function exportBackup(now = Date.now(), opts: { stampLastBackup?: boolean } = {}): Promise<BackupFile> {
  const tables: Partial<Record<BackupTable, Row[]>> = {};
  await db.transaction("r", BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) tables[t] = (await db.table(t).toArray()) as Row[];
  });
  if (opts.stampLastBackup) tables.settings = (tables.settings ?? []).map((r) => ({ ...r, lastBackupAt: now, updatedAt: now }));
  return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now, appName: APP_NAME, tables };
}

export const backupToJson = (b: BackupFile): string => JSON.stringify(b, null, 2);

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

/** Parse and validate a backup file's text (or already-parsed JSON). */
export function parseBackup(input: string | unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, error: "Not a JSON file." };
    }
  }
  const r = backupSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, backup: r.data };
}

/** Record counts per table, for the import preview. */
export function previewBackup(b: BackupFile): Record<BackupTable, number> {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, b.tables[t]?.length ?? 0])) as Record<BackupTable, number>;
}

/** The comparison stamp used by merge. */
export function recordStamp(r: Record<string, unknown>): number {
  for (const k of ["updatedAt", "createdAt", "at"]) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

/** Pure merge of one table: incoming replaces local only when strictly newer. */
export function mergeRows(local: Row[], incoming: Row[]): Row[] {
  const byId = new Map(local.map((r) => [r.id, r]));
  const changed: Row[] = [];
  for (const r of incoming) {
    const cur = byId.get(r.id);
    if (!cur || recordStamp(r) > recordStamp(cur)) changed.push(r);
  }
  return changed;
}

export interface ImportResult { mode: "replace" | "merge"; written: Record<BackupTable, number> }

export async function importBackup(b: BackupFile, mode: "replace" | "merge"): Promise<ImportResult> {
  const written = Object.fromEntries(BACKUP_TABLES.map((t) => [t, 0])) as Record<BackupTable, number>;
  await db.transaction("rw", BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const table = db.table(t);
      const incoming = b.tables[t] ?? [];
      if (mode === "replace") {
        await table.clear();
        await table.bulkPut(incoming);
        written[t] = incoming.length;
      } else {
        const local = (await table.bulkGet(incoming.map((r) => r.id))).filter(Boolean) as Row[];
        const rows = mergeRows(local, incoming);
        if (rows.length) await table.bulkPut(rows);
        written[t] = rows.length;
      }
    }
  });
  return { mode, written };
}
