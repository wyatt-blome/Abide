// Reminders: what the device supports today, and a placeholder for server Web Push.
//
// Reliable daily notifications on iOS (and when the app is closed anywhere) need a server that
// sends Web Push messages on a schedule. Planned later, not built:
//   1. Generate a VAPID key pair; expose the public key to the client (NEXT_PUBLIC_VAPID_KEY).
//   2. Client: registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
//      and POST the subscription + reminderTime + time zone to an API route.
//   3. A Vercel Cron job (vercel.json "crons", e.g. every 15 minutes) loads due subscriptions and
//      sends them with the `web-push` library using the VAPID private key (env secret).
//   4. The service worker shows the notification in its "push" handler.
// Until then subscribePush() reports why it cannot subscribe, and the app offers a local test
// notification plus a calendar (.ics) reminder, which works on every platform.

import { APP_NAME } from "@/config";

export type Platform = "ios" | "android" | "other";

export interface PushSupport {
  platform: Platform;
  /** Running as an installed app (home screen / standalone). */
  installed: boolean;
  notifications: boolean;
  pushManager: boolean;
  serviceWorker: boolean;
  /** Web Push could work here (iOS: only 16.4+ and only when installed). */
  webPushPossible: boolean;
  permission: NotificationPermission | "unsupported";
}

export function detectPlatform(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS reports a Mac user agent; touch support tells them apart.
  if (/Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
}

/** iOS major.minor from the user agent, or null. */
export function iosVersion(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): number | null {
  const m = /OS (\d+)[_.](\d+)/.exec(ua);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

export function pushSupport(): PushSupport {
  const hasWindow = typeof window !== "undefined";
  const notifications = hasWindow && "Notification" in window;
  const pushManager = hasWindow && "PushManager" in window;
  const serviceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const platform = detectPlatform();
  const installed = isInstalled();
  let webPushPossible = notifications && pushManager && serviceWorker;
  if (platform === "ios") {
    const v = iosVersion();
    webPushPossible = webPushPossible && installed && v !== null && v >= 16.04;
  }
  return {
    platform,
    installed,
    notifications,
    pushManager,
    serviceWorker,
    webPushPossible,
    permission: notifications ? Notification.permission : "unsupported",
  };
}

export type SubscribeResult = { ok: true; subscription: PushSubscriptionJSON } | { ok: false; reason: string };

/** Server Web Push is not set up yet (see the plan above). Never subscribes; says why. */
export async function subscribePush(): Promise<SubscribeResult> {
  const s = pushSupport();
  if (!s.notifications || !s.pushManager || !s.serviceWorker) {
    return { ok: false, reason: "This browser does not support Web Push." };
  }
  if (s.platform === "ios" && !s.installed) {
    return { ok: false, reason: "On iPhone, add the app to the Home Screen first (iOS 16.4 or later)." };
  }
  return { ok: false, reason: "Server reminders are not set up yet. Use the calendar reminder for now." };
}

export type TestNotificationResult = { ok: true } | { ok: false; reason: string };

/** Ask permission (from a tap) and show one local notification now. */
export async function showTestNotification(body: string): Promise<TestNotificationResult> {
  const s = pushSupport();
  if (!s.notifications) return { ok: false, reason: "Notifications are not supported here." };
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Notifications are blocked for this app." };
  try {
    const reg = s.serviceWorker ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(APP_NAME, { body, tag: "abide-test" });
    else new Notification(APP_NAME, { body, tag: "abide-test" });
    return { ok: true };
  } catch {
    return { ok: false, reason: "The notification could not be shown." };
  }
}
