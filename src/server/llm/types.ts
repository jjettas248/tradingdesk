/**
 * The LLM dependency-injection seam. The pipeline and review flows depend on this
 * interface, never on the Anthropic SDK directly, so tests substitute a
 * deterministic stub and no network call happens in unit/integration tests.
 *
 * Structural rule enforced by these shapes: the materiality call returns a
 * *structured, scored judgment* — never a bare pass/fail. The deterministic gate
 * decides pass/fail from `confidence`. The prose calls only compose language from
 * already-computed evidence; they never see price outcomes for the pre-trade
 * explanation.
 */

export interface MaterialityRequest {
  symbol: string;
  headline: string;
  summary: string;
  sourceTimestamp: string; // ISO
  sessionContext: string; // e.g. "pre-market, gapped +4% on 3x volume"
}

export interface MaterialityResult {
  isMaterial: boolean; // logged, but NOT the gate — confidence is
  confidence: number; // 0-1
  reasoning: string;
  category: string; // e.g. EARNINGS | GUIDANCE | MA | REGULATORY | PRODUCT | MACRO | OTHER
}

export interface ExplanationEvidence {
  symbol: string;
  setupName: string;
  direction: string;
  checklist: { label: string; detail: string; passed: boolean }[];
  levels: {
    entryLow: number;
    entryHigh: number;
    stop: number;
    target1: number;
    target2: number;
    maxEntry: number;
    rewardRisk: number;
    positionSize: number;
    sizeUnit: string;
    maxDollarLoss: number;
  };
  invalidationHints: string[];
}

export interface ExplanationSections {
  evidenceChecklist: string[];
  whyThisEntry: string;
  invalidation: string[];
  patternLesson: string;
  reflectionPrompts: string[];
}

export interface ReviewEvidence {
  symbol: string;
  setupName: string;
  direction: string;
  decisionType: string;
  plannedEntryLow: number;
  plannedEntryHigh: number;
  actualEntryPrice: number | null;
  stop: number;
  target1: number;
  target2: number;
  exits: { portionPercent: number; price: number; reason: string }[];
  realizedR: number | null;
  maxFavorableExcursion: number | null;
  maxAdverseExcursion: number | null;
  followedPlan: boolean;
  originalChecklist: { label: string; detail: string; passed: boolean }[];
}

export interface ReviewSections {
  whatHappened: string;
  thesisAssessment: string;
  executionAssessment: string;
  exitAssessment: string;
  patternLesson: string;
}

export interface LlmUsage {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface LlmResult<T> {
  data: T;
  usage: LlmUsage;
}

export interface LlmClient {
  assessMateriality(req: MaterialityRequest): Promise<LlmResult<MaterialityResult>>;
  composeExplanation(ev: ExplanationEvidence): Promise<LlmResult<ExplanationSections>>;
  composeReview(ev: ReviewEvidence): Promise<LlmResult<ReviewSections>>;
}
