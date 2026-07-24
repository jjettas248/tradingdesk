import { createHash } from "node:crypto";

/**
 * Canonical JSON + sha256 content hashing. This is what makes the pre-trade
 * explanation's "generated-before / revealed-after" ordering provable rather than
 * merely policy: the hash covers the evidence, the prose sections, the model,
 * the prompt version, AND the creation timestamp, so any change to any of them —
 * including back-dating — produces a different hash.
 */

/** Deterministic JSON stringify with recursively sorted object keys. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortValue(obj[key]);
  }
  return sorted;
}

export interface HashInput {
  evidenceSnapshot: unknown;
  sections: unknown;
  model: string;
  promptVersion: string;
  createdAt: Date | string;
}

/** sha256 over the canonicalized {evidence, sections, model, promptVersion, createdAt}. */
export function contentHash(input: HashInput): string {
  const createdAt =
    input.createdAt instanceof Date ? input.createdAt.toISOString() : input.createdAt;
  const canonical = canonicalize({
    evidenceSnapshot: input.evidenceSnapshot,
    sections: input.sections,
    model: input.model,
    promptVersion: input.promptVersion,
    createdAt,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
