import { describe, expect, it } from "vitest";
import { hashSeed, hiddenIndices, mulberry32 } from "@/lib/seeded";

describe("seeded", () => {
  it("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("hiddenIndices is deterministic, sized, sorted", () => {
    const h = hiddenIndices(20, 0.4, 7);
    expect(h).toEqual(hiddenIndices(20, 0.4, 7));
    expect(h).toHaveLength(8);
    expect([...h].sort((x, y) => x - y)).toEqual(h);
    expect(new Set(h).size).toBe(8);
    expect(hiddenIndices(20, 0, 7)).toEqual([]);
    expect(hiddenIndices(20, 1, 7)).toHaveLength(20);
  });
  it("is monotonic: 40% ⊇ 20%", () => {
    for (const seed of [1, 2, hashSeed("ROM.8.28")]) {
      const lo = new Set(hiddenIndices(37, 0.2, seed));
      const hi = new Set(hiddenIndices(37, 0.4, seed));
      for (const i of lo) expect(hi.has(i)).toBe(true);
    }
  });
  it("different seeds hide different words", () => {
    expect(hiddenIndices(30, 0.5, 1)).not.toEqual(hiddenIndices(30, 0.5, 2));
  });
});
