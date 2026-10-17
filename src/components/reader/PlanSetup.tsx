"use client";

import { useState } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import { ActionBar, Button, Card, ChipGroup, Icon, PageHeader, useToast } from "@/components/ui";
import type { ReadingPlan, ReadingStyle, TranslationId } from "@/db/types";
import { CHRONOLOGICAL } from "../../../content/plans/chronological";
import { loadHeadings, loadMeta } from "@/lib/bible";
import { isISODate, nextMonday, type ISODate } from "@/lib/isoDate";
import { createReadingPlan, estMinutes } from "@/lib/readingPlanStore";
import { PLAN_DAYS } from "@/lib/planGen";
import { formatDateLong, STYLE_HELP, STYLE_LABEL, WEEKDAY_SHORT, WEEKDAYS } from "./format";
import { availableTranslations, effectiveTranslation } from "./passage";
import { TRANSLATION_NAME } from "./PickerSheet";

/** Average verses per day over 312 days (31,086 verses with BSB text). */
const AVG_VERSES_PER_DAY = 100;

export function PlanSetup({ today }: { today: ISODate }) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const esv = { esvEnabled: settings.esvEnabled, esvKey: settings.esvKey };
  const [style, setStyle] = useState<ReadingStyle>("blended");
  const [grace, setGrace] = useState<ReadingPlan["graceWeekday"]>(settings.graceWeekday ?? 0);
  const [start, setStart] = useState<ISODate>(nextMonday(today));
  const [translation, setTranslation] = useState<TranslationId>(effectiveTranslation(settings.translation, esv));
  const [busy, setBusy] = useState(false);

  const validStart = isISODate(start);
  const create = async () => {
    if (!validStart) return;
    setBusy(true);
    try {
      const [meta, headings] = await Promise.all([loadMeta(), loadHeadings()]);
      await createReadingPlan({ style, startDate: start, graceWeekday: grace, translation }, { meta, headings, chronological: CHRONOLOGICAL });
      if (settings.graceWeekday !== grace) await update({ graceWeekday: grace });
      toast("Reading plan ready.", { tone: "success" });
    } catch {
      toast("Couldn't create the plan. Check your connection and try again.", { tone: "error" });
      setBusy(false);
    }
  };

  const styles: ReadingStyle[] = ["blended", "canonical", "chronological"];

  return (
    <>
      <PageHeader title="Read the Bible in a year" />
      <p className="mb-4 text-muted">
        {PLAN_DAYS} reading days, 6 days a week, {estMinutes(AVG_VERSES_PER_DAY, settings.readingVersesPerMin)} minutes a day on average.
        One day a week is a grace day: rest or catch up.
      </p>

      <div className="flex flex-col gap-4">
        <Card title="Order">
          <div role="radiogroup" aria-label="Order" className="flex flex-col gap-2">
            {styles.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={style === s}
                onClick={() => setStyle(s)}
                className={`bordered flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${style === s ? "border-accent bg-bg" : "bg-surface"}`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full [border-width:3px] ${style === s ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
                >
                  {style === s ? <Icon name="check" size={22} strokeWidth={3} /> : null}
                </span>
                <span className="flex flex-col">
                  <span className="text-[19px] font-bold">
                    {STYLE_LABEL[s]}
                    {s === "blended" ? " (default)" : ""}
                  </span>
                  <span className="text-[15px] text-muted">{STYLE_HELP[s]}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Grace day">
          <ChipGroup
            label="Grace day"
            single
            options={WEEKDAY_SHORT.map((d, i) => ({ value: String(i), label: d }))}
            selected={[String(grace)]}
            onChange={(sel) => {
              if (sel[0] !== undefined) setGrace(Number(sel[0]) as ReadingPlan["graceWeekday"]);
            }}
          />
          <p className="mt-2 text-[15px] text-muted">No reading is scheduled on {WEEKDAYS[grace]}s.</p>
        </Card>

        <Card title="Start date">
          <label className="flex flex-col gap-1">
            <span className="sr-only">Start date</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="bordered min-h-14 rounded-xl bg-bg px-3 text-[19px]"
            />
          </label>
          <p className="mt-2 text-[15px] text-muted">
            {validStart ? formatDateLong(start) : "Pick a date."}
            {validStart && start < today ? " Days before today will count as missed." : ""}
          </p>
        </Card>

        <Card title="Translation">
          <ChipGroup
            label="Translation"
            single
            options={availableTranslations(esv).map((t) => ({ value: t, label: t }))}
            selected={[translation]}
            onChange={(sel) => {
              if (sel[0]) setTranslation(sel[0] as TranslationId);
            }}
          />
          <p className="mt-2 text-[15px] text-muted">{TRANSLATION_NAME[translation]}. You can switch any time in the Reader.</p>
        </Card>
      </div>

      <ActionBar label="Create plan">
        <Button variant="primary" size="lg" icon="check" disabled={busy || !validStart} onClick={() => void create()}>
          {busy ? "Making your plan…" : "Start plan"}
        </Button>
      </ActionBar>
    </>
  );
}
