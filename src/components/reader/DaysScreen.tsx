"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import { Button, ChipGroup, cx, EmptyState, Icon, PageHeader, Sheet } from "@/components/ui";
import { db } from "@/db/db";
import type { ReadingDay } from "@/db/types";
import { isCatchUpDay, isDayComplete } from "@/lib/missed";
import { pickCurrentPlan, setDayDone, sortDays } from "@/lib/readingPlanStore";
import { formatRange } from "@/lib/refs";
import { formatDate } from "./format";
import { useBibleMeta, useToday } from "./hooks";
import { DayPortions } from "./TodayReading";

type Filter = "upcoming" | "past";

export function DaysScreen() {
  const { settings } = useSettings();
  const today = useToday();
  const meta = useBibleMeta();
  const plans = useLiveQuery(() => db.readingPlans.toArray(), []);
  const plan = pickCurrentPlan(plans);
  const days = useLiveQuery(async () => (plan ? db.readingDays.where("planId").equals(plan.id).toArray() : []), [plan?.id]);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [openId, setOpenId] = useState<string | null>(null);
  const todayRef = useRef<HTMLLIElement>(null);

  const list = useMemo(() => {
    if (!days || !today) return [];
    const sorted = sortDays(days).filter((d) => d.portions.length > 0);
    return filter === "upcoming" ? sorted.filter((d) => d.date >= today) : sorted.filter((d) => d.date < today).reverse();
  }, [days, today, filter]);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: "center" });
  }, [filter, list.length]);

  if (plans === undefined || today === null || (plan && days === undefined)) {
    return (
      <>
        <PageHeader title="All days" backHref="/read" />
        <p className="my-6 text-muted">Loading…</p>
      </>
    );
  }
  if (!plan) {
    return (
      <>
        <PageHeader title="All days" backHref="/read" />
        <EmptyState title="No reading plan yet" icon="calendar">
          Start one on the Read tab.
        </EmptyState>
      </>
    );
  }

  const open: ReadingDay | undefined = openId ? days?.find((d) => d.id === openId) : undefined;
  const status = (d: ReadingDay) => (isDayComplete(d) ? "done" : d.date < today ? "missed" : d.date === today ? "today" : "future");

  return (
    <>
      <PageHeader title="All days" backHref="/read" />
      <ChipGroup
        label="Show"
        single
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past" },
        ]}
        selected={[filter]}
        onChange={(sel) => {
          if (sel[0]) setFilter(sel[0] as Filter);
        }}
        className="mb-3"
      />
      {list.length === 0 ? <p className="my-6 text-muted">{filter === "past" ? "No past days yet." : "No upcoming days."}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.map((d) => {
          const st = status(d);
          return (
            <li key={d.id} ref={d.date === today ? todayRef : undefined}>
              <button
                type="button"
                onClick={() => setOpenId(d.id)}
                className={cx("bordered flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left", st === "today" ? "bg-bg" : "bg-surface")}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    st === "done" && "bg-success text-success-fg",
                    st === "missed" && "bg-danger text-danger-fg",
                    st === "today" && "[border-width:3px] border-accent",
                    st === "future" && "bordered",
                  )}
                >
                  {st === "done" ? <Icon name="check" size={22} strokeWidth={3} /> : st === "missed" ? <Icon name="cross" size={20} strokeWidth={3} /> : null}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="font-bold">
                    {isCatchUpDay(d) ? "Catch-up" : `Day ${d.dayIndex + 1}`} · {formatDate(d.date)}
                    {st === "today" ? " · Today" : ""}
                    <span className="sr-only">{st === "done" ? ", read" : st === "missed" ? ", missed" : ""}</span>
                  </span>
                  <span className="text-[15px] text-muted">{meta.data ? d.portions.map((p) => formatRange(p.range, meta.data!)).join("; ") : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open ? `${isCatchUpDay(open) ? "Catch-up" : `Day ${open.dayIndex + 1}`} · ${formatDate(open.date)}` : ""}
        footer={
          open ? (
            <Button icon={isDayComplete(open) ? "close" : "check"} onClick={() => void setDayDone(open.id, !isDayComplete(open))}>
              {isDayComplete(open) ? "Mark all unread" : "Mark all read"}
            </Button>
          ) : null
        }
      >
        {open ? <DayPortions day={open} meta={meta.data} versesPerMin={settings.readingVersesPerMin} /> : null}
      </Sheet>
    </>
  );
}
