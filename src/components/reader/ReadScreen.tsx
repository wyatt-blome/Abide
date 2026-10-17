"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionBar, Button, Card, cx, Icon, PageHeader, type IconName } from "@/components/ui";
import { db } from "@/db/db";
import { paceLabel, pickCurrentPlan, planStats } from "@/lib/readingPlanStore";
import { formatPercentRead } from "@/lib/progress";
import { formatDate, formatDateLong } from "./format";
import { useBibleMeta, useToday } from "./hooks";
import { linkButtonClass } from "./linkButton";
import { ListenButton } from "./ListenButton";
import { PlanSettingsSheet } from "./PlanSettingsSheet";
import { PlanSetup } from "./PlanSetup";
import { entriesOf, NowPlaying, portionReaderHref, TodayReading, todaysDays, usePortionsListen } from "./TodayReading";

const linkRow = "bordered tap flex min-h-14 items-center gap-3 rounded-xl bg-surface px-4 font-bold";

function NavLink({ href, icon, children }: { href: string; icon: IconName; children: string }) {
  return (
    <Link href={href} className={linkRow}>
      <Icon name={icon} size={24} />
      <span className="flex-1">{children}</span>
      <Icon name="chevronRight" size={22} className="text-muted" />
    </Link>
  );
}

export function ReadScreen() {
  const today = useToday();
  const meta = useBibleMeta();
  const plans = useLiveQuery(() => db.readingPlans.toArray(), []);
  const plan = pickCurrentPlan(plans);
  const days = useLiveQuery(async () => (plan ? db.readingDays.where("planId").equals(plan.id).toArray() : []), [plan?.id]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const todays = useMemo(() => (plan && days && today ? todaysDays(plan, days, today) : []), [plan, days, today]);
  const entries = useMemo(() => entriesOf(todays), [todays]);
  const listen = usePortionsListen(entries, plan?.translation ?? "BSB", "Today's reading");

  if (plans === undefined || today === null || (plan && days === undefined)) {
    return (
      <>
        <PageHeader title="Read" />
        <p className="my-6 text-muted">Loading…</p>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <PlanSetup today={today} />
        <div className="mt-6 flex flex-col gap-2">
          <NavLink href="/read/reader" icon="book">
            Browse the Bible
          </NavLink>
          <NavLink href="/read/books" icon="library">
            Books
          </NavLink>
        </div>
      </>
    );
  }

  const allDays = days ?? [];
  const stats = planStats(plan, allDays, today);
  const firstUnread = entries.find((e) => !e.portion.done) ?? entries[0];

  return (
    <>
      <PageHeader title="Read" />
      <div className="flex flex-col gap-4">
        <Card title={`Today · ${formatDate(today)}`}>
          <TodayReading plan={plan} days={allDays} today={today} meta={meta.data} listen={listen} />
          <div className="mt-3">
            <NowPlaying listen={listen} />
          </div>
        </Card>

        <Card title="Progress">
          <div
            role="progressbar"
            aria-label="Plan read"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stats.percent}
            className="bordered h-4 w-full overflow-hidden rounded-full bg-bg"
          >
            <div className="h-full bg-accent" style={{ width: `${stats.percent}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            <dt className="text-muted">Read</dt>
            <dd className="font-bold">
              {formatPercentRead(stats.doneVerses, stats.totalVerses)} of verses
            </dd>
            <dt className="text-muted">Days complete</dt>
            <dd className="font-bold">
              {stats.completeDays} of {stats.planDays}
            </dd>
            <dt className="text-muted">Pace</dt>
            <dd className={cx("flex items-center gap-1 font-bold", stats.net < 0 ? "text-danger" : stats.net > 0 ? "text-success" : "")}>
              <Icon name={stats.net < 0 ? "cross" : "check"} size={18} />
              {paceLabel(stats.net)}
            </dd>
            <dt className="text-muted">{stats.behindDays > 0 ? "Finish at this pace" : "Finish"}</dt>
            <dd className="font-bold">{stats.projectedFinish ? formatDateLong(stats.projectedFinish) : "—"}</dd>
          </dl>
        </Card>

        <div className="flex flex-col gap-2">
          <NavLink href="/read/days" icon="calendar">
            All days
          </NavLink>
          <NavLink href="/read/books" icon="library">
            Books
          </NavLink>
          <NavLink href="/read/reader" icon="book">
            Browse the Bible
          </NavLink>
          <button type="button" className={cx(linkRow, "text-left")} onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={24} />
            <span className="flex-1">Plan settings</span>
            <Icon name="chevronRight" size={22} className="text-muted" />
          </button>
        </div>
      </div>

      <ActionBar label="Today's reading">
        <ListenButton speech={listen.speech} onListen={listen.listen} busy={listen.busy} disabled={!entries.length} size="lg" />
        {firstUnread ? (
          <Link
            href={portionReaderHref(firstUnread.dayId, firstUnread.index)}
            className={linkButtonClass("primary", "lg")}
          >
            <Icon name="book" size={26} />
            Read today
          </Link>
        ) : (
          <Button size="lg" icon="book" onClick={() => undefined} disabled>
            Read today
          </Button>
        )}
      </ActionBar>

      <PlanSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} plan={plan} />
    </>
  );
}
