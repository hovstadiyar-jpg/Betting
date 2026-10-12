/**
 * Deterministic pseudo-random helpers for synthetic demo data.
 * A fixed seed means every server render and every build produces identical
 * numbers, which keeps SSR and client hydration in sync.
 */

export type Rng = () => number;

/** mulberry32 — tiny, fast, good-enough PRNG for demo data. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const uniform = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

export const intBetween = (rng: Rng, min: number, max: number) => Math.floor(uniform(rng, min, max + 1));

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick() called with an empty array");
  return item;
}

/** Standard normal via Box–Muller. */
export function normal(rng: Rng, mean = 0, sd = 1): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson sample (Knuth) — fine for the small means used here. */
export function poisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

/** P(X <= k) for X ~ Poisson(lambda). */
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= Math.floor(k); i += 1) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(1, sum);
}

/** Standard normal CDF (Abramowitz–Stegun approximation). */
export function normalCdf(x: number, mean = 0, sd = 1): number {
  const z = (x - mean) / (sd * Math.SQRT2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + (z >= 0 ? y : -y));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
