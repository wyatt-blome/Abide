"use client";

// After an attempt: grade per verse (✓/✗ + words, not color alone), next due date, Next / Done.

import type { ReactNode } from "react";
import { useNow } from "@/components/memorize/useNow";
import type { Grade } from "@/lib/scoring";
import { ActionBar, Button, Card, Icon } from "@/components/ui";
import { formatNextDue, GRADE_LABEL } from "./helpers";
import type { SummaryRow } from "./record";

export interface SummaryProps {
  title: string;
  rows: SummaryRow[];
  /** Passage run result (passage card). */
  passage?: { grade?: Grade; nextDue?: number };
  note?: string;
  mastered?: boolean;
  /** Shown when nothing was recorded (e.g. Read & Listen, preview of later verses). */
  extra?: ReactNode;
  onNext?: () => void;
  nextLabel?: string;
  onAgain?: () => void;
  onDone: () => void;
  now?: number;
}

const pct = (a: number) => `${Math.round(a * 100)}%`;

export function Summary({ title, rows, passage, note, mastered, extra, onNext, nextLabel = "Next item", onAgain, onDone, now: nowProp }: SummaryProps) {
  const tick = useNow();
  const now = nowProp ?? tick;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[22px] font-bold">{title}</h2>
      {mastered ? (
        <p className="flex items-center gap-2 font-bold text-success" role="status">
          <Icon name="check" size={24} /> Passage mastered
        </p>
      ) : null}
      {note ? <p className="font-semibold">{note}</p> : null}
      {passage?.grade ? (
        <Card title="Whole passage">
          <p className="flex items-center gap-2 text-[18px] font-bold">
            <Icon name={passage.grade >= 3 ? "check" : "cross"} size={22} className={passage.grade >= 3 ? "text-success" : "text-danger"} />
            {GRADE_LABEL[passage.grade]}
          </p>
          {passage.nextDue ? <p className="text-muted">Next run-through: {formatNextDue(passage.nextDue, now)}</p> : null}
        </Card>
      ) : null}
      {rows.length ? (
        <ul className="flex flex-col gap-2" aria-label="Results per verse">
          {rows.map((r) => {
            const ok = r.grade >= 3;
            return (
              <li key={r.key} className="bordered flex min-h-14 items-center gap-3 rounded-xl bg-surface px-3 py-2">
                <Icon name={ok ? "check" : "cross"} size={26} className={ok ? "text-success" : "text-danger"} />
                <div className="flex-1">
                  <p className="font-bold">
                    {r.label} · {GRADE_LABEL[r.grade]} <span className="font-normal text-muted">({pct(r.accuracy)})</span>
                  </p>
                  <p className="text-[15px] text-muted">
                    {r.nextDue !== undefined ? `Next: ${formatNextDue(r.nextDue, now)}` : null}
                    {r.nextDue !== undefined && r.note ? " · " : null}
                    {r.note}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {extra}
      {onAgain ? (
        <Button icon="refresh" onClick={onAgain}>
          Practice again
        </Button>
      ) : null}
      <ActionBar label="Summary">
        <Button variant={onNext ? "secondary" : "primary"} icon="check" onClick={onDone}>
          Done
        </Button>
        {onNext ? (
          <Button variant="primary" icon="chevronRight" onClick={onNext}>
            {nextLabel}
          </Button>
        ) : null}
      </ActionBar>
    </div>
  );
}
