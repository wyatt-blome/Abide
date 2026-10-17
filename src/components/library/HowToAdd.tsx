"use client";

// Renders library/packs/README.md (copied to /library/README.md by scripts/sync-pack-readme.ts).

import { EmptyState, PageHeader } from "@/components/ui";
import { useAsync } from "@/components/sources/useAsync";
import { Markdown } from "./Markdown";
import { LibraryNav } from "./shared";

async function loadReadme(): Promise<string> {
  const res = await fetch("/library/README.md");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function HowToAdd() {
  const q = useAsync("readme", loadReadme);
  return (
    <>
      <PageHeader title="How to add a pack" backHref="/library" />
      <LibraryNav current="/library/how-to-add" />
      {q.loading ? <p role="status" className="text-muted">Loading…</p> : null}
      {q.error ? <EmptyState title="The guide could not be loaded" icon="info">Connect to the internet and try again.</EmptyState> : null}
      {q.data ? (
        <article className="pb-6">
          <Markdown source={q.data} />
        </article>
      ) : null}
    </>
  );
}
