import { PIPELINE_STAGES, SETUP_KEYS } from "@/server/config/constants";
import type { PipelineDeps, PipelineCandidate } from "@/server/pipeline/context";
import { reject, isActive } from "@/server/pipeline/context";
import {
  checkSectorConfirmation,
  checkVwapReclaim,
  checkControlledPullback,
} from "@/server/pipeline/setups/setup1-catalyst-continuation";
import {
  checkBreadth,
  checkRelatedMarkets,
  checkVwapPullback,
  checkNoImminentRelease,
} from "@/server/pipeline/setups/setup2-index-trend-pullback";
import { firstFailedRequired } from "@/server/pipeline/types";

/**
 * Stage 3 — Quant. Purely deterministic structural checks. Runs the remaining
 * setup-specific criteria and rejects at QUANT on the first required failure.
 */
export async function runQuant(
  candidates: PipelineCandidate[],
  deps: PipelineDeps
): Promise<void> {
  for (const c of candidates) {
    if (!isActive(c)) continue;

    if (c.setupKey === SETUP_KEYS.CATALYST_CONTINUATION) {
      const inputs = {
        snapshot: c.snapshot,
        market: c.market,
        thresholds: deps.thresholds.setup1,
        catalystAgeHours: c.catalystAgeHours,
        materialityConfidence: c.materialityConfidence,
        rewardRisk: null,
      };
      const quantChecks = [
        checkSectorConfirmation(inputs),
        checkVwapReclaim(inputs),
        checkControlledPullback(inputs),
      ];
      c.checks.push(...quantChecks);
      const failed = firstFailedRequired(quantChecks);
      if (failed) reject(c, PIPELINE_STAGES.QUANT, failed.detail);
    } else {
      // Setup 2 — resolve imminent-release window from the economic calendar.
      const releases = await deps.economic.getUpcomingReleases(
        deps.thresholds.setup2.economicBlackoutMinutes * 4,
        deps.asOf
      );
      const soonest = releases
        .map((r) => (r.scheduledAt.getTime() - deps.asOf.getTime()) / 60_000)
        .filter((m) => m >= 0)
        .sort((a, b) => a - b)[0];
      c.economicReleaseInMinutes = soonest ?? null;

      const inputs = {
        snapshot: c.snapshot,
        market: c.market,
        thresholds: deps.thresholds.setup2,
        economicReleaseInMinutes: c.economicReleaseInMinutes,
        rewardRisk: null,
      };
      const quantChecks = [
        checkBreadth(inputs),
        checkRelatedMarkets(inputs),
        checkVwapPullback(inputs),
        checkNoImminentRelease(inputs),
      ];
      c.checks.push(...quantChecks);
      const failed = firstFailedRequired(quantChecks);
      if (failed) reject(c, PIPELINE_STAGES.QUANT, failed.detail);
    }
  }
}
