import { describe, it, expect } from "vitest";
import { pairwiseCorrelation, averageCorrelation } from "@/server/risk/correlation";
import { CORRELATION_BUCKETS } from "@/server/config/constants";

describe("pairwiseCorrelation", () => {
  it("is 1 for the same symbol", () => {
    expect(
      pairwiseCorrelation(
        { symbol: "NVDA", direction: "LONG" },
        { symbol: "NVDA", direction: "LONG" }
      )
    ).toBe(1);
  });

  it("uses the same-sector bucket for two tech names, same direction", () => {
    expect(
      pairwiseCorrelation(
        { symbol: "NVDA", direction: "LONG" },
        { symbol: "AMD", direction: "LONG" }
      )
    ).toBeCloseTo(CORRELATION_BUCKETS.SAME_SECTOR, 6);
  });

  it("uses the same-instrument bucket for MES + MNQ", () => {
    expect(
      pairwiseCorrelation(
        { symbol: "MES", direction: "LONG" },
        { symbol: "MNQ", direction: "LONG" }
      )
    ).toBeCloseTo(CORRELATION_BUCKETS.SAME_INSTRUMENT, 6);
  });

  it("uses the cross-sector bucket for two different-sector equities", () => {
    expect(
      pairwiseCorrelation(
        { symbol: "NVDA", direction: "LONG" }, // tech
        { symbol: "JPM", direction: "LONG" } // financials
      )
    ).toBeCloseTo(CORRELATION_BUCKETS.CROSS_SECTOR_SAME_DIR, 6);
  });

  it("flips sign for opposing directions", () => {
    expect(
      pairwiseCorrelation(
        { symbol: "NVDA", direction: "LONG" },
        { symbol: "AMD", direction: "SHORT" }
      )
    ).toBeCloseTo(-CORRELATION_BUCKETS.SAME_SECTOR, 6);
  });
});

describe("averageCorrelation", () => {
  it("is 0 with no others", () => {
    expect(averageCorrelation({ symbol: "NVDA", direction: "LONG" }, [])).toBe(0);
  });

  it("averages positive correlations and floors negatives at 0", () => {
    const avg = averageCorrelation({ symbol: "NVDA", direction: "LONG" }, [
      { symbol: "AMD", direction: "LONG" }, // +0.6
      { symbol: "AMD", direction: "SHORT" }, // -0.6 -> floored to 0
    ]);
    expect(avg).toBeCloseTo(0.3, 6);
  });
});
