/**
 * Portfolio heat cap. Total simultaneous risk (sum of per-trade risk fractions)
 * must not exceed a ceiling, so a cluster of individually-sane tickets can't add
 * up to an insane aggregate exposure. If adding a candidate would breach the cap,
 * its risk is scaled down to exactly fill the remaining headroom (or rejected if
 * there's none).
 */

export interface HeatInput {
  /** Risk fractions of positions already committed today (open + already armed). */
  existingFractions: number[];
  /** The proposed risk fraction for the new candidate. */
  proposedFraction: number;
  /** Max total portfolio risk fraction allowed at once. */
  maxTotalHeat: number;
}

export interface HeatResult {
  /** The allowed fraction after applying the cap (may be < proposed, or 0). */
  allowedFraction: number;
  /** True if the proposal had to be reduced or rejected. */
  capped: boolean;
  /** True if no headroom remained at all. */
  rejected: boolean;
  usedHeat: number;
  remainingHeat: number;
}

export function applyHeatCap(input: HeatInput): HeatResult {
  const used = input.existingFractions.reduce((a, b) => a + Math.max(0, b), 0);
  const remaining = Math.max(0, input.maxTotalHeat - used);
  const proposed = Math.max(0, input.proposedFraction);

  if (proposed <= remaining) {
    return {
      allowedFraction: proposed,
      capped: false,
      rejected: false,
      usedHeat: used,
      remainingHeat: remaining,
    };
  }

  // Breach: fill remaining headroom, or reject if none.
  return {
    allowedFraction: remaining,
    capped: true,
    rejected: remaining <= 0,
    usedHeat: used,
    remainingHeat: remaining,
  };
}
