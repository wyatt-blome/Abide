"use client";

// Mode pills for the practice screen. Speak It is hidden when speech recognition is unsupported
// (a one-line reason is shown instead); Story of the Passage only when the range has BSB headings.

import { useSyncExternalStore } from "react";
import { speechSupport, type SpeechSupport } from "@/lib/speech";
import { ChipGroup } from "@/components/ui";
import { MODE_LABEL, type DrillMode } from "./types";

export const ALL_MODES: DrillMode[] = ["read", "hide", "firstLetters", "typeFirst", "recall", "speak", "reference", "headings"];

const noopSubscribe = () => () => {};
const SERVER_SUPPORT: SpeechSupport = { supported: false };
let cached: SpeechSupport | null = null;
const clientSupport = () => (cached ??= speechSupport());

/** speechSupport() on the client (stable), "unsupported" without a reason during prerender. */
export function useSpeechSupport(): SpeechSupport {
  return useSyncExternalStore(noopSubscribe, clientSupport, () => SERVER_SUPPORT);
}

/** Reset the memoized support check (tests). */
export function resetSpeechSupportCache(): void {
  cached = null;
}

export interface ModePillsProps {
  mode: DrillMode;
  onChange: (mode: DrillMode) => void;
  /** Offer Story of the Passage (range has BSB headings). */
  hasHeadings: boolean;
  /** Modes to leave out (e.g. reference for a single-verse plan). */
  exclude?: DrillMode[];
}

export function availableModes(opts: { speech: boolean; hasHeadings: boolean; exclude?: DrillMode[] }): DrillMode[] {
  return ALL_MODES.filter(
    (m) => (m !== "speak" || opts.speech) && (m !== "headings" || opts.hasHeadings) && !(opts.exclude ?? []).includes(m),
  );
}

export function ModePills({ mode, onChange, hasHeadings, exclude }: ModePillsProps) {
  const speech = useSpeechSupport();
  const modes = availableModes({ speech: speech.supported, hasHeadings, exclude });
  return (
    <div className="flex flex-col gap-1">
      <ChipGroup<DrillMode>
        label="Practice mode"
        single
        options={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
        selected={[mode]}
        onChange={(s) => s[0] && onChange(s[0])}
      />
      {!speech.supported && speech.reason ? <p className="text-[15px] text-muted">Speak it: {speech.reason}</p> : null}
      {!hasHeadings ? <p className="text-[15px] text-muted">No BSB headings in this range</p> : null}
    </div>
  );
}
