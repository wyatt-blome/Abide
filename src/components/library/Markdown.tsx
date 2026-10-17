"use client";

// Minimal, safe Markdown renderer for the pack README: headings, paragraphs, lists, fenced code,
// pipe tables, `code`, **bold** and [links](https://…). Everything becomes React text nodes;
// no HTML from the file is ever injected.

import type { ReactNode } from "react";

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "code"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

const splitRow = (line: string): string[] =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ kind: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      out.push({ kind: "table", head: rows[0] ?? [], rows: body });
      continue;
    }
    const li = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = !!li[2];
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(lines[i]);
        if (m && !!m[2] === ordered) {
          items.push(m[3]);
          i++;
        } else if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1] += " " + lines[i].trim();
          i++;
        } else break;
      }
      out.push({ kind: ordered ? "ol" : "ul", items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```|^#{1,6}\s|^\s*\||^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])
    ) {
      buf.push(lines[i++].trim());
    }
    out.push({ kind: "p", text: buf.join(" ") });
  }
  return out;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const tok = m[0];
    if (m[1]) {
      nodes.push(
        <code key={k++} className="rounded bg-surface-strong px-1 text-[15px]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      nodes.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    } else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const href = lm?.[2] ?? "";
      if (lm && /^(https?:\/\/|\/)/.test(href)) {
        nodes.push(
          <a key={k++} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">
            {lm[1]}
          </a>,
        );
      } else nodes.push(lm?.[1] ?? tok);
    }
    last = at + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h": {
            const cls = b.level <= 1 ? "text-[22px] font-bold" : b.level === 2 ? "mt-3 text-[20px] font-bold" : "text-[18px] font-bold";
            if (b.level <= 1) return <h2 key={i} className={cls}>{inline(b.text)}</h2>;
            if (b.level === 2) return <h3 key={i} className={cls}>{inline(b.text)}</h3>;
            return <h4 key={i} className={cls}>{inline(b.text)}</h4>;
          }
          case "p":
            return <p key={i}>{inline(b.text)}</p>;
          case "code":
            return (
              <pre key={i} className="bordered overflow-x-auto rounded-xl bg-surface p-3 text-[14px]">
                <code>{b.text}</code>
              </pre>
            );
          case "ul":
          case "ol": {
            const Tag = b.kind;
            return (
              <Tag key={i} className={b.kind === "ul" ? "ml-5 list-disc" : "ml-5 list-decimal"}>
                {b.items.map((it, j) => (
                  <li key={j} className="mb-1">
                    {inline(it)}
                  </li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-[15px]">
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} scope="col" className="bordered p-2 text-left">
                          {inline(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, n) => (
                          <td key={n} className="bordered p-2 align-top">
                            {inline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
