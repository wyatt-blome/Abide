"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { introduceDueChunks } from "@/db/repo";
import type { MemoryPlan } from "@/db/types";
import { diffDays, todayISO } from "@/lib/isoDate";
import { AD_HOC_ID } from "@/lib/planActions";
import { planProgress } from "@/lib/progress";
import { buildQueue, formatSummary } from "@/lib/queue";
import { formatRange } from "@/lib/refs";
import { ActionBar, Card, EmptyState, Icon, PageHeader } from "@/components/ui";
import { linkButtonClass } from "@/components/memorize/linkButton";

const STATUS_TITLE: Record<MemoryPlan["status"], string> = { active: "Active", paused: "Paused", mastered: "Mastered" };

function startsLabel(startDate: string | undefined, now: number): string | null {
  if (!startDate) return null;
  const d = diffDays(todayISO(now), startDate);
  if (d <= 0) return null;
  if (d === 1) return "Starts tomorrow";
  return `Starts in ${d} days`;
}

export default function MemorizePage() {
  const data = useLiveQuery(async () => {
    const [plans, verseCards, passageCards] = await Promise.all([db.plans.toArray(), db.verseCards.toArray(), db.passageCards.toArray()]);
    plans.sort((a, b) => a.createdAt - b.createdAt);
    return { plans, verseCards, passageCards };
  }, []);

  useEffect(() => {
    void introduceDueChunks().catch(() => {});
  }, []);

  // eslint-disable-next-line react-hooks/purity -- the list is a live snapshot; "now" is read per render on purpose
  const now = Date.now();
  const queue = useMemo(() => (data ? buildQueue({ ...data, now }) : null), [data, now]);

  const groups = useMemo(() => {
    const g: Record<MemoryPlan["status"], MemoryPlan[]> = { active: [], paused: [], mastered: [] };
    for (const p of data?.plans ?? []) g[p.status].push(p);
    return g;
  }, [data]);

  const dueCount = queue ? queue.summary.reviews + queue.summary.passageRuns + queue.summary.newChunks : 0;

  return (
    <>
      <PageHeader
        title="Memorize"
        trailing={
          <Link href="/progress" className={linkButtonClass("ghost")}>
            <Icon name="chart" /> Progress
          </Link>
        }
      />

      {!data ? <p role="status">Loading…</p> : null}

      {data && queue ? (
        <Card title="Today" className="mb-4">
          <p className="text-[19px] font-bold">{formatSummary(queue.summary)}</p>
          {queue.summary.newPaused ? (
            <p className="mt-1 font-semibold">New verses are on hold until fewer than 40 reviews are due.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/hands-free?source=queue" className={linkButtonClass("secondary")}>
              <Icon name="car" /> Hands-Free
            </Link>
          </div>
        </Card>
      ) : null}

      {data && !data.plans.length ? (
        <EmptyState
          title="No memory plans yet"
          icon="cards"
          action={
            <Link href="/memorize/new" className={linkButtonClass("primary", "md", "w-full")}>
              <Icon name="plus" /> New plan
            </Link>
          }
        >
          Pick a starter passage or choose your own.
        </EmptyState>
      ) : null}

      {(["active", "paused", "mastered"] as const).map((status) =>
        groups[status].length ? (
          <section key={status} className="mb-5" aria-labelledby={`plans-${status}`}>
            <h2 id={`plans-${status}`} className="mb-2 text-[15px] font-bold uppercase tracking-wide text-muted">
              {STATUS_TITLE[status]}
            </h2>
            <ul className="flex flex-col gap-3">
              {groups[status].map((p) => (
                <PlanRow key={p.id} plan={p} data={data!} now={now} />
              ))}
            </ul>
          </section>
        ) : null,
      )}

      <ActionBar label="Memorize actions">
        <Link href="/memorize/new" className={linkButtonClass("secondary")}>
          <Icon name="plus" /> New plan
        </Link>
        <Link href="/memorize/practice?queue=today" className={linkButtonClass("primary")} aria-label={`Practice today, ${dueCount} items`}>
          <Icon name="play" /> Practice{dueCount ? ` (${dueCount})` : ""}
        </Link>
      </ActionBar>
    </>
  );
}

function PlanRow({ plan, data, now }: { plan: MemoryPlan; data: { verseCards: import("@/db/types").VerseCard[]; passageCards: import("@/db/types").PassageCard[] }; now: number }) {
  const prog = planProgress(plan, data.verseCards, data.passageCards, now);
  const pct = prog.total ? Math.round((prog.known / prog.total) * 100) : 0;
  const starts = plan.status === "active" ? startsLabel(plan.startDate, now) : null;
  return (
    <li>
      <Link
        href={`/memorize/plan?id=${plan.id}`}
        className="bordered flex min-h-16 flex-col gap-1 rounded-2xl bg-surface p-4 text-fg no-underline active:brightness-95"
      >
        <span className="flex items-center gap-2">
          <span className="flex-1 text-[19px] font-bold">{plan.title}</span>
          {plan.status === "mastered" ? <Icon name="check" className="text-success" label="Mastered" /> : null}
          {plan.status === "paused" ? <Icon name="pause" label="Paused" /> : null}
          <Icon name="chevronRight" />
        </span>
        {plan.starterId !== AD_HOC_ID ? <span className="text-muted">{formatRange(plan.range)}</span> : null}
        <span className="mt-1 flex items-center gap-2">
          <span aria-hidden="true" className="h-3 flex-1 overflow-hidden rounded-full bg-surface-strong">
            <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-[15px] font-semibold tabular-nums">
            {prog.known}/{prog.total} known
          </span>
        </span>
        <span className="text-[15px] text-muted">
          {[
            prog.dueToday ? `${prog.dueToday} due today` : "Nothing due today",
            `chunk ${Math.min(plan.chunksIntroduced, plan.chunks.length)} of ${plan.chunks.length}`,
            starts,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </Link>
    </li>
  );
}
