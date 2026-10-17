"use client";

import { useState } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import { Button, ChipGroup, Sheet, useToast } from "@/components/ui";
import type { ReadingPlan, TranslationId } from "@/db/types";
import { deleteReadingPlan, updateReadingPlan } from "@/lib/readingPlanStore";
import { formatDate, STYLE_LABEL, WEEKDAYS } from "./format";
import { POLICY_LABEL } from "./MissedSheet";
import { availableTranslations } from "./passage";

export interface PlanSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  plan: ReadingPlan;
}

const POLICIES: ReadingPlan["missedPolicy"][] = ["ask", "graceDay", "spread", "shiftEnd"];

export function PlanSettingsSheet({ open, onClose, plan }: PlanSettingsSheetProps) {
  const { settings } = useSettings();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    setConfirm(false);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Plan settings"
      footer={
        confirm ? (
          <>
            <Button onClick={() => setConfirm(false)}>Keep plan</Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                void deleteReadingPlan(plan.id).then(() => {
                  toast("Plan deleted.");
                  close();
                });
              }}
            >
              Delete plan
            </Button>
          </>
        ) : (
          <Button onClick={close}>Done</Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-muted">
          {STYLE_LABEL[plan.style]} · started {formatDate(plan.startDate)} · grace day {WEEKDAYS[plan.graceWeekday]}
        </p>
        <div>
          <ChipGroup
            label="When I miss days"
            showLabel
            single
            options={POLICIES.map((p) => ({ value: p, label: POLICY_LABEL[p] }))}
            selected={[plan.missedPolicy]}
            onChange={(sel) => {
              if (sel[0]) void updateReadingPlan(plan.id, { missedPolicy: sel[0] as ReadingPlan["missedPolicy"] });
            }}
          />
          <p className="mt-1 text-[15px] text-muted">Finished days never change.</p>
        </div>
        <ChipGroup
          label="Translation"
          showLabel
          single
          options={availableTranslations({ esvEnabled: settings.esvEnabled, esvKey: settings.esvKey }).map((t) => ({ value: t, label: t }))}
          selected={[plan.translation]}
          onChange={(sel) => {
            if (sel[0]) void updateReadingPlan(plan.id, { translation: sel[0] as TranslationId });
          }}
        />
        {confirm ? (
          <p className="font-semibold text-danger" role="alert">
            Delete this plan and its progress? This can&apos;t be undone.
          </p>
        ) : (
          <Button variant="secondary" icon="trash" onClick={() => setConfirm(true)}>
            Start over with a new plan
          </Button>
        )}
      </div>
    </Sheet>
  );
}
