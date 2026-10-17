"use client";

// Settings: every preference in the Settings record, plus reminders, backup and about.

import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_NAME_VERSE } from "@/config";
import type { Settings, Theme, TranslationId } from "@/db/types";
import { getVerseText } from "@/lib/bible";
import { clearEsvSession, esvAvailable } from "@/lib/esv";
import { NO_PACKS } from "@/lib/enabledPacks";
import { toKey } from "@/lib/refs";
import * as tts from "@/lib/tts";
import { useSettings } from "@/components/providers/AppProviders";
import { Button, ChipGroup, PageHeader, Stepper, Toggle, useToast } from "@/components/ui";
import { SelectField, TextField } from "@/components/library/fields";
import { linkButtonClass } from "@/components/library/shared";
import { useAsync } from "@/components/sources/useAsync";
import { AboutSection } from "./AboutSection";
import { BackupSection } from "./BackupSection";
import { RemindersSection } from "./RemindersSection";
import { SettingsBlock } from "./SettingsBlock";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sunlight", label: "Sunlight" },
];

const verseKey = toKey(APP_NAME_VERSE);

export function SettingsScreen() {
  const { settings, update, ready } = useSettings();
  const set = (patch: Partial<Settings>) => void update(patch);
  const verse = useAsync("name-verse", () => getVerseText("BSB", verseKey));

  return (
    <>
      <PageHeader title="Settings" />
      {!ready ? <p role="status" className="text-muted">Loading…</p> : null}

      <SettingsBlock title="Reading">
        <TranslationPicker settings={settings} onChange={(translation) => set({ translation })} />
        <Stepper
          label="Text size"
          value={settings.fontScale}
          min={1}
          max={2}
          step={0.1}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(fontScale) => set({ fontScale })}
        />
        <div className="bordered rounded-xl bg-bg p-3" aria-label="Text size preview">
          <p className="reading">{verse.data ?? ""}</p>
        </div>
        <ChipGroup
          label="Theme"
          showLabel
          single
          options={THEMES}
          selected={[settings.theme]}
          onChange={(v) => v[0] && set({ theme: v[0] })}
        />
        <Stepper
          label="Reading speed (verses per minute)"
          value={settings.readingVersesPerMin}
          min={3}
          max={20}
          onChange={(readingVersesPerMin) => set({ readingVersesPerMin })}
        />
      </SettingsBlock>

      <VoiceBlock settings={settings} set={set} verseText={verse.data ?? ""} />

      <SettingsBlock title="Memorize">
        <Stepper
          label="New chunks per day (at most)"
          value={settings.dailyNewLimit}
          min={1}
          max={10}
          onChange={(dailyNewLimit) => set({ dailyNewLimit })}
        />
        <SelectField
          label="Grace day (rest day each week)"
          value={String(settings.graceWeekday)}
          onChange={(e) => set({ graceWeekday: Number(e.target.value) as Settings["graceWeekday"] })}
        >
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </SelectField>
      </SettingsBlock>

      <SettingsBlock title="Sources library">
        <p>
          {settings.enabledPacks.length === 0
            ? "Using the default works."
            : settings.enabledPacks.includes(NO_PACKS)
              ? "All works are switched off."
              : `${settings.enabledPacks.length} works switched on.`}
        </p>
        <Link href="/library/manager" className={linkButtonClass("secondary")}>
          Open Library manager
        </Link>
      </SettingsBlock>

      <EsvBlock settings={settings} set={set} />
      <RemindersSection />
      <BackupSection />
      <AboutSection verseText={verse.data} />
    </>
  );
}

function TranslationPicker({ settings, onChange }: { settings: Settings; onChange: (t: TranslationId) => void }) {
  const options: { value: TranslationId; label: string }[] = [
    { value: "BSB", label: "BSB" },
    { value: "WEB", label: "WEB" },
    { value: "KJV", label: "KJV" },
    ...(esvAvailable(settings) ? [{ value: "ESV" as const, label: "ESV" }] : []),
  ];
  return (
    <ChipGroup
      label="Translation"
      showLabel
      single
      options={options}
      selected={[settings.translation]}
      onChange={(v) => v[0] && onChange(v[0])}
    />
  );
}

function VoiceBlock({ settings, set, verseText }: { settings: Settings; set: (p: Partial<Settings>) => void; verseText: string }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    let alive = true;
    const ok = tts.isSupported();
    tts.getVoices().then((v) => {
      if (!alive) return;
      setSupported(ok);
      setVoices(v);
    });
    const off = tts.onVoicesChanged((v) => alive && setVoices(v));
    return () => {
      alive = false;
      off();
    };
  }, []);

  return (
    <SettingsBlock title="Listening">
      {!supported ? <p className="font-semibold">✗ Speech is not available in this browser.</p> : null}
      <SelectField label="Voice" value={settings.ttsVoice ?? ""} onChange={(e) => set({ ttsVoice: e.target.value || undefined })}>
        <option value="">Device default</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {`${v.name} (${v.lang})`}
          </option>
        ))}
      </SelectField>
      <Stepper
        label="Speaking rate"
        value={settings.ttsRate}
        min={tts.MIN_RATE}
        max={tts.MAX_RATE}
        step={0.1}
        format={(v) => `${v.toFixed(1)}×`}
        onChange={(ttsRate) => set({ ttsRate })}
      />
      <Button
        icon="speaker"
        disabled={!supported || !verseText}
        onClick={() => tts.speak(verseText, { voice: settings.ttsVoice, rate: settings.ttsRate })}
      >
        Test voice
      </Button>
      <Stepper
        label="Hands-free pause (seconds)"
        value={settings.handsFreePauseSec}
        min={2}
        max={30}
        onChange={(handsFreePauseSec) => set({ handsFreePauseSec })}
      />
    </SettingsBlock>
  );
}

function EsvBlock({ settings, set }: { settings: Settings; set: (p: Partial<Settings>) => void }) {
  const toast = useToast();
  const [key, setKey] = useState(settings.esvKey ?? "");
  const [shown, setShown] = useState(false);
  const saved = (settings.esvKey ?? "") === key.trim();
  return (
    <SettingsBlock title="ESV (bring your own key)">
      <Toggle
        label="Use the ESV"
        description="Off by default. Needs your own free key from api.esv.org."
        checked={!!settings.esvEnabled}
        onChange={(on) => {
          set({ esvEnabled: on, ...(on || settings.translation !== "ESV" ? {} : { translation: "BSB" as const }) });
        }}
      />
      <TextField
        label="ESV API key"
        hint="Stored only on this device (and in backups you export)."
        type={shown ? "text" : "password"}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon="check"
          disabled={saved}
          onClick={() => {
            clearEsvSession();
            set({ esvKey: key.trim() || undefined });
            toast("Key saved", { tone: "success" });
          }}
        >
          Save key
        </Button>
        <Button icon={shown ? "eyeOff" : "eye"} onClick={() => setShown((s) => !s)}>
          {shown ? "Hide key" : "Show key"}
        </Button>
      </div>
      <p className="text-[15px] text-muted">
        ESV text is fetched from Crossway when you read, kept only until the app closes, and shown with its copyright notice.
      </p>
    </SettingsBlock>
  );
}
