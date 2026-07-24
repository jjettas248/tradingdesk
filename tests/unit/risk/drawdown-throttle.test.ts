import { describe, it, expect } from "vitest";
import {
  peakEquity,
  drawdownPercent,
  throttleForDrawdown,
  evaluateDrawdown,
} from "@/server/risk/drawdown-throttle";

describe("peakEquity", () => {
  it("tracks the high-water mark", () => {
    expect(peakEquity([10000, 10500, 10200, 10800, 10600])).toBe(10800);
  });
});

describe("drawdownPercent", () => {
  it("is 0 at or above the peak", () => {
    expect(drawdownPercent(10000, 10000)).toBe(0);
    expect(drawdownPercent(10000, 11000)).toBe(0);
  });
  it("computes positive drawdown below the peak", () => {
    expect(drawdownPercent(10000, 9000)).toBeCloseTo(10, 6);
  });
});

describe("throttleForDrawdown — exact tier boundaries", () => {
  it("full size just under -5%", () => {
    const t = throttleForDrawdown(4.99);
    expect(t.multiplier).toBe(1);
    expect(t.shouldHalt).toBe(false);
  });

  it("x0.75 exactly at -5%", () => {
    const t = throttleForDrawdown(5);
    expect(t.multiplier).toBe(0.75);
    expect(t.shouldHalt).toBe(false);
  });

  it("x0.75 between -5% and -10%", () => {
    expect(throttleForDrawdown(7.5).multiplier).toBe(0.75);
  });

  it("x0.50 exactly at -10%", () => {
    const t = throttleForDrawdown(10);
    expect(t.multiplier).toBe(0.5);
    expect(t.shouldHalt).toBe(false);
  });

  it("halts (x0) exactly at -15%", () => {
    const t = throttleForDrawdown(15);
    expect(t.multiplier).toBe(0);
    expect(t.shouldHalt).toBe(true);
  });

  it("halts beyond -15%", () => {
    const t = throttleForDrawdown(30);
    expect(t.multiplier).toBe(0);
    expect(t.shouldHalt).toBe(true);
  });
});

describe("evaluateDrawdown", () => {
  it("resolves the full state from an equity series", () => {
    const s = evaluateDrawdown([10000, 10800, 9720]); // peak 10800, now 9720 -> -10%
    expect(s.peakEquity).toBe(10800);
    expect(s.drawdownPercent).toBeCloseTo(10, 6);
    expect(s.multiplier).toBe(0.5);
    expect(s.shouldHalt).toBe(false);
  });

  it("flags halt at -15% from peak", () => {
    const s = evaluateDrawdown([10000, 10000, 8500]); // -15%
    expect(s.shouldHalt).toBe(true);
    expect(s.multiplier).toBe(0);
  });
});
