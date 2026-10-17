// Seeded PRNG for Progressive Hide.
//
// `hiddenIndices` must be deterministic per (wordCount, seed) and monotonic in `fraction`: the
// words hidden at 40% include every word hidden at 20%. Both follow from computing ONE seeded
// permutation of the word indices and hiding its first ⌈fraction·n⌉ entries.

/** mulberry32: small, fast 32-bit PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a hash, handy for turning a VerseKey or card id into a seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic Fisher–Yates permutation of 0..n−1. */
export function seededPermutation(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

/** Indices (ascending) of the words to hide for a fraction in [0, 1]. */
export function hiddenIndices(wordCount: number, fraction: number, seed: number): number[] {
  const n = Math.max(0, Math.floor(wordCount));
  const f = Math.min(1, Math.max(0, fraction));
  const k = Math.ceil(f * n - 1e-9);
  return seededPermutation(n, seed).slice(0, k).sort((a, b) => a - b);
}
