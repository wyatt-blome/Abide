// speechSynthesis wrapper.
// Quirks handled:
// - Voices load late (Chrome, iOS): getVoices() waits for `voiceschanged` with a timeout.
// - Utterances garbage-collected mid-speech (iOS/Chrome): every live utterance is kept in a Set.
// - Chrome stops long utterances after ~15 s: long text is split into sentence chunks; boundary
//   charIndex is mapped back to the original text.
// - `onend` sometimes never fires (iOS, Android): a watchdog polls `speechSynthesis.speaking`.
// - iOS needs the first speak() inside a user gesture (tap). Call speak() from a click handler.

export const MIN_RATE = 0.6;
export const MAX_RATE = 1.4;
const CHUNK_MAX_CHARS = 220;

export type SpeakResult = "end" | "cancel" | "error";

export interface SpeakOptions {
  /** 0.6–1.4 (clamped). Default 1. */
  rate?: number;
  /** voiceURI (Settings.ttsVoice), voice name, or a SpeechSynthesisVoice. */
  voice?: string | SpeechSynthesisVoice | null;
  pitch?: number;
  volume?: number;
  /** BCP-47 lang used when no voice is chosen. Default "en-US". */
  lang?: string;
  onStart?: () => void;
  /** Word boundary in the ORIGINAL text. charLength may be undefined (Safari). */
  onBoundary?: (charIndex: number, charLength: number | undefined, name: string) => void;
  onEnd?: (result: SpeakResult) => void;
  onError?: (error: string) => void;
}

export interface SpeakHandle {
  /** Stop this speech (and anything queued). */
  cancel: () => void;
  /** Resolves when speech finishes, is cancelled, or fails. */
  done: Promise<SpeakResult>;
}

export interface SequenceItem {
  text: string;
  /** Silence after this item, ms. Defaults to options.gapMs. */
  pauseAfterMs?: number;
}

export interface SequenceOptions extends Omit<SpeakOptions, "onEnd" | "onStart"> {
  /** Silence between items, ms. Default 400. */
  gapMs?: number;
  onItemStart?: (index: number) => void;
  onItemEnd?: (index: number) => void;
  onEnd?: (result: SpeakResult) => void;
}

// ---------------- support / voices ----------------

/** onError code used when the engine has no voice to speak with. */
export const NO_VOICE_ERROR = "no-voice";
/** UI labels for a speech failure. */
export const NO_VOICES_LABEL = "No voices installed for read-aloud on this device.";
export const SPEECH_FAILED_LABEL = "Read-aloud stopped: this device couldn't speak the text.";

/** True when speech is supported but the device reports no voices (after they had time to load). */
export function noVoicesInstalled(): boolean {
  const s = synth();
  return !!s && s.getVoices().length === 0;
}

/** The label to show after a speak() / speakSequence() call ended with "error". */
export function speechErrorLabel(): string {
  return noVoicesInstalled() ? NO_VOICES_LABEL : SPEECH_FAILED_LABEL;
}

export function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function synth(): SpeechSynthesis | null {
  return isSupported() ? window.speechSynthesis : null;
}

function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang?.toLowerCase().startsWith("en") ? 0 : 10) + (v.lang === "en-US" ? 0 : 1) + (v.localService ? 0 : 2);
  return [...voices].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}

/** All voices, English (en-US, local) first. Waits up to `timeoutMs` for late-loading voices. */
export function getVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length > 0) return Promise.resolve(sortVoices(now));
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      s.removeEventListener?.("voiceschanged", finish);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(sortVoices(s.getVoices()));
    };
    s.addEventListener?.("voiceschanged", finish);
    // Some iOS versions never fire voiceschanged: poll as well.
    const poll = setInterval(() => {
      if (s.getVoices().length > 0) finish();
    }, 250);
    const timer = setTimeout(finish, timeoutMs);
  });
}

/** Subscribe to voice list changes. Returns an unsubscribe function. */
export function onVoicesChanged(cb: (voices: SpeechSynthesisVoice[]) => void): () => void {
  const s = synth();
  if (!s) return () => {};
  const handler = () => cb(sortVoices(s.getVoices()));
  s.addEventListener?.("voiceschanged", handler);
  return () => s.removeEventListener?.("voiceschanged", handler);
}

/** Find a voice by voiceURI or name among the currently loaded voices. */
export function findVoice(id: string | undefined | null): SpeechSynthesisVoice | undefined {
  const s = synth();
  if (!s || !id) return undefined;
  const voices = s.getVoices();
  return voices.find((v) => v.voiceURI === id) ?? voices.find((v) => v.name === id);
}

export function clampRate(rate: number | undefined): number {
  if (rate === undefined || !Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

// ---------------- text helpers ----------------

/** Start offsets of each whitespace-separated word in `text`. */
export function wordStartOffsets(text: string): number[] {
  const out: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m.index);
  return out;
}

/**
 * Map a boundary charIndex to the index of the word containing it (or the nearest word before it).
 * Pass the precomputed `wordStartOffsets(text)` for repeated calls.
 */
export function charIndexToWordIndex(textOrOffsets: string | number[], charIndex: number): number {
  const offsets = typeof textOrOffsets === "string" ? wordStartOffsets(textOrOffsets) : textOrOffsets;
  if (offsets.length === 0) return -1;
  let lo = 0;
  let hi = offsets.length - 1;
  if (charIndex <= offsets[0]) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= charIndex) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Split text into chunks ≤ maxChars at sentence, then clause, then word boundaries. Keeps offsets. */
export function splitForSpeech(text: string, maxChars = CHUNK_MAX_CHARS): { text: string; offset: number }[] {
  if (text.length <= maxChars) return [{ text, offset: 0 }];
  const chunks: { text: string; offset: number }[] = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= maxChars) {
      chunks.push({ text: text.slice(start), offset: start });
      break;
    }
    const window = text.slice(start, start + maxChars);
    let cut = -1;
    for (const re of [/[.!?;]["'’”)\]]*\s/g, /[,:—–]\s/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let last = -1;
      re.lastIndex = 0;
      while ((m = re.exec(window))) last = m.index + m[0].length;
      if (last > maxChars * 0.4) {
        cut = last;
        break;
      }
    }
    if (cut <= 0) cut = maxChars;
    chunks.push({ text: text.slice(start, start + cut), offset: start });
    start += cut;
  }
  return chunks.filter((c) => c.text.trim().length > 0);
}

// ---------------- speaking ----------------

/** Live utterances; holding references prevents mid-speech garbage collection. */
const live = new Set<SpeechSynthesisUtterance>();
let generation = 0;

function makeUtterance(text: string, opts: SpeakOptions): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = clampRate(opts.rate);
  if (opts.pitch !== undefined) u.pitch = opts.pitch;
  if (opts.volume !== undefined) u.volume = opts.volume;
  const voice = typeof opts.voice === "string" ? findVoice(opts.voice) : opts.voice ?? undefined;
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = opts.lang ?? "en-US";
  }
  return u;
}

/** Speak one utterance; resolves on end/cancel/error. Internal: no cancel of the queue. */
function speakOne(
  text: string,
  opts: SpeakOptions,
  offset: number,
  isCurrent: () => boolean,
  onFirstStart?: () => void,
): Promise<SpeakResult> {
  const s = synth();
  if (!s) return Promise.resolve("error");
  return new Promise<SpeakResult>((resolve) => {
    const u = makeUtterance(text, opts);
    live.add(u);
    let started = false;
    let settled = false;
    const finish = (r: SpeakResult) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      live.delete(u);
      resolve(r);
    };
    u.onstart = () => {
      started = true;
      onFirstStart?.();
    };
    u.onboundary = (e) => {
      if (!isCurrent()) return;
      opts.onBoundary?.(offset + e.charIndex, (e as SpeechSynthesisEvent & { charLength?: number }).charLength, e.name);
    };
    u.onend = () => {
      // With no voices installed some engines "end" at once without ever starting: report it
      // instead of letting callers race through every item.
      if (!started && isCurrent() && s.getVoices().length === 0) {
        opts.onError?.(NO_VOICE_ERROR);
        finish("error");
        return;
      }
      finish(isCurrent() ? "end" : "cancel");
    };
    u.onerror = (e) => {
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled") finish("cancel");
      else {
        opts.onError?.(err ?? "error");
        finish("error");
      }
    };
    // Watchdog: some engines never fire onend.
    const begun = Date.now();
    const maxMs = 8000 + (text.length / Math.max(0.5, clampRate(opts.rate))) * 120;
    const watchdog = setInterval(() => {
      if (!isCurrent()) return finish("cancel");
      if (s.paused) return;
      const idle = !s.speaking && !s.pending;
      if (started && idle) finish("end");
      else if (!started && idle && Date.now() - begun > 3000) finish("error");
      else if (Date.now() - begun > maxMs * 3) finish("end");
    }, 500);
    s.speak(u);
  });
}

/** Speak `text`, cancelling anything already speaking. Call from a user gesture the first time (iOS). */
export function speak(text: string, opts: SpeakOptions = {}): SpeakHandle {
  const s = synth();
  if (!s || !text.trim()) {
    const r: SpeakResult = s ? "end" : "error";
    queueMicrotask(() => opts.onEnd?.(r));
    return { cancel: () => {}, done: Promise.resolve(r) };
  }
  const my = ++generation;
  s.cancel();
  const isCurrent = () => generation === my;
  const done = (async (): Promise<SpeakResult> => {
    let first = true;
    for (const chunk of splitForSpeech(text)) {
      if (!isCurrent()) return "cancel";
      const r = await speakOne(chunk.text, opts, chunk.offset, isCurrent, () => {
        if (first) {
          first = false;
          opts.onStart?.();
        }
      });
      if (r !== "end") return r;
    }
    return isCurrent() ? "end" : "cancel";
  })();
  done.then((r) => opts.onEnd?.(r));
  return {
    cancel: () => {
      if (isCurrent()) cancel();
    },
    done,
  };
}

function sleep(ms: number, isCurrent: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (ms <= 0) return resolve(isCurrent());
    const step = Math.min(ms, 100);
    let left = ms;
    const t = setInterval(() => {
      left -= step;
      if (!isCurrent()) {
        clearInterval(t);
        resolve(false);
      } else if (left <= 0) {
        clearInterval(t);
        resolve(true);
      }
    }, step);
  });
}

/**
 * Speak items one after another with gaps. Boundary charIndex is relative to the current item.
 * Cancelling (handle.cancel() or cancel()) stops the whole sequence.
 */
export function speakSequence(items: Array<string | SequenceItem>, opts: SequenceOptions = {}): SpeakHandle {
  const s = synth();
  const list = items.map((i) => (typeof i === "string" ? { text: i } : i));
  if (!s) {
    queueMicrotask(() => opts.onEnd?.("error"));
    return { cancel: () => {}, done: Promise.resolve("error") };
  }
  const my = ++generation;
  s.cancel();
  const isCurrent = () => generation === my;
  const gap = opts.gapMs ?? 400;
  const done = (async (): Promise<SpeakResult> => {
    for (let i = 0; i < list.length; i++) {
      if (!isCurrent()) return "cancel";
      opts.onItemStart?.(i);
      for (const chunk of splitForSpeech(list[i].text)) {
        const r = await speakOne(chunk.text, opts, chunk.offset, isCurrent);
        if (r !== "end") return r;
      }
      opts.onItemEnd?.(i);
      const pause = list[i].pauseAfterMs ?? (i < list.length - 1 ? gap : 0);
      if (!(await sleep(pause, isCurrent))) return "cancel";
    }
    return "end";
  })();
  done.then((r) => opts.onEnd?.(r));
  return {
    cancel: () => {
      if (isCurrent()) cancel();
    },
    done,
  };
}

/** Stop all speech. */
export function cancel(): void {
  generation++;
  synth()?.cancel();
}

export function pause(): void {
  synth()?.pause();
}

export function resume(): void {
  synth()?.resume();
}

export function isSpeaking(): boolean {
  const s = synth();
  return Boolean(s && (s.speaking || s.pending));
}

export function isPaused(): boolean {
  return Boolean(synth()?.paused);
}
