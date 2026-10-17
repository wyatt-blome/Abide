"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import { ActionBar, Button, EmptyState, Icon, PageHeader } from "@/components/ui";
import { db } from "@/db/db";
import type { BookLog, BookPlan } from "@/db/types";
import { assignmentLabel, percentRead } from "@/lib/booksStore";
import type { ISODate } from "@/lib/isoDate";
import { AddBookSheet } from "./AddBookSheet";
import { AddClassicSheet } from "./AddClassicSheet";
import { bookHref } from "./BookTodayCard";
import { useToday } from "./hooks";

const GROUPS: { status: BookPlan["status"]; label: string }[] = [
  { status: "active", label: "Reading" },
  { status: "paused", label: "Paused" },
  { status: "finished", label: "Finished" },
];

function BookRow({ plan, today, grace, logs }: { plan: BookPlan; today: ISODate; grace: number | null; logs: BookLog[] }) {
  const label = plan.dateLocked ? "Today's entries" : assignmentLabel(plan, today, grace, logs);
  return (
    <li>
      <Link href={bookHref(plan.id)} className="bordered flex min-h-16 items-center gap-3 rounded-xl bg-surface px-3 py-2">
        <Icon name="book" size={24} />
        <span className="flex flex-1 flex-col">
          <span className="font-bold">{plan.title}</span>
          <span className="text-[15px] text-muted">
            {[plan.author, plan.status === "active" ? label : null, `${percentRead(plan)}%`].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Icon name="chevronRight" size={22} className="text-muted" />
      </Link>
    </li>
  );
}

export function BooksScreen() {
  const router = useRouter();
  const { settings } = useSettings();
  const today = useToday();
  const books = useLiveQuery(() => db.bookPlans.toArray(), []);
  const logs = useLiveQuery(() => (today ? db.bookLogs.where("date").equals(today).toArray() : []), [today]);
  const [addOpen, setAddOpen] = useState(false);
  const [classicOpen, setClassicOpen] = useState(false);
  const grace = settings.graceWeekday;

  return (
    <>
      <PageHeader title="Books" backHref="/read" />
      {books === undefined || today === null ? <p className="my-6 text-muted">Loading…</p> : null}
      {books && today && books.length === 0 ? (
        <EmptyState title="No books yet" icon="library">
          Add a book you are reading, or one of the bundled classics. Each book gets a daily amount, 6 days a week.
        </EmptyState>
      ) : null}
      {books && today
        ? GROUPS.map((g) => {
            const list = books.filter((b) => b.status === g.status).sort((a, b) => b.updatedAt - a.updatedAt);
            if (!list.length) return null;
            return (
              <section key={g.status} className="mb-5">
                <h2 className="mb-2 text-[15px] font-bold uppercase tracking-wide text-muted">{g.label}</h2>
                <ul className="flex flex-col gap-2">
                  {list.map((b) => (
                    <BookRow key={b.id} plan={b} today={today} grace={grace} logs={logs ?? []} />
                  ))}
                </ul>
              </section>
            );
          })
        : null}

      <ActionBar label="Add">
        <Button variant="primary" icon="plus" onClick={() => setAddOpen(true)} disabled={!today}>
          Add a book
        </Button>
        <Button icon="download" onClick={() => setClassicOpen(true)} disabled={!today}>
          Add a classic
        </Button>
      </ActionBar>

      {today ? (
        <>
          <AddBookSheet
            open={addOpen}
            onClose={() => setAddOpen(false)}
            today={today}
            graceWeekday={grace}
            onCreated={(p) => router.push(bookHref(p.id))}
          />
          <AddClassicSheet
            open={classicOpen}
            onClose={() => setClassicOpen(false)}
            today={today}
            graceWeekday={grace}
            existing={books ?? []}
            onCreated={(p) => router.push(bookHref(p.id))}
          />
        </>
      ) : null}
    </>
  );
}
