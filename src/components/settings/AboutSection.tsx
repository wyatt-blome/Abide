"use client";

// About: the app name, its verse read from the bundled BSB, and the sources the app's data came
// from (URLs read from public/bible/sources.json, the library index and content/classics.ts).
// License labels come from the same files: sources.json `license.status` (copied from the
// downloaded license table) and the library index `works[].license.status`.

import { APP_NAME, APP_NAME_VERSE } from "@/config";
import { loadSources } from "@/lib/bible";
import { loadLibraryIndex, type LibraryIndex } from "@/lib/library";
import { formatRef } from "@/lib/refs";
import { Icon } from "@/components/ui";
import { useAsync } from "@/components/sources/useAsync";
import { CLASSICS } from "../../../content/classics";
import { SettingsBlock } from "./SettingsBlock";

interface TranslationSource {
  name?: string;
  license?: { status?: string; proofUrl?: string };
  text?: { url?: string };
  headings?: { files?: { url?: string }[] };
}

const dirOf = (url: string) => url.slice(0, url.lastIndexOf("/") + 1);

/** Display form of a library license status token (unknown tokens are shown as stored). */
const WORK_STATUS_LABEL: Record<string, string> = { "public-domain": "Public domain", "CC-BY": "CC BY" };

/** The license statuses recorded for a set of works, as one label ("" when none is recorded). */
function worksLicense(works: { license?: { status?: string } }[]): string {
  const statuses = [...new Set(works.map((w) => w.license?.status).filter((x): x is string => !!x))];
  return statuses.map((x) => WORK_STATUS_LABEL[x] ?? x).join(", ");
}

function Ext({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap inline-flex items-center gap-1 break-all text-[15px] font-semibold text-accent underline underline-offset-4"
    >
      <span>{href}</span>
      <Icon name="external" size={16} />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function Attribution({ name, license, urls }: { name: string; license?: string; urls: string[] }) {
  const unique = [...new Set(urls.filter(Boolean))];
  return (
    <li className="flex flex-col gap-1 border-t-[length:var(--border-width)] border-border pt-2">
      <p className="font-bold">
        {name}
        {license ? <span className="font-semibold text-muted">{` · ${license}`}</span> : null}
      </p>
      {unique.map((u) => (
        <Ext key={u} href={u} />
      ))}
    </li>
  );
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function AboutSection({ verseText }: { verseText?: string }) {
  const sources = useAsync("bible-sources", loadSources).data as Record<string, TranslationSource> | undefined;
  const index = useAsync<LibraryIndex>("index", loadLibraryIndex).data;

  const tr = (id: "BSB" | "WEB" | "KJV") => sources?.[id];
  const bsb = tr("BSB");
  const works = index?.works ?? [];
  const openbible = works.filter((w) => w.parser === "openbible-crossrefs");
  const creeds = works.filter((w) => w.parser === "creed-json-proofs");
  const otherWorks = works.filter((w) => w.parser !== "openbible-crossrefs" && w.parser !== "creed-json-proofs");
  const classicsOn = (host: string) => CLASSICS.filter((c) => hostOf(c.sourcePage) === host).map((c) => c.sourcePage);
  const worksOn = (host: string) => otherWorks.filter((w) => hostOf(w.sourcePage) === host).map((w) => w.sourcePage);

  return (
    <SettingsBlock title="About">
      <p className="text-[22px] font-bold">{APP_NAME}</p>
      {verseText ? (
        <figure className="flex flex-col gap-1">
          <blockquote className="reading">{verseText}</blockquote>
          <figcaption className="text-[15px] text-muted">{`${formatRef(APP_NAME_VERSE)} · Berean Standard Bible`}</figcaption>
        </figure>
      ) : null}

      <h3 className="mt-2 text-[18px] font-bold">Sources and licenses</h3>
      <ul className="flex flex-col gap-2">
        {bsb ? (
          <Attribution
            name={bsb.name ?? "Berean Standard Bible"}
            license={bsb.license?.status}
            urls={[bsb.text?.url ?? "", bsb.headings?.files?.[0]?.url ? dirOf(bsb.headings.files[0].url) : "", bsb.license?.proofUrl ?? ""]}
          />
        ) : null}
        {(["WEB", "KJV"] as const).map((id) => {
          const s = tr(id);
          return s ? <Attribution key={id} name={s.name ?? id} license={s.license?.status} urls={[s.text?.url ?? "", s.license?.proofUrl ?? ""]} /> : null;
        })}
        {openbible.length ? (
          <Attribution name="OpenBible.info cross-references" license={worksLicense(openbible)} urls={openbible.map((w) => w.sourcePage)} />
        ) : null}
        {creeds.length ? <Attribution name="Creeds.json" license={worksLicense(creeds)} urls={creeds.map((w) => w.sourcePage)} /> : null}
        <Attribution name="CCEL (Christian Classics Ethereal Library)" urls={[...worksOn("ccel.org"), ...classicsOn("ccel.org")]} />
        <Attribution name="Project Gutenberg" urls={[...worksOn("gutenberg.org"), ...classicsOn("gutenberg.org")]} />
        <Attribution name="Internet Archive (archive.org)" urls={[...worksOn("archive.org"), ...classicsOn("archive.org")]} />
      </ul>
      <p className="text-[15px] text-muted">Each excerpt in Sources links to its own source page.</p>
    </SettingsBlock>
  );
}
