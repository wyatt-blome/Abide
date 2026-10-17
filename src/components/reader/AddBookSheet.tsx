"use client";

import { useState, type ReactNode } from "react";
import { Button, ChipGroup, Sheet, useToast } from "@/components/ui";
import type { BookPlan } from "@/db/types";
import { buildBookPlan, createBookPlan, UNIT_WORD } from "@/lib/booksStore";
import { perDayToTarget } from "@/lib/books-track";
import { addDays, isISODate, type ISODate } from "@/lib/isoDate";
import { formatDateLong } from "./format";

export interface AddBookSheetProps {
  open: boolean;
  onClose: () => void;
  today: ISODate;
  graceWeekday: number | null;
  onCreated?: (plan: BookPlan) => void;
}

type PaceMode = "target" | "perDay";
const input = "bordered min-h-14 w-full rounded-xl bg-bg px-3 text-[19px]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      {children}
    </label>
  );
}

/** Eight weeks of reading from a start date (the default target). */
export const defaultTarget = (start: ISODate): ISODate => addDays(start, 55);

export function AddBookSheet({ open, onClose, today, graceWeekday, onCreated }: AddBookSheetProps) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [edition, setEdition] = useState("");
  const [unit, setUnit] = useState<BookPlan["unit"]>("pages");
  const [total, setTotal] = useState("");
  const [current, setCurrent] = useState("");
  const [start, setStart] = useState<ISODate>(today);
  const [mode, setMode] = useState<PaceMode>("target");
  const [target, setTarget] = useState<ISODate>(defaultTarget(today));
  const [perDay, setPerDay] = useState("");
  const [busy, setBusy] = useState(false);

  const totalN = Math.floor(Number(total));
  const currentN = Math.max(0, Math.floor(Number(current) || 0));
  const perDayN = Math.floor(Number(perDay));
  const valid =
    title.trim().length > 0 &&
    totalN >= 1 &&
    currentN < totalN &&
    isISODate(start) &&
    (mode === "target" ? isISODate(target) && target >= start : perDayN >= 1);

  const preview = valid
    ? buildBookPlan(
        {
          title, author, unit, total: totalN, current: currentN, startDate: start,
          targetDate: mode === "target" ? target : undefined,
          unitsPerDay: mode === "perDay" ? perDayN : undefined,
        },
        graceWeekday,
      )
    : null;
  const previewPerDay = preview ? preview.unitsPerDay ?? perDayToTarget(preview, start > today ? start : today, graceWeekday) : 0;

  const reset = () => {
    setTitle("");
    setAuthor("");
    setEdition("");
    setTotal("");
    setCurrent("");
    setPerDay("");
    setBusy(false);
  };

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const plan = await createBookPlan(
        {
          title, author, edition, unit, total: totalN, current: currentN, startDate: start,
          targetDate: mode === "target" ? target : undefined,
          unitsPerDay: mode === "perDay" ? perDayN : undefined,
        },
        graceWeekday,
      );
      toast(`Added ${plan.title}.`, { tone: "success" });
      reset();
      onCreated?.(plan);
      onClose();
    } catch {
      toast("Couldn't save the book.", { tone: "error" });
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a book"
      footer={
        <Button variant="primary" icon="check" disabled={!valid || busy} onClick={() => void save()}>
          Add book
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title">
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Author">
          <input className={input} value={author} onChange={(e) => setAuthor(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Edition (optional)">
          <input className={input} value={edition} onChange={(e) => setEdition(e.target.value)} autoComplete="off" />
        </Field>
        <ChipGroup
          label="Count by"
          showLabel
          single
          options={(["pages", "chapters", "sections"] as const).map((u) => ({ value: u, label: UNIT_WORD[u].many }))}
          selected={[unit]}
          onChange={(sel) => {
            if (sel[0]) setUnit(sel[0] as BookPlan["unit"]);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Total ${UNIT_WORD[unit].many}`}>
            <input className={input} inputMode="numeric" type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} />
          </Field>
          <Field label="Already read">
            <input className={input} inputMode="numeric" type="number" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        </div>
        <Field label="Start">
          <input className={input} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <ChipGroup
          label="Pace"
          showLabel
          single
          options={[
            { value: "target", label: "Finish by a date" },
            { value: "perDay", label: `${UNIT_WORD[unit].many} per day` },
          ]}
          selected={[mode]}
          onChange={(sel) => {
            if (sel[0]) setMode(sel[0] as PaceMode);
          }}
        />
        {mode === "target" ? (
          <Field label="Finish by">
            <input className={input} type="date" value={target} min={start} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        ) : (
          <Field label={`${UNIT_WORD[unit].many} per reading day`}>
            <input className={input} inputMode="numeric" type="number" min={1} value={perDay} onChange={(e) => setPerDay(e.target.value)} />
          </Field>
        )}
        {preview ? (
          <p className="text-muted" role="status">
            About {previewPerDay} {previewPerDay === 1 ? UNIT_WORD[unit].one : UNIT_WORD[unit].many} a day, 6 days a week. Finish{" "}
            {formatDateLong(preview.targetDate)}.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
