"use client";

// Reference Drill, per verse: (1) verse → pick its reference (distractors are other verses of the
// same plan), then (2) reference → recite it (Type letters or Full recall).
// A wrong reference pick caps that verse's accuracy just under the "Good" band (grade ≤ 3).

import { useMemo, useState } from "react";
import type { VerseKey, VerseRef } from "@/db/types";
import { formatRef, toKey } from "@/lib/refs";
import { hashSeed, seededPermutation } from "@/lib/seeded";
import { ActionBar, Button, ChipGroup, cx, haptic, Icon } from "@/components/ui";
import { RecallTyping } from "./RecallTyping";
import { TypeFirst } from "./TypeFirst";
import type { PerVerseAccuracy, PracticeVerse } from "./types";

export const WRONG_PICK_CAP = 0.919;
const OPTIONS = 4;

export interface ReferenceDrillProps {
  verses: PracticeVerse[];
  /** Plan verses the distractors come from. */
  pool: PracticeVerse[];
  onComplete: (perVerse: PerVerseAccuracy) => void;
}

/** Reference choices for a verse: itself + up to 3 others from the pool (neighbours if the pool is small). */
export function referenceOptions(v: PracticeVerse, pool: PracticeVerse[]): VerseRef[] {
  const others = pool.filter((p) => p.key !== v.key).map((p) => p.ref);
  const seen = new Set<VerseKey>([v.key, ...others.map(toKey)]);
  for (const d of [1, -1, 2, -2, 3, -3]) {
    if (others.length >= OPTIONS - 1) break;
    const r = { ...v.ref, verse: v.ref.verse + d };
    if (r.verse >= 1 && !seen.has(toKey(r))) {
      seen.add(toKey(r));
      others.push(r);
    }
  }
  const picked = seededPermutation(others.length, hashSeed(v.key)).slice(0, OPTIONS - 1).map((i) => others[i]);
  const all = [v.ref, ...picked];
  return seededPermutation(all.length, hashSeed(`${v.key}#order`)).map((i) => all[i]);
}

type Phase = { kind: "pick"; chosen?: VerseKey } | { kind: "recite" };
type ReciteMode = "type" | "recall";

export function ReferenceDrill({ verses, pool, onComplete }: ReferenceDrillProps) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [wrongPick, setWrongPick] = useState<Record<VerseKey, boolean>>({});
  const [acc, setAcc] = useState<PerVerseAccuracy>({});
  const [reciteMode, setReciteMode] = useState<ReciteMode>("type");
  const v = verses[i];
  const options = useMemo(() => (v ? referenceOptions(v, pool) : []), [v, pool]);

  if (!v) return null;

  const finishVerse = (a: number) => {
    const capped = wrongPick[v.key] ? Math.min(a, WRONG_PICK_CAP) : a;
    const next = { ...acc, [v.key]: capped };
    setAcc(next);
    if (i + 1 >= verses.length) onComplete(next);
    else {
      setI(i + 1);
      setPhase({ kind: "pick" });
    }
  };

  const header = (
    <p className="font-semibold text-muted">
      Verse {i + 1} of {verses.length}
    </p>
  );

  if (phase.kind === "pick") {
    const chosen = phase.chosen;
    return (
      <div className="flex flex-col gap-3">
        {header}
        <p className="font-semibold">Which reference is this?</p>
        <p className="reading bordered rounded-2xl bg-surface p-4">{v.text}</p>
        <div role="group" aria-label="Reference choices" className="flex flex-col gap-2">
          {options.map((r) => {
            const k = toKey(r);
            const right = k === v.key;
            const isChosen = chosen === k;
            return (
              <button
                key={k}
                type="button"
                disabled={chosen !== undefined}
                aria-pressed={isChosen}
                onClick={() => {
                  if (!right) haptic("error");
                  setWrongPick({ ...wrongPick, [v.key]: !right });
                  setPhase({ kind: "pick", chosen: k });
                }}
                className={cx(
                  "flex min-h-14 items-center gap-2 rounded-xl px-4 text-left text-[18px] font-semibold",
                  "[border-width:max(2px,var(--border-width))] border-solid",
                  chosen !== undefined && right ? "border-success bg-success text-success-fg" : "",
                  chosen !== undefined && isChosen && !right ? "border-danger bg-danger text-danger-fg" : "",
                  chosen === undefined || (!right && !isChosen) ? "border-border bg-bg text-fg" : "",
                )}
              >
                {chosen !== undefined && right ? <Icon name="check" size={22} label="Correct" /> : null}
                {chosen !== undefined && isChosen && !right ? <Icon name="cross" size={22} label="Wrong" /> : null}
                <span>{formatRef(r)}</span>
              </button>
            );
          })}
        </div>
        {chosen !== undefined ? (
          <ActionBar label="Reference drill">
            <Button variant="primary" icon="chevronRight" onClick={() => setPhase({ kind: "recite" })}>
              Now say it from the reference
            </Button>
          </ActionBar>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {header}
      <p className="text-[22px] font-bold">{formatRef(v.ref)}</p>
      <ChipGroup<ReciteMode>
        label="How to answer"
        single
        options={[
          { value: "type", label: "Type letters" },
          { value: "recall", label: "Type it all" },
        ]}
        selected={[reciteMode]}
        onChange={(s) => s[0] && setReciteMode(s[0])}
      />
      {reciteMode === "type" ? (
        <TypeFirst
          key={`${v.key}-type`}
          items={[{ id: v.key, label: "", text: v.text }]}
          onComplete={(r) => finishVerse(r.perItem[v.key]?.accuracy ?? 0)}
        />
      ) : (
        <RecallTyping key={`${v.key}-recall`} verses={[v]} onComplete={(p) => finishVerse(p[v.key] ?? 0)} />
      )}
    </div>
  );
}
