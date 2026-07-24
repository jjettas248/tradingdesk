import { describe, it, expect } from "vitest";
import { MockProvider } from "@/server/market-data/mock-provider";
import { MockEconomicCalendarProvider } from "@/server/market-data/mock-economic-calendar-provider";
import { StubLlmClient } from "@/server/llm/stub-client";
import { SCENARIOS } from "@/server/market-data/mock-scenarios";
import { runMorningPipeline } from "@/server/pipeline/run-morning-pipeline";
import type { PipelineDeps, RiskContext } from "@/server/pipeline/context";
import {
  DEFAULT_SETUP1_THRESHOLDS,
  DEFAULT_SETUP2_THRESHOLDS,
} from "@/server/pipeline/setups/thresholds";
import { SETUP_KEYS, PIPELINE_STAGES } from "@/server/config/constants";

const AS_OF = new Date("2026-07-24T13:45:00Z"); // ~09:45 ET

function riskContext(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    currentEquity: 10000,
    equitySeries: [10000],
    committedPositions: [],
    dailyTicketsUsed: 0,
    dailyEntriesUsed: 0,
    haltActive: false,
    sampleSizeBySetup: {
      // Give a live sample so Kelly isn't fully shrunk to zero in the test.
      [SETUP_KEYS.CATALYST_CONTINUATION]: 60,
      [SETUP_KEYS.INDEX_TREND_PULLBACK]: 60,
    },
    edgeBySetup: {
      [SETUP_KEYS.CATALYST_CONTINUATION]: { winProb: 0.5, rewardRisk: 2.5 },
      [SETUP_KEYS.INDEX_TREND_PULLBACK]: { winProb: 0.5, rewardRisk: 2.2 },
    },
    ...overrides,
  };
}

function makeDeps(scenario: object, risk: RiskContext, llm: StubLlmClient): PipelineDeps {
  return {
    provider: new MockProvider({ seed: 42, asOf: AS_OF, scenario }),
    economic: new MockEconomicCalendarProvider({
      asOf: AS_OF,
      releaseInMinutes: (scenario as { economicReleaseInMinutes?: number }).economicReleaseInMinutes ?? null,
    }),
    llm,
    asOf: AS_OF,
    risk,
    config: {
      lambda: 0.25,
      hardCapPct: 0.02,
      maxDailyTickets: 3,
      maxDailyEntries: 2,
      minEntryWindowMinutes: 5,
      maxTotalHeat: 0.06,
    },
    thresholds: { setup1: DEFAULT_SETUP1_THRESHOLDS, setup2: DEFAULT_SETUP2_THRESHOLDS },
  };
}

describe("morning pipeline — Setup 1 golden path", () => {
  it("arms NVDA with a complete ticket", async () => {
    const llm = new StubLlmClient();
    const deps = makeDeps(SCENARIOS.goldenSetup1, riskContext(), llm);
    const result = await runMorningPipeline(deps);

    const nvda = result.armed.find((c) => c.symbol === "NVDA");
    expect(nvda, "NVDA should be armed").toBeTruthy();
    expect(nvda!.setupKey).toBe(SETUP_KEYS.CATALYST_CONTINUATION);
    expect(nvda!.levels).toBeTruthy();
    expect(nvda!.sizing).toBeTruthy();
    expect(nvda!.levels!.stopPrice).toBeLessThan(nvda!.levels!.entryLow);
    expect(nvda!.levels!.target1Price).toBeGreaterThan(nvda!.levels!.entryHigh);
    expect(nvda!.levels!.rewardRisk).toBeGreaterThanOrEqual(DEFAULT_SETUP1_THRESHOLDS.minRewardRisk);
    expect(nvda!.sizing!.positionSize).toBeGreaterThanOrEqual(1);
    expect(nvda!.sizing!.maxDollarLoss).toBeLessThanOrEqual(10000 * 0.02 + 1e-6);
    // Exactly one materiality call for the one armed catalyst candidate (plus any
    // other equities that passed screening) — but never zero.
    expect(llm.materialityCalls).toBeGreaterThanOrEqual(1);
  });
});

describe("morning pipeline — rejection at the correct stage", () => {
  it("rejects a thin-RVOL candidate at the SCANNER stage", async () => {
    const llm = new StubLlmClient();
    const deps = makeDeps(SCENARIOS.setup1FailsRvol, riskContext(), llm);
    const result = await runMorningPipeline(deps);
    const amd = result.candidates.find((c) => c.symbol === "AMD");
    expect(amd).toBeTruthy();
    expect(amd!.status).toBe("REJECTED");
    expect(amd!.rejectedAtStage).toBe(PIPELINE_STAGES.SCANNER);
  });

  it("blocks a Setup 2 index trade when a release is imminent", async () => {
    const llm = new StubLlmClient();
    const deps = makeDeps(SCENARIOS.setup2BlockedByRelease, riskContext(), llm);
    const result = await runMorningPipeline(deps);
    const mes = result.candidates.find((c) => c.symbol === "MES");
    expect(mes).toBeTruthy();
    expect(mes!.status).toBe("REJECTED");
    expect(mes!.rejectedAtStage).toBe(PIPELINE_STAGES.QUANT);
  });
});

describe("morning pipeline — risk halt", () => {
  it("rejects everything at RISK_MANAGER when drawdown hits -15%", async () => {
    const llm = new StubLlmClient();
    const deps = makeDeps(
      SCENARIOS.goldenSetup1,
      riskContext({ equitySeries: [10000, 10000, 8500] }), // -15%
      llm
    );
    const result = await runMorningPipeline(deps);
    expect(result.risk.haltTriggered).toBe(true);
    expect(result.armed.length).toBe(0);
  });
});

describe("morning pipeline — daily ticket cap", () => {
  it("never arms more than the remaining ticket budget", async () => {
    const llm = new StubLlmClient();
    const deps = makeDeps(SCENARIOS.correlatedTechLongs, riskContext({ dailyTicketsUsed: 2 }), llm);
    const result = await runMorningPipeline(deps);
    expect(result.armed.length).toBeLessThanOrEqual(1); // only 1 of 3 budget left
  });
});
