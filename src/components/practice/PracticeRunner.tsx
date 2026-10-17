"use client";

// One practice item: mode pills → drill → record → Summary.

import { useEffect, useRef, useState } from "react";
import type { BsbHeading } from "@/db/types";
import { Button, EmptyState } from "@/components/ui";
import { FirstLetters } from "./FirstLetters";
import { HeadingsDrill, storyHeadings } from "./HeadingsDrill";
import { ModePills, useSpeechSupport } from "./ModePills";
import { ProgressiveHide } from "./ProgressiveHide";
import { ReadListen } from "./ReadListen";
import { RecallTyping } from "./RecallTyping";
import { recordAttempt, type RecordResult } from "./record";
import { ReferenceDrill } from "./ReferenceDrill";
import { SpeakIt } from "./SpeakIt";
import { Summary } from "./Summary";
import { TypeFirst } from "./TypeFirst";
import { MODE_LABEL, type DrillMode, type DrillOutcome, type PerVerseAccuracy, type PracticeVerse, type RecordKind } from "./types";

export interface PracticeSpec {
  planId: string;
  /** "Psalm 23 · Review". */
  title: string;
  /** e.g. "Learning v.7–8 · run-through v.1–8". */
  subtitle?: string;
  verses: PracticeVerse[];
  /** Plan verses (reference-drill distractors). */
  pool: PracticeVerse[];
  record: RecordKind;
  passageCardId?: string;
  /** BSB headings within the plan range. */
  headings: BsbHeading[];
  defaultMode: DrillMode;
}

export interface PracticeRunnerProps {
  spec: PracticeSpec;
  /** Starting mode (default spec.defaultMode). */
  initialMode?: DrillMode;
  onNext?: () => void;
  nextLabel?: string;
  onDone: () => void;
  /** Hide the mode pills (fixed-mode flows). */
  fixedMode?: boolean;
}

type Phase = { kind: "drill" } | { kind: "saving" } | { kind: "summary"; outcome: DrillOutcome; result: RecordResult } | { kind: "error"; message: string };

export function PracticeRunner({ spec, initialMode, onNext, nextLabel, onDone, fixedMode }: PracticeRunnerProps) {
  const speech = useSpeechSupport();
  const [chosenMode, setChosenMode] = useState<DrillMode>(initialMode ?? spec.defaultMode);
  let mode = chosenMode;
  if (mode === "speak" && !speech.supported) mode = "typeFirst";
  const hasHeadings = storyHeadings(spec.headings).length > 0;
  if (mode === "headings" && !hasHeadings) mode = "typeFirst";
  const [phase, setPhase] = useState<Phase>({ kind: "drill" });
  const [attempt, setAttempt] = useState(0);
  const startedAt = useRef(0);
  const key = `${mode}-${attempt}`;
  // Attempt duration starts when the drill (re)mounts.
  useEffect(() => {
    startedAt.current = Date.now();
  }, [key]);

  const setMode = (m: DrillMode) => {
    setChosenMode(m);
    setPhase({ kind: "drill" });
    setAttempt((n) => n + 1);
  };

  const finish = async (perVerse: PerVerseAccuracy, note?: string) => {
    const outcome: DrillOutcome = { mode, perVerse, note };
    const durationMs = startedAt.current ? Date.now() - startedAt.current : 0;
    setPhase({ kind: "saving" });
    try {
      const result = await recordAttempt({
        planId: spec.planId, kind: spec.record, verses: spec.verses, outcome, durationMs, passageCardId: spec.passageCardId,
      });
      setPhase({ kind: "summary", outcome, result });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Couldn't save the result." });
    }
  };

  if (!spec.verses.length) {
    return <EmptyState title="Nothing to practice">These verses have no text in this translation.</EmptyState>;
  }

  if (phase.kind === "summary") {
    const { result, outcome } = phase;
    return (
      <Summary
        title={`${spec.title} · ${MODE_LABEL[outcome.mode]}`}
        rows={result.rows}
        passage={result.passageGrade ? { grade: result.passageGrade, nextDue: result.passageDue } : undefined}
        note={outcome.note}
        mastered={result.mastered}
        onAgain={() => setMode(mode)}
        onNext={onNext}
        nextLabel={nextLabel}
        onDone={onDone}
      />
    );
  }

  const items = spec.verses.map((v) => ({ id: v.key, label: v.label, text: v.text }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-[20px] font-bold">{spec.title}</h2>
          {spec.subtitle ? <p className="font-semibold text-muted">{spec.subtitle}</p> : null}
        </div>
        {onNext ? (
          <Button variant="ghost" icon="skipNext" onClick={onNext}>
            Skip
          </Button>
        ) : null}
      </div>
      {!fixedMode ? <ModePills mode={mode} onChange={setMode} hasHeadings={hasHeadings} /> : null}
      {phase.kind === "saving" ? <p role="status">Saving…</p> : null}
      {phase.kind === "error" ? (
        <p role="alert" className="font-semibold text-danger">
          {phase.message}
        </p>
      ) : null}
      {phase.kind === "drill" ? (
        <div key={key}>
          {mode === "read" ? (
            <ReadListen verses={spec.verses} onNextMode={() => setMode("hide")} nextModeLabel="Next: Hide words" />
          ) : null}
          {mode === "hide" ? <ProgressiveHide verses={spec.verses} onComplete={(p) => void finish(p)} /> : null}
          {mode === "firstLetters" ? <FirstLetters verses={spec.verses} onComplete={(p) => void finish(p)} /> : null}
          {mode === "typeFirst" ? (
            <TypeFirst
              items={items}
              onComplete={(r) => {
                const p: PerVerseAccuracy = {};
                for (const [k, x] of Object.entries(r.perItem)) p[k] = x.accuracy;
                void finish(p);
              }}
            />
          ) : null}
          {mode === "recall" ? <RecallTyping verses={spec.verses} onComplete={(p) => void finish(p)} /> : null}
          {mode === "speak" ? <SpeakIt verses={spec.verses} onComplete={(p) => void finish(p)} /> : null}
          {mode === "reference" ? <ReferenceDrill verses={spec.verses} pool={spec.pool} onComplete={(p) => void finish(p)} /> : null}
          {mode === "headings" ? (
            <HeadingsDrill headings={spec.headings} verses={spec.verses} onComplete={(p, note) => void finish(p, note)} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
