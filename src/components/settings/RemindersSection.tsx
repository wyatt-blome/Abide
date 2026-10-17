"use client";

// Reminders: daily time, calendar (.ics) reminder, local test notification, Web Push status.

import { useState, useSyncExternalStore } from "react";
import { APP_NAME } from "@/config";
import { buildDailyIcs, icsFilename } from "@/lib/ics";
import { pushSupport, showTestNotification, subscribePush, type PushSupport } from "@/lib/push";
import { useSettings } from "@/components/providers/AppProviders";
import { Button, useToast } from "@/components/ui";
import { TextField } from "@/components/library/fields";
import { SettingsBlock } from "./SettingsBlock";

const noop = () => () => {};
let cachedSupport: PushSupport | null = null;
const getSupport = () => (cachedSupport ??= pushSupport());

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function RemindersSection() {
  const toast = useToast();
  const { settings, update } = useSettings();
  const support = useSyncExternalStore(noop, getSupport, () => null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const downloadIcs = () => {
    try {
      const url = typeof window !== "undefined" ? window.location.origin : undefined;
      const ics = buildDailyIcs({ reminderTime: settings.reminderTime, url });
      downloadBlob(new Blob([ics], { type: "text/calendar" }), icsFilename());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not make the calendar file.", { tone: "error" });
    }
  };

  const testNotification = async () => {
    const r = await showTestNotification(`Time for ${APP_NAME}.`);
    if (r.ok) toast("Test notification sent", { tone: "success" });
    else toast(r.reason, { tone: "error" });
  };

  return (
    <SettingsBlock title="Reminders">
      <TextField
        label="Daily reminder time"
        type="time"
        value={settings.reminderTime}
        onChange={(e) => {
          if (/^\d{2}:\d{2}$/.test(e.target.value)) void update({ reminderTime: e.target.value });
        }}
      />
      <Button icon="calendar" onClick={downloadIcs}>
        Add daily reminder to calendar (.ics)
      </Button>
      <p className="text-[15px] text-muted">A calendar reminder works on every phone, even with the app closed.</p>

      {support ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">
            {support.webPushPossible ? "✓ This device can receive web notifications." : "✗ Web notifications are not available here."}
          </p>
          {support.platform === "ios" && !support.installed ? (
            <p className="text-[15px]">On iPhone, notifications need iOS 16.4 or later and the app added to the Home Screen.</p>
          ) : null}
          <p className="text-[15px] text-muted">iPhone needs a server to send reliable daily notifications; that is not set up yet.</p>
          <Button icon="info" disabled={!support.notifications} onClick={testNotification}>
            Send a test notification
          </Button>
          <Button
            icon="refresh"
            disabled={!support.webPushPossible}
            onClick={async () => {
              const r = await subscribePush();
              setPushMsg(r.ok ? "Subscribed." : r.reason);
            }}
          >
            Turn on server reminders
          </Button>
          {pushMsg ? (
            <p role="status" className="font-semibold">
              {pushMsg}
            </p>
          ) : null}
        </div>
      ) : null}
    </SettingsBlock>
  );
}
