"use client";

import Link from "next/link";
import { useState } from "react";
import { AddNoteSheet } from "@/components/library/AddNoteSheet";
import { Button, haptic, Icon, Stepper, useToast } from "@/components/ui";
import type { BookLog, BookPlan } from "@/db/types";
import { bookPaceLabel, bookTodayView, logProgress, markDatedRead, UNIT_WORD, unitPosition } from "@/lib/booksStore";
import { weekdayOf, type ISODate } from "@/lib/isoDate";
import { CheckBox } from "./CheckBox";
import { formatDate } from "./format";
import { linkButtonClass } from "./linkButton";

export interface BookTodayCardProps {
  plan: BookPlan;
  logs: BookLog[];
  today: ISODate;
  graceWeekday: number | null;
  /** Show the book's title (Today page). */
  showTitle?: boolean;
}

export const bookHref = (id: string): string => `/read/book?id=${encodeURIComponent(id)}`;
export const classicHref = (id: string, section?: number): string =>
  `/read/classic?id=${encodeURIComponent(id)}${section !== undefined ? `&s=${section}` : ""}`;

/** Today's assignment, quick "Read to p. N", a Stepper to log, then "Add a quote or note?". */
export function BookTodayCard({ plan, logs, today, graceWeekday, showTitle }: BookTodayCardProps) {
  const toast = useToast();
  const view = bookTodayView(plan, today, graceWeekday, logs);
  const [value, setValue] = useState(plan.current);
  const [seen, setSeen] = useState(plan.current);
  if (seen !== plan.current) {
    setSeen(plan.current);
    setValue(plan.current);
  }
  const [prompt, setPrompt] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const word = UNIT_WORD[plan.unit];

  const log = async (n: number) => {
    try {
      const { plan: saved } = await logProgress(plan.id, n, today);
      haptic("success");
      setPrompt(String(saved.current));
      if (saved.status === "finished") toast(`Finished ${plan.title}.`, { tone: "success" });
    } catch {
      toast("Couldn't save.", { tone: "error" });
    }
  };

  const title = showTitle ? (
    <Link href={bookHref(plan.id)} className="tap -mx-1 flex flex-col justify-center rounded-xl px-1">
      <span className="text-[19px] font-bold">{plan.title}</span>
      {plan.author ? <span className="text-[15px] text-muted">{plan.author}</span> : null}
    </Link>
  ) : null;

  if (plan.dateLocked) {
    const readToday = logs.some((l) => l.bookId === plan.id && l.date === today);
    return (
      <div className="flex flex-col gap-2">
        {title}
        <p className="font-semibold">Today&apos;s morning and evening entries</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={classicHref(plan.id)} className={linkButtonClass("secondary", "md", "flex-1")}>
            <Icon name="book" size={22} />
            Open
          </Link>
          <CheckBox checked={readToday} onChange={(c) => void markDatedRead(plan.id, today, c)} label="Read today" showLabel />
        </div>
      </div>
    );
  }

  const a = view.assignment;
  const isGrace = graceWeekday !== null && weekdayOf(today) === graceWeekday;
  let status: string;
  if (plan.status === "finished") status = "Finished";
  else if (plan.status === "paused") status = "Paused";
  else if (view.label) status = view.label;
  else if (today < plan.startDate) status = `Starts ${formatDate(plan.startDate)}`;
  else if (isGrace) status = "Grace day: nothing assigned.";
  else status = "Nothing assigned today.";

  return (
    <div className="flex flex-col gap-3">
      {title}
      <div>
        <p className="text-[19px] font-bold">{status}</p>
        {a && plan.status === "active" ? (
          <p className={a.done ? "flex items-center gap-1 font-semibold text-success" : "text-[15px] text-muted"}>
            {a.done ? <Icon name="check" size={18} /> : null}
            {a.done ? "Today's reading is done." : `${bookPaceLabel(view.pace)} · now at ${unitPosition(plan.unit, plan.current)}`}
          </p>
        ) : null}
      </div>
      {plan.classicId ? (
        <Link href={classicHref(plan.id)} className={linkButtonClass("secondary", "md")}>
          <Icon name="book" size={22} />
          Open text
        </Link>
      ) : null}
      {a && !a.done && plan.status === "active" ? (
        <Button variant="primary" icon="check" onClick={() => void log(a.to)}>
          Read to {unitPosition(plan.unit, a.to)}
        </Button>
      ) : null}
      {plan.status !== "finished" || value !== plan.current ? (
        <div className="flex flex-wrap items-end gap-3">
          <Stepper
            label={`Read through ${word.one}`}
            value={value}
            min={0}
            max={plan.total}
            onChange={setValue}
            format={(v) => `${v} / ${plan.total}`}
          />
          {value !== plan.current ? (
            <Button icon="check" onClick={() => void log(value)}>
              Save
            </Button>
          ) : null}
        </div>
      ) : null}
      {prompt !== null ? (
        <div role="status" className="bordered flex flex-col gap-2 rounded-xl bg-bg p-3">
          <p className="font-semibold">Saved. Add a quote or note?</p>
          <div className="flex gap-2 [&>*]:flex-1">
            <Button variant="primary" icon="edit" onClick={() => setNoteOpen(true)}>
              Add
            </Button>
            <Button onClick={() => setPrompt(null)}>Not now</Button>
          </div>
        </div>
      ) : null}
      {noteOpen ? (
        <AddNoteSheet
          open
          onClose={() => {
            setNoteOpen(false);
            setPrompt(null);
          }}
          bookId={plan.id}
          page={prompt ?? String(plan.current)}
        />
      ) : null}
    </div>
  );
}
