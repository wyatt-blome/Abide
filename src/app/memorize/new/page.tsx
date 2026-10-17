"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STARTERS, STARTER_BY_ID } from "../../../../content/starters";
import { createMemoryPlan, type PassageData } from "@/db/repo";
import type { MemoryPlan, TranslationId, VerseRange } from "@/db/types";
import { headingsInRange, loadHeadings, loadMeta } from "@/lib/bible";
import { chunkPassage } from "@/lib/chunking";
import { todayISO } from "@/lib/isoDate";
import type { BibleMeta } from "@/lib/meta";
import { bundledTranslation, loadPassageData } from "@/lib/planActions";
import { formatRange, rangeSize } from "@/lib/refs";
import { useSettings } from "@/components/providers/AppProviders";
import { ReferencePicker } from "@/components/ReferencePicker";
import { storyHeadings } from "@/components/practice/HeadingsDrill";
import { ActionBar, Button, ChipGroup, cx, haptic, Icon, PageHeader, Stepper, Toggle, useToast } from "@/components/ui";

type Source = "starter" | "custom";
type Pace = MemoryPlan["pace"];

const PACES: { value: Pace; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "everyOtherDay", label: "Every other day" },
  { value: "twicePerDay", label: "2 a day" },
];
const TRANSLATIONS: { value: TranslationId; label: string }[] = [
  { value: "BSB", label: "BSB" },
  { value: "WEB", label: "WEB" },
  { value: "KJV", label: "KJV" },
];

/** Days until every chunk is introduced, at a pace. */
function daysFor(chunks: number, pace: Pace): number {
  if (chunks <= 0) return 0;
  if (pace === "twicePerDay") return Math.ceil(chunks / 2);
  if (pace === "everyOtherDay") return chunks * 2 - 1;
  return chunks;
}

function durationLabel(days: number): string {
  if (days <= 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days <= 70) return `about ${Math.round(days / 7)} weeks`;
  return `about ${Math.round(days / 30)} months`;
}

export default function NewPlanPage() {
  const router = useRouter();
  const toast = useToast();
  const { settings, ready } = useSettings();
  const dateId = useId();
  const [meta, setMeta] = useState<BibleMeta | null>(null);
  const [source, setSource] = useState<Source>("starter");
  const [starterId, setStarterId] = useState<string>(STARTERS[0].id);
  const [fullChapter, setFullChapter] = useState(false);
  const [custom, setCustom] = useState<VerseRange[]>([]);
  const [pace, setPace] = useState<Pace>("daily");
  const [chunkSize, setChunkSize] = useState(2);
  const [translation, setTranslation] = useState<TranslationId | null>(null);
  const [startDate, setStartDate] = useState(() => todayISO());
  const [preview, setPreview] = useState<{ key: string; data: PassageData; headings: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const t: TranslationId = translation ?? (ready ? bundledTranslation(settings.translation) : "BSB");
  const starter = STARTER_BY_ID[starterId];
  const range: VerseRange | null =
    source === "starter" ? (fullChapter && starter.fullChapterOption ? starter.fullChapterOption : starter.range) : custom[0] ?? null;
  const title = source === "starter" && !(fullChapter && starter.fullChapterOption) ? starter.title : range ? formatRange(range, meta ?? undefined) : "";
  const previewKey = range ? `${t}|${JSON.stringify(range)}` : "";

  useEffect(() => {
    let alive = true;
    loadMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!range) return;
    let alive = true;
    Promise.all([loadPassageData(range, t), loadHeadings()])
      .then(([data, hs]) => {
        if (alive) setPreview({ key: previewKey, data, headings: storyHeadings(headingsInRange(hs, range)).length });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // previewKey identifies range + translation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const current = preview && preview.key === previewKey ? preview : null;
  const chunks = useMemo(
    () => (current ? chunkPassage(current.data.verses, current.data.headingStarts, chunkSize, current.data.emptyKeys).length : 0),
    [current, chunkSize],
  );

  const pickStarter = (id: string) => {
    const s = STARTER_BY_ID[id];
    setStarterId(id);
    setFullChapter(false);
    setChunkSize(s.chunkSize);
    setPace(s.pace);
  };

  const create = async () => {
    if (!range) return;
    setBusy(true);
    try {
      const data = current?.data ?? (await loadPassageData(range, t));
      const plan = await createMemoryPlan(
        {
          title, range, translation: t, pace, chunkSize, startDate,
          starterId: source === "starter" ? starter.id : undefined,
        },
        data,
      );
      haptic("success");
      router.push(`/memorize/plan?id=${plan.id}`);
    } catch (e) {
      haptic("error");
      toast(e instanceof Error ? e.message : "Couldn't create the plan.", { tone: "error" });
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New plan" backHref="/memorize" />
      <div className="flex flex-col gap-6">
        <ChipGroup<Source>
          label="Passage"
          showLabel
          single
          options={[
            { value: "starter", label: "Starter passages" },
            { value: "custom", label: "Choose a passage" },
          ]}
          selected={[source]}
          onChange={(v) => v[0] && setSource(v[0])}
        />

        {source === "starter" ? (
          <ul className="flex flex-col gap-2" aria-label="Starter passages">
            {STARTERS.map((s) => {
              const on = s.id === starterId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickStarter(s.id)}
                    className={cx(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-left",
                      "[border-width:max(2px,var(--border-width))] border-solid",
                      on ? "border-accent bg-surface" : "border-border bg-bg",
                    )}
                  >
                    <span className={cx("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full", on ? "bg-accent text-accent-fg" : "bordered")}>
                      {on ? <Icon name="check" size={18} /> : null}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[18px] font-bold">{s.title}</span>
                      <span className="block text-[15px] text-muted">
                        {meta ? `${rangeSize(s.range, meta)} verses` : ""}
                        {s.long ? " · long plan" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <ReferencePicker label="Passage to memorize" value={custom} onChange={setCustom} />
        )}

        {source === "starter" && starter.fullChapterOption ? (
          <Toggle
            label={`Whole chapter (${formatRange(starter.fullChapterOption, meta ?? undefined)})`}
            checked={fullChapter}
            onChange={setFullChapter}
          />
        ) : null}

        {source === "starter" && starter.headingsDrillFirst ? (
          <p className="bordered flex items-start gap-2 rounded-xl bg-surface p-3 font-semibold">
            <Icon name="info" />
            <span>Long plan. Start with Story of the Passage: learn the BSB section headings in order, then the verses.</span>
          </p>
        ) : null}

        <ChipGroup<Pace> label="Pace" showLabel single options={PACES} selected={[pace]} onChange={(v) => v[0] && setPace(v[0])} />
        <Stepper label="Verses per chunk" value={chunkSize} min={1} max={3} onChange={setChunkSize} />
        <ChipGroup<TranslationId>
          label="Translation"
          showLabel
          single
          options={TRANSLATIONS}
          selected={[t]}
          onChange={(v) => v[0] && setTranslation(v[0])}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={dateId} className="font-semibold">
            Start date
          </label>
          <input
            id={dateId}
            type="date"
            value={startDate}
            min={todayISO()}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
            className="bordered min-h-12 rounded-xl bg-bg px-3 text-[18px] text-fg"
          />
        </div>

        {range ? (
          <div className="bordered rounded-xl bg-surface p-3" aria-live="polite">
            <p className="text-[18px] font-bold">{title}</p>
            {current ? (
              <p className="text-muted">
                {chunks} chunk{chunks === 1 ? "" : "s"} · new verses for {durationLabel(daysFor(chunks, pace))}
                {current.headings ? ` · ${current.headings} BSB heading${current.headings === 1 ? "" : "s"}` : " · No BSB headings in this range"}
              </p>
            ) : (
              <p className="text-muted">Working out chunks…</p>
            )}
          </div>
        ) : null}
      </div>

      <ActionBar label="Create plan">
        <Button variant="primary" icon="plus" size="lg" disabled={!range || busy} onClick={() => void create()}>
          Create plan
        </Button>
      </ActionBar>
    </>
  );
}
