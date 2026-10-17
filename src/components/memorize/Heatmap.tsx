"use client";

// Per-verse heatmap: one cell per verse, shaded by maturity (lib/progress.ts). Each state also has
// its own symbol and border style, so it never relies on color alone; the legend repeats both.

import type { CSSProperties } from "react";
import type { MemoryPlan, VerseCard, VerseKey } from "@/db/types";
import type { BibleMeta } from "@/lib/meta";
import { rangeKeys } from "@/lib/meta";
import { MATURITY_LABEL, MATURITY_ORDER, planVerseMaturity, type Maturity } from "@/lib/progress";
import { fromKey } from "@/lib/refs";
import { AD_HOC_ID } from "@/lib/planActions";
import { BOOK_BY_CODE } from "@/lib/books";

export type HeatState = Maturity | "empty";

export interface HeatCell {
  key: VerseKey;
  /** Short visible label: "7", "5:12" or "Rom 8:28". */
  label: string;
  /** Spoken label: "Psalm 23:1". */
  fullLabel: string;
  state: HeatState;
}

const SYMBOL: Record<HeatState, string> = { new: "○", learning: "◔", young: "◑", mature: "●", empty: "—" };
const STATE_LABEL: Record<HeatState, string> = { ...MATURITY_LABEL, empty: "No text in BSB" };

function cellStyle(state: HeatState): CSSProperties {
  const mix = (p: number) => `color-mix(in srgb, var(--accent) ${p}%, var(--bg))`;
  switch (state) {
    case "new":
      return { background: "var(--bg)", borderStyle: "dashed" };
    case "learning":
      return { background: mix(22), borderStyle: "dotted" };
    case "young":
      return { background: mix(55), borderStyle: "solid" };
    case "mature":
      return { background: "var(--accent)", color: "var(--accent-fg)", borderStyle: "solid" };
    case "empty":
      return { background: "var(--surface-strong)", borderStyle: "solid", opacity: 0.7 };
  }
}

const shortBook = (code: string) => BOOK_BY_CODE[code]?.name ?? code;

/** Heatmap cells for a plan: plan verses, plus BSB-empty slots inside a regular plan's range. */
export function planHeatCells(
  plan: Pick<MemoryPlan, "id" | "chunks" | "range" | "starterId">,
  verseCards: VerseCard[],
  meta?: BibleMeta | null,
): HeatCell[] {
  const mat = new Map(planVerseMaturity(plan, verseCards).map((m) => [m.key, m.maturity]));
  const keys = meta && plan.starterId !== AD_HOC_ID ? rangeKeys(meta, plan.range) : plan.chunks.flat();
  const refs = keys.map(fromKey);
  const books = new Set(refs.map((r) => r.book));
  const chapters = new Set(refs.map((r) => `${r.book}.${r.chapter}`));
  return keys.map((key, i) => {
    const r = refs[i];
    const label = books.size > 1 ? `${shortBook(r.book).slice(0, 4)} ${r.chapter}:${r.verse}` : chapters.size > 1 ? `${r.chapter}:${r.verse}` : String(r.verse);
    const state: HeatState = mat.get(key) ?? "empty";
    return { key, label, fullLabel: `${shortBook(r.book)} ${r.chapter}:${r.verse}`, state };
  });
}

export interface HeatmapProps {
  cells: HeatCell[];
  /** Accessible name, e.g. the plan title. */
  label: string;
  /** Show the legend (default true). */
  legend?: boolean;
}

export function Heatmap({ cells, label, legend = true }: HeatmapProps) {
  const states: HeatState[] = [...MATURITY_ORDER, ...(cells.some((c) => c.state === "empty") ? (["empty"] as const) : [])];
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={label} className="flex flex-wrap gap-1">
        {cells.map((c) => (
          <li
            key={c.key}
            title={`${c.fullLabel}: ${STATE_LABEL[c.state]}`}
            className="flex h-11 min-w-11 flex-col items-center justify-center rounded-md px-1 text-[12px] leading-none"
            style={{ ...cellStyle(c.state), borderWidth: "max(1px, var(--border-width))", borderColor: "var(--border)" }}
          >
            <span aria-hidden="true" className="font-bold tabular-nums">
              {c.label}
            </span>
            <span aria-hidden="true" className="mt-0.5 text-[13px]">
              {SYMBOL[c.state]}
            </span>
            <span className="sr-only">{`${c.fullLabel}: ${STATE_LABEL[c.state]}`}</span>
          </li>
        ))}
      </ul>
      {legend ? (
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted">
          {states.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-[11px]"
                style={{ ...cellStyle(s), borderWidth: "max(1px, var(--border-width))", borderColor: "var(--border)" }}
              >
                {SYMBOL[s]}
              </span>
              <span>
                {STATE_LABEL[s]}
                {s === "mature" ? " (≥ 21 days)" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
