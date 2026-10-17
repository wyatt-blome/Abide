"use client";

import { Icon, Sheet } from "@/components/ui";
import type { ReadingPlan } from "@/db/types";
import type { MissedPolicy } from "@/lib/missed";

export const POLICY_OPTIONS: { value: MissedPolicy; label: string; help: string }[] = [
  { value: "graceDay", label: "Catch up on grace day", help: "Missed readings move to your next grace days." },
  { value: "spread", label: "Spread over next 2 weeks", help: "Missed verses are added in small parts to the next 12 reading days." },
  { value: "shiftEnd", label: "Shift end date", help: "Pick up where you left off. The plan ends later." },
];

export const POLICY_LABEL: Record<ReadingPlan["missedPolicy"], string> = {
  ask: "Ask me",
  graceDay: "Catch up on grace day",
  spread: "Spread over next 2 weeks",
  shiftEnd: "Shift end date",
};

export interface MissedSheetProps {
  open: boolean;
  onClose: () => void;
  missedDays: number;
  onChoose: (policy: MissedPolicy) => void;
  busy?: boolean;
}

/** Asked once when days are missed; the choice is remembered on the plan. */
export function MissedSheet({ open, onClose, missedDays, onChoose, busy }: MissedSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={`${missedDays} ${missedDays === 1 ? "day" : "days"} missed`}>
      <p className="mb-3 text-muted">What should happen to missed readings? Finished days never change. You can change this later in Plan settings.</p>
      <ul className="flex flex-col gap-3">
        {POLICY_OPTIONS.map((o) => (
          <li key={o.value}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onChoose(o.value)}
              className="bordered flex min-h-16 w-full flex-col items-start gap-1 rounded-xl bg-surface px-4 py-3 text-left disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-[19px] font-bold">
                <Icon name="chevronRight" size={22} />
                {o.label}
              </span>
              <span className="text-[15px] text-muted">{o.help}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
