import type {
  MarketDataProvider,
  EconomicCalendarProvider,
  SymbolSnapshot,
  MarketContext,
  Direction,
} from "@/server/market-data/types";
import type { LlmClient } from "@/server/llm/types";
import type { CheckResult, TicketLevels, SizingResult } from "@/server/pipeline/types";
import type { PipelineStage, SetupKey } from "@/server/config/constants";
import type { Setup1Thresholds, Setup2Thresholds } from "@/server/pipeline/setups/thresholds";

/** A position already committed (open, or armed earlier today) — for correlation + heat. */
export interface CommittedPosition {
  symbol: string;
  direction: Direction;
  sectorEtf: string | null;
  assetClass: string;
  riskFraction: number;
}

/** Everything the Risk Manager needs from the DB / account state. */
export interface RiskContext {
  currentEquity: number;
  equitySeries: number[]; // chronological, for drawdown
  committedPositions: CommittedPosition[];
  dailyTicketsUsed: number;
  dailyEntriesUsed: number;
  haltActive: boolean;
  /** Observed closed-trade sample size per setup key, for Kelly shrinkage. */
  sampleSizeBySetup: Record<string, number>;
  /** Estimated win prob + reward:risk priors per setup key. */
  edgeBySetup: Record<string, { winProb: number; rewardRisk: number }>;
}

export interface PipelineConfig {
  lambda: number;
  hardCapPct: number;
  maxDailyTickets: number;
  maxDailyEntries: number;
  minEntryWindowMinutes: number;
  maxTotalHeat: number;
}

export interface PipelineDeps {
  provider: MarketDataProvider;
  economic: EconomicCalendarProvider;
  llm: LlmClient;
  asOf: Date;
  risk: RiskContext;
  config: PipelineConfig;
  thresholds: {
    setup1: Setup1Thresholds;
    setup2: Setup2Thresholds;
  };
  /** Sink for LLM call telemetry (persisted by the caller). */
  onLlmCall?: (log: {
    purpose: string;
    relatedSymbol: string;
    model: string;
    promptVersion: string;
    request: unknown;
    response: unknown;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  }) => void;
}

/** Internal working candidate — carries scratch data between stages. */
export interface PipelineCandidate {
  symbol: string;
  setupKey: SetupKey;
  assetClass: "EQUITY" | "INDEX_FUTURE";
  direction: Direction;
  status: "SCANNED" | "FLAGGED" | "REJECTED" | "ARMED";
  rejectedAtStage?: PipelineStage;
  rejectionReason?: string;
  checks: CheckResult[];
  rank?: number;
  levels?: TicketLevels;
  sizing?: SizingResult;

  // scratch (not persisted directly; summarized into evidence.context)
  snapshot: SymbolSnapshot;
  market: MarketContext;
  catalystAgeHours: number | null;
  catalystHeadline: string | null;
  catalystSummary: string | null;
  catalystPublishedAt: Date | null;
  materialityConfidence: number | null;
  materialityReasoning: string | null;
  flowConfirmed: boolean;
  economicReleaseInMinutes: number | null;
}

/** Mark a candidate rejected at the given stage. */
export function reject(
  c: PipelineCandidate,
  stage: PipelineStage,
  reason: string
): PipelineCandidate {
  c.status = "REJECTED";
  c.rejectedAtStage = stage;
  c.rejectionReason = reason;
  return c;
}

export function isActive(c: PipelineCandidate): boolean {
  return c.status !== "REJECTED";
}
