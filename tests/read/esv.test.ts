import { describe, expect, it, vi } from "vitest";
import {
  buildEsvRequest, clearEsvSession, ESV_API_URL, ESV_FALLBACK_NOTICE, esvAvailable, esvChapterQuery, esvErrorMessage,
  esvNotice, EsvError, fetchEsvChapter, parseEsvPassage,
} from "@/lib/esv";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("ESV request building", () => {
  it("is off unless enabled with a key", () => {
    expect(esvAvailable({})).toBe(false);
    expect(esvAvailable({ esvEnabled: true, esvKey: "  " })).toBe(false);
    expect(esvAvailable({ esvEnabled: false, esvKey: "k" })).toBe(false);
    expect(esvAvailable({ esvEnabled: true, esvKey: "k" })).toBe(true);
  });

  it("builds a plain-text query with the Token header", () => {
    const req = buildEsvRequest(esvChapterQuery("PSA", 23), " secret ");
    const url = new URL(req.url);
    expect(`${url.origin}${url.pathname}`).toBe(ESV_API_URL);
    const p = url.searchParams;
    expect(p.get("q")).toBe("Psalms 23");
    expect(p.get("include-headings")).toBe("false");
    expect(p.get("include-footnotes")).toBe("false");
    expect(p.get("include-footnote-body")).toBe("false");
    expect(p.get("include-passage-references")).toBe("false");
    expect(p.get("include-verse-numbers")).toBe("true");
    expect(p.get("include-first-verse-numbers")).toBe("true");
    expect(p.get("include-copyright")).toBe("true");
    expect(req.init.headers.Authorization).toBe("Token secret");
    expect(req.init.cache).toBe("no-store");
  });
});

describe("ESV fetch & parse (mock fetch)", () => {
  it("splits verses, keeps the API's copyright line, and memoizes for the session only", async () => {
    clearEsvSession();
    const fetchMock = vi.fn(async () =>
      json({ passages: ["[1] Lorem ipsum dolor.\n    [2] Sit amet,\n  consectetur.\n\nPlaceholder notice (ESV) placeholder."] }),
    );
    const ch = await fetchEsvChapter("JHN", 3, "key1", fetchMock);
    expect(ch.verses).toEqual({ 1: "Lorem ipsum dolor.", 2: "Sit amet, consectetur." });
    expect(ch.copyright).toBe("Placeholder notice (ESV) placeholder.");
    await fetchEsvChapter("JHN", 3, "key1", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(new URL(url).searchParams.get("q")).toBe("John 3");
    expect(init.headers.Authorization).toBe("Token key1");
    clearEsvSession();
    await fetchEsvChapter("JHN", 3, "key1", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("short copyright form and fallback notice", () => {
    expect(parseEsvPassage("[1] Lorem. (ESV)")).toEqual({ verses: { 1: "Lorem." }, copyright: "(ESV)" });
    const none = parseEsvPassage("[1] Lorem.");
    expect(none.copyright).toBeNull();
    expect(esvNotice([none])).toBe(ESV_FALLBACK_NOTICE);
    expect(ESV_FALLBACK_NOTICE.length).toBeLessThan(160);
  });

  it("errors carry UI labels and are not cached", async () => {
    clearEsvSession();
    const bad = vi.fn(async () => json({ detail: "Invalid token." }, 401));
    await expect(fetchEsvChapter("ROM", 8, "nope", bad)).rejects.toBeInstanceOf(EsvError);
    await expect(fetchEsvChapter("ROM", 8, "nope", bad)).rejects.toThrow(esvErrorMessage(401));
    expect(bad).toHaveBeenCalledTimes(2);
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchEsvChapter("ROM", 9, "k", offline)).rejects.toThrow(esvErrorMessage());
  });
});
