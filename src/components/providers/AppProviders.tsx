"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Serwist } from "@serwist/window";
import { db } from "@/db/db";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "@/db/repo";
import type { Settings, Theme } from "@/db/types";
import { THEME_META_COLORS } from "@/lib/brand";
import { ToastProvider } from "@/components/ui/Toast";
import { FONT_SCALE_STORAGE_KEY, THEME_STORAGE_KEY } from "./storageKeys";
import { offlineCacheSupported, warmOfflineCache, type WarmupProgress } from "./offlineWarmup";

declare global {
  interface Window {
    /** Set by @serwist/next's injected client entry (production builds only). */
    serwist?: Serwist;
  }
}


const MIN_FONT_SCALE = 1;
const MAX_FONT_SCALE = 2;

// ---------------- Settings ----------------

export interface SettingsContextValue {
  /** Current settings (DEFAULT_SETTINGS until the Dexie row has loaded). */
  settings: Settings;
  /** true once the stored settings have been read. */
  ready: boolean;
  /** Patch settings (persisted via updateSettings; UI updates live). */
  update: (patch: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <AppProviders>");
  return ctx;
}

// ---------------- App update (service worker) ----------------

export interface AppUpdateValue {
  /** A new version has installed and is waiting. */
  updateAvailable: boolean;
  /** Activate the waiting version and reload the page. */
  applyUpdate: () => void;
}

const UpdateContext = createContext<AppUpdateValue>({ updateAvailable: false, applyUpdate: () => {} });

export function useAppUpdate(): AppUpdateValue {
  return useContext(UpdateContext);
}

// ---------------- Offline status ----------------

export interface OfflineStatus {
  state: "unsupported" | "idle" | "warming" | "ready" | "partial";
  /** Files checked/cached so far and total (bible + enabled small library packs). */
  done: number;
  total: number;
  failed: number;
  /** Re-run the warm-up (e.g. after enabling packs). */
  rewarm: () => void;
}

const OfflineContext = createContext<OfflineStatus>({
  state: "unsupported",
  done: 0,
  total: 0,
  failed: 0,
  rewarm: () => {},
});

export function useOfflineStatus(): OfflineStatus {
  return useContext(OfflineContext);
}

// ---------------- Theme helpers ----------------

export function clampFontScale(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, v));
}

function resolvedTheme(theme: Theme): "light" | "dark" | "sunlight" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setThemeColorMeta(color: string) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute("content", color);
  });
}

function currentChromeColor(theme: Theme): string {
  if (document.documentElement.classList.contains("hands-free")) return THEME_META_COLORS.handsFree;
  return THEME_META_COLORS[resolvedTheme(theme)];
}

/**
 * Hands-free chrome: true-black page while `active`. Call from the hands-free screen:
 * `useHandsFreeMode()`; the class is removed again on unmount.
 */
export function useHandsFreeMode(active = true): void {
  const ctx = useContext(SettingsContext);
  const theme = ctx?.settings.theme ?? "system";
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.classList.add("hands-free");
    setThemeColorMeta(THEME_META_COLORS.handsFree);
    return () => {
      root.classList.remove("hands-free");
      setThemeColorMeta(currentChromeColor(theme));
    };
  }, [active, theme]);
}

// ---------------- Provider ----------------

export function AppProviders({ children }: { children: ReactNode }) {
  // Live row from Dexie; getSettings() once ensures the singleton exists (writes are not allowed in liveQuery).
  const row = useLiveQuery(() => db.settings.get("singleton"), [], null);
  const [ensured, setEnsured] = useState<Settings | null>(null);
  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) setEnsured(s);
      })
      .catch(() => {
        if (!cancelled) setEnsured(DEFAULT_SETTINGS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const settings: Settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, ...(ensured ?? {}), ...(row ?? {}) }),
    [row, ensured],
  );
  const ready = row !== null || ensured !== null;

  const update = useCallback(async (patch: Partial<Settings>) => {
    await updateSettings(patch);
  }, []);

  // Apply theme + font scale to <html>, mirror them for the pre-paint script.
  useEffect(() => {
    const root = document.documentElement;
    const theme = settings.theme ?? "system";
    root.dataset.theme = theme;
    const scale = clampFontScale(settings.fontScale);
    root.style.setProperty("--font-scale", String(scale));
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(scale));
    } catch {
      // storage unavailable (private mode): ignore
    }
    setThemeColorMeta(currentChromeColor(theme));
    if (theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setThemeColorMeta(currentChromeColor(theme));
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [settings.theme, settings.fontScale]);

  const updateValue = useServiceWorkerUpdate();
  const offline = useOfflineWarmup(ready ? settings.enabledPacks : null);

  const settingsValue = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);

  return (
    <SettingsContext.Provider value={settingsValue}>
      <UpdateContext.Provider value={updateValue}>
        <OfflineContext.Provider value={offline}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </UpdateContext.Provider>
    </SettingsContext.Provider>
  );
}

// ---------------- Service worker update flow ----------------

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function useServiceWorkerUpdate(): AppUpdateValue {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const reloading = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const sw = window.serwist;
    const onWaiting = () => setUpdateAvailable(true);
    sw?.addEventListener("waiting", onWaiting);

    // A worker may already be waiting from an earlier visit (registered before this effect ran).
    let lastCheck = Date.now();
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg?.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
        reg?.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true);
          });
        });
      })
      .catch(() => {});

    // The app stays open for days: look for a new version when it comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      sw?.removeEventListener("waiting", onWaiting);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const reload = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    const sw = window.serwist;
    if (sw) {
      sw.addEventListener("controlling", reload);
      sw.messageSkipWaiting();
    }
    // Also message the waiting worker directly (covers a worker found via getRegistration()).
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        else if (!sw) reload();
      })
      .catch(reload);
    // Safety net: if nothing happens, reload anyway.
    setTimeout(reload, 4000);
  }, []);

  return useMemo(() => ({ updateAvailable, applyUpdate }), [updateAvailable, applyUpdate]);
}

// ---------------- Offline warm-up ----------------

const noopSubscribe = () => () => {};

function useOfflineWarmup(enabledPacks: string[] | null): OfflineStatus {
  const [progress, setProgress] = useState<WarmupProgress & { running: boolean; finished: boolean }>({
    done: 0,
    total: 0,
    failed: 0,
    running: false,
    finished: false,
  });
  const [runId, setRunId] = useState(0);
  const packsKey = enabledPacks ? [...enabledPacks].sort().join(",") : null;
  // false during prerender/hydration, then the real value (avoids a hydration mismatch).
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => offlineCacheSupported() && process.env.NODE_ENV === "production",
    () => false,
  );

  useEffect(() => {
    if (packsKey === null || !supported) return;
    const controller = new AbortController();
    const packs = packsKey ? packsKey.split(",") : [];
    // Let the first screen render and settle before downloading.
    const start = () => {
      setProgress((p) => ({ ...p, running: true, finished: false }));
      warmOfflineCache({
        enabledPacks: packs,
        signal: controller.signal,
        onProgress: (p) => setProgress((prev) => ({ ...prev, ...p })),
      })
        .then((p) => {
          if (!controller.signal.aborted) setProgress({ ...p, running: false, finished: true });
        })
        .catch(() => {
          if (!controller.signal.aborted) setProgress((prev) => ({ ...prev, running: false, finished: true }));
        });
    };
    const timer = setTimeout(start, 2500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [packsKey, supported, runId]);

  const rewarm = useCallback(() => setRunId((n) => n + 1), []);

  return useMemo<OfflineStatus>(() => {
    let state: OfflineStatus["state"];
    if (!supported) state = "unsupported";
    else if (progress.running) state = "warming";
    else if (!progress.finished) state = "idle";
    else state = progress.failed > 0 || progress.total === 0 ? "partial" : "ready";
    return { state, done: progress.done, total: progress.total, failed: progress.failed, rewarm };
  }, [supported, progress, rewarm]);
}
