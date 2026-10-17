"use client";

// Library manager: every work in the index (built) and every pack that was not built, with its
// license evidence, edition, source and status. Built packs can be switched on/off
// (settings.enabledPacks). Large packs are opt-in and download their shards only when switched on.

import { useMemo, useState, type ReactNode } from "react";
import type { Era, SourceType } from "@/db/types";
import { effectivePackIds, togglePack } from "@/lib/enabledPacks";
import { ERA_LABELS, ERA_ORDER, TYPE_LABELS, loadLibraryIndex, loadShard, type LibraryIndex, type LibraryWork } from "@/lib/library";
import { useOfflineStatus, useSettings } from "@/components/providers/AppProviders";
import { EmptyState, Icon, PageHeader, Toggle, useToast } from "@/components/ui";
import { useAsync } from "@/components/sources/useAsync";
import { LibraryNav, SectionTitle } from "./shared";

export interface PackSummary {
  id: string;
  author: string;
  title: string;
  edition: string;
  era: Era;
  types: SourceType[];
  sourcePage: string;
  license: { status: string; basis: string; proofText: string; proofUrl: string };
  defaultEnabled: boolean;
  largePack: boolean;
  ocr?: boolean;
  ocrNote?: string;
  listedOnly?: boolean;
}

const BASIS_LABELS: Record<string, string> = {
  "rights-statement": "Rights statement in the source",
  "published-before-1931": "Published before 1931",
  "pd-mark": "Public Domain Mark",
  "cc-by": "CC BY license",
};
const STATUS_LABELS: Record<string, string> = { "public-domain": "Public domain", "CC-BY": "CC BY" };

export function formatPackSize(bytes: number): string {
  const mb = bytes / 1_000_000;
  return `⬇ ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

async function loadSummary(): Promise<PackSummary[]> {
  try {
    const res = await fetch("/library/packs-summary.json");
    if (!res.ok) return [];
    const json = (await res.json()) as { packs?: PackSummary[] };
    return json.packs ?? [];
  } catch {
    return [];
  }
}

type Progress = { done: number; total: number; failed: number };

/** Fetch every shard of a pack (cached by the service worker and in Dexie), reporting progress. */
export async function downloadPack(packId: string, books: string[], onProgress: (p: Progress) => void): Promise<Progress> {
  let p: Progress = { done: 0, total: books.length, failed: 0 };
  onProgress(p);
  for (const b of books) {
    const ok = await loadShard(packId, b).then(
      () => true,
      () => false,
    );
    p = { done: p.done + 1, total: p.total, failed: p.failed + (ok ? 0 : 1) };
    onProgress(p);
  }
  return p;
}

const byEraThenTitle = (a: { era: Era; title: string }, b: { era: Era; title: string }) =>
  ERA_ORDER.indexOf(a.era) - ERA_ORDER.indexOf(b.era) || a.title.localeCompare(b.title);

export function LibraryManager() {
  const toast = useToast();
  const { settings, update, ready } = useSettings();
  const { rewarm } = useOfflineStatus();
  const indexQ = useAsync<LibraryIndex>("index", loadLibraryIndex);
  const summaryQ = useAsync("summary", loadSummary);
  const [progress, setProgress] = useState<Record<string, Progress>>({});

  const index = indexQ.data;
  const defaults = useMemo(() => (index?.works ?? []).filter((w) => w.defaultEnabled).map((w) => w.id), [index]);
  const enabled = effectivePackIds(settings.enabledPacks, defaults);
  const summaries = new Map((summaryQ.data ?? []).map((s) => [s.id, s]));

  const download = async (work: LibraryWork) => {
    const result = await downloadPack(work.id, index?.books[work.id] ?? [], (p) =>
      setProgress((cur) => ({ ...cur, [work.id]: p })),
    );
    toast(result.failed ? `${result.failed} files failed to download` : `${work.title} downloaded`, {
      tone: result.failed ? "error" : "success",
    });
  };

  const setOn = async (work: LibraryWork, on: boolean) => {
    await update({ enabledPacks: togglePack(settings.enabledPacks, defaults, work.id, on) });
    if (!on) return;
    if (work.largePack) void download(work);
    else rewarm();
  };

  if (indexQ.error) {
    return (
      <>
        <PageHeader title="Library manager" backHref="/library" />
        <LibraryNav current="/library/manager" />
        <EmptyState title="The library index could not be loaded" icon="info" />
      </>
    );
  }

  const works = [...(index?.works ?? [])].sort(byEraThenTitle);
  const skipped = index?.skipped ?? [];

  return (
    <>
      <PageHeader title="Library manager" backHref="/library" />
      <LibraryNav current="/library/manager" />
      {!index ? <p role="status" className="text-muted">Loading…</p> : null}

      {index ? (
        <section aria-labelledby="mgr-built">
          <SectionTitle id="mgr-built">Built works</SectionTitle>
          <ul className="flex flex-col gap-3">
            {works.map((w) => (
              <WorkCard
                key={w.id}
                info={w}
                built={w}
                on={enabled.includes(w.id)}
                disabled={!ready}
                onToggle={(on) => setOn(w, on)}
                progress={progress[w.id]}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {index && skipped.length ? (
        <section aria-labelledby="mgr-skipped">
          <SectionTitle id="mgr-skipped">Not built</SectionTitle>
          <ul className="flex flex-col gap-3">
            {skipped.map((s) => {
              const info = summaries.get(s.id);
              return <WorkCard key={s.id} info={info} id={s.id} skippedReason={s.reason} />;
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}

type WorkInfo = Pick<PackSummary, "author" | "title" | "edition" | "era" | "types" | "sourcePage" | "license"> & {
  ocr?: boolean;
  ocrNote?: string;
  listedOnly?: boolean;
  largePack?: boolean;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[14px] font-bold text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap inline-flex items-center gap-1 break-all font-semibold text-accent underline underline-offset-4"
    >
      <span>{children}</span>
      <Icon name="external" size={16} />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function WorkCard({
  info,
  built,
  id,
  on,
  disabled,
  onToggle,
  progress,
  skippedReason,
}: {
  info?: WorkInfo;
  built?: LibraryWork;
  id?: string;
  on?: boolean;
  disabled?: boolean;
  onToggle?: (on: boolean) => void;
  progress?: Progress;
  skippedReason?: string;
}) {
  const title = info?.title ?? id ?? "";
  return (
    <li className="bordered flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div>
        <p className="text-[18px] font-bold">{title}</p>
        {info ? <p>{info.author}</p> : null}
      </div>

      {built ? (
        <p className="flex items-center gap-2 font-semibold text-success">
          <Icon name="check" size={20} />
          <span>Built</span>
        </p>
      ) : (
        <p className="flex items-start gap-2 font-semibold text-danger">
          <Icon name="cross" size={20} className="mt-0.5 shrink-0" />
          <span>{`Not built: ${skippedReason ?? ""}`}</span>
        </p>
      )}

      {built && onToggle && !built.listedOnly ? (
        <>
          {built.largePack ? <p className="font-bold">{formatPackSize(built.packSizeBytes)}</p> : null}
          <Toggle
            checked={!!on}
            disabled={disabled}
            onChange={onToggle}
            label={built.largePack ? `Download and use ${built.title}` : `Use ${built.title}`}
            description={built.largePack ? "Large pack: downloads only when switched on" : undefined}
          />
          {progress ? (
            <p role="status" className="text-[15px]">
              {progress.done < progress.total
                ? `Downloading ${progress.done} / ${progress.total}`
                : progress.failed
                  ? `✗ ${progress.failed} of ${progress.total} files failed`
                  : `✓ Downloaded ${progress.total} files`}
            </p>
          ) : null}
        </>
      ) : null}

      {info ? (
        <dl className="grid grid-cols-1 gap-2 text-[15px] sm:grid-cols-2">
          <Row label="Era">{ERA_LABELS[info.era] ?? info.era}</Row>
          <Row label="Types">{info.types.map((t) => TYPE_LABELS[t] ?? t).join(", ")}</Row>
          <Row label="Edition">{info.edition}</Row>
          <Row label="License">{`${STATUS_LABELS[info.license.status] ?? info.license.status} · ${BASIS_LABELS[info.license.basis] ?? info.license.basis}`}</Row>
          <Row label="License evidence (as found in the source)">
            <code className="break-all">{info.license.proofText}</code>
          </Row>
          <Row label="License page">
            <ExtLink href={info.license.proofUrl}>{info.license.proofUrl}</ExtLink>
          </Row>
          <Row label="Source">
            <ExtLink href={info.sourcePage}>{info.sourcePage}</ExtLink>
          </Row>
          {built ? (
            <Row label={built.crossrefCount ? "Cross-references" : "Excerpts"}>
              {String(built.crossrefCount || built.excerptCount)}
            </Row>
          ) : null}
          {built && !built.largePack ? <Row label="Size">{formatPackSize(built.packSizeBytes).replace("⬇ ", "")}</Row> : null}
          {info.largePack && !built ? <Row label="Pack size">Large pack (opt-in)</Row> : null}
          {info.listedOnly ? <Row label="Mapping">Listed only (no verse mapping)</Row> : null}
          {info.ocr ? <Row label="OCR">{info.ocrNote ?? "OCR text: may contain scanning errors"}</Row> : null}
        </dl>
      ) : null}
    </li>
  );
}
