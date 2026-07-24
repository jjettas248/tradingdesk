import { describe, it, expect } from "vitest";
import {
  evaluateSetup2,
  type Setup2Inputs,
} from "@/server/pipeline/setups/setup2-index-trend-pullback";
import { DEFAULT_SETUP2_THRESHOLDS } from "@/server/pipeline/setups/thresholds";
import type { SymbolSnapshot, MarketContext } from "@/server/market-data/types";
import { allRequiredPassed, firstFailedRequired } from "@/server/pipeline/types";

function goldenSnapshot(): SymbolSnapshot {
  return {
    symbol: "MES",
    assetClass: "INDEX_FUTURE",
    sectorEtf: null,
    asOf: new Date("2026-07-24T14:00:00Z"),
    priorClose: 5450,
    openPrice: 5470,
    lastPrice: 5478,
    sessionHigh: 5485,
    sessionLow: 5462,
    gapPercent: 0.37,
    changePercent: 0.51,
    relativeVolume: 1.4,
    anchoredVwap: 5474,
    distanceToVwapPct: 0.07,
    reclaimedVwap: true,
    firstPullbackDepthPct: 30,
    impulseMovePct: 0.6,
    trendStrength: 0.65,
    intradayBars: [],
  };
}

function goldenMarket(): MarketContext {
  return {
    asOf: new Date("2026-07-24T14:00:00Z"),
    spyChangePercent: 0.5,
    breadthRatio: 0.68,
    sectorChangePercent: {},
    relatedMarketAgreement: 1,
  };
}

function goldenInputs(): Setup2Inputs {
  return {
    snapshot: goldenSnapshot(),
    market: goldenMarket(),
    thresholds: DEFAULT_SETUP2_THRESHOLDS,
    economicReleaseInMinutes: null,
    rewardRisk: 2.4,
  };
}

describe("Setup 2 — golden path", () => {
  it("passes every required check", () => {
    const checks = evaluateSetup2(goldenInputs());
    expect(allRequiredPassed(checks)).toBe(true);
  });
});

describe("Setup 2 — fails exactly one criterion at a time", () => {
  it("fails on weak higher-timeframe trend", () => {
    const i = goldenInputs();
    i.snapshot.trendStrength = 0.2;
    expect(firstFailedRequired(evaluateSetup2(i))?.key).toBe("htf_context");
  });

  it("fails on unsupportive breadth", () => {
    const i = goldenInputs();
    i.market.breadthRatio = 0.4; // long needs >0.55
    expect(firstFailedRequired(evaluateSetup2(i))?.key).toBe("breadth");
  });

  it("fails when related markets diverge", () => {
    const i = goldenInputs();
    i.market.relatedMarketAgreement = 0.25;
    expect(firstFailedRequired(evaluateSetup2(i))?.key).toBe("related_markets");
  });

  it("fails when it is not a controlled VWAP pullback", () => {
    const i = goldenInputs();
    i.snapshot.reclaimedVwap = false;
    expect(firstFailedRequired(evaluateSetup2(i))?.key).toBe("vwap_pullback");
  });

  it("fails when a major economic release is imminent", () => {
    const i = goldenInputs();
    i.economicReleaseInMinutes = 8; // inside 15m blackout
    expect(firstFailedRequired(evaluateSetup2(i))?.key).toBe("no_imminent_release");
  });

  it("passes the release check when the release is comfortably far out", () => {
    const i = goldenInputs();
    i.economicReleaseInMinutes = 120;
    expect(allRequiredPassed(evaluateSetup2(i))).toBe(true);
  });

  it("fails when reward/risk is unfavorable", () => {
    const i = goldenInputs();
    i.rewardRisk = 1.1;
    expect(firstFailedRequired(evaluateSetup2(i))?.key).toBe("reward_risk");
  });
});
