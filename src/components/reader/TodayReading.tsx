"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import { Button, cx, Icon, useToast } from "@/components/ui";
import type { ReadingDay, ReadingPlan, ReadingPortion, TranslationId } from "@/db/types";
import type { ISODate } from "@/lib/isoDate";
import type { BibleMeta } from "@/lib/meta";
import { isCatchUpDay, missedDays, type MissedPolicy } from "@/lib/missed";
import {
  applyMissedToPlan, daysOn, estMinutes, isGraceDate, setPortionDone, sortDays, unreadVerses,
} from "@/lib/readingPlanStore";
import { formatRange, formatRef } from "@/lib/refs";
import { CheckBox } from "./CheckBox";
import { formatDate, minutesLabel, TRACK_LABEL } from "./format";
import { ListenButton } from "./ListenButton";
import { MissedSheet } from "./MissedSheet";
import { loadPassage } from "./passage";
import { useSpeech, type Speech, type SpeechItem } from "./useSpeech";

export const portionReaderHref = (dayId: string, portion: number): string =>
  `/read/reader?day=${encodeURIComponent(dayId)}&portion=${portion}`;

// ---------------------------------------------------------------- one day's portions

export interface DayPortionsProps {
  day: ReadingDay;
  meta: BibleMeta | null;
  versesPerMin: number;
  heading?: string;
  /** Key of the verse being spoken (marks its portion). */
  speakingRange?: { dayId: string; index: number } | null;
}

export function DayPortions({ day, meta, versesPerMin, heading, speakingRange }: DayPortionsProps) {
  return (
    <div className="flex flex-col gap-1">
      {heading ? <p className="text-[15px] font-bold text-muted">{heading}</p> : null}
      <ul className="flex flex-col gap-1">
        {day.portions.map((p, i) => {
          const label = meta ? formatRange(p.range, meta) : formatRef(p.range.start);
          const speaking = speakingRange?.dayId === day.id && speakingRange.index === i;
          return (
            <li key={`${day.id}-${i}`} className={cx("flex items-center gap-3 rounded-xl", speaking && "bg-surface-strong")}>
              <CheckBox checked={p.done} onChange={(c) => void setPortionDone(day.id, i, c)} label={`Read ${label}`} />
              <Link href={portionReaderHref(day.id, i)} className="tap flex flex-1 flex-col justify-center rounded-xl py-1">
                <span className={cx("text-[19px] font-bold", p.done && "line-through decoration-2")}>
                  {label}
                  {speaking ? <span className="sr-only"> (playing)</span> : null}
                </span>
                <span className="text-[15px] text-muted">
                  {[p.track === "ALL" ? null : TRACK_LABEL[p.track], `${p.verseCount} verses`, minutesLabel(estMinutes(p.verseCount, versesPerMin))]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
              <Icon name="chevronRight" size={22} className="shrink-0 text-muted" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- listen to portions

export interface PortionEntry {
  dayId: string;
  index: number;
  portion: ReadingPortion;
}

export function entriesOf(days: ReadingDay[], unreadOnly = true): PortionEntry[] {
  const all = days.flatMap((d) => d.portions.map((portion, index) => ({ dayId: d.id, index, portion })));
  const unread = all.filter((e) => !e.portion.done);
  return unreadOnly && unread.length ? unread : all;
}

export interface PortionsListen {
  speech: Speech;
  busy: boolean;
  listen: () => void;
  /** Portion being spoken. */
  speaking: { dayId: string; index: number } | null;
  /** "Genesis 3:4" while speaking. */
  nowLabel: string | null;
}

/** Preloads the portions' text so Listen can start speaking inside the tap (iOS). */
export function usePortionsListen(entries: PortionEntry[], translation: TranslationId, title: string): PortionsListen {
  const { settings } = useSettings();
  const speech = useSpeech();
  const toast = useToast();
  const [items, setItems] = useState<{ sig: string; items: (SpeechItem & { dayId: string; index: number })[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const sig = useMemo(
    () => `${translation}|${entries.map((e) => `${e.dayId}:${e.index}:${formatRef(e.portion.range.start)}`).join(",")}`,
    [entries, translation],
  );
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const esv = useMemo(() => ({ esvEnabled: settings.esvEnabled, esvKey: settings.esvKey }), [settings.esvEnabled, settings.esvKey]);

  const load = useMemo(
    () => async (list: PortionEntry[]) => {
      const out: (SpeechItem & { dayId: string; index: number })[] = [];
      for (const e of list) {
        const passage = await loadPassage(translation, e.portion.range, esv);
        for (const v of passage.verses) {
          if (v.text) out.push({ key: v.key, text: v.text, label: formatRef(v.ref), dayId: e.dayId, index: e.index });
        }
      }
      return out;
    },
    [translation, esv],
  );

  useEffect(() => {
    if (!entries.length) return;
    let cancelled = false;
    load(entries)
      .then((list) => {
        if (!cancelled) setItems({ sig, items: list });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // sig captures entries + translation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, load]);

  const ready = items && items.sig === sig ? items.items : null;

  const begin = (list: (SpeechItem & { dayId: string; index: number })[]) => {
    if (!list.length) {
      toast("No text to read for this portion.", { tone: "error" });
      return;
    }
    speech.start(list, {
      title,
      onFinish: (result) => {
        if (result !== "end") return;
        const done = entriesRef.current;
        toast("Finished listening.", {
          duration: 8000,
          action: {
            label: "Mark read",
            onAction: () => {
              for (const e of done) void setPortionDone(e.dayId, e.index, true);
            },
          },
        });
      },
    });
  };

  const listen = () => {
    if (ready) return begin(ready);
    setBusy(true);
    load(entries)
      .then(begin)
      .catch(() => toast("Couldn't load the text. Check your connection.", { tone: "error" }))
      .finally(() => setBusy(false));
  };

  const cur = speech.current as (SpeechItem & { dayId?: string; index?: number }) | null;
  return {
    speech,
    busy,
    listen,
    speaking: cur && cur.dayId !== undefined && cur.index !== undefined ? { dayId: cur.dayId, index: cur.index } : null,
    nowLabel: cur?.label ?? null,
  };
}

export function NowPlaying({ listen }: { listen: PortionsListen }) {
  if (listen.speech.state === "idle") return null;
  return (
    <div className="flex items-center gap-3" role="status">
      <Icon name="speaker" size={22} />
      <span className="flex-1 font-semibold">
        {listen.speech.state === "paused" ? "Paused" : "Now reading"}
        {listen.nowLabel ? `: ${listen.nowLabel}` : ""}
      </span>
      <Button icon="stop" onClick={listen.speech.stop}>
        Stop
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- missed-day policy

const ASKED_KEY = "abide.read.missedAsked";

function askedThisSession(planId: string): boolean {
  try {
    return sessionStorage.getItem(ASKED_KEY) === planId;
  } catch {
    return false;
  }
}

function markAsked(planId: string) {
  try {
    sessionStorage.setItem(ASKED_KEY, planId);
  } catch {
    // ignore
  }
}

/**
 * Ask once (plan.missedPolicy === "ask") which policy to use; once chosen, apply it automatically
 * whenever days are missed.
 */
export function useMissedPolicy(plan: ReadingPlan, days: ReadingDay[], today: ISODate, meta: BibleMeta | null) {
  const toast = useToast();
  const missed = useMemo(() => missedDays(days, today), [days, today]);
  const missedSig = `${today}|${missed.map((d) => d.id).join(",")}`;
  const applied = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!meta || plan.missedPolicy === "ask" || missed.length === 0) return;
    if (applied.current === missedSig) return;
    applied.current = missedSig;
    void applyMissedToPlan(plan.id, plan.missedPolicy, { meta, today }).catch(() => {});
  }, [meta, plan.id, plan.missedPolicy, missed.length, missedSig, today]);

  const askOpen = plan.missedPolicy === "ask" && missed.length > 0 && !dismissed && !askedThisSession(plan.id) && !!meta;

  const choose = async (policy: MissedPolicy) => {
    if (!meta) return;
    setBusy(true);
    try {
      await applyMissedToPlan(plan.id, policy, { meta, today, remember: true });
      applied.current = missedSig;
      toast("Plan updated.", { tone: "success" });
    } catch {
      toast("Couldn't update the plan.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    markAsked(plan.id);
    setDismissed(true);
  };

  return { missed, askOpen, choose, close, busy };
}

// ---------------------------------------------------------------- today's reading block

export interface TodayReadingProps {
  plan: ReadingPlan;
  days: ReadingDay[];
  today: ISODate;
  meta: BibleMeta | null;
  /** Render the Listen button inside the block (Today page). */
  showListen?: boolean;
  /** Supply when the page runs usePortionsListen itself (Read page). */
  listen?: PortionsListen;
}

export function todaysDays(plan: ReadingPlan, days: ReadingDay[], today: ISODate): ReadingDay[] {
  if (today < plan.startDate) {
    const first = sortDays(days).find((d) => d.portions.length > 0);
    return first ? [first] : [];
  }
  const on = daysOn(days, today);
  if (isGraceDate(plan, today)) return [...on, ...missedDays(days, today).filter((d) => !on.includes(d))];
  return on;
}

export function TodayReading({ plan, days, today, meta, showListen, listen: external }: TodayReadingProps) {
  const { settings } = useSettings();
  const vpm = settings.readingVersesPerMin;
  const grace = isGraceDate(plan, today);
  const notStarted = today < plan.startDate;
  const todays = useMemo(() => todaysDays(plan, days, today), [plan, days, today]);
  const missedPolicy = useMissedPolicy(plan, days, today, meta);
  const entries = useMemo(() => entriesOf(todays), [todays]);
  const own = usePortionsListen(showListen ? entries : [], plan.translation, "Today's reading");
  const listen = external ?? own;
  const remaining = unreadVerses(todays);
  const allDone = todays.length > 0 && remaining === 0;
  const finished = !notStarted && days.length > 0 && days.every((d) => d.portions.every((p) => p.done));

  let intro: string;
  if (finished) intro = "You finished the plan.";
  else if (notStarted) intro = `Your plan starts ${formatDate(plan.startDate)}. You can read ahead.`;
  else if (grace) intro = todays.length ? "Rest or catch up. Missed readings:" : "Rest or catch up. Nothing to catch up on.";
  else if (!todays.length) intro = "Nothing scheduled today.";
  else if (allDone) intro = "Today's reading is done.";
  else intro = `${remaining} verses · ${minutesLabel(estMinutes(remaining, vpm))}`;

  return (
    <div className="flex flex-col gap-3">
      <p className={cx("font-semibold", allDone && "text-success")}>
        {allDone ? <Icon name="check" size={20} className="mr-1 inline align-[-3px]" /> : null}
        {grace && !finished ? <span className="font-bold">Grace day. </span> : null}
        {intro}
      </p>
      {todays.map((d) => (
        <DayPortions
          key={d.id}
          day={d}
          meta={meta}
          versesPerMin={vpm}
          speakingRange={listen.speaking}
          heading={
            isCatchUpDay(d)
              ? `Catch-up (${formatDate(d.date)})`
              : d.date < today
                ? `Day ${d.dayIndex + 1} · missed (${formatDate(d.date)})`
                : todays.length > 1 || notStarted
                  ? `Day ${d.dayIndex + 1} · ${formatDate(d.date)}`
                  : undefined
          }
        />
      ))}
      {showListen && entries.length ? (
        <>
          <NowPlaying listen={listen} />
          <ListenButton speech={listen.speech} onListen={listen.listen} busy={listen.busy} block />
        </>
      ) : null}
      {missedPolicy.missed.length > 0 && !grace ? (
        <p className="flex items-center gap-2 text-[15px] font-semibold text-danger">
          <Icon name="cross" size={18} />
          {missedPolicy.missed.length} missed {missedPolicy.missed.length === 1 ? "day" : "days"}
          {plan.missedPolicy === "ask" ? null : " (being caught up)"}
        </p>
      ) : null}
      <MissedSheet
        open={missedPolicy.askOpen}
        onClose={missedPolicy.close}
        missedDays={missedPolicy.missed.length}
        busy={missedPolicy.busy}
        onChoose={(p) => {
          void missedPolicy.choose(p).then(missedPolicy.close);
        }}
      />
    </div>
  );
}
