/**
 * Static, non-secret constants. Anything a user might reasonably want to tune
 * per-deployment lives in env.ts instead; this file is for structural facts
 * about the market and the app.
 */

export const TIMEZONE = "America/New_York";

/** The two authorized setups. Keys are stable identifiers used across the DB. */
export const SETUP_KEYS = {
  CATALYST_CONTINUATION: "SETUP_1_CATALYST_CONTINUATION",
  INDEX_TREND_PULLBACK: "SETUP_2_INDEX_TREND_PULLBACK",
} as const;

export type SetupKey = (typeof SETUP_KEYS)[keyof typeof SETUP_KEYS];

/**
 * Dollar value of a one-point move per contract, for the micro futures the
 * Index Trend Pullback setup trades. Sizing math is in contracts, not shares,
 * for these — getting this wrong silently mis-sizes, so it's explicit.
 */
export const FUTURES_POINT_VALUE: Record<string, number> = {
  MES: 5, // Micro E-mini S&P 500: $5 per index point
  MNQ: 2, // Micro E-mini Nasdaq-100: $2 per index point
};

/** Symbols the Index Trend Pullback setup is allowed to trade. */
export const INDEX_FUTURE_SYMBOLS = ["MES", "MNQ"] as const;

/**
 * How stale a Telegram callback can be before the webhook refuses to process it.
 * Guards against a resurfaced/buggy button tap mutating state long after the fact.
 */
export const MAX_DECISION_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Correlation buckets (v1 heuristic — no real covariance data exists yet). Used
 * by the Risk Manager to avoid disguising one oversized directional bet as N
 * independent tickets.
 */
export const CORRELATION_BUCKETS = {
  SAME_INSTRUMENT: 0.8, // e.g. MES + MNQ same day, same direction
  SAME_SECTOR: 0.6, // two names in the same sector, same direction
  CROSS_SECTOR_SAME_DIR: 0.3, // different sectors, same direction (broad-market beta)
  UNRELATED: 0.05, // opposing or genuinely unrelated
} as const;

/** Drawdown throttle tiers. Multiplier applied to Kelly-derived size. */
export const DRAWDOWN_TIERS = [
  { thresholdPct: 15, multiplier: 0, halt: true }, // -15%: halt, human must resolve
  { thresholdPct: 10, multiplier: 0.5, halt: false }, // -10%: half size
  { thresholdPct: 5, multiplier: 0.75, halt: false }, // -5%: three-quarter size
  { thresholdPct: 0, multiplier: 1, halt: false }, // normal
] as const;

/** Structural labels for lifecycle stages a candidate can be rejected at. */
export const PIPELINE_STAGES = {
  SCANNER: "SCANNER",
  CATALYST_FLOW: "CATALYST_FLOW",
  QUANT: "QUANT",
  TRADE_ARCHITECT: "TRADE_ARCHITECT",
  RISK_MANAGER: "RISK_MANAGER",
  CHIEF_TRADER: "CHIEF_TRADER",
} as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

/**
 * Seeded conservative edge priors per setup, used by the Risk Manager until
 * ~20+ closed trades accumulate per setup (after which empirical stats take
 * over). Deliberately modest win rates; the positive expectancy comes from
 * reward:risk and runners, not from a high hit rate. Tunable.
 */
export const SEEDED_EDGE_PRIORS: Record<string, { winProb: number; rewardRisk: number }> = {
  [SETUP_KEYS.CATALYST_CONTINUATION]: { winProb: 0.45, rewardRisk: 2.5 },
  [SETUP_KEYS.INDEX_TREND_PULLBACK]: { winProb: 0.45, rewardRisk: 2.2 },
};

/** Min closed trades before empirical edge replaces the seeded prior. */
export const EMPIRICAL_EDGE_MIN_SAMPLE = 20;

/**
 * The seeded prior is a deliberate, conservative belief — worth this many
 * pseudo-observations for Kelly's confidence shrinkage. Without it, a fresh
 * deployment (0 live trades) shrinks Kelly to 0 and the desk arms nothing,
 * ever. This lets cold start size at ~the hard cap and ramp as real trades
 * close. Tunable.
 */
export const PRIOR_PSEUDO_COUNT = 20;

/** Max fraction of equity at risk across all simultaneous positions. */
export const MAX_PORTFOLIO_HEAT = 0.06;

/** Prompt versions — bump when a prompt changes so hashes/logs stay meaningful. */
export const PROMPT_VERSIONS = {
  CATALYST_MATERIALITY: "materiality-v1",
  PRETRADE_EXPLANATION: "explanation-v1",
  POSTTRADE_REVIEW: "review-v1",
} as const;
