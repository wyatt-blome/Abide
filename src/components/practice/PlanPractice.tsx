"use client";

// Practice one plan: pick a target (a verse, a chunk, or the cumulative run-through), then a mode.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { BsbHeading, MemoryPlan, VerseKey } from "@/db/types";
import { headingsInRange, loadHeadings } from "@/lib/bible";
import { buildUpLabel } from "@/lib/queue";
import { fromKey } from "@/lib/refs";
import { Button, ChipGroup, EmptyState, Stepper } from "@/components/ui";
import { formatBuildUp, formatSpan, loadPracticeVerses, verseLabels } from "./helpers";
import { PracticeRunner, type PracticeSpec } from "./PracticeRunner";
import type { DrillMode, PracticeVerse, RecordKind } from "./types";

export type TargetKind = "verse" | "chunk" | "run";
export interface Target { kind: TargetKind; index: number }

/** Parse ?target= ("run", "chunk:3", "verse:PSA.23.1"). */
export function parseTarget(raw: string | null, plan: MemoryPlan): Target | null {
  if (!raw) return null;
  if (raw === "run" || raw === "all") return { kind: "run", index: 0 };
  const [kind, val] = raw.split(":");
  if (kind === "chunk") {
    const n = Number(val);
    return Number.isInteger(n) && n >= 0 && n < plan.chunks.length ? { kind: "chunk", index: n } : null;
  }
  if (kind === "verse") {
    const i = plan.chunks.flat().indexOf(val);
    return i >= 0 ? { kind: "verse", index: i } : null;
  }
  return null;
}

export interface ResolvedTarget { keys: VerseKey[]; record: RecordKind; title: string; subtitle?: string; usePassageCard: boolean }

/** Keys and recording rule for a target. */
export function resolveTarget(plan: MemoryPlan, t: Target, hasPassageCard: boolean): ResolvedTarget {
  const all = plan.chunks.flat();
  if (t.kind === "verse") {
    const key = all[Math.min(t.index, all.length - 1)];
    return { keys: [key], record: "verses", title: `${plan.title} · ${verseLabels([fromKey(key)])[0]}`, usePassageCard: false };
  }
  if (t.kind === "chunk") {
    const i = Math.min(t.index, plan.chunks.length - 1);
    return {
      keys: plan.chunks[i], record: "verses", title: `${plan.title} · Chunk ${i + 1}`,
      subtitle: formatBuildUp(buildUpLabel(plan, i)), usePassageCard: false,
    };
  }
  const n = Math.max(1, Math.min(plan.chunksIntroduced, plan.chunks.length));
  const keys = plan.chunks.slice(0, n).flat();
  const whole = n >= plan.chunks.length;
  const span = formatSpan({ start: fromKey(keys[0]), end: fromKey(keys[keys.length - 1]) });
  if (whole && hasPassageCard) return { keys, record: "passage", title: `${plan.title} · Whole passage`, usePassageCard: true };
  return {
    keys, record: n === 1 ? "verses" : "runThrough",
    title: `${plan.title} · Run-through`, subtitle: whole ? undefined : `Run-through ${span} (verses learned so far)`, usePassageCard: false,
  };
}

export interface PlanPracticeProps {
  planId: string;
  target: string | null;
  mode: DrillMode | null;
}

export function PlanPractice({ planId, target: targetParam, mode: modeParam }: PlanPracticeProps) {
  const router = useRouter();
  const plan = useLiveQuery(() => db.plans.get(planId), [planId], null);
  const passageCard = useLiveQuery(() => db.passageCards.where("planId").equals(planId).first(), [planId], null);
  // undefined while loading: the default target waits for it (a `false` default would pick the
  // run-through first and then flip to the new chunk, remounting the drill).
  const hasNew = useLiveQuery(
    async () => (await db.verseCards.where("planId").equals(planId).toArray()).some((c) => c.reps === 0),
    [planId],
    undefined,
  );
  const [headings, setHeadings] = useState<BsbHeading[] | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  // The default target is decided once, when plan and cards are first loaded. Recording an attempt
  // changes `hasNew`; re-deriving the default then would swap the target and unmount the Summary.
  const [defaultTarget, setDefaultTarget] = useState<{ target: Target; newChunk: boolean } | null>(null);
  // The spec carries the specKey it was built for, so a stale spec is never shown for a new target.
  const [built, setBuilt] = useState<{ key: string; spec: PracticeSpec } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!defaultTarget && plan && hasNew !== undefined) {
    const fromUrl = parseTarget(targetParam, plan);
    const newChunk = !fromUrl && hasNew && plan.chunksIntroduced > 0;
    setDefaultTarget({
      target: fromUrl ?? (newChunk ? { kind: "chunk", index: plan.chunksIntroduced - 1 } : { kind: "run", index: 0 }),
      newChunk,
    });
  }

  useEffect(() => {
    let alive = true;
    loadHeadings()
      .then((h) => alive && setHeadings(h))
      .catch(() => alive && setHeadings([]));
    return () => {
      alive = false;
    };
  }, []);

  // Target: the one chosen on this page, else the default (?target, else the plan's newest
  // unlearned chunk, else the run-through), frozen once resolved.
  const effectiveTarget: Target | null = plan ? (target ?? defaultTarget?.target ?? null) : null;

  const resolved = useMemo(
    () => (plan && effectiveTarget && passageCard !== null ? resolveTarget(plan, effectiveTarget, !!passageCard) : null),
    [plan, effectiveTarget, passageCard],
  );
  const specKey = resolved ? `${resolved.keys.join(",")}|${resolved.record}` : "";

  useEffect(() => {
    if (!plan || !resolved || !headings) return;
    let alive = true;
    Promise.all([loadPracticeVerses(resolved.keys, plan.translation), loadPracticeVerses(plan.chunks.flat(), plan.translation)])
      .then(([verses, pool]: [PracticeVerse[], PracticeVerse[]]) => {
        if (!alive) return;
        const isNewChunk = !target && !!defaultTarget?.newChunk;
        setBuilt({
          key: specKey,
          spec: {
          planId: plan.id, title: resolved.title, subtitle: resolved.subtitle, verses, pool, record: resolved.record,
          passageCardId: resolved.usePassageCard ? passageCard?.id : undefined,
            headings: headingsInRange(headings, plan.range), defaultMode: isNewChunk ? "read" : "typeFirst",
          },
        });
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load the verses."));
    return () => {
      alive = false;
    };
    // specKey captures the target; the spec is not rebuilt when cards change after recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, headings, plan?.id]);

  if (plan === null || passageCard === null || (plan && hasNew === undefined)) return <p role="status">Loading…</p>;
  if (!plan) {
    return (
      <EmptyState title="Plan not found" action={<Button onClick={() => router.push("/memorize")}>Memorize</Button>}>
        It may have been deleted.
      </EmptyState>
    );
  }
  if (error) return <p role="alert" className="text-danger">{error}</p>;

  const t = effectiveTarget ?? { kind: "run", index: 0 };
  const all = plan.chunks.flat();
  const allLabels = verseLabels(all.map(fromKey));
  const setT = (next: Target) => setTarget(next);
  const spec = built && built.key === specKey ? built.spec : null;

  return (
    <div className="flex flex-col gap-4">
      <details className="bordered rounded-xl bg-surface p-3">
        <summary className="flex min-h-12 cursor-pointer items-center font-semibold">What to practice</summary>
        <div className="mt-2 flex flex-col gap-3">
          <ChipGroup<TargetKind>
            label="Practice target"
            single
            options={[
              { value: "verse", label: "One verse" },
              { value: "chunk", label: "One chunk" },
              { value: "run", label: "Run-through" },
            ]}
            selected={[t.kind]}
            onChange={(s) => s[0] && setT({ kind: s[0], index: s[0] === "chunk" ? Math.max(0, plan.chunksIntroduced - 1) : 0 })}
          />
          {t.kind === "verse" ? (
            <Stepper
              label="Verse"
              value={t.index}
              min={0}
              max={all.length - 1}
              format={(i) => allLabels[i] ?? ""}
              onChange={(i) => setT({ kind: "verse", index: i })}
            />
          ) : null}
          {t.kind === "chunk" ? (
            <Stepper
              label="Chunk"
              value={t.index}
              min={0}
              max={plan.chunks.length - 1}
              format={(i) => `${i + 1} · ${formatSpan({ start: fromKey(plan.chunks[i][0]), end: fromKey(plan.chunks[i][plan.chunks[i].length - 1]) })}`}
              onChange={(i) => setT({ kind: "chunk", index: i })}
            />
          ) : null}
        </div>
      </details>
      {spec ? (
        <PracticeRunner
          key={specKey}
          spec={spec}
          initialMode={modeParam ?? undefined}
          onDone={() => router.push(`/memorize/plan?id=${plan.id}`)}
        />
      ) : (
        <p role="status">Loading…</p>
      )}
    </div>
  );
}
