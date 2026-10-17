// Citation parser: inputs are structural reference strings with placeholder words around them.
import { beforeAll, describe, expect, it } from "vitest";
import { type BibleMeta, fmtRange, loadMeta } from "../../scripts/lib/bible-meta";
import { bookFromName, findCitations, parseOsis, romanToInt } from "../../scripts/lib/citations";

let meta: BibleMeta;
beforeAll(async () => {
  meta = await loadMeta();
});

/** All valid ranges found in s, formatted. */
function refs(s: string, ctx?: { book?: string; chapter?: number }): string[] {
  return findCitations(s, meta, ctx).flatMap((c) => c.ranges.map((r) => fmtRange(meta, r)));
}
function problems(s: string): string[] {
  return findCitations(s, meta).flatMap((c) => c.problems);
}

describe("roman numerals", () => {
  it("parses strict lowercase and uppercase numerals", () => {
    expect(romanToInt("viii")).toBe(8);
    expect(romanToInt("XIV")).toBe(14);
    expect(romanToInt("cxix")).toBe(119);
    expect(romanToInt("l")).toBe(50);
  });
  it("rejects mixed case and non-canonical forms", () => {
    expect(romanToInt("Xiv")).toBeNull();
    expect(romanToInt("iiii")).toBeNull();
    expect(romanToInt("vx")).toBeNull();
  });
  it("reads roman chapters in citations", () => {
    expect(refs("lorem (Rom. viii. 28) ipsum")).toEqual(["Rom 8:28"]);
    expect(refs("lorem Ps. cxix. 105 ipsum")).toEqual(["Ps 119:105"]);
    expect(refs("lorem Rom. i. ipsum")).toEqual(["Rom 1"]);
  });
});

describe("ranges and lists", () => {
  it("handles verse ranges, lists and cross-chapter ranges", () => {
    expect(refs("Rom. 8:28-30.")).toEqual(["Rom 8:28–30"]);
    expect(refs("Rom. 8:28—9:3 lorem")).toEqual(["Rom 8:28–9:3"]);
    expect(refs("Heb. xi. 1-3, 6 lorem")).toEqual(["Heb 11:1–3", "Heb 11:6"]);
    expect(refs("Eph. ii. 8, 9.")).toEqual(["Eph 2:8", "Eph 2:9"]);
  });
  it("continues ';' lists in the same book and switches books", () => {
    expect(refs("John iii. 16, 17; v. 24.")).toEqual(["John 3:16", "John 3:17", "John 5:24"]);
    expect(refs("lorem 1 Cor. xv. 22; Gal. ii. 20 ipsum")).toEqual(["1 Cor 15:22", "Gal 2:20"]);
    expect(refs("Rom. 8:28, 1 John 4:19")).toEqual(["Rom 8:28", "1 John 4:19"]);
  });
  it("handles chapter ranges and whole chapters", () => {
    expect(refs("Matt. v.-vii. lorem")).toEqual(["Matt 5–7"]);
    expect(refs("PSALM 23")).toEqual(["Ps 23"]);
  });
  it("reads single-chapter books' numbers as verses", () => {
    expect(refs("Jude 3 lorem")).toEqual(["Jude 1:3"]);
  });
});

describe("collision words", () => {
  it("never matches lowercase words or numbers after English words", () => {
    expect(refs("This is 5 times")).toEqual([]);
    expect(refs("lorem am 3 ipsum")).toEqual([]);
    expect(refs("Job said 3 things")).toEqual([]);
    expect(refs("From 3 to 4")).toEqual([]);
  });
  it("requires chapter and verse for word-like book names", () => {
    expect(refs("Mark 4 lorem")).toEqual([]);
    expect(refs("Mark 4:3")).toEqual(["Mark 4:3"]);
    expect(refs("Job xix. 25")).toEqual(["Job 19:25"]);
    expect(refs("Song 2 lorem")).toEqual([]);
  });
  it("requires a period after two-letter abbreviations", () => {
    expect(refs("Is 5:3")).toEqual([]);
    expect(refs("Is. 53:5")).toEqual(["Isa 53:5"]);
    expect(refs("Isa. 53:5")).toEqual(["Isa 53:5"]);
  });
  it("does not read a roman pronoun as a chapter", () => {
    expect(refs("Rom. I lorem")).toEqual([]);
  });
});

describe("OCR tolerance (matching only)", () => {
  it("accepts 'l' for '1' in a book prefix and verse number", () => {
    expect(refs("l Cor. xiii. 4")).toEqual(["1 Cor 13:4"]);
    const c = findCitations("Rom. 8:2l lorem", meta);
    expect(c[0].ranges.map((r) => fmtRange(meta, r))).toEqual(["Rom 8:21"]);
    expect(c[0].problems.join()).toMatch(/ocr/);
  });
  it("accepts ',' or '.' after a roman chapter", () => {
    expect(refs("Rom. xv, 4 lorem")).toEqual(["Rom 15:4"]);
    expect(refs("Rom. xv. 4 lorem")).toEqual(["Rom 15:4"]);
  });
});

describe("validation and ambiguity", () => {
  it("drops ranges beyond the versification and says why", () => {
    expect(refs("Rom. 8:40 lorem")).toEqual([]);
    expect(problems("Rom. 8:40 lorem").join()).toMatch(/invalid range/);
    expect(problems("Ps. 151:1").join()).toMatch(/chapter 151/);
  });
  it("drops arabic chapter + comma lists as ambiguous", () => {
    expect(refs("Ps. 23, 24 lorem")).toEqual([]);
    expect(problems("Ps. 23, 24 lorem").join()).toMatch(/ambiguous/);
  });
  it("resolves 'ver. 5' only with a heading context", () => {
    expect(refs("lorem ver. 5 ipsum")).toEqual([]);
    expect(problems("lorem ver. 5 ipsum").join()).toMatch(/without a heading context/);
    expect(refs("lorem ver. 5-7 ipsum", { book: "ROM", chapter: 8 })).toEqual(["Rom 8:5–7"]);
  });
});

describe("OSIS references (proof texts, cross references)", () => {
  it("parses single verses, ranges, whole chapters and comma lists", () => {
    const f = (s: string) => parseOsis(s, meta).map((r) => fmtRange(meta, r));
    expect(f("Rom.8.28")).toEqual(["Rom 8:28"]);
    expect(f("Rom.14.7-Rom.14.9")).toEqual(["Rom 14:7–9"]);
    expect(f("Ps.8")).toEqual(["Ps 8"]);
    expect(f("Gen.1-Gen.2")).toEqual(["Gen 1–2"]);
    expect(f("Rom.3.10,Rom.3.23")).toEqual(["Rom 3:10", "Rom 3:23"]);
  });
  it("reports unknown books and invalid verses", () => {
    const p: string[] = [];
    expect(parseOsis("Xyz.1.1,Rom.8.99", meta, p)).toEqual([]);
    expect(p).toHaveLength(2);
  });
  it("resolves free book names", () => {
    expect(bookFromName("ROMANS")).toBe("ROM");
    expect(bookFromName("1 Corinthians")).toBe("1CO");
    expect(bookFromName("II Kings")).toBe("2KI");
    expect(bookFromName("Psalm")).toBe("PSA");
  });
});
