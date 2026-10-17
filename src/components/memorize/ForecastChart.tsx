"use client";

// 30-day due forecast: one series (reviews due per day) as thin bars with rounded tops anchored to
// the baseline, recessive grid, labelled axes. Accessible: <title>/<desc>, per-bar <title>
// (hover/tap tooltip) and a table view (the keyboard/screen-reader path).

import { useId, useState } from "react";
import type { ForecastDay } from "@/lib/progress";

export interface ForecastChartProps {
  days: ForecastDay[];
}

const W = 340;
const H = 180;
const PAD = { left: 30, right: 8, top: 14, bottom: 34 };

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ForecastChart({ days }: ForecastChartProps) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, days.length);
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH;
  const total = days.reduce((a, d) => a + d.count, 0);
  const shown = active !== null ? days[active] : null;

  return (
    <figure className="flex flex-col gap-2">
      <p className="min-h-6 text-[15px] font-semibold" aria-live="polite">
        {shown ? `${active === 0 ? "Today" : shortDate(shown.date)}: ${shown.count} due` : `${total} reviews due in the next ${days.length} days`}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        onMouseLeave={() => setActive(null)}
      >
        <title id={`${id}-t`}>Reviews due per day, next {days.length} days</title>
        <desc id={`${id}-d`}>
          {`Bar chart. Today: ${days[0]?.count ?? 0} due (including overdue). Busiest day: ${max} due. Total ${total}.`}
        </desc>
        {/* recessive grid + y axis ticks */}
        {[0, niceMax / 2, niceMax].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={v === 0 ? 1.5 : 0.75} />
            <text x={PAD.left - 5} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = d.count ? Math.max(2, y(0) - y(d.count)) : 0;
          const r = Math.min(4, barW / 2, h);
          const top = y(0) - h;
          const label = `${i === 0 ? "Today" : shortDate(d.date)}: ${d.count} due`;
          return (
            <g key={d.date} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
              <title>{label}</title>
              {/* hit target: the full column */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 ? (
                <path
                  d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`}
                  fill="var(--accent)"
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              ) : null}
            </g>
          );
        })}
        {/* x axis labels: today, then weekly */}
        {days.map((d, i) =>
          i % 7 === 0 ? (
            <text key={d.date} x={PAD.left + i * slot + slot / 2} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {i === 0 ? "Today" : shortDate(d.date)}
            </text>
          ) : null,
        )}
        <text x={PAD.left + plotW / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--muted)">
          Day
        </text>
        <text x={10} y={PAD.top + plotH / 2} textAnchor="middle" fontSize="10" fill="var(--muted)" transform={`rotate(-90 10 ${PAD.top + plotH / 2})`}>
          Due
        </text>
      </svg>
      <figcaption className="text-[14px] text-muted">From current due dates only. Today includes anything overdue.</figcaption>
      <details>
        <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Show as a table</summary>
        <table className="w-full text-left text-[15px]">
          <thead>
            <tr>
              <th scope="col" className="py-1">Day</th>
              <th scope="col" className="py-1 text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d.date} className="border-t border-border">
                <td className="py-1">{i === 0 ? "Today" : shortDate(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
