"use client";

// Speak It: recite out loud; the transcript is scored with the same fuzzy word alignment as typing.

import { useEffect, useRef, useState } from "react";
import { listen } from "@/lib/speech";
import { ActionBar, Button, haptic, Icon } from "@/components/ui";
import { DiffView } from "./DiffView";
import { scoreVerses, type MultiScore } from "./helpers";
import type { PerVerseAccuracy, PracticeVerse } from "./types";

export interface SpeakItProps {
  verses: PracticeVerse[];
  onComplete: (perVerse: PerVerseAccuracy) => void;
}

export function SpeakIt({ verses, onComplete }: SpeakItProps) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MultiScore | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const start = () => {
    setError(null);
    setPartial("");
    setResult(null);
    setListening(true);
    stopRef.current = listen({
      onPartial: setPartial,
      onFinal: (text) => {
        const r = scoreVerses(verses, text);
        if (r.matched < r.total) haptic("error");
        setPartial(text);
        setResult(r);
      },
      onError: (_code, message) => {
        haptic("error");
        setError(message);
      },
      onEnd: () => {
        setListening(false);
        stopRef.current = null;
      },
    });
  };

  const stop = () => stopRef.current?.();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">Tap Start, say the passage, then tap Stop.</p>
      {listening ? (
        <p className="flex items-center gap-2 font-bold" role="status">
          <Icon name="mic" size={22} /> Listening…
        </p>
      ) : null}
      {partial && !result ? <p className="reading bordered rounded-xl bg-surface p-3">{partial}</p> : null}
      {error ? (
        <p role="alert" className="flex items-center gap-2 font-semibold text-danger">
          <Icon name="cross" size={20} />
          {error}
        </p>
      ) : null}
      {result ? (
        <DiffView
          ops={result.ops}
          matched={result.matched}
          total={result.total}
          verseStarts={verses.length > 1 ? result.verseStarts.map((at, i) => ({ at, label: verses[i].label })) : []}
        />
      ) : null}
      <ActionBar label="Speak controls">
        {listening ? (
          <Button variant="danger" icon="stop" size="lg" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button variant={result ? "secondary" : "primary"} icon="mic" size="lg" onClick={start}>
            {result ? "Try again" : "Start"}
          </Button>
        )}
        {result && !listening ? (
          <Button variant="primary" icon="check" size="lg" onClick={() => onComplete(result.perVerse)}>
            Continue
          </Button>
        ) : null}
      </ActionBar>
    </div>
  );
}
