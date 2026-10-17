"use client";

// Backup: export (share sheet or download), import (preview → merge or replace), clear all data.

import { useId, useState } from "react";
import { clearAllData } from "@/db/repo";
import {
  backupFilename, backupToJson, exportBackup, importBackup, parseBackup, previewBackup, type BackupFile, type BackupTable,
} from "@/lib/backup";
import { useSettings } from "@/components/providers/AppProviders";
import { Button, Sheet, useToast } from "@/components/ui";
import { FieldError } from "@/components/library/fields";
import { downloadBlob } from "./RemindersSection";
import { SettingsBlock } from "./SettingsBlock";

export const TABLE_LABELS: Record<BackupTable, string> = {
  plans: "Memory plans",
  verseCards: "Verse cards",
  passageCards: "Passage cards",
  reviewLogs: "Review history",
  readingPlans: "Reading plans",
  readingDays: "Reading days",
  bookPlans: "Books",
  bookLogs: "Book reading log",
  userNotes: "Quotes and notes",
  linkOuts: "Saved links",
  settings: "Settings",
  streak: "Streak",
};

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function BackupSection() {
  const toast = useToast();
  const { settings, update } = useSettings();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; backup: BackupFile } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const at = Date.now();
      const backup = await exportBackup(at, { stampLastBackup: true });
      const json = backupToJson(backup);
      const name = backupFilename();
      const blob = new Blob([json], { type: "application/json" });
      const file = typeof File !== "undefined" ? new File([blob], name, { type: "application/json" }) : null;
      let shared = false;
      if (file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          shared = true;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      if (!shared) downloadBlob(blob, name);
      await update({ lastBackupAt: at });
      toast("Backup saved", { tone: "success" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Backup failed.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    setPending(null);
    if (!file) return;
    const r = parseBackup(await file.text());
    if (!r.ok) setError(`That file is not a backup: ${r.error.slice(0, 120)}`);
    else setPending({ name: file.name, backup: r.backup });
  };

  const doImport = async (mode: "replace" | "merge") => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await importBackup(pending.backup, mode);
      const n = Object.values(res.written).reduce((a, b) => a + b, 0);
      toast(mode === "replace" ? `Replaced with ${n} records` : `Merged ${n} newer records`, { tone: "success" });
      setPending(null);
      setConfirmReplace(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const counts = pending ? previewBackup(pending.backup) : null;

  return (
    <SettingsBlock title="Backup" id="backup">
      <p>{settings.lastBackupAt ? `Last backup: ${formatWhen(settings.lastBackupAt)}` : "No backup made yet."}</p>
      <Button variant="primary" icon="download" disabled={busy} onClick={doExport}>
        Export backup
      </Button>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className="bordered tap inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-surface px-4 font-semibold"
        >
          Import a backup file
        </label>
        <input
          id={inputId}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </div>

      {pending && counts ? (
        <div className="bordered flex flex-col gap-3 rounded-xl p-3">
          <p className="font-bold">{pending.name}</p>
          <p className="text-[15px]">{`Made ${formatWhen(pending.backup.exportedAt)}`}</p>
          <table className="w-full text-[15px]">
            <tbody>
              {(Object.keys(counts) as BackupTable[]).map((t) => (
                <tr key={t}>
                  <th scope="row" className="py-1 text-left font-semibold">
                    {TABLE_LABELS[t]}
                  </th>
                  <td className="py-1 text-right tabular-nums">{counts[t]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="primary" disabled={busy} onClick={() => doImport("merge")}>
            Merge (keep the newer copy of each item)
          </Button>
          {confirmReplace ? (
            <Button variant="danger" disabled={busy} onClick={() => doImport("replace")}>
              Yes, replace everything on this device
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => setConfirmReplace(true)}>
              Replace everything with this backup
            </Button>
          )}
          <Button variant="ghost" icon="close" onClick={() => setPending(null)}>
            Cancel import
          </Button>
        </div>
      ) : null}

      <Button variant="danger" icon="trash" onClick={() => setConfirmClear(true)}>
        Clear all data
      </Button>
      <Sheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all data?"
        footer={
          <>
            <Button icon="close" onClick={() => setConfirmClear(false)}>
              Keep my data
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={async () => {
                await clearAllData();
                window.location.reload();
              }}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <p>Plans, progress, notes, links and settings on this device will be deleted. Export a backup first if you may want them.</p>
      </Sheet>
    </SettingsBlock>
  );
}
