import { describe, it, expect } from "vitest";
import { canonicalize, contentHash, type HashInput } from "@/server/explanation/hash";

describe("canonicalize", () => {
  it("sorts object keys recursively so order doesn't matter", () => {
    expect(canonicalize({ b: 1, a: { d: 4, c: 3 } })).toBe(
      canonicalize({ a: { c: 3, d: 4 }, b: 1 })
    );
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });
});

describe("contentHash — tamper evidence", () => {
  const base: HashInput = {
    evidenceSnapshot: { symbol: "NVDA", checks: [{ key: "rvol", passed: true }] },
    sections: { whyThisEntry: "wait for the pullback" },
    model: "claude-sonnet-5",
    promptVersion: "explanation-v1",
    createdAt: new Date("2026-07-24T14:00:00.000Z"),
  };

  it("is stable for identical input regardless of key order", () => {
    const reordered: HashInput = {
      createdAt: base.createdAt,
      promptVersion: base.promptVersion,
      model: base.model,
      sections: { whyThisEntry: "wait for the pullback" },
      evidenceSnapshot: { checks: [{ passed: true, key: "rvol" }], symbol: "NVDA" },
    };
    expect(contentHash(base)).toBe(contentHash(reordered));
  });

  it("changes if the evidence changes", () => {
    const mutated = { ...base, evidenceSnapshot: { symbol: "AMD" } };
    expect(contentHash(mutated)).not.toBe(contentHash(base));
  });

  it("changes if the prose changes", () => {
    const mutated = { ...base, sections: { whyThisEntry: "chase it" } };
    expect(contentHash(mutated)).not.toBe(contentHash(base));
  });

  it("changes if the timestamp changes (back-dating is detectable)", () => {
    const mutated = { ...base, createdAt: new Date("2026-07-24T15:00:00.000Z") };
    expect(contentHash(mutated)).not.toBe(contentHash(base));
  });

  it("changes if the model changes", () => {
    const mutated = { ...base, model: "claude-opus-4-8" };
    expect(contentHash(mutated)).not.toBe(contentHash(base));
  });

  it("treats a Date and its ISO string identically", () => {
    const asString = { ...base, createdAt: (base.createdAt as Date).toISOString() };
    expect(contentHash(asString)).toBe(contentHash(base));
  });
});
