"use client";

// /read/classic?id=<bookPlanId>[&s=<section index>]
// Reads a bundled classic from Cache Storage (downloading on first use), one section at a time,
// with Listen. Date-locked devotionals (Morning and Evening) show only today's two entries.

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddNoteSheet } from "@/components/library/AddNoteSheet";
import { ActionBar, Button, cx, EmptyState, Icon, PageHeader, useToast } from "@/components/ui";
import { db } from "@/db/db";
import type { BookLog, BookPlan } from "@/db/types";
import { CLASSIC_BY_ID, type ClassicInfo } from "../../../content/classics";
import { logProgress, markDatedRead, updateBookPlan } from "@/lib/booksStore";
import { DOWNLOAD_FAILED, entriesForDate, loadClassicText, parseClassic, type ClassicContent, type DatedEntry } from "@/lib/classics";
import type { ISODate } from "@/lib/isoDate";
import { bookHref, classicHref } from "./BookTodayCard";
import { CheckBox } from "./CheckBox";
import { formatDateLong } from "./format";
import { scrollBehavior, useReducedMotion, useToday } from "./hooks";
import { ListenButton } from "./ListenButton";
import { useSpeech, type Speech } from "./useSpeech";

function useClassicContent(classic: ClassicInfo | undefined) {
  const [state, setState] = useState<{ id: string; content?: ClassicContent; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!classic) return;
    let cancelled = false;
    loadClassicText(classic)
      .then((text) => {
        if (!cancelled) setState({ id: classic.id, content: parseClassic(classic, text) });
      })
      .catch(() => {
        if (!cancelled) setState({ id: classic.id, error: DOWNLOAD_FAILED });
      });
    return () => {
      cancelled = true;
    };
  }, [classic, attempt]);
  const current = state && classic && state.id === classic.id ? state : null;
  return { content: current?.content ?? null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1) };
}

function Paragraphs({ paragraphs, speech, prefix }: { paragraphs: string[]; speech: Speech; prefix: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const key = speech.current?.key ?? null;
  useEffect(() => {
    if (!key?.startsWith(prefix)) return;
    ref.current?.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ block: "center", behavior: scrollBehavior(reduced) });
  }, [key, prefix, reduced]);
  return (
    <div ref={ref} className="reading flex flex-col gap-4">
      {paragraphs.map((p, i) => {
        const k = `${prefix}${i}`;
        return (
          <p key={k} data-key={k} className={cx("rounded-lg px-1", key === k && "outline outline-[3px] outline-accent")}>
            {p}
          </p>
        );
      })}
    </div>
  );
}

function Provenance({ classic }: { classic: ClassicInfo }) {
  return (
    <footer className="mt-8 flex flex-col gap-1 text-[14px] text-muted">
      <p>
        {classic.title} · {classic.author}
      </p>
      <p>{classic.edition}</p>
      {classic.ocr ? <p>OCR text: may contain scanning errors.</p> : null}
      <a href={classic.sourcePage} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 font-semibold underline">
        Source
        <Icon name="external" size={16} />
      </a>
    </footer>
  );
}

export function ClassicScreen() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const today = useToday();
  const plan = useLiveQuery(async () => (id ? (await db.bookPlans.get(id)) ?? null : null), [id]);
  const logs = useLiveQuery(() => (id ? db.bookLogs.where("bookId").equals(id).toArray() : []), [id]);
  const classic = plan?.classicId ? CLASSIC_BY_ID[plan.classicId] : undefined;
  const { content, error, retry } = useClassicContent(classic);

  const backHref = id ? bookHref(id) : "/read/books";
  if (plan === undefined || today === null) {
    return (
      <>
        <PageHeader title="Reading" backHref={backHref} />
        <p className="my-6 text-muted">Loading…</p>
      </>
    );
  }
  if (!plan || !classic) {
    return (
      <>
        <PageHeader title="Reading" backHref="/read/books" />
        <EmptyState title="This book has no bundled text" icon="book" />
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader title={plan.title} backHref={backHref} />
        <div className="my-6 flex flex-col gap-3" role="alert">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <Icon name="cross" size={22} />
            {error}
          </p>
          <Button icon="refresh" onClick={retry}>
            Try again
          </Button>
        </div>
        <Provenance classic={classic} />
      </>
    );
  }
  if (!content) {
    return (
      <>
        <PageHeader title={plan.title} backHref={backHref} />
        <p className="my-6 text-muted">Loading the text…</p>
      </>
    );
  }
  return content.kind === "dated" ? (
    <DatedReader plan={plan} classic={classic} entries={content.entries} today={today} logs={logs ?? []} />
  ) : (
    <SectionReader plan={plan} classic={classic} content={content} today={today} />
  );
}

// ---------------------------------------------------------------- Morning and Evening

function DatedReader({ plan, classic, entries, today, logs }: { plan: BookPlan; classic: ClassicInfo; entries: DatedEntry[]; today: ISODate; logs: BookLog[] }) {
  const speech = useSpeech();
  const { morning, evening } = useMemo(() => entriesForDate(entries, today), [entries, today]);
  const readToday = logs.some((l) => l.date === today);
  const list = [
    { id: "m", label: "Morning", entry: morning },
    { id: "e", label: "Evening", entry: evening },
  ];
  const listen = (which: string, entry: DatedEntry) =>
    speech.start(entry.paragraphs.map((p, i) => ({ key: `${which}${i}`, text: p })), { title: `${classic.title}: ${entry.heading}` });

  return (
    <>
      <PageHeader title={classic.title} backHref={bookHref(plan.id)} />
      <p className="text-muted">{formatDateLong(today)}</p>
      {!morning && !evening ? <p className="my-6 font-semibold">No entry for this date was found in this edition.</p> : null}
      {list.map(({ id, label, entry }) =>
        entry ? (
          <section key={id} className="mt-6" aria-label={label}>
            <h2 className="mb-2 text-[17px] font-bold">{entry.heading}</h2>
            <Button
              className="mb-3"
              icon={speech.current?.key.startsWith(id) && speech.state === "speaking" ? "pause" : "speaker"}
              disabled={!speech.supported}
              onClick={() => {
                if (speech.current?.key.startsWith(id) && speech.state === "speaking") speech.pause();
                else if (speech.current?.key.startsWith(id) && speech.state === "paused") speech.resume();
                else listen(id, entry);
              }}
            >
              {speech.current?.key.startsWith(id) && speech.state === "speaking" ? "Pause" : `Listen to ${label.toLowerCase()}`}
            </Button>
            <Paragraphs paragraphs={entry.paragraphs} speech={speech} prefix={id} />
          </section>
        ) : null,
      )}
      <Provenance classic={classic} />
      <ActionBar label="Today's entries">
        {speech.state !== "idle" ? (
          <Button size="lg" icon="stop" onClick={speech.stop}>
            Stop
          </Button>
        ) : null}
        <CheckBox
          checked={readToday}
          onChange={(c) => void markDatedRead(plan.id, today, c)}
          label="Read today"
          showLabel
          className="bordered bg-surface px-3"
        />
      </ActionBar>
    </>
  );
}

// ---------------------------------------------------------------- sectioned classics

function SectionReader({ plan, classic, content, today }: { plan: BookPlan; classic: ClassicInfo; content: Extract<ClassicContent, { kind: "sections" }>; today: ISODate }) {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const speech = useSpeech();
  const sections = content.sections;
  const n = sections.length;
  const sParam = params.get("s");
  const index = Math.max(0, Math.min(n - 1, sParam !== null && Number.isFinite(Number(sParam)) ? Number(sParam) : Math.min(plan.current, n - 1)));
  const section = sections[index];
  const [notePage, setNotePage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  // The plan counts sections; keep its total in step with the downloaded text.
  const { id: planId, total: planTotal, current: planCurrent } = plan;
  useEffect(() => {
    if (n > 0 && planTotal !== n) void updateBookPlan(planId, { total: n, current: Math.min(planCurrent, n) });
  }, [n, planId, planTotal, planCurrent]);

  const goTo = (i: number) => {
    speech.stop();
    router.replace(classicHref(plan.id, i), { scroll: true });
  };
  const done = plan.current >= index + 1;
  const markRead = async () => {
    try {
      await logProgress(plan.id, Math.max(plan.current, index + 1), today);
      setPrompt(`§ ${index + 1}`);
      if (index + 1 < n) goTo(index + 1);
      else toast(`Finished ${classic.title}.`, { tone: "success" });
    } catch {
      toast("Couldn't save.", { tone: "error" });
    }
  };
  const listen = () =>
    speech.start(section.paragraphs.map((p, i) => ({ key: `s${index}-${i}`, text: p })), { title: `${classic.title}: ${section.title}` });

  return (
    <>
      <PageHeader title={classic.title} backHref={bookHref(plan.id)} />
      <p className="text-muted">
        Section {index + 1} of {n}
        {done ? " · read" : ""}
      </p>
      <h2 className="mb-3 mt-4 text-[20px] font-bold">{section.title}</h2>
      {prompt ? (
        <div role="status" className="bordered mb-4 flex flex-col gap-2 rounded-xl bg-surface p-3">
          <p className="font-semibold">Saved. Add a quote or note?</p>
          <div className="flex gap-2 [&>*]:flex-1">
            <Button variant="primary" icon="edit" onClick={() => setNotePage(prompt)}>
              Add
            </Button>
            <Button onClick={() => setPrompt(null)}>Not now</Button>
          </div>
        </div>
      ) : null}
      <Paragraphs paragraphs={section.paragraphs} speech={speech} prefix={`s${index}-`} />
      <Provenance classic={classic} />

      <ActionBar label="Reading">
        <div className="flex min-w-0 items-stretch gap-2">
          <Button iconOnly icon="chevronLeft" label="Previous section" disabled={index === 0} onClick={() => goTo(index - 1)} />
          <ListenButton speech={speech} onListen={listen} className="min-w-0! flex-1 px-2" />
          {speech.state !== "idle" ? <Button iconOnly icon="stop" label="Stop" onClick={speech.stop} /> : null}
          <Button variant={done ? "secondary" : "success"} icon="check" className="min-w-0! flex-1 px-2" onClick={() => void markRead()}>
            <span className="truncate">{done ? "Read" : "Mark read"}</span>
          </Button>
          <Button iconOnly icon="chevronRight" label="Next section" disabled={index >= n - 1} onClick={() => goTo(index + 1)} />
        </div>
      </ActionBar>

      {notePage ? (
        <AddNoteSheet
          open
          onClose={() => {
            setNotePage(null);
            setPrompt(null);
          }}
          bookId={plan.id}
          page={notePage}
        />
      ) : null}
    </>
  );
}
