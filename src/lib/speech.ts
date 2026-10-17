// SpeechRecognition / webkitSpeechRecognition wrapper.
// Not available: Firefox, iOS home-screen (standalone) apps, insecure contexts. Callers show the
// one-line `reason` and offer typing instead.

export interface SpeechSupport {
  supported: boolean;
  reason?: string;
}

export interface ListenOptions {
  /** Default "en-US". */
  lang?: string;
  /** Running transcript (final + interim) while speaking. */
  onPartial?: (text: string) => void;
  /** Whole final transcript, once, when recognition ends (after stop() or silence). */
  onFinal?: (text: string) => void;
  /** Recognition error: code (e.g. "not-allowed", "no-speech") and a one-line message for the UI. */
  onError?: (code: string, message: string) => void;
  /** Called after onFinal/onError when the session is over. */
  onEnd?: () => void;
  /** Keep listening through pauses until stop(). Default true. */
  continuous?: boolean;
}

// Minimal typings (not in TypeScript's DOM lib).
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionResultList {
  readonly length: number;
  [index: number]: RecognitionResult;
}
interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}
interface RecognitionErrorEvent extends Event {
  readonly error: string;
}
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
}

export const UNSUPPORTED_REASON = "Speech recognition isn't available in this browser.";
export const IOS_STANDALONE_REASON = "Speech recognition isn't available in the home-screen app on iPhone. Open it in Safari to speak.";
export const INSECURE_REASON = "Speech recognition needs a secure (https) connection.";

export function speechSupport(): SpeechSupport {
  if (typeof window === "undefined") return { supported: false, reason: UNSUPPORTED_REASON };
  if (isIOS() && isStandalone()) return { supported: false, reason: IOS_STANDALONE_REASON };
  if (window.isSecureContext === false) return { supported: false, reason: INSECURE_REASON };
  if (!ctor()) return { supported: false, reason: UNSUPPORTED_REASON };
  return { supported: true };
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone permission was denied.",
  "service-not-allowed": "Speech recognition is turned off on this device.",
  "no-speech": "No speech was heard.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a network connection on this device.",
  "language-not-supported": "This language isn't supported for speech recognition.",
};

export function speechErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? "Speech recognition stopped.";
}

/**
 * Start listening. Returns stop(): ends the session gracefully (the final transcript is delivered
 * through onFinal). Calling stop() twice is safe.
 */
export function listen(opts: ListenOptions = {}): () => void {
  const Ctor = ctor();
  const support = speechSupport();
  if (!Ctor || !support.supported) {
    queueMicrotask(() => {
      opts.onError?.("unsupported", support.reason ?? UNSUPPORTED_REASON);
      opts.onEnd?.();
    });
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = opts.lang ?? "en-US";
  rec.continuous = opts.continuous ?? true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  const finals: string[] = [];
  let stopped = false;
  let ended = false;
  let errored = false;

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0]?.transcript ?? "";
      if (r.isFinal) finals[i] = t;
      else interim += t;
    }
    const text = [...finals.filter(Boolean), interim].join(" ").replace(/\s+/g, " ").trim();
    opts.onPartial?.(text);
  };
  rec.onerror = (e) => {
    if (e.error === "aborted") return;
    if (e.error === "no-speech" && finals.length > 0) return;
    errored = true;
    opts.onError?.(e.error, speechErrorMessage(e.error));
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    const text = finals.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (!errored || text) opts.onFinal?.(text);
    opts.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    ended = true;
    queueMicrotask(() => {
      opts.onError?.("start-failed", "Speech recognition couldn't start.");
      opts.onEnd?.();
    });
  }

  return () => {
    if (stopped || ended) return;
    stopped = true;
    try {
      rec.stop();
    } catch {
      rec.abort();
    }
  };
}
