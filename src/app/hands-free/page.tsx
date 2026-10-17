"use client";

// Hands-Free (/hands-free?source=queue | ?plan=ID | ?plan=ID&loop=1&repeats=N&gap=S).
// True-black screen, big controls at the bottom, no tab bar. Per item: the reference is read, a
// pause for reciting (settings.handsFreePauseSec), then the verse. "First half, I finish it": the
// first half is read, a pause to finish it, then the whole verse. Nothing is graded: each item is
// logged as "heard" (it stays due). Listen loop: the passage is read N times, S seconds between
// verses. Lock-screen / headset controls via Media Session; the screen stays on while playing.

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db } from "@/db/db";
import { introduceDueChunks, recordHeard } from "@/db/repo";
import type { MemoryPlan } from "@/db/types";
import { requestWakeLock, setMediaHandlers, setMediaMetadata, setPlaybackState, clearMediaSession, type WakeLockHandle } from "@/lib/media";
import { buildQueue } from "@/lib/queue";
import { formatRange, formatRef, fromKey } from "@/lib/refs";
import { cancel as cancelSpeech, isSupported as ttsSupported, speak } from "@/lib/tts";
import { useHandsFreeMode, useSettings } from "@/components/providers/AppProviders";
import { Button, cx, Icon, Stepper, Toggle } from "@/components/ui";
import { firstHalf, loadPracticeVerses } from "@/components/practice/helpers";
import { useSwipe } from "@/components/practice/useSwipe";

const noopSubscribe = () => () => {};

interface HFItem {
  id: string;
  reference: string;
  text: string;
  cardId?: string;
  cardType?: "verse" | "passage";
}

type Phase = "idle" | "reference" | "recite" | "half" | "finish" | "verse" | "gap" | "done";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  reference: "Reference",
  recite: "Your turn: say it",
  half: "First half",
  finish: "Your turn: finish it",
  verse: "Listen",
  gap: "Next verse coming",
  done: "Finished",
};

async function planItems(plan: MemoryPlan): Promise<HFItem[]> {
  const verses = await loadPracticeVerses(plan.chunks.flat(), plan.translation);
  const cards = await db.verseCards.where("planId").equals(plan.id).toArray();
  const byKey = new Map(cards.map((c) => [c.key, c]));
  return verses.map((v) => ({
    id: v.key, reference: formatRef(v.ref), text: v.text, cardId: byKey.get(v.key)?.id, cardType: byKey.has(v.key) ? "verse" : undefined,
  }));
}

async function queueItems(): Promise<HFItem[]> {
  await introduceDueChunks();
  const now = Date.now();
  const [plans, verseCards, passageCards] = await Promise.all([db.plans.toArray(), db.verseCards.toArray(), db.passageCards.toArray()]);
  plans.sort((a, b) => a.createdAt - b.createdAt);
  const byId = new Map(plans.map((p) => [p.id, p]));
  const out: HFItem[] = [];
  for (const it of buildQueue({ plans, verseCards, passageCards, now }).items) {
    const plan = byId.get(it.planId);
    if (!plan) continue;
    if (it.kind === "review") {
      const [v] = await loadPracticeVerses([it.card.key], plan.translation);
      if (v) out.push({ id: it.card.id, reference: formatRef(v.ref), text: v.text, cardId: it.card.id, cardType: "verse" });
    } else if (it.kind === "passage") {
      const vs = await loadPracticeVerses(it.keys, plan.translation);
      const range = { start: fromKey(it.keys[0]), end: fromKey(it.keys[it.keys.length - 1]) };
      out.push({ id: it.card.id, reference: formatRange(range), text: vs.map((v) => v.text).join(" "), cardId: it.card.id, cardType: "passage" });
    } else {
      const vs = await loadPracticeVerses(it.keys, plan.translation);
      for (const v of vs) {
        const card = it.cards.find((c) => c.key === v.key);
        out.push({ id: `${it.planId}:${v.key}`, reference: formatRef(v.ref), text: v.text, cardId: card?.id, cardType: card ? "verse" : undefined });
      }
    }
  }
  return out;
}

function sleep(ms: number, alive: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (ms <= 0) return resolve(alive());
    const until = Date.now() + ms;
    const t = setInterval(() => {
      if (!alive()) {
        clearInterval(t);
        resolve(false);
      } else if (Date.now() >= until) {
        clearInterval(t);
        resolve(true);
      }
    }, 100);
  });
}

function HandsFree() {
  useHandsFreeMode();
  const params = useSearchParams();
  const planId = params.get("plan");
  const loop = params.get("loop") === "1" && !!planId;
  const { settings, update } = useSettings();
  const [items, setItems] = useState<HFItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [running, setRunning] = useState(false);
  const [halfVariant, setHalfVariant] = useState(false);
  const [repeats, setRepeats] = useState(() => Math.min(20, Math.max(1, Number(params.get("repeats")) || 3)));
  const [gap, setGap] = useState(() => Math.min(15, Math.max(0, Number(params.get("gap") ?? 2) || 0)));
  const [lap, setLap] = useState(1);

  const gen = useRef(0);
  const wake = useRef<WakeLockHandle | null>(null);
  const wakePending = useRef<Promise<WakeLockHandle> | null>(null);
  const wantWake = useRef(false);
  const live = useRef({ pauseSec: settings.handsFreePauseSec, rate: settings.ttsRate, voice: settings.ttsVoice, halfVariant, gap, repeats });
  useEffect(() => {
    live.current = { pauseSec: settings.handsFreePauseSec, rate: settings.ttsRate, voice: settings.ttsVoice, halfVariant, gap, repeats };
  }, [settings.handsFreePauseSec, settings.ttsRate, settings.ttsVoice, halfVariant, gap, repeats]);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<{ list: HFItem[]; name: string }> => {
      if (planId) {
        const plan = await db.plans.get(planId);
        if (!plan) throw new Error("Plan not found.");
        return { list: await planItems(plan), name: plan.title };
      }
      return { list: await queueItems(), name: "Today's verses" };
    };
    load()
      .then(({ list, name }) => {
        if (!alive) return;
        setItems(list);
        setTitle(name);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't load verses."));
    return () => {
      alive = false;
    };
  }, [planId]);

  const say = useCallback(async (text: string, alive: () => boolean): Promise<boolean> => {
    if (!alive()) return false;
    const h = speak(text, { rate: live.current.rate, voice: live.current.voice });
    const r = await h.done;
    return alive() && r !== "cancel";
  }, []);

  const releaseWake = useCallback(() => {
    wantWake.current = false;
    void wake.current?.release();
    wake.current = null;
  }, []);

  // One wake lock at a time: concurrent requests share the pending promise, and a lock that
  // arrives after Stop (or a second one) is released at once.
  const acquireWake = useCallback(async () => {
    wantWake.current = true;
    if (wake.current) return;
    if (!wakePending.current) {
      const pending = requestWakeLock();
      wakePending.current = pending;
      void pending.finally(() => {
        if (wakePending.current === pending) wakePending.current = null;
      });
    }
    const handle = await wakePending.current;
    if (wake.current === handle) return;
    if (!wantWake.current || wake.current) {
      void handle.release();
      return;
    }
    wake.current = handle;
  }, []);

  const stop = useCallback(() => {
    gen.current++;
    cancelSpeech();
    setRunning(false);
    setPlaybackState("paused");
    releaseWake();
  }, [releaseWake]);

  const runFrom = useCallback(
    (start: number, startLap = 1) => {
      if (!items || !items.length) return;
      const my = ++gen.current;
      const alive = () => gen.current === my;
      setRunning(true);
      setPlaybackState("playing");
      void acquireWake().catch(() => {});
      void (async () => {
        const laps = loop ? live.current.repeats : 1;
        for (let l = startLap; l <= laps; l++) {
          setLap(l);
          for (let i = l === startLap ? start : 0; i < items.length; i++) {
            const it = items[i];
            const began = Date.now();
            setIndex(i);
            setMediaMetadata({ title: it.reference, album: title });
            if (loop) {
              setPhase("verse");
              if (!(await say(it.text, alive))) return;
              setPhase("gap");
              if (!(await sleep(live.current.gap * 1000, alive))) return;
              continue;
            }
            setPhase("reference");
            if (!(await say(it.reference, alive))) return;
            if (live.current.halfVariant) {
              setPhase("half");
              if (!(await say(firstHalf(it.text), alive))) return;
              setPhase("finish");
            } else {
              setPhase("recite");
            }
            if (!(await sleep(live.current.pauseSec * 1000, alive))) return;
            setPhase("verse");
            if (!(await say(it.text, alive))) return;
            if (it.cardId && it.cardType) void recordHeard(it.cardId, it.cardType, Date.now() - began).catch(() => {});
            setPhase("gap");
            if (!(await sleep(1200, alive))) return;
          }
        }
        if (!alive()) return;
        setPhase("done");
        setRunning(false);
        setPlaybackState("paused");
        releaseWake();
      })();
    },
    [items, loop, say, title, acquireWake, releaseWake],
  );

  const toggle = useCallback(() => {
    if (running) stop();
    else runFrom(phase === "done" ? 0 : index, phase === "done" ? 1 : lap);
  }, [running, stop, runFrom, phase, index, lap]);

  const step = useCallback(
    (d: number) => {
      if (!items?.length) return;
      const n = Math.max(0, Math.min(items.length - 1, index + d));
      if (running) runFrom(n, lap);
      else {
        setIndex(n);
        setPhase("idle");
      }
    },
    [items, index, running, runFrom, lap],
  );

  // Media Session: lock screen, car and headset buttons.
  const handlers = useRef({ toggle, step, stop, runFrom, running });
  useEffect(() => {
    handlers.current = { toggle, step, stop, runFrom, running };
  }, [toggle, step, stop, runFrom, running]);
  useEffect(() => {
    const genRef = gen;
    const wakeRef = wake;
    const wantWakeRef = wantWake;
    const off = setMediaHandlers({
      play: () => !handlers.current.running && handlers.current.toggle(),
      pause: () => handlers.current.running && handlers.current.stop(),
      nexttrack: () => handlers.current.step(1),
      previoustrack: () => handlers.current.step(-1),
    });
    return () => {
      off();
      genRef.current++;
      cancelSpeech();
      clearMediaSession();
      wantWakeRef.current = false;
      void wakeRef.current?.release();
      wakeRef.current = null;
    };
  }, []);

  const swipe = useSwipe(() => step(-1), () => step(1));
  // Server render and hydration assume support; the real value is read after hydration.
  const speechOk = useSyncExternalStore(noopSubscribe, ttsSupported, () => true);
  const item = items?.[index];

  return (
    <div className="flex min-h-[calc(100dvh-var(--safe-top))] flex-col pb-[calc(200px+var(--safe-bottom))]">
      <h1 className="pt-3 text-[18px] font-bold text-muted">
        Hands-Free{title ? ` · ${title}` : ""}
        {loop ? " · Listen loop" : ""}
      </h1>

      {!speechOk ? <p className="mt-2 font-semibold">Read-aloud isn&apos;t available in this browser.</p> : null}
      {error ? (
        <p role="alert" className="mt-4 text-[20px] font-bold">
          {error}
        </p>
      ) : null}
      {items && !items.length ? <p className="mt-6 text-[22px] font-bold">Nothing due right now.</p> : null}
      {!items && !error ? <p role="status">Loading…</p> : null}

      {item ? (
        <div {...swipe} className="flex flex-1 flex-col justify-center gap-3 py-6" aria-live="polite">
          <p className="text-[18px] font-semibold text-muted">
            {index + 1} of {items!.length}
            {loop ? ` · time ${lap} of ${repeats}` : ""}
          </p>
          <p className="text-[40px] font-bold leading-tight">{item.reference}</p>
          <p className="text-[24px] font-bold">{PHASE_LABEL[phase]}</p>
          {phase === "verse" || phase === "half" ? <p className="reading text-muted">{phase === "half" ? firstHalf(item.text) : item.text}</p> : null}
        </div>
      ) : null}

      <details className="bordered mb-4 rounded-2xl p-3">
        <summary className="flex min-h-12 cursor-pointer items-center text-[18px] font-semibold">Settings</summary>
        <div className="mt-3 flex flex-col gap-4">
          {loop ? (
            <>
              <Stepper label="Times through" value={repeats} min={1} max={20} onChange={setRepeats} />
              <Stepper label="Gap between verses" value={gap} min={0} max={15} format={(v) => `${v} s`} onChange={setGap} />
            </>
          ) : (
            <>
              <Stepper
                label="Pause to recite"
                value={settings.handsFreePauseSec}
                min={2}
                max={30}
                format={(v) => `${v} s`}
                onChange={(v) => void update({ handsFreePauseSec: v })}
              />
              <Toggle label="First half, I finish it" checked={halfVariant} onChange={setHalfVariant} />
            </>
          )}
        </div>
      </details>

      <div
        role="toolbar"
        aria-label="Hands-Free controls"
        className={cx("fixed inset-x-0 bottom-0 z-30 border-t-[length:var(--border-width)] border-border bg-bg", "pb-[var(--safe-bottom)]")}
      >
        <div className="mx-auto flex max-w-[44rem] flex-col gap-2 px-4 py-3">
          <div className="flex items-stretch gap-3">
            <Button size="xl" icon="skipPrev" iconOnly label="Previous" className="flex-1" disabled={!items?.length} onClick={() => step(-1)} />
            <Button size="xl" variant="primary" icon={running ? "pause" : "play"} className="flex-[2]" disabled={!items?.length} onClick={toggle}>
              {running ? "Pause" : phase === "done" ? "Again" : "Start"}
            </Button>
            <Button size="xl" icon="skipNext" iconOnly label="Next" className="flex-1" disabled={!items?.length} onClick={() => step(1)} />
          </div>
          <Link
            href={planId ? `/memorize/plan?id=${planId}` : "/memorize"}
            onClick={() => stop()}
            className="bordered flex min-h-12 items-center justify-center gap-2 rounded-xl text-[18px] font-semibold text-fg no-underline"
          >
            <Icon name="close" /> Exit
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function HandsFreePage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <HandsFree />
    </Suspense>
  );
}
