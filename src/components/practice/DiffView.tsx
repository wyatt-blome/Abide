"use client";

// Word alignment view for Full Recall / Speak It. Not color alone: missed words are underlined with
// ✗, wrong or extra words are struck through, and every state has screen-reader text.

import type { AlignmentOp } from "@/lib/scoring";
import { Icon } from "@/components/ui";

export interface DiffViewProps {
  ops: AlignmentOp[];
  /** Target word index where each verse starts, with its label (adds verse labels inline). */
  verseStarts?: { at: number; label: string }[];
  matched: number;
  total: number;
}

export function DiffView({ ops, verseStarts = [], matched, total }: DiffViewProps) {
  const starts = new Map(verseStarts.map((s) => [s.at, s.label]));
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 font-bold">
        <Icon name="check" size={22} className="text-success" />
        <span>
          {matched} of {total} words
        </span>
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted" aria-label="Legend">
        <li>
          <span className="text-success">word</span> = right
        </li>
        <li>
          <span className="underline decoration-2">word</span> ✗ = missed
        </li>
        <li>
          <span className="line-through">word</span> = wrong or extra
        </li>
      </ul>
      <p className="reading" data-testid="diff-view">
        {ops.map((o, i) => {
          // Each target word index occurs once among match/sub/del ops.
          const label = "ti" in o ? starts.get(o.ti) : undefined;
          const lead = label ? <span className="mr-1 font-sans text-[14px] font-bold text-muted">{label}</span> : null;
          switch (o.op) {
            case "match":
              return (
                <span key={i}>
                  {lead}
                  <span className="text-success" data-op="match">
                    {o.target}
                  </span>{" "}
                </span>
              );
            case "sub":
              return (
                <span key={i} data-op="sub">
                  {lead}
                  <span className="text-danger underline decoration-2 underline-offset-4">{o.target}</span>
                  <Icon name="cross" size={14} className="text-danger" />
                  <span className="text-muted line-through"> ({o.attempt})</span>
                  <span className="sr-only">{`: you said ${o.attempt}`}</span>{" "}
                </span>
              );
            case "del":
              return (
                <span key={i} data-op="del">
                  {lead}
                  <span className="text-danger underline decoration-2 decoration-dashed underline-offset-4">{o.target}</span>
                  <Icon name="cross" size={14} className="text-danger" />
                  <span className="sr-only"> (missed)</span>{" "}
                </span>
              );
            case "ins":
              return (
                <span key={i} data-op="ins" className="text-muted line-through">
                  +{o.attempt}
                  <span className="sr-only"> (extra word)</span>{" "}
                </span>
              );
          }
        })}
      </p>
    </div>
  );
}
