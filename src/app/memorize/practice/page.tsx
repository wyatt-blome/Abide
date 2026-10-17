"use client";

// /memorize/practice?queue=today            — today's session (daily queue)
// /memorize/practice?plan=ID[&target=..][&mode=..] — practice one plan
// /memorize/practice?mode=headings&range=ROM.8.1-ROM.8.39 — Story of the Passage over a range
//   (in a plan that covers it, else over the range's BSB verses without recording)
// Query params (not a dynamic route) so the page shell is precached for offline use.

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ALL_MODES } from "@/components/practice/ModePills";
import { PlanPractice } from "@/components/practice/PlanPractice";
import { QueueSession } from "@/components/practice/QueueSession";
import { RangePractice } from "@/components/practice/RangePractice";
import { parseRangeId } from "@/lib/refs";
import type { DrillMode } from "@/components/practice/types";
import { EmptyState } from "@/components/ui";
import { linkButtonClass } from "@/components/memorize/linkButton";
import Link from "next/link";

function PracticeInner() {
  const params = useSearchParams();
  const queue = params.get("queue");
  const planId = params.get("plan");
  const rawMode = params.get("mode");
  const mode = rawMode && (ALL_MODES as string[]).includes(rawMode) ? (rawMode as DrillMode) : null;
  const rangeParam = params.get("range");
  const range = useMemo(() => parseRangeId(rangeParam), [rangeParam]);

  if (queue === "today") {
    return (
      <>
        <PageHeader title="Today's verses" backHref="/memorize" />
        <QueueSession />
      </>
    );
  }
  if (planId) {
    return (
      <>
        <PageHeader title="Practice" backHref={`/memorize/plan?id=${encodeURIComponent(planId)}`} />
        <PlanPractice key={planId} planId={planId} target={params.get("target")} mode={mode} />
      </>
    );
  }
  if (range && (mode === null || mode === "headings")) {
    return (
      <>
        <PageHeader title="Story of the Passage" backHref="/memorize" />
        <RangePractice range={range} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Practice" backHref="/memorize" />
      <EmptyState
        title="Choose what to practice"
        action={
          <Link href="/memorize/practice?queue=today" className={linkButtonClass("primary", "md", "w-full")}>
            Today&apos;s verses
          </Link>
        }
      >
        Start today&apos;s session or open a plan.
      </EmptyState>
    </>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <PracticeInner />
    </Suspense>
  );
}
