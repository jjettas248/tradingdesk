import type { MockScenario } from "@/server/market-data/mock-provider";

/**
 * Named, deterministic scenarios for tests, demos, and the CLI's --scenario flag.
 * Each returns a MockScenario that shapes the generated day.
 */
export const SCENARIOS: Record<string, MockScenario> = {
  /** A clean Setup 1 golden path: NVDA gaps on a fresh material catalyst. */
  goldenSetup1: {
    arm: [
      {
        symbol: "NVDA",
        direction: "LONG",
        news: {
          headline: "NVDA guides Q3 revenue well above consensus on data-center demand",
          summary:
            "NVIDIA raised forward guidance materially above Street estimates, citing accelerating data-center orders. Shares gapped up ~4% pre-market and are extending on 3x relative volume.",
          ageHours: 3,
        },
      },
    ],
  },

  /** A clean Setup 2 golden path: MES trends up with broad support, no release soon. */
  goldenSetup2: {
    arm: [{ symbol: "MES", direction: "LONG" }],
    marketContext: { breadthRatio: 0.68, relatedMarketAgreement: 1 },
    economicReleaseInMinutes: undefined,
  },

  /** Setup 1 candidate that should FAIL on relative volume (thin gap). */
  setup1FailsRvol: {
    arm: [{ symbol: "AMD", direction: "LONG" }],
    overrides: {
      AMD: { relativeVolume: 1.05 }, // below the 1.5 floor
    },
  },

  /** Setup 2 candidate blocked by an imminent economic release. */
  setup2BlockedByRelease: {
    arm: [{ symbol: "MES", direction: "LONG" }],
    economicReleaseInMinutes: 8, // inside the 15-min blackout
  },

  /** Two correlated tech longs on the same day — exercises the correlation cap. */
  correlatedTechLongs: {
    arm: [
      { symbol: "NVDA", direction: "LONG" },
      { symbol: "AMD", direction: "LONG" },
    ],
  },
};

export type ScenarioName = keyof typeof SCENARIOS;

export function getScenario(name: string | undefined): MockScenario | undefined {
  if (!name) return undefined;
  return SCENARIOS[name as ScenarioName];
}
