"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { getStreak } from "@/db/repo";
import type { VerseKey } from "@/db/types";
import { loadMeta } from "@/lib/bible";
import { todayISO } from "@/lib/isoDate";
import { rangeKeys, type BibleMeta } from "@/lib/meta";
import { classifyCard, forecastDue, formatPercentRead, isKnown, isPlanMastered } from "@/lib/progress";
import { displayStreak, weekDots, type DotStatus } from "@/lib/streak";
import { useSettings } from "@/components/providers/AppProviders";
import { Card, Icon, PageHeader } from "@/components/ui";
import { ForecastChart } from "@/components/memorize/ForecastChart";
import { Heatmap, HeatmapLegend, planHeatCells } from "@/components/memorize/Heatmap";
import { useNow } from "@/components/memorize/useNow";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOT: Record<DotStatus, { symbol: string; label: string }> = {
  done: { symbol: "●", label: "practised" },
  missed: { symbol: "○", label: "missed" },
  grace: { symbol: "◇", label: "grace day" },
  today: { symbol: "◎", label: "today, not yet" },
  future: { symbol: "·", label: "coming" },
};

export default function ProgressPage() {
  const { settings } = useSettings();
  const now = useNow();
  const [meta, setMeta] = useState<BibleMeta | null>(null);
  const data = useLiveQuery(async () => {
    const [plans, verseCards, passageCards, streak, readingDays, bookPlans] = await Promise.all([
      db.plans.toArray(), db.verseCards.toArray(), db.passageCards.toArray(), getStreak(), db.readingDays.toArray(), db.bookPlans.toArray(),
    ]);
    const ids = [...verseCards, ...passageCards].map((c) => c.id);
    const logs = ids.length ? await db.reviewLogs.where("cardId").anyOf(ids).toArray() : [];
    plans.sort((a, b) => a.createdAt - b.createdAt);
    return { plans, verseCards, passageCards, streak, readingDays, bookPlans, logs };
  }, []);

  useEffect(() => {
    let alive = true;
    loadMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!data || !now) return null;
    const known = new Set<VerseKey>();
    for (const c of data.verseCards) if (isKnown(classifyCard(c))) known.add(c.key);
    const mastered = data.plans.filter((p) =>
      isPlanMastered({
        plan: p,
        verseCards: data.verseCards.filter((c) => c.planId === p.id),
        passageCard: data.passageCards.find((c) => c.planId === p.id),
        logs: data.logs,
      }),
    ).length;
    const active = new Set(data.plans.filter((p) => p.status !== "paused").map((p) => p.id));
    const forecast = forecastDue(
      [...data.verseCards, ...data.passageCards].filter((c) => active.has(c.planId)),
      now,
      30,
    );
    let read: number | null = null;
    if (meta) {
      const keys = new Set<VerseKey>();
      for (const d of data.readingDays) for (const p of d.portions) if (p.done) for (const k of rangeKeys(meta, p.range, { skipEmpty: true })) keys.add(k);
      read = keys.size;
    }
    const today = todayISO(now);
    return {
      known: known.size,
      mastered,
      forecast,
      read,
      readable: meta ? meta.totalVerses - meta.emptyVerses.BSB.length : 31086,
      booksFinished: data.bookPlans.filter((b) => b.status === "finished").length,
      streakNow: displayStreak(data.streak, today, settings.graceWeekday),
      dots: weekDots(data.streak, today, settings.graceWeekday),
    };
  }, [data, meta, now, settings.graceWeekday]);

  return (
    <>
      <PageHeader title="Progress" backHref="/memorize" />
      {!data || !stats ? (
        <p role="status">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Card title="Streak">
            <p className="flex items-center gap-2 text-[22px] font-bold">
              <Icon name="flame" size={28} />
              {stats.streakNow} day{stats.streakNow === 1 ? "" : "s"}
              <span className="text-[16px] font-semibold text-muted">· best {data.streak.best}</span>
            </p>
            <ol className="mt-3 grid grid-cols-7 gap-1 text-center" aria-label="This week">
              {stats.dots.map((d) => (
                <li key={d.date} className="flex flex-col items-center">
                  <span className="text-[13px] text-muted" aria-hidden="true">
                    {WEEKDAY[d.weekday]}
                  </span>
                  <span aria-hidden="true" className={d.status === "done" ? "text-[24px] text-accent" : "text-[24px] text-muted"}>
                    {DOT[d.status].symbol}
                  </span>
                  <span className="sr-only">{`${WEEKDAY[d.weekday]}: ${DOT[d.status].label}`}</span>
                </li>
              ))}
            </ol>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Verses known" value={String(stats.known)} />
            <Stat label="Passages mastered" value={String(stats.mastered)} />
            <Stat
              label="Bible read"
              value={stats.read === null ? "…" : formatPercentRead(stats.read, stats.readable)}
              sub={stats.read === null ? undefined : `${stats.read.toLocaleString()} of ${stats.readable.toLocaleString()} verses`}
            />
            <Stat label="Books finished" value={String(stats.booksFinished)} />
          </div>

          <Card title="Due in the next 30 days">
            <ForecastChart days={stats.forecast} />
          </Card>

          {data.plans.length ? (
            <section aria-labelledby="heatmaps" className="flex flex-col gap-3">
              <h2 id="heatmaps" className="text-[15px] font-bold uppercase tracking-wide text-muted">
                Passages
              </h2>
              {data.plans.map((p) => (
                <Card key={p.id} as="article">
                  <Link href={`/memorize/plan?id=${p.id}`} className="tap mb-2 flex items-center gap-2 font-bold text-fg no-underline">
                    <span className="flex-1 text-[18px]">{p.title}</span>
                    <Icon name="chevronRight" />
                  </Link>
                  <Heatmap cells={planHeatCells(p, data.verseCards, meta)} label={`${p.title}: verse progress`} legend={false} />
                </Card>
              ))}
              <HeatmapLegend includeEmpty />
            </section>
          ) : (
            <p className="text-muted">No memory plans yet.</p>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bordered rounded-2xl bg-surface p-3">
      <p className="text-[14px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-[26px] font-bold tabular-nums">{value}</p>
      {sub ? <p className="text-[13px] text-muted">{sub}</p> : null}
    </div>
  );
}
