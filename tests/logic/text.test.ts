import { describe, expect, it } from "vitest";
import { firstLetters, numberToWords, tokenize, unifyQuotes, wordCount } from "@/lib/text";

describe("tokenize", () => {
  it("keeps punctuation on display tokens and normalizes", () => {
    const t = tokenize("“Lorem ipsum, dolor’s sit.”");
    expect(t.map((x) => x.display)).toEqual(["“Lorem", "ipsum,", "dolor’s", "sit.”"]);
    expect(t.map((x) => x.norm)).toEqual(["lorem", "ipsum", "dolors", "sit"]);
    expect(t[0].lead).toBe("“");
    expect(t[3].trail).toBe(".”");
  });
  it("splits em-dash joined words and merges lone punctuation", () => {
    expect(tokenize("lorem—ipsum").map((x) => x.display)).toEqual(["lorem—", "ipsum"]);
    expect(tokenize("lorem — ipsum").map((x) => x.display)).toEqual(["lorem—", "ipsum"]);
  });
  it("counts words", () => {
    expect(wordCount("  lorem ipsum — dolor ")).toBe(3);
  });
});

describe("first letters and quotes", () => {
  it("renders first letters with punctuation", () => {
    expect(firstLetters("Lorem ipsum, dolor sit.")).toBe("L i, d s.");
  });
  it("unifies quotes", () => {
    expect(unifyQuotes("‘a’ “b”")).toBe("'a' \"b\"");
  });
});

describe("numberToWords", () => {
  it("spells numbers", () => {
    expect(numberToWords(3)).toEqual(["three"]);
    expect(numberToWords(40)).toEqual(["forty"]);
    expect(numberToWords(153)).toEqual(["one", "hundred", "fifty", "three"]);
    expect(numberToWords(144000)).toEqual(["one", "hundred", "forty", "four", "thousand"]);
    expect(numberToWords(0)).toEqual(["zero"]);
  });
});
