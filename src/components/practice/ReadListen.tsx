"use client";

// Read & Listen: one verse at a time (swipe or Prev/Next), read aloud with word highlight.
// Rate (0.6–1.4) and voice are saved to settings (ttsRate, ttsVoice).

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  cancel, charIndexToWordIndex, clampRate, getVoices, isSupported, MAX_RATE, MIN_RATE, onVoicesChanged, speak, speakSequence,
  wordStartOffsets, type SpeakHandle,
} from "@/lib/tts";
import { useSettings } from "@/components/providers/AppProviders";
import { ActionBar, Button, cx } from "@/components/ui";
import { useSwipe } from "./useSwipe";
import type { PracticeVerse } from "./types";

export interface ReadListenProps {
  verses: PracticeVerse[];
  /** Offered after reading ("Next: Hide words"). */
  onNextMode?: () => void;
  nextModeLabel?: string;
}

export function ReadListen({ verses, onNextMode, nextModeLabel }: ReadListenProps) {
  const { settings, update } = useSettings();
  const rateId = useId();
  const voiceId = useId();
  const [index, setIndex] = useState(0);
  const [word, setWord] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const handle = useRef<SpeakHandle | null>(null);
  const supported = typeof window !== "undefined" && isSupported();
  const v = verses[Math.min(index, verses.length - 1)];
  const offsets = useMemo(() => (v ? wordStartOffsets(v.text) : []), [v]);
  const words = useMemo(() => (v ? v.text.match(/\S+/g) ?? [] : []), [v]);

  useEffect(() => {
    let alive = true;
    getVoices().then((list) => alive && setVoices(list));
    const off = onVoicesChanged((list) => setVoices(list));
    return () => {
      alive = false;
      off();
      cancel();
    };
  }, []);

  const stop = () => {
    handle.current?.cancel();
    handle.current = null;
    setPlaying(false);
    setWord(-1);
  };

  const go = (n: number) => {
    stop();
    setIndex(Math.max(0, Math.min(verses.length - 1, n)));
  };

  const playOne = () => {
    if (!v) return;
    stop();
    setPlaying(true);
    handle.current = speak(v.text, {
      rate: settings.ttsRate,
      voice: settings.ttsVoice,
      onBoundary: (ci) => setWord(charIndexToWordIndex(offsets, ci)),
      onEnd: () => {
        setPlaying(false);
        setWord(-1);
      },
    });
  };

  const playAll = () => {
    stop();
    const from = index;
    const list = verses.slice(from);
    let cur = from;
    setPlaying(true);
    handle.current = speakSequence(
      list.map((x) => x.text),
      {
        rate: settings.ttsRate,
        voice: settings.ttsVoice,
        gapMs: 700,
        onItemStart: (i) => {
          cur = from + i;
          setIndex(cur);
          setWord(-1);
        },
        onBoundary: (ci) => setWord(charIndexToWordIndex(wordStartOffsets(verses[cur].text), ci)),
        onEnd: () => {
          setPlaying(false);
          setWord(-1);
        },
      },
    );
  };

  const swipe = useSwipe(() => go(index - 1), () => go(index + 1));

  if (!v) return null;

  return (
    <div className="flex flex-col gap-4">
      <div {...swipe} className="bordered min-h-40 rounded-2xl bg-surface p-4" aria-live="polite">
        <p className="mb-2 font-bold text-muted">
          {v.label} <span className="font-normal">({index + 1} of {verses.length})</span>
        </p>
        <p className="reading">
          {words.map((w, i) => (
            <span key={i} className={cx(i === word && "rounded bg-accent text-accent-fg underline decoration-2 underline-offset-4")}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
      {verses.length > 1 ? <p className="text-[15px] text-muted">Swipe left or right for the next verse.</p> : null}

      {!supported ? <p className="text-muted">Read-aloud isn&apos;t available in this browser.</p> : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={rateId} className="font-semibold">
          Speed {clampRate(settings.ttsRate).toFixed(1)}×
        </label>
        <input
          id={rateId}
          type="range"
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.1}
          value={clampRate(settings.ttsRate)}
          onChange={(e) => void update({ ttsRate: clampRate(Number(e.target.value)) })}
          className="h-12 w-full accent-[var(--accent)]"
        />
      </div>
      {voices.length ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={voiceId} className="font-semibold">
            Voice
          </label>
          <select
            id={voiceId}
            value={settings.ttsVoice ?? ""}
            onChange={(e) => void update({ ttsVoice: e.target.value || undefined })}
            className="bordered min-h-12 rounded-xl bg-bg px-3 text-fg"
          >
            <option value="">Default voice</option>
            {voices.map((vo) => (
              <option key={vo.voiceURI} value={vo.voiceURI}>
                {vo.name} ({vo.lang})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {verses.length > 1 ? (
          <Button icon="repeat" onClick={playAll} disabled={!supported}>
            Listen from here to the end
          </Button>
        ) : null}
        {onNextMode ? (
          <Button icon="chevronRight" onClick={onNextMode}>
            {nextModeLabel ?? "Next"}
          </Button>
        ) : null}
      </div>

      <ActionBar label="Read controls">
        <Button icon="chevronLeft" disabled={index === 0} onClick={() => go(index - 1)} label="Previous verse" iconOnly />
        {playing ? (
          <Button variant="primary" icon="stop" size="lg" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" icon="speaker" size="lg" onClick={playOne} disabled={!supported}>
            Listen
          </Button>
        )}
        <Button
          icon="chevronRight"
          disabled={index >= verses.length - 1}
          onClick={() => go(index + 1)}
          label="Next verse"
          iconOnly
        />
      </ActionBar>
    </div>
  );
}
