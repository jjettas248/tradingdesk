import type { SymbolSnapshot, MarketContext } from "@/server/market-data/types";
import type { CheckResult } from "@/server/pipeline/types";
import type { Setup1Thresholds } from "@/server/pipeline/setups/thresholds";
import { PIPELINE_STAGES } from "@/server/config/constants";

/**
 * Setup 1 — Catalyst Continuation Pullback. Each documented criterion is its own
 * pure check function returning a structured CheckResult, so each has a dedicated
 * unit-test fixture and the pipeline can short-circuit at the right stage (the
 * expensive LLM materiality check only runs after the cheap screening passes).
 *
 * `direction` is LONG in v1 for this setup (continuation of a positive catalyst);
 * SHORT is structurally supported by the same code but not armed by the scanner.
 */

export interface Setup1Inputs {
  snapshot: SymbolSnapshot;
  market: MarketContext;
  thresholds: Setup1Thresholds;
  /** Age in hours of the freshest catalyst; null if none found. */
  catalystAgeHours: number | null;
  /** LLM materiality confidence 0-1; null if not yet evaluated. */
  materialityConfidence: number | null;
  /** Reward/risk from built levels; null until the Trade Architect runs. */
  rewardRisk: number | null;
  /** Whether a money-flow signal was subsequently confirmed by price. */
  flowConfirmed?: boolean;
}

function mk(
  partial: Omit<CheckResult, "stage"> & { stage: CheckResult["stage"] }
): CheckResult {
  return partial;
}

const S = PIPELINE_STAGES;

export function checkGap(i: Setup1Inputs): CheckResult {
  const v = Math.abs(i.snapshot.gapPercent);
  const t = i.thresholds.minGapPercent;
  return mk({
    key: "gap",
    label: "Significant gap / directional move",
    stage: S.SCANNER,
    value: v,
    threshold: t,
    passed: v >= t,
    required: true,
    detail: `Gap ${v.toFixed(1)}% vs ${t}% floor`,
  });
}

export function checkRelativeVolume(i: Setup1Inputs): CheckResult {
  const v = i.snapshot.relativeVolume;
  const t = i.thresholds.minRelativeVolume;
  return mk({
    key: "rvol",
    label: "Abnormal relative volume",
    stage: S.SCANNER,
    value: v,
    threshold: t,
    passed: v >= t,
    required: true,
    detail: `RVOL ${v.toFixed(2)}x vs ${t}x floor`,
  });
}

export function checkFreshness(i: Setup1Inputs): CheckResult {
  const v = i.catalystAgeHours;
  const t = i.thresholds.maxCatalystAgeHours;
  const passed = v !== null && v <= t;
  return mk({
    key: "catalyst_fresh",
    label: "Catalyst is fresh",
    stage: S.CATALYST_FLOW,
    value: v ?? undefined,
    threshold: t,
    passed,
    required: true,
    detail:
      v === null ? "No catalyst found" : `Catalyst age ${v.toFixed(1)}h vs ${t}h max`,
  });
}

export function checkMateriality(i: Setup1Inputs): CheckResult {
  const v = i.materialityConfidence;
  const t = i.thresholds.materialityConfidenceMin;
  const passed = v !== null && v >= t;
  return mk({
    key: "materiality",
    label: "Catalyst is material (LLM-assessed)",
    stage: S.CATALYST_FLOW,
    value: v ?? undefined,
    threshold: t,
    passed,
    required: true,
    detail:
      v === null
        ? "Materiality not evaluated"
        : `Materiality confidence ${(v * 100).toFixed(0)}% vs ${(t * 100).toFixed(0)}% floor`,
  });
}

/**
 * Sector confirmation: the name's sector ETF is moving in the same direction as
 * the trade and at least keeping pace with SPY (relative strength). This is a
 * deterministic structural comparison — not an LLM judgment.
 */
export function checkSectorConfirmation(i: Setup1Inputs): CheckResult {
  const sector = i.snapshot.sectorEtf;
  const dirSign = i.snapshot.changePercent >= 0 ? 1 : -1;
  const sectorMove = sector ? i.market.sectorChangePercent[sector] ?? 0 : 0;
  const spyMove = i.market.spyChangePercent;
  const relativeStrength = sectorMove - spyMove; // sector RS vs broad market
  const sameDirection = Math.sign(sectorMove) === dirSign;
  const passed =
    sameDirection && dirSign * relativeStrength >= i.thresholds.minSectorRelativeStrength;
  return mk({
    key: "sector_confirmation",
    label: "Sector confirms the move",
    stage: S.QUANT,
    value: relativeStrength,
    threshold: i.thresholds.minSectorRelativeStrength,
    passed,
    required: true,
    detail: sector
      ? `Sector ${sector} ${sectorMove.toFixed(2)}% vs SPY ${spyMove.toFixed(2)}% (RS ${relativeStrength.toFixed(2)})`
      : "No sector mapping",
  });
}

export function checkVwapReclaim(i: Setup1Inputs): CheckResult {
  const reclaimed = i.snapshot.reclaimedVwap;
  return mk({
    key: "vwap_reclaim",
    label: "Holds / reclaims anchored VWAP",
    stage: S.QUANT,
    value: i.snapshot.distanceToVwapPct,
    threshold: i.thresholds.vwapReclaimTolerancePct,
    passed: reclaimed,
    required: true,
    detail: reclaimed
      ? `Holding VWAP (${i.snapshot.distanceToVwapPct.toFixed(2)}% away)`
      : "Below/against anchored VWAP",
  });
}

export function checkControlledPullback(i: Setup1Inputs): CheckResult {
  const v = i.snapshot.firstPullbackDepthPct;
  const t = i.thresholds.maxPullbackDepthPct;
  return mk({
    key: "controlled_pullback",
    label: "First pullback stays controlled",
    stage: S.QUANT,
    value: v,
    threshold: t,
    passed: v <= t,
    required: true,
    detail: `Pullback depth ${v.toFixed(0)}% of impulse vs ${t}% max`,
  });
}

export function checkRewardRisk(i: Setup1Inputs): CheckResult {
  const v = i.rewardRisk;
  const t = i.thresholds.minRewardRisk;
  const passed = v !== null && v >= t;
  return mk({
    key: "reward_risk",
    label: "Reward/risk favorable after confirmation",
    stage: S.TRADE_ARCHITECT,
    value: v ?? undefined,
    threshold: t,
    passed,
    required: true,
    detail: v === null ? "R:R not computed" : `R:R ${v.toFixed(2)} vs ${t} floor`,
  });
}

/** Run every Setup 1 check. Used by the integration test and available to the pipeline. */
export function evaluateSetup1(i: Setup1Inputs): CheckResult[] {
  return [
    checkGap(i),
    checkRelativeVolume(i),
    checkFreshness(i),
    checkMateriality(i),
    checkSectorConfirmation(i),
    checkVwapReclaim(i),
    checkControlledPullback(i),
    checkRewardRisk(i),
  ];
}
