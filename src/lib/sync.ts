// Sync seam for later (e.g. a user's own cloud folder or a small server). Today everything lives
// on the device; NoopSyncAdapter does nothing and says so. A real adapter would push/pull the
// backup tables (lib/backup.ts) and merge by updatedAt exactly as importBackup("merge") does.

export type SyncState = "disabled" | "idle" | "syncing" | "error";

export interface SyncStatus {
  state: SyncState;
  /** ms timestamp of the last successful push or pull. */
  lastSyncedAt?: number;
  message?: string;
}

export interface SyncResult {
  ok: boolean;
  /** Records written locally (pull) or sent (push). */
  records: number;
  message?: string;
}

export interface SyncAdapter {
  readonly id: string;
  push(): Promise<SyncResult>;
  pull(): Promise<SyncResult>;
  status(): SyncStatus;
}

export class NoopSyncAdapter implements SyncAdapter {
  readonly id = "noop";
  async push(): Promise<SyncResult> {
    return { ok: false, records: 0, message: "Sync is not set up. Data stays on this device." };
  }
  async pull(): Promise<SyncResult> {
    return { ok: false, records: 0, message: "Sync is not set up. Data stays on this device." };
  }
  status(): SyncStatus {
    return { state: "disabled", message: "Sync is not set up. Data stays on this device." };
  }
}

export const syncAdapter: SyncAdapter = new NoopSyncAdapter();
