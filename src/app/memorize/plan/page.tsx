"use client";

// Plan detail (/memorize/plan?id=…): heatmap, chunks with build-up labels, practice entry points,
// pause/resume/delete, and the Sources panel.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { BsbHeading, MemoryPlan } from "@/db/types";
import { getRangeVerses, headingsInRange, loadHeadings, loadMeta, type RangeVerse } from "@/lib/bible";
import { diffDays, todayISO } from "@/lib/isoDate";
import type { BibleMeta } from "@/lib/meta";
import { AD_HOC_ID, bundledTranslation, deletePlan, setPlanStatus } from "@/lib/planActions";
import { planProgress, planVerseMaturity, MATURITY_LABEL } from "@/lib/progress";
import { buildUpLabel } from "@/lib/queue";
import { formatRange, fromKey, toKey } from "@/lib/refs";
import { ActionBar, Button, Card, EmptyState, Icon, PageHeader, Sheet, Stepper, useToast } from "@/components/ui";
import { Heatmap, planHeatCells } from "@/components/memorize/Heatmap";
import { linkButtonClass } from "@/components/memorize/linkButton";
import { useNow } from "@/components/memorize/useNow";
import { formatBuildUp } from "@/components/practice/helpers";
import { HEADING_CAPTION, storyHeadings } from "@/components/practice/HeadingsDrill";
import { SourcesPanel } from "@/components/sources/SourcesPanel";

const PACE_LABEL: Record<MemoryPlan["pace"], string> = { daily: "Daily", everyOtherDay: "Every other day", twicePerDay: "2 a day" };

function PlanDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const data = useLiveQuery(async () => {
    const [plan, verseCards, passageCards] = await Promise.all([
      db.plans.get(id),
      db.verseCards.where("planId").equals(id).toArray(),
      db.passageCards.where("planId").equals(id).toArray(),
    ]);
    return { plan, verseCards, passageCards };
  }, [id]);
  const [meta, setMeta] = useState<BibleMeta | null>(null);
  const [headings, setHeadings] = useState<BsbHeading[] | null>(null);
  const [verses, setVerses] = useState<RangeVerse[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [repeats, setRepeats] = useState(3);
  const [gap, setGap] = useState(2);
  const plan = data?.plan;
  const rangeKey = plan ? `${plan.translation}|${JSON.stringify(plan.range)}|${plan.chunks.length}` : "";

  useEffect(() => {
    let alive = true;
    Promise.all([loadMeta(), loadHeadings()])
      .then(([m, h]) => {
        if (!alive) return;
        setMeta(m);
        setHeadings(h);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!plan) return;
    let alive = true;
    const t = bundledTranslation(plan.translation);
    const load =
      plan.starterId === AD_HOC_ID
        ? Promise.all(
            plan.chunks.flat().map(async (k) => (await getRangeVerses(t, { start: fromKey(k), end: fromKey(k) }))[0]),
          ).then((vs) => vs.filter(Boolean))
        : getRangeVerses(t, plan.range);
    load.then((vs) => alive && setVerses(vs)).catch(() => {});
    return () => {
      alive = false;
    };
    // rangeKey identifies the verses to show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  if (!data) return <p role="status">Loading…</p>;
  if (!plan) {
    return (
      <EmptyState title="Plan not found" action={<Link href="/memorize" className={linkButtonClass("primary", "md", "w-full")}>Memorize</Link>}>
        It may have been deleted.
      </EmptyState>
    );
  }

  const prog = planProgress(plan, data.verseCards, data.passageCards, now);
  const maturity = new Map(planVerseMaturity(plan, data.verseCards).map((m) => [m.key, m.maturity]));
  const story = headings ? storyHeadings(headingsInRange(headings, plan.range)) : [];
  const headingsAt = new Map<string, string[]>();
  for (const h of story) headingsAt.set(toKey(h), [...(headingsAt.get(toKey(h)) ?? []), h.text]);
  const starts = plan.startDate ? diffDays(todayISO(now), plan.startDate) : 0;
  const isAdHoc = plan.starterId === AD_HOC_ID;
  const loopHref = `/hands-free?plan=${plan.id}&loop=1&repeats=${repeats}&gap=${gap}`;

  return (
    <>
      <PageHeader title={plan.title} backHref="/memorize" />
      <div className="flex flex-col gap-5">
        <div>
          {!isAdHoc ? <p className="text-[18px] font-semibold">{formatRange(plan.range, meta ?? undefined)}</p> : null}
          <p className="text-muted">
            {[
              plan.translation,
              PACE_LABEL[plan.pace],
              plan.status === "active" ? null : plan.status === "paused" ? "Paused" : "Mastered",
              starts > 0 ? (starts === 1 ? "Starts tomorrow" : `Starts in ${starts} days`) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <Card title="Verses">
          <p className="mb-3 font-semibold">
            {prog.known} of {prog.total} known · {prog.counts.mature} mature · {prog.dueToday} due today
          </p>
          <Heatmap cells={planHeatCells(plan, data.verseCards, meta)} label={`${plan.title}: verse progress`} />
        </Card>

        <Card title="Practice">
          <div className="flex flex-col gap-3">
            <Link href={`/memorize/practice?plan=${plan.id}`} className={linkButtonClass("secondary")}>
              <Icon name="keyboard" /> Practice
            </Link>
            {story.length ? (
              <Link href={`/memorize/practice?plan=${plan.id}&mode=headings&target=run`} className={linkButtonClass("secondary")}>
                <Icon name="list" /> Story of the Passage
              </Link>
            ) : headings ? (
              <p className="text-muted">No BSB headings in this range</p>
            ) : null}
            <Link href={`/hands-free?plan=${plan.id}`} className={linkButtonClass("secondary")}>
              <Icon name="car" /> Hands-Free
            </Link>
          </div>
        </Card>

        <Card title="Listen loop">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4">
              <Stepper label="Times through" value={repeats} min={1} max={20} onChange={setRepeats} />
              <Stepper label="Gap between verses" value={gap} min={0} max={15} format={(v) => `${v} s`} onChange={setGap} />
            </div>
            <Link href={loopHref} className={linkButtonClass("secondary")}>
              <Icon name="repeat" /> Start listen loop
            </Link>
          </div>
        </Card>

        <Card title="Chunks">
          <ol className="flex flex-col gap-2">
            {plan.chunks.map((chunk, i) => {
              const introduced = i < plan.chunksIntroduced;
              const states = chunk.map((k) => maturity.get(k) ?? "new");
              const learned = states.every((s) => s === "young" || s === "mature");
              return (
                <li key={i}>
                  <Link
                    href={`/memorize/practice?plan=${plan.id}&target=chunk:${i}`}
                    className="bordered flex min-h-14 items-center gap-3 rounded-xl bg-bg px-3 py-2 text-fg no-underline"
                  >
                    <Icon
                      name={learned ? "check" : introduced ? "cards" : "calendar"}
                      className={learned ? "text-success" : "text-muted"}
                      label={learned ? "Learned" : introduced ? "Started" : "Not started"}
                    />
                    <span className="flex-1">
                      <span className="block font-semibold">
                        {i + 1}. {formatBuildUp(buildUpLabel(plan, i))}
                      </span>
                      <span className="block text-[14px] text-muted">
                        {introduced ? states.map((s) => MATURITY_LABEL[s]).join(", ") : "Not started yet"}
                      </span>
                    </span>
                    <Icon name="chevronRight" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>

        <details className="bordered rounded-2xl bg-surface p-4">
          <summary className="flex min-h-12 cursor-pointer items-center font-bold">Passage text</summary>
          {verses ? (
            <div className="reading mt-2 flex flex-col gap-2">
              {verses.map((v) => (
                <div key={v.key}>
                  {headingsAt.get(v.key)?.map((h, hi) => (
                    <div key={hi} className="mt-2 font-sans">
                      <p className="text-[13px] font-semibold text-muted">{HEADING_CAPTION}</p>
                      <p className="text-[17px] font-bold">{h}</p>
                    </div>
                  ))}
                  <p>
                    <span className="mr-1.5 font-sans text-[14px] font-bold text-muted">
                      {v.ref.chapter}:{v.ref.verse}
                    </span>
                    {v.text ? v.text : <span className="text-muted">(no text in BSB)</span>}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p role="status">Loading…</p>
          )}
        </details>

        <Card title="Plan">
          <div className="flex flex-col gap-3">
            {plan.status === "paused" ? (
              <Button icon="play" onClick={() => void setPlanStatus(plan.id, "active")}>
                Resume plan
              </Button>
            ) : (
              <Button icon="pause" onClick={() => void setPlanStatus(plan.id, "paused")}>
                Pause plan
              </Button>
            )}
            <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
              Delete plan
            </Button>
          </div>
        </Card>

        <SourcesPanel range={plan.range} translation={plan.translation} />
      </div>

      <ActionBar label="Plan actions">
        <Link href={`/hands-free?plan=${plan.id}`} className={linkButtonClass("secondary")}>
          <Icon name="car" /> Hands-Free
        </Link>
        <Link href={`/memorize/practice?plan=${plan.id}`} className={linkButtonClass("primary")}>
          <Icon name="play" /> Practice
        </Link>
      </ActionBar>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this plan?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={async () => {
                await deletePlan(plan.id);
                toast(`Deleted ${plan.title}`, { tone: "info" });
                router.push("/memorize");
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>Its review history is removed too. This can&apos;t be undone.</p>
      </Sheet>
    </>
  );
}

function PlanRoute() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <EmptyState title="No plan chosen" action={<Link href="/memorize" className={linkButtonClass("primary", "md", "w-full")}>Memorize</Link>} />
    );
  }
  return <PlanDetail key={id} id={id} />;
}

export default function PlanPage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <PlanRoute />
    </Suspense>
  );
}
