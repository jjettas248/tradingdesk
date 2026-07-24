import { describe, it, expect } from "vitest";
import {
  evaluateSetup1,
  type Setup1Inputs,
} from "@/server/pipeline/setups/setup1-catalyst-continuation";
import { DEFAULT_SETUP1_THRESHOLDS } from "@/server/pipeline/setups/thresholds";
import type { SymbolSnapshot, MarketContext } from "@/server/market-data/types";
import { allRequiredPassed, firstFailedRequired } from "@/server/pipeline/types";

function goldenSnapshot(): SymbolSnapshot {
  return {
    symbol: "NVDA",
    assetClass: "EQUITY",
    sectorEtf: "XLK",
    asOf: new Date("2026-07-24T14:00:00Z"),
    priorClose: 180,
    openPrice: 187,
    lastPrice: 188,
    sessionHigh: 189,
    sessionLow: 185,
    gapPercent: 3.9,
    changePercent: 4.4,
    relativeVolume: 3.1,
    anchoredVwap: 186.5,
    distanceToVwapPct: 0.8,
    reclaimedVwap: true,
    firstPullbackDepthPct: 35,
    impulseMovePct: 4.5,
    trendStrength: 0.7,
    intradayBars: [],
  };
}

function goldenMarket(): MarketContext {
  return {
    asOf: new Date("2026-07-24T14:00:00Z"),
    spyChangePercent: 0.5,
    breadthRatio: 0.62,
    sectorChangePercent: { XLK: 1.4 },
    relatedMarketAgreement: 1,
  };
}

function goldenInputs(): Setup1Inputs {
  return {
    snapshot: goldenSnapshot(),
    market: goldenMarket(),
    thresholds: DEFAULT_SETUP1_THRESHOLDS,
    catalystAgeHours: 3,
    materialityConfidence: 0.85,
    rewardRisk: 2.6,
    flowConfirmed: true,
  };
}

describe("Setup 1 — golden path", () => {
  it("passes every required check", () => {
    const checks = evaluateSetup1(goldenInputs());
    expect(allRequiredPassed(checks)).toBe(true);
    expect(firstFailedRequired(checks)).toBeUndefined();
  });
});

describe("Setup 1 — fails exactly one criterion at a time", () => {
  it("fails on thin relative volume", () => {
    const i = goldenInputs();
    i.snapshot.relativeVolume = 1.05;
    const failed = firstFailedRequired(evaluateSetup1(i));
    expect(failed?.key).toBe("rvol");
  });

  it("fails on an insufficient gap", () => {
    const i = goldenInputs();
    i.snapshot.gapPercent = 0.7;
    const failed = evaluateSetup1(i).find((c) => !c.passed);
    expect(failed?.key).toBe("gap");
  });

  it("fails on a stale catalyst", () => {
    const i = goldenInputs();
    i.catalystAgeHours = 48;
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("catalyst_fresh");
  });

  it("fails on a missing catalyst", () => {
    const i = goldenInputs();
    i.catalystAgeHours = null;
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("catalyst_fresh");
  });

  it("fails on immaterial catalyst (LLM confidence below floor)", () => {
    const i = goldenInputs();
    i.materialityConfidence = 0.4;
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("materiality");
  });

  it("fails when the sector does not confirm", () => {
    const i = goldenInputs();
    i.market.sectorChangePercent = { XLK: -1.2 }; // sector down while stock up
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("sector_confirmation");
  });

  it("fails when price lost anchored VWAP", () => {
    const i = goldenInputs();
    i.snapshot.reclaimedVwap = false;
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("vwap_reclaim");
  });

  it("fails on an uncontrolled (deep) pullback", () => {
    const i = goldenInputs();
    i.snapshot.firstPullbackDepthPct = 80;
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("controlled_pullback");
  });

  it("fails when reward/risk is unfavorable", () => {
    const i = goldenInputs();
    i.rewardRisk = 1.2;
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("reward_risk");
  });

  it("fails when reward/risk is not yet computed", () => {
    const i = goldenInputs();
    i.rewardRisk = null;
    expect(firstFailedRequired(evaluateSetup1(i))?.key).toBe("reward_risk");
  });
});
