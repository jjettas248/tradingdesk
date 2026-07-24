import type { SymbolSnapshot, MarketContext } from "@/server/market-data/types";
import type { CheckResult } from "@/server/pipeline/types";
import type { Setup2Thresholds } from "@/server/pipeline/setups/thresholds";
import { PIPELINE_STAGES } from "@/server/config/constants";

/**
 * Setup 2 — Index Trend Pullback (MES / MNQ). Deterministic structural checks
 * only; there is no LLM step in this setup (no news materiality — index trend is
 * a pure-structure play). Each documented criterion is its own pure function.
 */

export interface Setup2Inputs {
  snapshot: SymbolSnapshot;
  market: MarketContext;
  thresholds: Setup2Thresholds;
  /** Minutes until the next high-importance economic release; null if none soon. */
  economicReleaseInMinutes: number | null;
  /** Reward/risk from built levels; null until the Trade Architect runs. */
  rewardRisk: number | null;
}

const S = PIPELINE_STAGES;

export function checkHigherTimeframeContext(i: Setup2Inputs): CheckResult {
  const v = i.snapshot.trendStrength;
  const t = i.thresholds.minTrendStrength;
  return {
    key: "htf_context",
    label: "Clear higher-timeframe / opening structure",
    stage: S.SCANNER,
    value: v,
    threshold: t,
    passed: v >= t,
    required: true,
    detail: `Trend strength ${v.toFixed(2)} vs ${t} floor`,
  };
}

export function checkBreadth(i: Setup2Inputs): CheckResult {
  // Breadth must support the trade's direction. For a long, we want breadth high;
  // for a short, we want breadth low (i.e. 1 - breadth high).
  const dirLong = i.snapshot.changePercent >= 0;
  const supportive = dirLong ? i.market.breadthRatio : 1 - i.market.breadthRatio;
  const t = i.thresholds.minBreadthRatio;
  return {
    key: "breadth",
    label: "Breadth supports the direction",
    stage: S.QUANT,
    value: supportive,
    threshold: t,
    passed: supportive >= t,
    required: true,
    detail: `Supportive breadth ${(supportive * 100).toFixed(0)}% vs ${(t * 100).toFixed(0)}% floor`,
  };
}

export function checkRelatedMarkets(i: Setup2Inputs): CheckResult {
  const v = i.market.relatedMarketAgreement;
  const t = i.thresholds.relatedMarketMinAgreement;
  return {
    key: "related_markets",
    label: "Related markets confirm",
    stage: S.QUANT,
    value: v,
    threshold: t,
    passed: v >= t,
    required: true,
    detail: `Related-market agreement ${(v * 100).toFixed(0)}% vs ${(t * 100).toFixed(0)}% floor`,
  };
}

export function checkVwapPullback(i: Setup2Inputs): CheckResult {
  // Pullback into VWAP/breakout zone: price should be near VWAP (within tolerance)
  // and on the correct side (reclaimed), i.e. a pullback that held, not a breakdown.
  const dist = Math.abs(i.snapshot.distanceToVwapPct);
  const near = dist <= i.thresholds.vwapPullbackTolerancePct + 5;
  const passed = i.snapshot.reclaimedVwap && near;
  return {
    key: "vwap_pullback",
    label: "Pullback into VWAP / volume-supported zone",
    stage: S.QUANT,
    value: i.snapshot.distanceToVwapPct,
    threshold: i.thresholds.vwapPullbackTolerancePct,
    passed,
    required: true,
    detail: passed
      ? `Pulled back to VWAP (${i.snapshot.distanceToVwapPct.toFixed(2)}% away), held`
      : `Not a controlled VWAP pullback (${i.snapshot.distanceToVwapPct.toFixed(2)}% away, reclaimed=${i.snapshot.reclaimedVwap})`,
  };
}

export function checkNoImminentRelease(i: Setup2Inputs): CheckResult {
  const mins = i.economicReleaseInMinutes;
  const blackout = i.thresholds.economicBlackoutMinutes;
  const passed = mins === null || mins > blackout;
  return {
    key: "no_imminent_release",
    label: "No imminent major economic release",
    stage: S.QUANT,
    value: mins ?? undefined,
    threshold: blackout,
    passed,
    required: true,
    detail:
      mins === null
        ? "No high-importance release scheduled soon"
        : `Next release in ${mins}m vs ${blackout}m blackout`,
  };
}

export function checkRewardRisk(i: Setup2Inputs): CheckResult {
  const v = i.rewardRisk;
  const t = i.thresholds.minRewardRisk;
  const passed = v !== null && v >= t;
  return {
    key: "reward_risk",
    label: "Reward/risk favorable after confirmation",
    stage: S.TRADE_ARCHITECT,
    value: v ?? undefined,
    threshold: t,
    passed,
    required: true,
    detail: v === null ? "R:R not computed" : `R:R ${v.toFixed(2)} vs ${t} floor`,
  };
}

export function evaluateSetup2(i: Setup2Inputs): CheckResult[] {
  return [
    checkHigherTimeframeContext(i),
    checkBreadth(i),
    checkRelatedMarkets(i),
    checkVwapPullback(i),
    checkNoImminentRelease(i),
    checkRewardRisk(i),
  ];
}
