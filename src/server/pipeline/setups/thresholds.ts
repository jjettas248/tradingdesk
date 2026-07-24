import { SETUP_KEYS } from "@/server/config/constants";

/**
 * Tunable numeric parameters for each setup. These live in the DB
 * (PlaybookSetup.thresholds) so they can be adjusted without a code change, but
 * the shape is typed here and the seed writes these defaults. Setup predicate
 * functions receive a thresholds object as an explicit argument, which keeps them
 * pure and unit-testable.
 */

export interface Setup1Thresholds {
  minRelativeVolume: number; // abnormal participation floor (e.g. 1.5x)
  minGapPercent: number; // significant gap/directional move floor
  minRewardRisk: number; // R:R after confirmation
  materialityConfidenceMin: number; // LLM materiality confidence gate (0-1)
  maxCatalystAgeHours: number; // "fresh" = catalyst newer than this
  minSectorRelativeStrength: number; // sector ETF must outperform SPY by at least this (fraction)
  vwapReclaimTolerancePct: number; // how close to VWAP counts as a reclaim/hold
  maxPullbackDepthPct: number; // first pullback must stay shallower than this vs. the move
}

export interface Setup2Thresholds {
  minRewardRisk: number;
  minBreadthRatio: number; // advancers/decliners or % above VWAP supporting direction
  vwapPullbackTolerancePct: number; // pullback must reach near VWAP/breakout zone
  minTrendStrength: number; // opening-structure directional strength (0-1)
  relatedMarketMinAgreement: number; // fraction of related markets confirming (0-1)
  economicBlackoutMinutes: number; // no entry if a major release is within this window
}

export const DEFAULT_SETUP1_THRESHOLDS: Setup1Thresholds = {
  minRelativeVolume: 1.5,
  minGapPercent: 2.0,
  minRewardRisk: 2.0,
  materialityConfidenceMin: 0.7,
  maxCatalystAgeHours: 18,
  minSectorRelativeStrength: 0.0, // sector must at least keep pace with SPY, same direction
  vwapReclaimTolerancePct: 0.3,
  maxPullbackDepthPct: 50, // pullback shouldn't retrace more than half the impulse
};

export const DEFAULT_SETUP2_THRESHOLDS: Setup2Thresholds = {
  minRewardRisk: 2.0,
  minBreadthRatio: 0.55, // >55% of the tape supporting the direction
  vwapPullbackTolerancePct: 0.25,
  minTrendStrength: 0.4,
  relatedMarketMinAgreement: 0.5,
  economicBlackoutMinutes: 15,
};

export const SETUP_THRESHOLD_DEFAULTS: Record<string, Setup1Thresholds | Setup2Thresholds> = {
  [SETUP_KEYS.CATALYST_CONTINUATION]: DEFAULT_SETUP1_THRESHOLDS,
  [SETUP_KEYS.INDEX_TREND_PULLBACK]: DEFAULT_SETUP2_THRESHOLDS,
};
