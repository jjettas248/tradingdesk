import { describe, it, expect } from "vitest";
import {
  fullKelly,
  confidenceShrink,
  conservativeKellyFraction,
  correlationAdjust,
  capFraction,
  computeRiskFraction,
} from "@/server/risk/kelly";

describe("fullKelly", () => {
  it("computes W - (1-W)/R for a positive edge", () => {
    // W=0.5, R=2 -> 0.5 - 0.5/2 = 0.25
    expect(fullKelly(0.5, 2)).toBeCloseTo(0.25, 6);
  });

  it("returns negative for a negative-edge bet (caller floors it)", () => {
    // W=0.3, R=1 -> 0.3 - 0.7 = -0.4
    expect(fullKelly(0.3, 1)).toBeCloseTo(-0.4, 6);
  });

  it("returns 0 when rewardRisk <= 0", () => {
    expect(fullKelly(0.9, 0)).toBe(0);
    expect(fullKelly(0.9, -1)).toBe(0);
  });

  it("clamps winProb into [0,1]", () => {
    expect(fullKelly(1.5, 2)).toBeCloseTo(fullKelly(1, 2), 6);
    expect(fullKelly(-0.5, 2)).toBeCloseTo(fullKelly(0, 2), 6);
  });
});

describe("confidenceShrink", () => {
  it("is 0 with no sample (fully shrunk toward zero)", () => {
    expect(confidenceShrink(0, 20)).toBe(0);
  });

  it("approaches 1 as sample grows", () => {
    expect(confidenceShrink(20, 20)).toBeCloseTo(0.5, 6);
    expect(confidenceShrink(180, 20)).toBeCloseTo(0.9, 6);
  });

  it("never exceeds 1 or drops below 0", () => {
    expect(confidenceShrink(10_000, 20)).toBeLessThanOrEqual(1);
    expect(confidenceShrink(-5, 20)).toBe(0);
  });
});

describe("conservativeKellyFraction", () => {
  it("floors at 0 for a negative edge", () => {
    const f = conservativeKellyFraction({
      winProb: 0.2,
      rewardRisk: 1,
      sampleSize: 100,
      lambda: 0.25,
    });
    expect(f).toBe(0);
  });

  it("is 0 with zero sample regardless of edge (aggressive shrinkage)", () => {
    const f = conservativeKellyFraction({
      winProb: 0.8,
      rewardRisk: 3,
      sampleSize: 0,
      lambda: 0.25,
    });
    expect(f).toBe(0);
  });

  it("applies lambda and shrink multiplicatively", () => {
    // fullKelly(0.5,2)=0.25; shrink(20,20)=0.5; lambda=0.25 -> 0.25*0.5*0.25=0.03125
    const f = conservativeKellyFraction({
      winProb: 0.5,
      rewardRisk: 2,
      sampleSize: 20,
      lambda: 0.25,
      priorStrength: 20,
    });
    expect(f).toBeCloseTo(0.03125, 6);
  });
});

describe("correlationAdjust", () => {
  it("is unchanged for a single position", () => {
    expect(correlationAdjust(0.02, 1, 0.6)).toBeCloseTo(0.02, 6);
  });

  it("divides by (1 + (n-1)*rho)", () => {
    // n=10, rho=0.3 -> 1 + 9*0.3 = 3.7
    expect(correlationAdjust(0.0769, 10, 0.3)).toBeCloseTo(0.0769 / 3.7, 6);
  });

  it("clamps rho into [0,1]", () => {
    expect(correlationAdjust(0.02, 3, 2)).toBeCloseTo(correlationAdjust(0.02, 3, 1), 6);
  });
});

describe("capFraction", () => {
  it("caps at the hard limit", () => {
    expect(capFraction(0.5, 0.02)).toBe(0.02);
  });
  it("passes through below the cap", () => {
    expect(capFraction(0.01, 0.02)).toBe(0.01);
  });
  it("floors at 0", () => {
    expect(capFraction(-0.1, 0.02)).toBe(0);
  });
});

describe("computeRiskFraction (full composition)", () => {
  it("never exceeds the hard cap even with a huge raw edge", () => {
    const r = computeRiskFraction({
      winProb: 0.9,
      rewardRisk: 5,
      sampleSize: 10_000,
      lambda: 0.5,
      correlatedCount: 1,
      correlation: 0,
      hardCapPct: 0.02,
      drawdownMultiplier: 1,
    });
    expect(r.fraction).toBeLessThanOrEqual(0.02);
    expect(r.fraction).toBe(0.02);
  });

  it("halts (0) when the drawdown multiplier is 0", () => {
    const r = computeRiskFraction({
      winProb: 0.6,
      rewardRisk: 2,
      sampleSize: 100,
      lambda: 0.25,
      correlatedCount: 1,
      correlation: 0,
      hardCapPct: 0.02,
      drawdownMultiplier: 0,
    });
    expect(r.fraction).toBe(0);
  });

  it("reduces size for correlated positions", () => {
    const base = computeRiskFraction({
      winProb: 0.55,
      rewardRisk: 2.5,
      sampleSize: 50,
      lambda: 0.25,
      correlatedCount: 1,
      correlation: 0,
      hardCapPct: 0.1, // high cap so correlation, not the cap, is the binding constraint
      drawdownMultiplier: 1,
    });
    const correlated = computeRiskFraction({
      winProb: 0.55,
      rewardRisk: 2.5,
      sampleSize: 50,
      lambda: 0.25,
      correlatedCount: 5,
      correlation: 0.6,
      hardCapPct: 0.1,
      drawdownMultiplier: 1,
    });
    expect(correlated.fraction).toBeLessThan(base.fraction);
  });

  it("exposes intermediate steps for auditability", () => {
    const r = computeRiskFraction({
      winProb: 0.55,
      rewardRisk: 2,
      sampleSize: 40,
      lambda: 0.25,
      correlatedCount: 2,
      correlation: 0.6,
      hardCapPct: 0.02,
      drawdownMultiplier: 0.75,
    });
    expect(r.steps.conservative).toBeGreaterThan(0);
    expect(r.steps.afterCorrelation).toBeLessThan(r.steps.conservative);
    expect(r.steps.afterDrawdown).toBeCloseTo(r.steps.afterCorrelation * 0.75, 6);
    expect(r.steps.afterCap).toBe(r.fraction);
  });
});
