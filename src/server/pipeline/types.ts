import type { AssetClass, Direction } from "@/server/market-data/types";
import type { PipelineStage } from "@/server/config/constants";

/**
 * A single, named, structured piece of evidence. EVERY gating decision in the
 * system is a threshold comparison that produces one of these — including the one
 * check computed by an LLM (materiality), whose numeric confidence becomes
 * `value` and whose pass/fail is still decided by a deterministic threshold here.
 * The LLM never emits a bare pass/fail.
 */
export interface CheckResult {
  /** Stable machine key, e.g. "rvol", "materiality", "vwap_reclaim". */
  key: string;
  /** Human-readable label for the explanation/journal. */
  label: string;
  stage: PipelineStage;
  /** Did this check pass its threshold? */
  passed: boolean;
  /** The observed numeric value, when applicable. */
  value?: number;
  /** The threshold it was compared against, when applicable. */
  threshold?: number;
  /** Short human detail, e.g. "RVOL 3.1x ≥ 1.5x floor". */
  detail: string;
  /** Whether this check is required to arm, or merely informational/weighting. */
  required: boolean;
}

/** The evolving evidence object a candidate accumulates as it moves through stages. */
export interface CandidateEvidence {
  symbol: string;
  setupKey: string;
  assetClass: AssetClass;
  direction: Direction;
  checks: CheckResult[];
  /** Structural facts captured for the explanation prompt (not gating). */
  context: Record<string, number | string | boolean | null>;
}

/** Concrete order levels produced by the Trade Architect. */
export interface TicketLevels {
  entryLow: number;
  entryHigh: number;
  triggerCondition: string;
  stopPrice: number;
  target1Price: number;
  target2Price: number;
  maxEntryPrice: number;
  rewardRisk: number;
  runnerPlan: string;
  alertExpiresAt: Date;
}

/** Sizing output from the Risk Manager. */
export interface SizingResult {
  positionSize: number; // shares or contracts
  sizeUnit: "SHARES" | "CONTRACTS";
  maxDollarLoss: number;
  riskFraction: number; // fraction of equity actually risked
  perShareRisk: number;
  notes: string[];
}

/** The full working object as it flows through the pipeline. */
export interface WorkingCandidate {
  evidence: CandidateEvidence;
  rank?: number;
  levels?: TicketLevels;
  sizing?: SizingResult;
  status: "SCANNED" | "FLAGGED" | "REJECTED" | "ARMED";
  rejectedAtStage?: PipelineStage;
  rejectionReason?: string;
}

export function allRequiredPassed(checks: CheckResult[]): boolean {
  return checks.filter((c) => c.required).every((c) => c.passed);
}

export function firstFailedRequired(checks: CheckResult[]): CheckResult | undefined {
  return checks.find((c) => c.required && !c.passed);
}
