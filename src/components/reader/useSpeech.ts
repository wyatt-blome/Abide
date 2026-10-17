"use client";

// Listen: speaks a list of items (verses, paragraphs) with tts.speakSequence, tracks the current
// item and word for highlighting, keeps the screen on (Wake Lock) and wires Media Session
// controls (play/pause/stop/next/previous) for car and headset buttons.
// "Pause" stops speech and remembers the item; "Resume" restarts at the start of that item
// (speechSynthesis.pause is unreliable on Android).

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSettings } from "@/components/providers/AppProviders";
import {
  clearMediaSession, requestWakeLock, setMediaHandlers, setMediaMetadata, setPlaybackState, type WakeLockHandle,
} from "@/lib/media";
import { cancel, charIndexToWordIndex, isSupported, speakSequence, wordStartOffsets, type SpeakResult } from "@/lib/tts";

export interface SpeechItem {
  key: string;
  text: string;
  /** Optional label shown while this item is spoken, e.g. "Genesis 3:4". */
  label?: string;
}

export type SpeechState = "idle" | "speaking" | "paused";

export interface StartOptions {
  title: string;
  startAt?: number;
  onFinish?: (result: SpeakResult) => void;
}

export interface SpeechControls {
  start: (items: SpeechItem[], opts: StartOptions) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
}

export interface Speech extends SpeechControls {
  supported: boolean;
  state: SpeechState;
  /** Index of the item being spoken (or paused at); -1 when idle. */
  index: number;
  /** The current item (spoken or paused at). */
  current: SpeechItem | null;
  /** Word index inside the current item; -1 before the first boundary. */
  word: number;
}

interface View {
  state: SpeechState;
  index: number;
  word: number;
  items: SpeechItem[];
}

const IDLE: View = { state: "idle", index: -1, word: -1, items: [] };

interface EngineDeps {
  setView: (fn: (v: View) => View) => void;
  prefs: Prefs;
}

interface Prefs {
  voice: string | undefined;
  rate: number;
}

function createEngine({ setView, prefs: initialPrefs }: EngineDeps): SpeechControls & { dispose: () => void; setPrefs: (p: Prefs) => void } {
  let prefs: Prefs = initialPrefs;
  const voice = () => prefs.voice;
  const rate = () => prefs.rate;
  let items: SpeechItem[] = [];
  let opts: StartOptions | null = null;
  let current = -1;
  let run = 0;
  let wake: WakeLockHandle | null = null;
  let unhook: (() => void) | null = null;

  const releaseWake = () => {
    const w = wake;
    wake = null;
    void w?.release();
  };
  const teardown = () => {
    unhook?.();
    unhook = null;
    clearMediaSession();
    releaseWake();
  };

  const speakFrom = (at: number) => {
    if (at < 0 || at >= items.length) return;
    const my = ++run;
    const list = items;
    const offsets = list.map((it) => wordStartOffsets(it.text));
    current = at;
    setView(() => ({ state: "speaking", index: at, word: -1, items: list }));
    setPlaybackState("playing");
    if (!wake) {
      void requestWakeLock().then((w) => {
        if (run === my && !wake) wake = w;
        else void w.release();
      });
    }
    speakSequence(
      list.slice(at).map((it) => it.text),
      {
        rate: rate(),
        voice: voice() ?? null,
        onItemStart: (i) => {
          if (run !== my) return;
          current = at + i;
          setView((v) => ({ ...v, index: at + i, word: -1 }));
        },
        onBoundary: (charIndex) => {
          if (run !== my) return;
          const o = offsets[current];
          if (o) {
            const w = charIndexToWordIndex(o, charIndex);
            setView((v) => (v.word === w ? v : { ...v, word: w }));
          }
        },
        onEnd: (result) => {
          if (run !== my || result === "cancel") return; // pause/stop/skip set their own state
          current = -1;
          setView(() => IDLE);
          teardown();
          opts?.onFinish?.(result);
        },
      },
    );
  };

  const controls: SpeechControls = {
    start: (list, o) => {
      const usable = list.filter((it) => it.text.trim());
      if (!usable.length) return;
      items = usable;
      opts = o;
      setMediaMetadata({ title: o.title });
      unhook?.();
      unhook = setMediaHandlers({
        play: () => controls.resume(),
        pause: () => controls.pause(),
        stop: () => controls.stop(),
        nexttrack: () => controls.next(),
        previoustrack: () => controls.previous(),
      });
      speakFrom(Math.max(0, Math.min(usable.length - 1, o.startAt ?? 0)));
    },
    pause: () => {
      if (current < 0) return;
      run++;
      cancel();
      setView((v) => ({ ...v, state: "paused" }));
      setPlaybackState("paused");
      releaseWake();
    },
    resume: () => {
      if (current >= 0) speakFrom(current);
    },
    stop: () => {
      run++;
      cancel();
      current = -1;
      setView(() => IDLE);
      teardown();
    },
    next: () => {
      if (current + 1 < items.length) speakFrom(current + 1);
    },
    previous: () => {
      if (current >= 0) speakFrom(Math.max(0, current - 1));
    },
  };

  return {
    ...controls,
    setPrefs: (p: Prefs) => {
      prefs = p;
    },
    dispose: () => {
      run++;
      if (current >= 0) cancel();
      current = -1;
      teardown();
    },
  };
}

const noopSubscribe = () => () => {};

export function useSpeech(): Speech {
  const { settings } = useSettings();
  const supported = useSyncExternalStore(noopSubscribe, isSupported, () => false);
  const [view, setView] = useState<View>(IDLE);
  const [engine] = useState(() => createEngine({ setView, prefs: { voice: settings.ttsVoice, rate: settings.ttsRate } }));
  // Voice and rate are read when each item starts speaking, so a change applies from the next item.
  useEffect(() => {
    engine.setPrefs({ voice: settings.ttsVoice, rate: settings.ttsRate });
  }, [engine, settings.ttsVoice, settings.ttsRate]);
  useEffect(() => () => engine.dispose(), [engine]);

  return {
    supported,
    state: view.state,
    index: view.index,
    current: view.index >= 0 ? view.items[view.index] ?? null : null,
    word: view.word,
    start: engine.start,
    pause: engine.pause,
    resume: engine.resume,
    stop: engine.stop,
    next: engine.next,
    previous: engine.previous,
  };
}

/** Split text into word/space tokens; word tokens carry their word index (matches wordStartOffsets). */
export function wordTokens(text: string): { text: string; word: number }[] {
  const out: { text: string; word: number }[] = [];
  let w = 0;
  for (const t of text.split(/(\s+)/)) {
    if (!t) continue;
    if (/^\s+$/.test(t)) out.push({ text: t, word: -1 });
    else out.push({ text: t, word: w++ });
  }
  return out;
}
