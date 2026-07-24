/**
 * Trading-results score (0-100). First-pass heuristic — every constant is
 * flagged tunable. Rewards positive rolling expectancy and clean execution,
 * penalizes drawdown.
 *
 *   score = clamp(50 + 10*expectancyR + 0.3*(execQuality-50) - 2*drawdown%, 0, 100)
 */

export interface TradingResultsInput {
  closedRMultiples: number[]; // realized R per closed trade (recent window)
  avgExecutionQuality: number; // 0-100
  currentDrawdownPercent: number; // positive
}

export interface ScoreResult {
  score: number;
  components: Record<string, number>;
}

export function tradingResultsScore(input: TradingResultsInput): ScoreResult {
  const n = input.closedRMultiples.length;
  const expectancyR = n ? input.closedRMultiples.reduce((a, b) => a + b, 0) / n : 0;
  const raw =
    50 +
    10 * expectancyR +
    0.3 * (clamp(input.avgExecutionQuality, 0, 100) - 50) -
    2 * Math.max(0, input.currentDrawdownPercent);
  return {
    score: clamp(raw, 0, 100),
    components: {
      expectancyR: round2(expectancyR),
      sampleSize: n,
      avgExecutionQuality: round2(input.avgExecutionQuality),
      drawdownPercent: round2(input.currentDrawdownPercent),
    },
  };
}

/**
 * Per-trade execution quality (0-100): penalize entering past the chase limit
 * and deviating from the exit plan.
 */
export function executionQuality(input: {
  enteredPastChaseLimit: boolean;
  slippageR: number; // how far past the intended entry, in R (0 if none)
  exitDeviatedFromPlan: boolean;
}): number {
  let q = 100;
  if (input.enteredPastChaseLimit) q -= 25;
  q -= Math.min(25, Math.max(0, input.slippageR) * 25);
  if (input.exitDeviatedFromPlan) q -= 20;
  return clamp(q, 0, 100);
}

function clamp(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
