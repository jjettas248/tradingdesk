/**
 * Fractional-Kelly position sizing, built to be conservative by construction.
 *
 * The design's stated requirements, implemented here:
 *  - Use a shrunk / lower-bound edge estimate, never the optimistic backtest mean.
 *    New strategies (few observed trades) shrink aggressively toward zero.
 *  - Apply a fractional-Kelly multiplier (lambda, default quarter-Kelly).
 *  - Adjust for portfolio correlation so N correlated tickets aren't sized as N
 *    independent bets.
 *  - Enforce a hard cap that a bad/unstable estimate can never exceed.
 *  - Never return a negative fraction (a negative edge means "don't trade", size 0).
 *
 * All functions are pure and unit-tested.
 */

/**
 * Full Kelly fraction for a trade that risks 1R to make `rewardRisk` R with
 * probability `winProb` (and loses 1R otherwise).
 *   f* = W - (1 - W) / R
 * Can be negative (negative edge) — callers floor at 0.
 */
export function fullKelly(winProb: number, rewardRisk: number): number {
  if (rewardRisk <= 0) return 0;
  const w = clamp01(winProb);
  return w - (1 - w) / rewardRisk;
}

/**
 * Shrinkage toward zero based on how much live evidence backs the estimate.
 * With `sampleSize` observed trades and prior strength `k`, the factor is
 *   n / (n + k)
 * so 0 trades -> 0 (fully shrunk), and it approaches 1 as evidence accumulates.
 */
export function confidenceShrink(sampleSize: number, priorStrength = 20): number {
  const n = Math.max(0, sampleSize);
  const k = Math.max(1e-9, priorStrength);
  return n / (n + k);
}

export interface ConservativeKellyInput {
  winProb: number;
  rewardRisk: number;
  /** Number of live closed trades supporting this estimate. */
  sampleSize: number;
  /** Fractional-Kelly multiplier (lambda), e.g. 0.25 for quarter-Kelly. */
  lambda: number;
  /** Prior strength for the shrinkage. Higher => more conservative when data is thin. */
  priorStrength?: number;
}

/**
 * Conservative per-trade Kelly fraction BEFORE correlation adjustment and the
 * hard cap: lambda * shrink * fullKelly, floored at 0.
 */
export function conservativeKellyFraction(input: ConservativeKellyInput): number {
  const raw = fullKelly(input.winProb, input.rewardRisk);
  if (raw <= 0) return 0;
  const shrink = confidenceShrink(input.sampleSize, input.priorStrength ?? 20);
  const f = input.lambda * shrink * raw;
  return Math.max(0, f);
}

/**
 * Reduce a per-trade fraction for correlation with `n` related positions at
 * average pairwise correlation `rho`:
 *   f_adj = f / (1 + (n - 1) * rho)
 * n is the total count of correlated positions INCLUDING this one (n>=1).
 */
export function correlationAdjust(fraction: number, n: number, rho: number): number {
  const count = Math.max(1, n);
  const denom = 1 + (count - 1) * clamp01(rho);
  return fraction / denom;
}

/** Apply the hard cap and floor. The cap protects against an unstable estimate. */
export function capFraction(fraction: number, hardCapPct: number): number {
  return Math.max(0, Math.min(fraction, hardCapPct));
}

export interface RiskFractionInput extends ConservativeKellyInput {
  /** Number of correlated positions including this one. */
  correlatedCount: number;
  /** Average pairwise correlation among them. */
  correlation: number;
  /** Hard ceiling on fraction of equity risked. */
  hardCapPct: number;
  /** Drawdown throttle multiplier (1 = normal, 0.5 = half, 0 = halt). */
  drawdownMultiplier: number;
}

export interface RiskFractionResult {
  fraction: number;
  steps: {
    fullKelly: number;
    conservative: number;
    afterCorrelation: number;
    afterDrawdown: number;
    afterCap: number;
  };
}

/**
 * The full composition, in order: fullKelly -> conservative (lambda + shrink) ->
 * correlation adjust -> drawdown multiplier -> hard cap. Returns the final
 * fraction plus every intermediate for auditability.
 */
export function computeRiskFraction(input: RiskFractionInput): RiskFractionResult {
  const raw = fullKelly(input.winProb, input.rewardRisk);
  const conservative = conservativeKellyFraction(input);
  const afterCorrelation = correlationAdjust(
    conservative,
    input.correlatedCount,
    input.correlation
  );
  const afterDrawdown = afterCorrelation * clampNonNeg(input.drawdownMultiplier);
  const afterCap = capFraction(afterDrawdown, input.hardCapPct);
  return {
    fraction: afterCap,
    steps: {
      fullKelly: raw,
      conservative,
      afterCorrelation,
      afterDrawdown,
      afterCap,
    },
  };
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clampNonNeg(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, x);
}
