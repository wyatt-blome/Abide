import { describe, expect, it } from "vitest";
import { align, gradeFromAccuracy, normalizeWords, score, similarity } from "@/lib/scoring";

const TARGET = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.";

describe("normalizeWords", () => {
  it("lowercases, strips punctuation, unifies quotes, spells digits", () => {
    expect(normalizeWords("“Lorem,” IPSUM’s 3 dolor; 40!")).toEqual(["lorem", "ipsums", "three", "dolor", "forty"]);
    expect(normalizeWords("lorem-ipsum 153")).toEqual(["lorem", "ipsum", "one", "hundred", "fifty", "three"]);
  });
  it("matches spelled-out and digit numbers", () => {
    expect(score("forty days", "40 days").accuracy).toBe(1);
    expect(score("one hundred fifty-three", "153").accuracy).toBe(1);
  });
});

describe("similarity and alignment", () => {
  it("similarity = 1 - lev/maxLen", () => {
    expect(similarity("tempor", "tempor")).toBe(1);
    expect(similarity("adipiscing", "adipisicng")).toBeCloseTo(0.8, 5);
    expect(similarity("abc", "xyz")).toBe(0);
  });
  it("produces match/sub/ins/del ops", () => {
    const ops = align(["a1", "lorem", "ipsum", "dolor"], ["a1", "lorem", "extra", "ipsun", "sit"]);
    expect(ops.map((o) => o.op)).toEqual(["match", "match", "ins", "match", "sub"]);
    const near = ops[3];
    expect(near.op === "match" && near.exact).toBe(false);
  });
  it("reports deletions for missing words", () => {
    const ops = align(["lorem", "ipsum", "dolor"], ["lorem", "dolor"]);
    expect(ops.map((o) => o.op)).toEqual(["match", "del", "match"]);
  });
});

describe("score", () => {
  it("perfect recitation ignoring case and punctuation", () => {
    const r = score(TARGET, "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor");
    expect(r.accuracy).toBe(1);
    expect(r.grade).toBe(5);
  });
  it("tolerates small typos (similarity >= 0.8)", () => {
    const r = score(TARGET, "lorem ipsum dolor sit amet consectetur adipisicng elit sed do eiusmod tempor");
    expect(r.accuracy).toBe(1);
  });
  it("accuracy = matched / target words", () => {
    // 12 target words, 3 missing → 9/12 = .75 → grade 2
    const r = score(TARGET, "lorem ipsum dolor sit amet consectetur adipiscing elit sed");
    expect(r.targetWords).toBe(12);
    expect(r.accuracy).toBeCloseTo(0.75, 5);
    expect(r.grade).toBe(2);
  });
  it("extra words do not raise accuracy", () => {
    const r = score("lorem ipsum", "lorem lorem ipsum ipsum");
    expect(r.accuracy).toBe(1);
    expect(r.ops.filter((o) => o.op === "ins")).toHaveLength(2);
  });
  it("peeks cost 0.03 each, clamped at 0", () => {
    expect(score(TARGET, TARGET, 1).accuracy).toBeCloseTo(0.97, 5);
    expect(score(TARGET, TARGET, 1).grade).toBe(4);
    expect(score("lorem", "", 5).accuracy).toBe(0);
  });
  it("empty attempt grades 1", () => {
    expect(score(TARGET, "").grade).toBe(1);
  });
});

describe("gradeFromAccuracy", () => {
  it("uses the thresholds", () => {
    expect(gradeFromAccuracy(0.98)).toBe(5);
    expect(gradeFromAccuracy(0.979)).toBe(4);
    expect(gradeFromAccuracy(0.92)).toBe(4);
    expect(gradeFromAccuracy(0.8)).toBe(3);
    expect(gradeFromAccuracy(0.6)).toBe(2);
    expect(gradeFromAccuracy(0.59)).toBe(1);
  });
});
