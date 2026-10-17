"use client";

// Today's session (?queue=today): walks queue.buildQueue items in order — overdue → due → passage
// runs → new chunks (learn the chunk, then the cumulative run-through). The queue is snapshotted
// at the start so an Again does not jump the line; at the end it is rebuilt and anything still due
// (e.g. Again cards) is offered as another round.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/db/db";
import { introduceDueChunks } from "@/db/repo";
import type { BsbHeading, MemoryPlan, VerseKey } from "@/db/types";
import { headingsInRange, loadHeadings } from "@/lib/bible";
import { buildQueue, buildUpLabel, type QueueItem } from "@/lib/queue";
import { ActionBar, Button, EmptyState, Icon } from "@/components/ui";
import { formatBuildUp, loadPracticeVerses } from "./helpers";
import { PracticeRunner, type PracticeSpec } from "./PracticeRunner";
import { updateStreakAfterPractice } from "./record";
import type { DrillMode, RecordKind } from "./types";

interface Step {
  plan: MemoryPlan;
  keys: VerseKey[];
  record: RecordKind;
  passageCardId?: string;
  title: string;
  subtitle?: string;
  defaultMode: DrillMode;
  kindLabel: string;
}

/** Queue items → practice steps (a new chunk is two steps: learn, then run-through). */
export function stepsFromQueue(items: QueueItem[], plans: MemoryPlan[]): Step[] {
  const byId = new Map(plans.map((p) => [p.id, p]));
  const out: Step[] = [];
  for (const it of items) {
    const plan = byId.get(it.planId);
    if (!plan) continue;
    if (it.kind === "review") {
      out.push({
        plan, keys: [it.card.key], record: "verses", title: plan.title, defaultMode: "typeFirst",
        kindLabel: it.overdue ? "Overdue review" : "Review",
      });
    } else if (it.kind === "passage") {
      out.push({
        plan, keys: it.keys, record: "passage", passageCardId: it.card.id, title: plan.title, defaultMode: "typeFirst",
        kindLabel: "Whole passage",
      });
    } else {
      const label = formatBuildUp(buildUpLabel(plan, it.chunkIndex));
      out.push({ plan, keys: it.keys, record: "verses", title: plan.title, subtitle: label, defaultMode: "read", kindLabel: "New" });
      if (it.runThrough.length) {
        out.push({
          plan, keys: it.runThrough, record: "runThrough", title: plan.title, subtitle: label, defaultMode: "typeFirst",
          kindLabel: "Run-through",
        });
      }
    }
  }
  return out;
}

async function snapshot(): Promise<{ steps: Step[] }> {
  await introduceDueChunks();
  const now = Date.now();
  const [plans, verseCards, passageCards] = await Promise.all([db.plans.toArray(), db.verseCards.toArray(), db.passageCards.toArray()]);
  plans.sort((a, b) => a.createdAt - b.createdAt);
  const q = buildQueue({ plans, verseCards, passageCards, now });
  return { steps: stepsFromQueue(q.items, plans) };
}

export function QueueSession() {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [round, setRound] = useState(1);
  const [index, setIndex] = useState(0);
  const [spec, setSpec] = useState<PracticeSpec | null>(null);
  const [headings, setHeadings] = useState<BsbHeading[] | null>(null);
  const [finished, setFinished] = useState<{ remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    snapshot()
      .then(({ steps: s }) => {
        setSteps(s);
        setIndex(0);
        setFinished(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load today's queue."));
  }, []);

  useEffect(() => {
    let alive = true;
    loadHeadings()
      .then((h) => alive && setHeadings(h))
      .catch(() => alive && setHeadings([]));
    start();
    return () => {
      alive = false;
    };
  }, [start]);

  const step = steps?.[index];
  useEffect(() => {
    if (!step || !headings) return;
    let alive = true;
    Promise.all([loadPracticeVerses(step.keys, step.plan.translation), loadPracticeVerses(step.plan.chunks.flat(), step.plan.translation)])
      .then(([verses, pool]) => {
        if (!alive) return;
        setSpec({
          planId: step.plan.id, title: `${step.title} · ${step.kindLabel}`, subtitle: step.subtitle, verses, pool,
          record: step.record, passageCardId: step.passageCardId, headings: headingsInRange(headings, step.plan.range),
          defaultMode: step.defaultMode,
        });
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load the verses."));
    return () => {
      alive = false;
    };
  }, [step, headings]);

  const next = async () => {
    setSpec(null);
    if (steps && index + 1 < steps.length) {
      setIndex(index + 1);
      return;
    }
    const again = await snapshot();
    await updateStreakAfterPractice();
    setFinished({ remaining: again.steps.length });
  };

  if (error) return <p role="alert" className="font-semibold text-danger">{error}</p>;
  if (!steps) return <p role="status">Loading today&apos;s queue…</p>;

  if (finished || !steps.length) {
    const remaining = finished?.remaining ?? 0;
    return (
      <div className="flex flex-col gap-4">
        {remaining > 0 ? (
          <EmptyState title={`${remaining} more to go over`} icon="repeat">
            Verses you missed come back once more today.
          </EmptyState>
        ) : (
          <EmptyState title={steps.length ? "Queue cleared" : "Nothing due right now"} icon="check">
            {steps.length ? "That's everything due today." : "New verses start on their plan's start date."}
          </EmptyState>
        )}
        {remaining === 0 && steps.length ? (
          <p className="flex items-center justify-center gap-2 font-bold text-success" role="status">
            <Icon name="check" size={24} /> Done for today
          </p>
        ) : null}
        <ActionBar label="Session">
          <Button variant={remaining ? "secondary" : "primary"} icon="check" onClick={() => router.push("/memorize")}>
            Done
          </Button>
          {remaining ? (
            <Button
              variant="primary"
              icon="repeat"
              onClick={() => {
                setRound(round + 1);
                start();
              }}
            >
              Go over them
            </Button>
          ) : null}
        </ActionBar>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-semibold text-muted">
        {round > 1 ? `Round ${round} · ` : ""}Item {index + 1} of {steps.length}
      </p>
      {spec ? (
        <PracticeRunner
          key={`${round}-${index}`}
          spec={spec}
          onNext={() => void next()}
          nextLabel={index + 1 < steps.length ? "Next item" : "Finish"}
          onDone={() => router.push("/memorize")}
        />
      ) : (
        <p role="status">Loading…</p>
      )}
    </div>
  );
}
