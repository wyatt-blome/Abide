"use client";

// "Memorize this" sheet (opened from the reader): add a range to the Ad hoc plan or start a new
// plan for it. Either way the new verses start tomorrow.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { MemoryPlan, VerseRange } from "@/db/types";
import { loadMeta } from "@/lib/bible";
import type { BibleMeta } from "@/lib/meta";
import {
  AD_HOC_ID, AD_HOC_TITLE, addToAdHocPlan, bundledTranslation, createPlanStartingTomorrow, loadPassageData,
} from "@/lib/planActions";
import { formatRange, rangeToKeys } from "@/lib/refs";
import { useSettings } from "@/components/providers/AppProviders";
import { Button, ChipGroup, haptic, Sheet, useToast } from "@/components/ui";

export interface MemorizeThisSheetProps {
  open: boolean;
  onClose(): void;
  range: VerseRange;
}

type Target = "adhoc" | "new";

const PACE_OPTIONS: { value: MemoryPlan["pace"]; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "everyOtherDay", label: "Every other day" },
  { value: "twicePerDay", label: "2 a day" },
];

export function MemorizeThisSheet({ open, onClose, range }: MemorizeThisSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const { settings } = useSettings();
  const [meta, setMeta] = useState<BibleMeta | null>(null);
  const [target, setTarget] = useState<Target>("adhoc");
  const [pace, setPace] = useState<MemoryPlan["pace"]>("daily");
  const [busy, setBusy] = useState(false);
  const adHoc = useLiveQuery(() => db.plans.filter((p) => p.starterId === AD_HOC_ID).first(), [], undefined);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const label = formatRange(range, meta ?? undefined);
  const keys = meta ? rangeToKeys(meta, range, true) : [];
  const inPlan = adHoc ? new Set(adHoc.chunks.flat()) : new Set<string>();
  const already = keys.filter((k) => inPlan.has(k)).length;
  const fresh = keys.length - already;

  const submit = async () => {
    setBusy(true);
    try {
      const translation = target === "adhoc" && adHoc ? adHoc.translation : bundledTranslation(settings.translation);
      const data = await loadPassageData(range, translation);
      if (target === "adhoc") {
        const res = await addToAdHocPlan(range, data, { translation, pace });
        if (res.added === 0) {
          toast(`Already in ${AD_HOC_TITLE}`, { tone: "info" });
        } else {
          haptic("success");
          const msg = `Added ${res.added} verse${res.added === 1 ? "" : "s"} to ${AD_HOC_TITLE} · starts tomorrow`;
          toast(msg, {
            tone: "success",
            action: { label: "Open", onAction: () => router.push(`/memorize/plan?id=${res.plan.id}`) },
          });
        }
      } else {
        const plan = await createPlanStartingTomorrow(range, label, data, { translation, pace });
        haptic("success");
        toast(`New plan: ${plan.title} · starts tomorrow`, {
          tone: "success",
          action: { label: "Open", onAction: () => router.push(`/memorize/plan?id=${plan.id}`) },
        });
      }
      onClose();
    } catch (e) {
      haptic("error");
      toast(e instanceof Error ? e.message : "Couldn't add the passage.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Memorize this"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="plus" disabled={busy || (target === "adhoc" && !!adHoc && meta !== null && fresh === 0)} onClick={submit}>
            {target === "adhoc" ? "Add" : "Create plan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[19px] font-bold">{label}</p>
        <ChipGroup<Target>
          label="Where to add it"
          showLabel
          single
          options={[
            { value: "adhoc", label: adHoc ? `Add to ${AD_HOC_TITLE}` : `New ${AD_HOC_TITLE} plan` },
            { value: "new", label: "Its own plan" },
          ]}
          selected={[target]}
          onChange={(v) => v[0] && setTarget(v[0])}
        />
        {target === "adhoc" && adHoc && meta ? (
          <p className="text-muted">
            {fresh} new verse{fresh === 1 ? "" : "s"}
            {already ? ` · ${already} already in ${AD_HOC_TITLE} (kept as they are)` : ""}
          </p>
        ) : null}
        {target === "new" || !adHoc ? (
          <ChipGroup<MemoryPlan["pace"]>
            label="Pace"
            showLabel
            single
            options={PACE_OPTIONS}
            selected={[pace]}
            onChange={(v) => v[0] && setPace(v[0])}
          />
        ) : null}
        <p className="font-semibold">Starts tomorrow.</p>
      </div>
    </Sheet>
  );
}
