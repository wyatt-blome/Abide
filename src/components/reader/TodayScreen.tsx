"use client";

// Today: memory review, Bible reading, book reading, streak, backup nudge.

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import { ActionBar, Card, cx, Icon, PageHeader } from "@/components/ui";
import { db } from "@/db/db";
import { introduceDueChunks } from "@/db/repo";
import { DAY_MS, type ISODate } from "@/lib/isoDate";
import { buildQueue, formatSummary } from "@/lib/queue";
import { pickCurrentPlan } from "@/lib/readingPlanStore";
import { displayStreak, emptyStreak, weekDots, type WeekDot } from "@/lib/streak";
import { BookTodayCard } from "./BookTodayCard";
import { formatDateLong, WEEKDAYS } from "./format";
import { useBibleMeta, useToday } from "./hooks";
import { linkButtonClass } from "./linkButton";
import { TodayReading } from "./TodayReading";

const BACKUP_NUDGE_DAYS = 14;

/** Today's memory queue (null while loading) and whether any plan is not paused. */
function useTodayQueue(now: number) {
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const verseCards = useLiveQuery(() => db.verseCards.toArray(), []);
  const passageCards = useLiveQuery(() => db.passageCards.toArray(), []);
  const queue = useMemo(
    () => (plans && verseCards && passageCards ? buildQueue({ plans, verseCards, passageCards, now }) : null),
    [plans, verseCards, passageCards, now],
  );
  return { queue, hasPlans: !!plans?.some((p) => p.status !== "paused") };
}

function MemoryCard({ queue, hasPlans }: ReturnType<typeof useTodayQueue>) {
  const empty = queue ? queue.items.length === 0 : false;

  return (
    <Card title="Memory review">
      {!queue ? <p className="text-muted">Loading…</p> : null}
      {queue && !hasPlans ? (
        <p className="mb-3">No verses to review yet.</p>
      ) : queue && empty ? (
        <p className="mb-3 flex items-center gap-2 font-semibold text-success">
          <Icon name="check" size={20} />
          All caught up today.
        </p>
      ) : queue ? (
        <p className="mb-3 text-[19px] font-bold">{formatSummary(queue.summary)}</p>
      ) : null}
      {queue?.summary.newPaused ? <p className="mb-3 text-[15px] text-muted">New verses are on hold until reviews are under 40.</p> : null}
      <div className="flex flex-col gap-2">
        {queue && !hasPlans ? (
          <Link href="/memorize" className={linkButtonClass("secondary")}>
            <Icon name="plus" size={22} />
            Pick verses to memorize
          </Link>
        ) : (
          <Link href="/hands-free?source=queue" className={linkButtonClass("secondary", "md", empty ? "opacity-60" : undefined)}>
            <Icon name="car" size={22} />
            Hands-Free
          </Link>
        )}
        <Link href="/progress" className="tap inline-flex items-center gap-2 self-start rounded-xl font-semibold underline">
          <Icon name="chart" size={20} />
          Progress
        </Link>
      </div>
    </Card>
  );
}

function BibleCard({ today }: { today: ISODate }) {
  const meta = useBibleMeta();
  const plans = useLiveQuery(() => db.readingPlans.toArray(), []);
  const plan = pickCurrentPlan(plans);
  const days = useLiveQuery(async () => (plan ? db.readingDays.where("planId").equals(plan.id).toArray() : []), [plan?.id]);
  return (
    <Card title="Bible reading">
      {plans === undefined || (plan && days === undefined) ? <p className="text-muted">Loading…</p> : null}
      {plans && !plan ? (
        <>
          <p className="mb-3">Read the whole Bible in a year, 6 days a week.</p>
          <Link href="/read" className={linkButtonClass("secondary")}>
            <Icon name="book" size={22} />
            Start a reading plan
          </Link>
        </>
      ) : null}
      {plan && days ? <TodayReading plan={plan} days={days} today={today} meta={meta.data} showListen /> : null}
    </Card>
  );
}

function BooksCard({ today }: { today: ISODate }) {
  const { settings } = useSettings();
  const books = useLiveQuery(() => db.bookPlans.where("status").equals("active").toArray(), []);
  const logs = useLiveQuery(() => db.bookLogs.where("date").equals(today).toArray(), [today]);
  if (!books || !books.length) return null;
  return (
    <Card title="Book reading">
      <ul className="flex flex-col gap-5">
        {[...books]
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((b) => (
            <li key={b.id}>
              <BookTodayCard plan={b} logs={logs ?? []} today={today} graceWeekday={settings.graceWeekday} showTitle />
            </li>
          ))}
      </ul>
    </Card>
  );
}

const DOT_LABEL: Record<WeekDot["status"], string> = {
  done: "practised",
  missed: "missed",
  grace: "grace day",
  today: "today, not yet",
  future: "coming up",
};

function StreakCard({ today }: { today: ISODate }) {
  const { settings } = useSettings();
  const streak = useLiveQuery(async () => (await db.streak.get("singleton")) ?? emptyStreak(), []);
  if (!streak) return null;
  const current = displayStreak(streak, today, settings.graceWeekday);
  const dots = weekDots(streak, today, settings.graceWeekday);
  return (
    <Card title="Streak">
      <p className="flex items-center gap-2 text-[19px] font-bold">
        <Icon name="flame" size={24} />
        {current} {current === 1 ? "day" : "days"}
        {streak.best > current ? <span className="text-[15px] font-semibold text-muted">· best {streak.best}</span> : null}
      </p>
      <ol className="mt-3 grid grid-cols-7 gap-1" aria-label="This week">
        {dots.map((d) => (
          <li key={d.date} className="flex flex-col items-center gap-1" aria-label={`${WEEKDAYS[d.weekday]}: ${DOT_LABEL[d.status]}`}>
            <span aria-hidden="true" className="text-[13px] font-semibold text-muted">
              {WEEKDAYS[d.weekday].slice(0, 1)}
            </span>
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-bold",
                d.status === "done" && "bg-success text-success-fg",
                d.status === "missed" && "bg-danger text-danger-fg",
                d.status === "grace" && "bordered text-muted",
                d.status === "today" && "[border-width:3px] border-solid border-accent",
                d.status === "future" && "bordered opacity-60",
              )}
            >
              {d.status === "done" ? (
                <Icon name="check" size={20} strokeWidth={3} />
              ) : d.status === "missed" ? (
                <Icon name="cross" size={18} strokeWidth={3} />
              ) : d.status === "grace" ? (
                "–"
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function BackupNudge({ now }: { now: number }) {
  const { settings, ready } = useSettings();
  const firstUse = useLiveQuery(async () => {
    const [plans, reading] = await Promise.all([db.plans.toArray(), db.readingPlans.toArray()]);
    const stamps = [...plans.map((p) => p.createdAt), ...reading.map((p) => p.createdAt)].filter((n) => n > 0);
    return stamps.length ? Math.min(...stamps) : null;
  }, []);
  if (!ready || firstUse === undefined) return null;
  const since = settings.lastBackupAt ?? firstUse;
  if (since === null || now - since < BACKUP_NUDGE_DAYS * DAY_MS) return null;
  const days = Math.floor((now - since) / DAY_MS);
  return (
    <Card title="Backup">
      <p className="mb-3">
        {settings.lastBackupAt ? `Last backup ${days} days ago.` : "You haven't made a backup yet."} Your data lives only on this phone.
      </p>
      <Link href="/settings#backup" className={linkButtonClass("secondary")}>
        <Icon name="download" size={22} />
        Back up now
      </Link>
    </Card>
  );
}

export function TodayScreen() {
  const today = useToday();
  // Taken once per date (reset when the date changes); minute precision is enough for the queue summary.
  const [clock, setClock] = useState(() => ({ day: today, now: today ? Date.now() : 0 }));
  if (clock.day !== today) setClock(() => ({ day: today, now: today ? Date.now() : 0 }));
  const now = clock.now;
  const { queue, hasPlans } = useTodayQueue(now);

  useEffect(() => {
    void introduceDueChunks().catch(() => {});
  }, [today]);

  if (!today) {
    return (
      <>
        <PageHeader title="Today" />
        <p className="my-6 text-muted">Loading…</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Today" />
      <p className="-mt-1 mb-4 text-muted">{formatDateLong(today)}</p>
      <div className="flex flex-col gap-4">
        <MemoryCard queue={queue} hasPlans={hasPlans} />
        <BibleCard today={today} />
        <BooksCard today={today} />
        <StreakCard today={today} />
        <BackupNudge now={now} />
      </div>
      <ActionBar label="Start">
        {queue && queue.items.length === 0 ? (
          // Nothing due: no primary "Start review"; offer Memorize instead.
          <Link href="/memorize" className={linkButtonClass("secondary", "lg")}>
            <Icon name={hasPlans ? "check" : "plus"} size={26} />
            {hasPlans ? "Open Memorize" : "Pick verses to memorize"}
          </Link>
        ) : (
          <Link href="/memorize/practice?queue=today" className={linkButtonClass("primary", "lg")}>
            <Icon name="play" size={26} />
            Start review
          </Link>
        )}
      </ActionBar>
    </>
  );
}
