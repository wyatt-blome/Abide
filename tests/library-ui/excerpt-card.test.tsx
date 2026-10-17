// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { LibraryExcerpt, LibraryWork } from "@/lib/library";
import { ExcerptCard, hasFullCitation } from "@/components/sources/ExcerptCard";
import { SL } from "@/components/sources/labels";
import { readIndex, readShard } from "./_setup";

afterEach(cleanup);

const index = readIndex();
const work = (id: string) => index.works.find((w) => w.id === id) as LibraryWork;

describe("ExcerptCard citation enforcement", () => {
  const ex = readShard("heidelberg-catechism", "ROM").excerpts[0];
  const w = work("heidelberg-catechism");

  it("renders with all five fields", () => {
    expect(hasFullCitation(ex, w)).toBe(true);
    const { container, getByText } = render(<ExcerptCard excerpt={ex} work={w} />);
    expect(container.querySelector("article")).not.toBeNull();
    for (const s of [w.author, w.title, ex.locator, w.edition, SL.source]) expect(getByText(s)).toBeTruthy();
    expect(getByText(SL.source).closest("a")?.getAttribute("href")).toBe(ex.url);
  });

  const blanks: [string, LibraryExcerpt, LibraryWork][] = [
    ["author", ex, { ...w, author: "" }],
    ["work title", ex, { ...w, title: " " }],
    ["locator", { ...ex, locator: "" }, w],
    ["edition", ex, { ...w, edition: "" }],
    ["url", { ...ex, url: "" }, w],
    ["non-http url", { ...ex, url: "javascript:void(0)" }, w],
  ];
  for (const [name, e, wk] of blanks) {
    it(`hides the card when the ${name} is missing`, () => {
      expect(hasFullCitation(e, wk)).toBe(false);
      const { container } = render(<ExcerptCard excerpt={e} work={wk} />);
      expect(container.innerHTML).toBe("");
    });
  }

  it("hides the card when the work is unknown", () => {
    const { container } = render(<ExcerptCard excerpt={ex} work={undefined} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ellipses stay outside the verbatim text", () => {
  const cases: [string, LibraryExcerpt][] = [];
  for (const id of ["westminster-larger-catechism", "belgic-confession", "canons-of-dort"]) {
    for (const x of readShard(id, "ROM").excerpts) {
      if (x.truncatedEnd && !cases.some(([, c]) => c.truncatedEnd && !c.truncatedStart)) cases.push([id, x]);
      if (x.truncatedStart && !cases.some(([, c]) => c.truncatedStart)) cases.push([id, x]);
    }
  }

  it("found truncated excerpts in the data", () => {
    expect(cases.some(([, x]) => x.truncatedStart)).toBe(true);
    expect(cases.some(([, x]) => x.truncatedEnd)).toBe(true);
  });

  for (const [id, x] of cases) {
    it(`${id} ${x.locator}`, () => {
      const { container } = render(<ExcerptCard excerpt={x} work={work(id)} />);
      const verbatim = Array.from(container.querySelectorAll<HTMLElement>("[data-verbatim]"));
      const parts = x.text.split("\n").filter(Boolean);
      expect(verbatim.map((v) => v.textContent)).toEqual(parts);
      for (const v of verbatim) {
        expect(v.childNodes).toHaveLength(1);
        expect(v.querySelector("[data-ellipsis]")).toBeNull();
      }
      const dots = Array.from(container.querySelectorAll<HTMLElement>("[data-ellipsis]"));
      expect(dots).toHaveLength((x.truncatedStart ? 1 : 0) + (x.truncatedEnd ? 1 : 0));
      for (const d of dots) {
        expect(d.getAttribute("aria-hidden")).toBe("true");
        expect(d.textContent).toBe(SL.ellipsis);
        expect(d.closest("[data-verbatim]")).toBeNull();
      }
      if (x.truncatedEnd) expect(verbatim[verbatim.length - 1].nextElementSibling).toBe(dots[dots.length - 1]);
      if (x.truncatedStart) expect(verbatim[0].previousElementSibling?.previousElementSibling).toBe(dots[0]);
    });
  }
});
