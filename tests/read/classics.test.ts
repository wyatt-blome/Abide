import { describe, expect, it } from "vitest";
import {
  ClassicDownloadError, DOWNLOAD_FAILED, entriesForDate, gutenbergTextUrl, loadClassicText, parseDatedEntries,
  processClassicText, splitSections, stripGutenberg,
} from "@/lib/classics";
import type { ClassicInfo } from "../../content/classics";
import { CLASSICS } from "../../content/classics";

// Synthetic, structural placeholder fixtures only (no real text).
const lorem = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `Lorem ipsum dolor sit amet ${tag} ${i}, consectetur adipiscing elit sed do eiusmod.`).join("\n");

const GUTENBERG = [
  "The Project Gutenberg eBook of Placeholder",
  "Header placeholder line.",
  "",
  "*** START OF THE PROJECT GUTENBERG EBOOK PLACEHOLDER ***",
  "",
  "PLACEHOLDER TITLE",
  "",
  "CHAPTER I.",
  "",
  lorem(8, "alpha"),
  "",
  lorem(3, "beta"),
  "",
  "CHAPTER II.",
  "",
  lorem(8, "gamma"),
  "",
  "CHAPTER III.",
  "",
  lorem(8, "delta"),
  "",
  "*** END OF THE PROJECT GUTENBERG EBOOK PLACEHOLDER ***",
  "",
  "Footer placeholder line.",
].join("\r\n");

describe("Gutenberg header/footer", () => {
  it("keeps only the text between the START and END markers", () => {
    const body = stripGutenberg(GUTENBERG);
    expect(body.startsWith("PLACEHOLDER TITLE")).toBe(true);
    expect(body).not.toMatch(/\*\*\*/);
    expect(body).not.toMatch(/Header placeholder|Footer placeholder/);
    expect(body.trim().endsWith("eiusmod.")).toBe(true);
    expect(body).not.toMatch(/\r/);
  });

  it("leaves text without markers unchanged (trimmed)", () => {
    expect(stripGutenberg("\nLorem ipsum.\n")).toBe("Lorem ipsum.");
  });

  it("joins volumes in order", () => {
    const two = processClassicText({ format: "gutenberg" }, [GUTENBERG, GUTENBERG.replace(/alpha/g, "omega")]);
    expect(two.indexOf("alpha")).toBeLessThan(two.indexOf("omega"));
    expect(two).not.toMatch(/START OF/);
  });

  it("builds the cache URL from the eBook id", () => {
    expect(gutenbergTextUrl(131)).toBe("https://www.gutenberg.org/cache/epub/131/pg131.txt");
  });
});

describe("sections", () => {
  it("splits at CHAPTER headings; tiny front matter merges into the first section", () => {
    const s = splitSections(stripGutenberg(GUTENBERG));
    expect(s.map((x) => x.title)).toEqual(["CHAPTER I.", "CHAPTER II.", "CHAPTER III."]);
    expect(s[0].paragraphs[0]).toBe("PLACEHOLDER TITLE");
    expect(s[0].paragraphs).toHaveLength(3);
    expect(s[0].paragraphs[1]).toMatch(/^Lorem ipsum dolor sit amet alpha 0,.*alpha 7,/);
    expect(s.map((x) => x.index)).toEqual([0, 1, 2]);
  });

  it("roman numerals on their own line, after a blank line, are headings", () => {
    const text = ["I.", "", lorem(8, "a"), "", "II.", "", lorem(8, "b"), "", "III", "", lorem(8, "c")].join("\n");
    expect(splitSections(text).map((x) => x.title)).toEqual(["I.", "II.", "III"]);
  });

  it("falls back to parts when there are no headings", () => {
    const text = Array.from({ length: 300 }, (_, i) => lorem(1, `p${i}`)).join("\n\n");
    const s = splitSections(text);
    expect(s.length).toBeGreaterThan(1);
    expect(s[0].title).toBe("Part 1");
    expect(s.flatMap((x) => x.paragraphs)).toHaveLength(300);
  });
});

const DEVOTIONAL = [
  "Placeholder devotional",
  "",
  "Contents",
  "Morning, January 1",
  "Evening, January 1",
  "",
  "Morning, January 1",
  "",
  "\"Lorem ipsum dolor sit amet.\" Placeholder 1:1",
  "",
  "Lorem morning one, first paragraph.",
  "",
  "Lorem morning one, second paragraph.",
  "",
  "Evening, January 1",
  "",
  "Lorem evening one.",
  "",
  "January 2nd",
  "Morning",
  "",
  "Lorem morning two.",
  "",
  "January 2nd",
  "",
  "Evening",
  "",
  "Lorem evening two.",
  "",
  "February 29 — Morning",
  "Lorem leap morning.",
].join("\n");

describe("date-locked entries", () => {
  const entries = parseDatedEntries(DEVOTIONAL);

  it("selects today's morning and evening entries by their date headings", () => {
    const jan1 = entriesForDate(entries, "2027-01-01");
    expect(jan1.morning?.paragraphs).toEqual([
      "\"Lorem ipsum dolor sit amet.\" Placeholder 1:1",
      "Lorem morning one, first paragraph.",
      "Lorem morning one, second paragraph.",
    ]);
    expect(jan1.morning?.heading).toBe("Morning, January 1");
    expect(jan1.evening?.paragraphs).toEqual(["Lorem evening one."]);
  });

  it("handles a date line followed by a Morning/Evening line", () => {
    const jan2 = entriesForDate(entries, "2026-01-02");
    expect(jan2.morning?.paragraphs).toEqual(["Lorem morning two."]);
    expect(jan2.morning?.heading).toBe("January 2nd, Morning");
    expect(jan2.evening?.paragraphs).toEqual(["Lorem evening two."]);
  });

  it("date-first headings and missing dates", () => {
    expect(entriesForDate(entries, "2028-02-29").morning?.paragraphs).toEqual(["Lorem leap morning."]);
    expect(entriesForDate(entries, "2028-02-29").evening).toBeUndefined();
    expect(entriesForDate(entries, "2026-03-05")).toEqual({ morning: undefined, evening: undefined });
  });
});

describe("download", () => {
  const fake: ClassicInfo = {
    id: "placeholder", title: "Placeholder", author: "Lorem", edition: "Test", sourcePage: "https://example.invalid/",
    textUrls: ["https://example.invalid/a.txt", "https://example.invalid/b.txt"], format: "gutenberg",
  };

  it("fetches every file once and strips each", async () => {
    const calls: string[] = [];
    const text = await loadClassicText(fake, async (url) => {
      calls.push(url);
      return new Response(url.endsWith("a.txt") ? GUTENBERG : GUTENBERG.replace(/alpha/g, "omega"));
    });
    expect(calls).toEqual(fake.textUrls);
    expect(text).toMatch(/alpha[\s\S]*omega/);
    // Second load comes from storage (memory in Node: no Cache Storage).
    await loadClassicText(fake, async () => {
      throw new Error("network should not be used");
    });
  });

  it("a failed download reports the UI label", async () => {
    const broken = { ...fake, id: "broken", textUrls: ["https://example.invalid/missing.txt"] };
    await expect(loadClassicText(broken, async () => new Response("", { status: 404 }))).rejects.toBeInstanceOf(ClassicDownloadError);
    await expect(loadClassicText(broken, async () => { throw new TypeError("CORS"); })).rejects.toThrow(DOWNLOAD_FAILED);
  });

  it("the bundled list holds ids and URLs only", () => {
    expect(CLASSICS).toHaveLength(8);
    for (const c of CLASSICS) {
      expect(c.textUrls.length).toBeGreaterThan(0);
      for (const u of [...c.textUrls, c.sourcePage]) expect(u).toMatch(/^https:\/\//);
    }
    expect(CLASSICS.filter((c) => c.dateLocked).map((c) => c.id)).toEqual(["morning-and-evening"]);
  });
});
