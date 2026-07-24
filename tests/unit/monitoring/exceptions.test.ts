import { describe, it, expect } from "vitest";
import { classifyException } from "@/server/monitoring/exceptions";

describe("classifyException — LONG", () => {
  const call = (price: number) => classifyException("LONG", price, 100, 110, 120);
  it("STOP when price at/below stop", () => {
    expect(call(100)).toBe("STOP");
    expect(call(99)).toBe("STOP");
  });
  it("TARGET2 when price at/above target2", () => {
    expect(call(120)).toBe("TARGET2");
    expect(call(125)).toBe("TARGET2");
  });
  it("TARGET1 between target1 and target2", () => {
    expect(call(110)).toBe("TARGET1");
    expect(call(115)).toBe("TARGET1");
  });
  it("null in the normal band", () => {
    expect(call(105)).toBeNull();
  });
  it("STOP takes priority over targets in a degenerate config", () => {
    // stop above targets shouldn't happen, but STOP must win if it does
    expect(classifyException("LONG", 100, 130, 110, 120)).toBe("STOP");
  });
});

describe("classifyException — SHORT", () => {
  const call = (price: number) => classifyException("SHORT", price, 100, 90, 80);
  it("STOP when price at/above stop", () => {
    expect(call(100)).toBe("STOP");
    expect(call(101)).toBe("STOP");
  });
  it("TARGET2 when price at/below target2", () => {
    expect(call(80)).toBe("TARGET2");
    expect(call(75)).toBe("TARGET2");
  });
  it("TARGET1 between", () => {
    expect(call(90)).toBe("TARGET1");
    expect(call(85)).toBe("TARGET1");
  });
  it("null in the normal band", () => {
    expect(call(95)).toBeNull();
  });
});
