import { describe, it, expect } from "vitest";
import { applyHeatCap } from "@/server/risk/portfolio-heat";

describe("applyHeatCap", () => {
  it("passes through when under the cap", () => {
    const r = applyHeatCap({
      existingFractions: [0.01],
      proposedFraction: 0.01,
      maxTotalHeat: 0.06,
    });
    expect(r.allowedFraction).toBe(0.01);
    expect(r.capped).toBe(false);
    expect(r.rejected).toBe(false);
  });

  it("scales down to fill remaining headroom on breach", () => {
    const r = applyHeatCap({
      existingFractions: [0.03, 0.02],
      proposedFraction: 0.02,
      maxTotalHeat: 0.06,
    });
    expect(r.allowedFraction).toBeCloseTo(0.01, 6); // only 0.01 left
    expect(r.capped).toBe(true);
    expect(r.rejected).toBe(false);
  });

  it("rejects when there is no headroom left", () => {
    const r = applyHeatCap({
      existingFractions: [0.04, 0.02],
      proposedFraction: 0.02,
      maxTotalHeat: 0.06,
    });
    expect(r.allowedFraction).toBe(0);
    expect(r.rejected).toBe(true);
  });

  it("ignores negative existing fractions", () => {
    const r = applyHeatCap({
      existingFractions: [-0.01, 0.02],
      proposedFraction: 0.02,
      maxTotalHeat: 0.06,
    });
    expect(r.usedHeat).toBeCloseTo(0.02, 6);
  });
});
