"use client";

// /memorize/practice?mode=headings&range=ROM.8.1-ROM.8.39 (the Sources panel's Outline link).
// When a memory plan (active first, then mastered) covers the range, its practice page opens in
// "Story of the Passage"; otherwise the drill runs over the range's BSB verses outside any plan
// (planId "" → nothing is recorded).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { MemoryPlan, VerseRange } from "@/db/types";
import { headingsInRange, loadHeadings, loadMeta } from "@/lib/bible";
import { clampRange, formatRange, rangeContains, rangeToKeys } from "@/lib/refs";
import { EmptyState } from "@/components/ui";
import { storyHeadings } from "./HeadingsDrill";
import { loadPracticeVerses } from "./helpers";
import { PlanPractice } from "./PlanPractice";
import { PracticeRunner, type PracticeSpec } from "./PracticeRunner";

/** The plan to practise a range in: one whose range contains it (active before mastered), else null. */
export function planForRange(plans: MemoryPlan[], range: VerseRange): MemoryPlan | null {
  const covers = (p: MemoryPlan) => rangeContains(p.range, range.start) && rangeContains(p.range, range.end);
  return plans.find((p) => p.status === "active" && covers(p)) ?? plans.find((p) => p.status === "mastered" && covers(p)) ?? null;
}

/** Spec for the free "Story of the Passage" drill over a range's BSB verses. */
export async function rangeHeadingsSpec(raw: VerseRange): Promise<PracticeSpec> {
  const [meta, headings] = await Promise.all([loadMeta(), loadHeadings()]);
  const range = clampRange(meta, raw);
  const verses = await loadPracticeVerses(rangeToKeys(meta, range, true), "BSB");
  return {
    planId: "",
    title: formatRange(range, meta),
    verses,
    pool: verses,
    record: "verses",
    headings: headingsInRange(headings, range),
    defaultMode: "headings",
  };
}

function RangeHeadingsPractice({ range }: { range: VerseRange }) {
  const router = useRouter();
  const [spec, setSpec] = useState<PracticeSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    rangeHeadingsSpec(range)
      .then((s) => alive && setSpec(s))
      .catch(() => alive && setError("Couldn't load the verses."));
    return () => {
      alive = false;
    };
  }, [range]);

  if (error) return <p role="alert" className="text-danger">{error}</p>;
  if (!spec) return <p role="status">Loading…</p>;
  if (!storyHeadings(spec.headings).length) {
    return <EmptyState title="No BSB headings in this range">Choose a passage with section headings.</EmptyState>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">Practice only: results are not saved to a plan.</p>
      <PracticeRunner spec={spec} initialMode="headings" fixedMode onDone={() => router.back()} />
    </div>
  );
}

export function RangePractice({ range }: { range: VerseRange }) {
  const plans = useLiveQuery(() => db.plans.toArray(), [], undefined);
  if (plans === undefined) return <p role="status">Loading…</p>;
  const plan = planForRange(plans, range);
  if (plan) return <PlanPractice key={plan.id} planId={plan.id} target="run" mode="headings" />;
  return <RangeHeadingsPractice range={range} />;
}
