"use client";

import { useState } from "react";
import { ChipGroup, cx, Icon, Sheet, useToast } from "@/components/ui";
import type { BookPlan } from "@/db/types";
import { CLASSICS, type ClassicInfo } from "../../../content/classics";
import { createBookPlan } from "@/lib/booksStore";
import { DOWNLOAD_FAILED, loadClassicText, parseClassic } from "@/lib/classics";
import { addDays, type ISODate } from "@/lib/isoDate";

export interface AddClassicSheetProps {
  open: boolean;
  onClose: () => void;
  today: ISODate;
  graceWeekday: number | null;
  existing: BookPlan[];
  onCreated?: (plan: BookPlan) => void;
}

const SPANS: { value: string; label: string; days: number }[] = [
  { value: "28", label: "4 weeks", days: 27 },
  { value: "56", label: "8 weeks", days: 55 },
  { value: "91", label: "3 months", days: 90 },
  { value: "182", label: "6 months", days: 181 },
];

/** Download a bundled classic, split it into sections and add it to the Books track. */
export function AddClassicSheet({ open, onClose, today, graceWeekday, existing, onCreated }: AddClassicSheetProps) {
  const toast = useToast();
  const [span, setSpan] = useState("56");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const add = async (c: ClassicInfo) => {
    setBusy(c.id);
    setFailed(null);
    let text: string;
    try {
      text = await loadClassicText(c);
    } catch {
      setFailed(c.id);
      setBusy(null);
      return;
    }
    try {
      const content = parseClassic(c, text);
      const days = SPANS.find((s) => s.value === span)?.days ?? 55;
      const plan =
        content.kind === "dated"
          ? await createBookPlan(
              {
                title: c.title, author: c.author, edition: c.edition, unit: "sections", total: 366,
                startDate: today, targetDate: addDays(today, 365), classicId: c.id, dateLocked: true,
              },
              graceWeekday,
            )
          : await createBookPlan(
              {
                title: c.title, author: c.author, edition: c.edition, unit: "sections",
                total: Math.max(1, content.sections.length), startDate: today, targetDate: addDays(today, days), classicId: c.id,
              },
              graceWeekday,
            );
      toast(`Added ${c.title}.`, { tone: "success" });
      onCreated?.(plan);
      onClose();
    } catch {
      toast("Couldn't add this book.", { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add a classic">
      <div className="flex flex-col gap-4">
        <p className="text-muted">Public-domain texts are downloaded once and kept on this device.</p>
        <ChipGroup
          label="Finish in"
          showLabel
          single
          options={SPANS.map((s) => ({ value: s.value, label: s.label }))}
          selected={[span]}
          onChange={(sel) => {
            if (sel[0]) setSpan(sel[0]);
          }}
        />
        <ul className="flex flex-col gap-2">
          {CLASSICS.map((c) => {
            const added = existing.some((b) => b.classicId === c.id && b.status !== "finished");
            return (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={added || busy !== null}
                  onClick={() => void add(c)}
                  className={cx("bordered flex min-h-16 w-full items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left", "disabled:opacity-60")}
                >
                  <Icon name={added ? "check" : "download"} size={24} />
                  <span className="flex flex-1 flex-col">
                    <span className="font-bold">{c.title}</span>
                    <span className="text-[15px] text-muted">
                      {c.author} · {c.edition}
                      {c.dateLocked ? " · today's entries only" : ""}
                    </span>
                    {busy === c.id ? <span className="text-[15px] font-semibold">Downloading…</span> : null}
                    {added ? <span className="text-[15px] font-semibold">Added</span> : null}
                  </span>
                </button>
                {failed === c.id ? (
                  <p role="alert" className="mt-1 flex items-center gap-2 font-semibold text-danger">
                    <Icon name="cross" size={18} />
                    {DOWNLOAD_FAILED}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
