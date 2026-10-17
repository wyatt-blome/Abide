"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AddNoteSheet } from "@/components/library/AddNoteSheet";
import { useSettings } from "@/components/providers/AppProviders";
import { ActionBar, Button, Card, cx, EmptyState, Icon, PageHeader, useToast } from "@/components/ui";
import { db } from "@/db/db";
import { CLASSIC_BY_ID } from "../../../content/classics";
import { proposeTarget, recomputeToTarget } from "@/lib/books-track";
import { bookPaceLabel, bookTodayView, deleteBookPlan, percentRead, UNIT_WORD, unitPosition, updateBookPlan } from "@/lib/booksStore";
import { BookTodayCard, classicHref } from "./BookTodayCard";
import { formatDate, formatDateLong } from "./format";
import { useToday } from "./hooks";
import { linkButtonClass } from "./linkButton";

export function BookScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { settings } = useSettings();
  const today = useToday();
  const id = params.get("id") ?? "";
  const plan = useLiveQuery(async () => (id ? (await db.bookPlans.get(id)) ?? null : null), [id]);
  const logs = useLiveQuery(() => (id ? db.bookLogs.where("bookId").equals(id).toArray() : []), [id]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const grace = settings.graceWeekday;

  if (plan === undefined || logs === undefined || today === null) {
    return (
      <>
        <PageHeader title="Book" backHref="/read/books" />
        <p className="my-6 text-muted">Loading…</p>
      </>
    );
  }
  if (!plan) {
    return (
      <>
        <PageHeader title="Book" backHref="/read/books" />
        <EmptyState title="Book not found" icon="book" />
      </>
    );
  }

  const classic = plan.classicId ? CLASSIC_BY_ID[plan.classicId] : undefined;
  const view = bookTodayView(plan, today, grace, logs);
  const word = UNIT_WORD[plan.unit];
  const pct = percentRead(plan);
  const recent = [...logs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10);
  const proposed = plan.status === "active" && !plan.dateLocked ? proposeTarget(plan, today, grace) : null;
  const recompute = recomputeToTarget(plan, today, grace);

  return (
    <>
      <PageHeader title={plan.title} backHref="/read/books" backLabel="Back to Books" />
      <p className="text-muted">{[plan.author, plan.edition].filter(Boolean).join(" · ")}</p>

      <div className="mt-4 flex flex-col gap-4">
        <Card title="Today">
          <BookTodayCard plan={plan} logs={logs} today={today} graceWeekday={grace} />
        </Card>

        <Card title="Progress">
          <div
            role="progressbar"
            aria-label={`${plan.title} read`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="bordered h-4 w-full overflow-hidden rounded-full bg-bg"
          >
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 font-bold">
            {plan.dateLocked ? `${plan.current} days read` : `${unitPosition(plan.unit, plan.current)} of ${plan.total} ${word.many}`} · {pct}%
          </p>
          {!plan.dateLocked ? (
            <>
              <p className="mt-1">
                Target: {formatDateLong(plan.targetDate)}
                {plan.unitsPerDay ? ` · ${plan.unitsPerDay} ${word.many} a day` : ""}
              </p>
              {plan.status === "active" ? (
                <p
                  className={cx(
                    "mt-1 flex items-center gap-1 font-semibold",
                    view.pace.status === "behind" ? "text-danger" : view.pace.status === "ahead" ? "text-success" : "",
                  )}
                >
                  <Icon name={view.pace.status === "behind" ? "cross" : "check"} size={18} />
                  {bookPaceLabel(view.pace)}
                </p>
              ) : null}
            </>
          ) : null}
          {plan.status === "active" && view.pace.status === "behind" && !plan.dateLocked ? (
            <div className="mt-3 flex flex-col gap-2">
              {plan.unitsPerDay ? (
                <Button
                  icon="refresh"
                  onClick={() => {
                    void updateBookPlan(plan.id, { unitsPerDay: undefined }).then(() =>
                      toast(`Now ${recompute.perDay} ${word.many} a day to finish ${formatDate(plan.targetDate)}.`, { tone: "success" }),
                    );
                  }}
                >
                  Keep {formatDate(plan.targetDate)}: {recompute.perDay} {word.many} a day
                </Button>
              ) : (
                <p className="text-[15px] text-muted">
                  Daily amounts grow to keep the target: now {recompute.perDay} {word.many} a day.
                </p>
              )}
              {proposed && proposed !== plan.targetDate ? (
                <Button
                  icon="calendar"
                  onClick={() => {
                    void updateBookPlan(plan.id, { targetDate: proposed }).then(() => toast(`Target moved to ${formatDate(proposed)}.`));
                  }}
                >
                  Move target to {formatDate(proposed)}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>

        {classic ? (
          <Card title="Text">
            <p>{classic.edition}</p>
            {classic.ocr ? <p className="text-[15px] text-muted">OCR text: may contain scanning errors.</p> : null}
            <a href={classic.sourcePage} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 font-bold underline">
              Source
              <Icon name="external" size={18} />
            </a>
          </Card>
        ) : null}

        <Card title="Recent sessions">
          {recent.length === 0 ? <p className="text-muted">No sessions yet.</p> : null}
          <ul className="flex flex-col gap-1">
            {recent.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span>{formatDate(l.date)}</span>
                <span className="font-semibold">
                  {plan.dateLocked ? "Read" : `${unitPosition(plan.unit, l.from)}${l.to !== l.from ? `–${l.to}` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-2">
          {plan.status === "active" ? (
            <Button icon="pause" onClick={() => void updateBookPlan(plan.id, { status: "paused" })}>
              Pause this book
            </Button>
          ) : (
            <Button icon="play" onClick={() => void updateBookPlan(plan.id, { status: "active" })}>
              {plan.status === "finished" ? "Read again" : "Resume"}
            </Button>
          )}
          {plan.status !== "finished" ? (
            <Button icon="check" onClick={() => void updateBookPlan(plan.id, { status: "finished" })}>
              Mark finished
            </Button>
          ) : null}
          {confirmDelete ? (
            <div role="alert" className="bordered flex flex-col gap-2 rounded-xl p-3">
              <p className="font-semibold">Remove this book and its sessions? Notes stay in My Library.</p>
              <div className="flex gap-2 [&>*]:flex-1">
                <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
                <Button
                  variant="danger"
                  icon="trash"
                  onClick={() => {
                    void deleteBookPlan(plan.id).then(() => router.replace("/read/books"));
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button icon="trash" onClick={() => setConfirmDelete(true)}>
              Remove book
            </Button>
          )}
        </div>
      </div>

      <ActionBar label="Book">
        {classic ? (
          <Link href={classicHref(plan.id)} className={linkButtonClass("primary", "lg")}>
            <Icon name="book" size={26} />
            {plan.dateLocked ? "Today's entries" : "Open text"}
          </Link>
        ) : null}
        <Button size="lg" icon="edit" onClick={() => setNoteOpen(true)}>
          Add a quote or note
        </Button>
      </ActionBar>

      {noteOpen ? <AddNoteSheet open onClose={() => setNoteOpen(false)} bookId={plan.id} page={String(plan.current)} /> : null}
    </>
  );
}
