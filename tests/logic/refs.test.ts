import { describe, expect, it } from "vitest";
import {
  compareRefs, END, formatRange, formatRef, fromKey, keysCovered, parseReference, rangeContains, rangeSize,
  rangesOverlap, rangeToKeys, ref, toKey,
} from "@/lib/refs";
import { loadMeta } from "./_data";

const meta = loadMeta();
const R = (b: string, c1: number, v1: number, c2: number, v2: number) => ({ start: ref(b, c1, v1), end: ref(b, c2, v2) });

describe("keys and comparison", () => {
  it("round-trips keys", () => {
    expect(toKey(ref("ROM", 8, 28))).toBe("ROM.8.28");
    expect(fromKey("1CO.13.4")).toEqual(ref("1CO", 13, 4));
  });
  it("compares canonically", () => {
    expect(compareRefs(ref("GEN", 50, 26), ref("EXO", 1, 1))).toBeLessThan(0);
    expect(compareRefs(ref("ROM", 8, 28), ref("ROM", 8, 28))).toBe(0);
    expect(compareRefs(ref("ROM", 9, 1), ref("ROM", 8, 39))).toBeGreaterThan(0);
  });
  it("contains and overlaps", () => {
    const r = R("JHN", 1, 1, 1, 18);
    expect(rangeContains(r, ref("JHN", 1, 14))).toBe(true);
    expect(rangeContains(r, ref("JHN", 1, 19))).toBe(false);
    expect(rangesOverlap(r, R("JHN", 1, 18, 1, 30))).toBe(true);
    expect(rangesOverlap(r, R("JHN", 1, 19, 1, 30))).toBe(false);
  });
});

describe("meta-based sizes", () => {
  it("rangeSize uses BSB versification", () => {
    expect(rangeSize(R("PSA", 23, 1, 23, 6), meta)).toBe(6);
    expect(rangeSize(R("MAT", 5, 1, 7, 29), meta)).toBe(111);
    expect(rangeSize({ start: ref("GEN", 50, 25), end: ref("EXO", 1, 2) }, meta)).toBe(4);
  });
  it("rangeToKeys can skip BSB empty verses", () => {
    const r = R("MAT", 17, 20, 17, 22);
    expect(rangeToKeys(meta, r)).toEqual(["MAT.17.20", "MAT.17.21", "MAT.17.22"]);
    expect(rangeToKeys(meta, r, true)).toEqual(["MAT.17.20", "MAT.17.22"]);
  });
  it("keysCovered de-duplicates and sorts", () => {
    const keys = keysCovered(meta, [R("ROM", 8, 30, 8, 31), R("ROM", 8, 28, 8, 30)]);
    expect(keys).toEqual(["ROM.8.28", "ROM.8.29", "ROM.8.30", "ROM.8.31"]);
  });
});

describe("formatting", () => {
  it("formats single verses and ranges", () => {
    expect(formatRef(ref("ROM", 8, 28))).toBe("Romans 8:28");
    expect(formatRange(R("JHN", 1, 1, 1, 18), meta)).toBe("John 1:1–18");
    expect(formatRange(R("ROM", 8, 28, 8, 28), meta)).toBe("Romans 8:28");
    expect(formatRange(R("ISA", 52, 13, 53, 12), meta)).toBe("Isaiah 52:13–53:12");
  });
  it("detects whole chapters with meta", () => {
    expect(formatRange(R("ROM", 8, 1, 8, 39), meta)).toBe("Romans 8");
    expect(formatRange(R("MAT", 5, 1, 7, 29), meta)).toBe("Matthew 5–7");
    expect(formatRange(R("PSA", 23, 1, 23, 6), meta)).toBe("Psalm 23");
    expect(formatRange(R("PSA", 1, 1, 2, 12), meta)).toBe("Psalms 1–2");
    expect(formatRange(R("JUD", 1, 1, 1, 25), meta)).toBe("Jude");
  });
  it("formats cross-book ranges", () => {
    expect(formatRange({ start: ref("GEN", 50, 1), end: ref("EXO", 2, 25) }, meta)).toBe("Genesis 50–Exodus 2");
    expect(formatRange({ start: ref("GEN", 50, 15), end: ref("EXO", 1, 7) }, meta)).toBe("Genesis 50:15–Exodus 1:7");
  });
  it("without meta treats END sentinels as chapter ends", () => {
    expect(formatRange({ start: ref("ROM", 8, 1), end: ref("ROM", 8, END) })).toBe("Romans 8");
  });
});

describe("parseReference", () => {
  it("parses multiple segments", () => {
    expect(parseReference("Rom 8:28-30; Ps 23", meta)).toEqual([R("ROM", 8, 28, 8, 30), R("PSA", 23, 1, 23, 6)]);
  });
  it("parses numbered books and whole chapters", () => {
    expect(parseReference("1 Cor 13", meta)).toEqual([R("1CO", 13, 1, 13, 13)]);
    expect(parseReference("1Cor 13:4", meta)).toEqual([R("1CO", 13, 4, 13, 4)]);
    expect(parseReference("Matthew 5-7", meta)).toEqual([R("MAT", 5, 1, 7, 29)]);
  });
  it("accepts en/em dashes and periods", () => {
    expect(parseReference("John 15:4–5", meta)).toEqual([R("JHN", 15, 4, 15, 5)]);
    expect(parseReference("Jn. 15.4—5", meta)).toEqual([R("JHN", 15, 4, 15, 5)]);
  });
  it("parses chapter-spanning and comma lists", () => {
    expect(parseReference("Isa 52:13-53:12", meta)).toEqual([R("ISA", 52, 13, 53, 12)]);
    expect(parseReference("John 3:16, 18", meta)).toEqual([R("JHN", 3, 16, 3, 16), R("JHN", 3, 18, 3, 18)]);
    expect(parseReference("Rom 8:28; 12:1-2", meta)).toEqual([R("ROM", 8, 28, 8, 28), R("ROM", 12, 1, 12, 2)]);
  });
  it("parses whole books and long names", () => {
    expect(parseReference("Jude", meta)).toEqual([R("JUD", 1, 1, 1, 25)]);
    expect(parseReference("Song of Solomon 2:1", meta)).toEqual([R("SNG", 2, 1, 2, 1)]);
    expect(parseReference("Psalm 119:105", meta)).toEqual([R("PSA", 119, 105, 119, 105)]);
  });
  it("parses cross-book ranges", () => {
    expect(parseReference("Gen 50 – Exod 2", meta)).toEqual([{ start: ref("GEN", 50, 1), end: ref("EXO", 2, 25) }]);
  });
  it("uses END sentinels without meta", () => {
    expect(parseReference("Ps 23")).toEqual([{ start: ref("PSA", 23, 1), end: ref("PSA", 23, END) }]);
  });
  it("rejects nonsense and impossible verses", () => {
    expect(parseReference("hello world")).toBeNull();
    expect(parseReference("")).toBeNull();
    expect(parseReference("Rom 8:40", meta)).toBeNull();
    expect(parseReference("Rom 17", meta)).toBeNull();
    expect(parseReference("Rom 8:30-28", meta)).toBeNull();
  });
});
