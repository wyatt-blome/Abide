// Media Session (lock screen / car / headset controls) and Screen Wake Lock helpers.
// Note: browsers show Media Session controls only while the page plays media. speechSynthesis
// alone may not surface them (notably iOS); handlers are still set where supported.
import { APP_NAME } from "@/config";

export type MediaAction = "play" | "pause" | "stop" | "nexttrack" | "previoustrack" | "seekbackward" | "seekforward";

export function mediaSessionSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

export interface MediaInfo {
  /** e.g. the passage reference "Psalm 23:1–6". */
  title: string;
  /** Default APP_NAME. */
  artist?: string;
  album?: string;
}

export function setMediaMetadata({ title, artist = APP_NAME, album }: MediaInfo): void {
  if (!mediaSessionSupported() || typeof MediaMetadata === "undefined") return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: album ?? APP_NAME,
      artwork: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
  } catch {
    // ignore
  }
}

/** Install handlers; returns a function that removes them. */
export function setMediaHandlers(handlers: Partial<Record<MediaAction, () => void>>): () => void {
  if (!mediaSessionSupported()) return () => {};
  const set: MediaAction[] = [];
  for (const [action, fn] of Object.entries(handlers) as [MediaAction, (() => void) | undefined][]) {
    if (!fn) continue;
    try {
      navigator.mediaSession.setActionHandler(action, () => fn());
      set.push(action);
    } catch {
      // action not supported by this browser
    }
  }
  return () => {
    for (const action of set) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // ignore
      }
    }
  };
}

export function setPlaybackState(state: MediaSessionPlaybackState): void {
  if (!mediaSessionSupported()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    // ignore
  }
}

export function clearMediaSession(): void {
  if (!mediaSessionSupported()) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  } catch {
    // ignore
  }
}

// ---------------- Wake Lock ----------------

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export interface WakeLockHandle {
  /** true while the screen is actually being kept on. */
  readonly active: boolean;
  /** Release and stop re-acquiring. */
  release: () => Promise<void>;
}

/**
 * Keep the screen on. The lock is dropped by the browser when the page is hidden; this handle
 * re-acquires it whenever the page becomes visible again, until release().
 * Never throws: on unsupported browsers `active` stays false.
 */
export async function requestWakeLock(): Promise<WakeLockHandle> {
  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  const acquire = async () => {
    if (released || !wakeLockSupported() || document.visibilityState !== "visible") return;
    if (sentinel && !sentinel.released) return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  await acquire();

  return {
    get active() {
      return Boolean(sentinel && !sentinel.released);
    },
    release: async () => {
      released = true;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      const s = sentinel;
      sentinel = null;
      try {
        await s?.release();
      } catch {
        // ignore
      }
    },
  };
}

export interface WakeLockGate {
  /** Ask for the screen to stay on. Concurrent calls share one request; at most one lock is held. */
  acquire: () => Promise<void>;
  /** Drop the lock (also one that is still being requested when it arrives). */
  release: () => void;
  /** The lock currently held, if any. */
  readonly held: WakeLockHandle | null;
}

/**
 * One screen wake lock for a component: repeated or overlapping acquire() calls never leak a
 * second handle, and a lock that resolves after release() is released at once.
 */
export function createWakeLockGate(request: () => Promise<WakeLockHandle> = requestWakeLock): WakeLockGate {
  let held: WakeLockHandle | null = null;
  let pending: Promise<WakeLockHandle> | null = null;
  let wanted = false;
  return {
    get held() {
      return held;
    },
    acquire: async () => {
      wanted = true;
      if (held) return;
      if (!pending) {
        const p = request();
        pending = p;
        p.then(
          () => {
            if (pending === p) pending = null;
          },
          () => {
            if (pending === p) pending = null;
          },
        );
      }
      const handle = await pending;
      if (handle === held) return;
      if (!wanted || held) {
        void handle.release();
        return;
      }
      held = handle;
    },
    release: () => {
      wanted = false;
      const h = held;
      held = null;
      void h?.release();
    },
  };
}
