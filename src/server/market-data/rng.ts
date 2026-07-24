/**
 * Tiny seedable PRNG (mulberry32) + helpers. The mock provider must be
 * deterministic given a seed so tests and repeated runs are reproducible — and
 * because the workflow/runtime environment forbids Math.random() in some
 * contexts, an explicit seeded generator is the right tool regardless.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Ensure a non-zero 32-bit state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Approx standard normal via Box–Muller. */
  normal(mean = 0, stdev = 1): number {
    const u1 = Math.max(this.next(), 1e-9);
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdev;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/**
 * Derive a stable per-symbol seed from a base seed + a string, so each symbol's
 * path is independent but reproducible.
 */
export function deriveSeed(base: number, key: string): number {
  let h = base >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}
