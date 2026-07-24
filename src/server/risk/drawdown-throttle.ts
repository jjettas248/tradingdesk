import { DRAWDOWN_TIERS } from "@/server/config/constants";

/**
 * Drawdown-based risk throttle. Applied as a multiplier on the Kelly-derived
 * size, matching the design exactly:
 *   0% .. -5%  -> full size (x1)
 *   -5%        -> x0.75
 *   -10%       -> x0.50
 *   -15%       -> halt (x0), requires a human to resolve
 *
 * Peak equity is the high-water mark of the equity curve; drawdown is measured
 * from it.
 */

export interface DrawdownState {
  peakEquity: number;
  currentEquity: number;
  drawdownPercent: number; // positive number, e.g. 7.5 means -7.5%
  multiplier: number;
  shouldHalt: boolean;
  tierLabel: string;
}

/** Peak (high-water mark) over an equity series. */
export function peakEquity(equitySeries: number[]): number {
  return equitySeries.reduce((mx, v) => Math.max(mx, v), Number.NEGATIVE_INFINITY);
}

/** Drawdown percent (positive) of current vs. peak. 0 if at/above peak. */
export function drawdownPercent(peak: number, current: number): number {
  if (peak <= 0) return 0;
  const dd = ((peak - current) / peak) * 100;
  return Math.max(0, dd);
}

/**
 * Resolve the throttle tier for a given drawdown percent. Tiers are checked from
 * most-severe to least, so exact boundaries (e.g. exactly -10%) land on the more
 * conservative tier.
 */
export function throttleForDrawdown(ddPercent: number): {
  multiplier: number;
  shouldHalt: boolean;
  tierLabel: string;
} {
  for (const tier of DRAWDOWN_TIERS) {
    if (ddPercent >= tier.thresholdPct) {
      return {
        multiplier: tier.multiplier,
        shouldHalt: tier.halt,
        tierLabel:
          tier.thresholdPct === 0
            ? "normal"
            : `${tier.halt ? "HALT" : "throttled"} at -${tier.thresholdPct}%`,
      };
    }
  }
  // DRAWDOWN_TIERS always includes a 0% tier, so this is unreachable in practice.
  return { multiplier: 1, shouldHalt: false, tierLabel: "normal" };
}

/** Full evaluation from an equity series (chronological). */
export function evaluateDrawdown(equitySeries: number[]): DrawdownState {
  const current = equitySeries.length ? equitySeries[equitySeries.length - 1] : 0;
  const peak = equitySeries.length ? peakEquity(equitySeries) : current;
  const dd = drawdownPercent(peak, current);
  const throttle = throttleForDrawdown(dd);
  return {
    peakEquity: peak,
    currentEquity: current,
    drawdownPercent: dd,
    multiplier: throttle.multiplier,
    shouldHalt: throttle.shouldHalt,
    tierLabel: throttle.tierLabel,
  };
}
