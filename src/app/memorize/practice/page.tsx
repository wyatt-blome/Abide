"use client";

// /memorize/practice?queue=today            — today's session (daily queue)
// /memorize/practice?plan=ID[&target=..][&mode=..] — practice one plan
// Query params (not a dynamic route) so the page shell is precached for offline use.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ALL_MODES } from "@/components/practice/ModePills";
import { PlanPractice } from "@/components/practice/PlanPractice";
import { QueueSession } from "@/components/practice/QueueSession";
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
