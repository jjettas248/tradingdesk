import type {
  LlmClient,
  LlmResult,
  MaterialityRequest,
  MaterialityResult,
  ExplanationEvidence,
  ExplanationSections,
  ReviewEvidence,
  ReviewSections,
} from "@/server/llm/types";

/**
 * Deterministic stub LLM client. Used in tests, in dry-run/demo mode when no
 * ANTHROPIC_API_KEY is set, and as the DI default for the integration test.
 * Produces plausible structured output with no network call. It counts its own
 * calls so tests can assert (e.g.) that the fast loop never invokes the LLM.
 */
export class StubLlmClient implements LlmClient {
  public materialityCalls = 0;
  public explanationCalls = 0;
  public reviewCalls = 0;

  constructor(
    private readonly opts: {
      /** Force a fixed materiality confidence (default: heuristic from summary). */
      materialityConfidence?: number;
    } = {}
  ) {}

  async assessMateriality(req: MaterialityRequest): Promise<LlmResult<MaterialityResult>> {
    this.materialityCalls++;
    // Cheap heuristic so the stub still discriminates: strong words => material.
    const text = `${req.headline} ${req.summary}`.toLowerCase();
    const strong = /(guidance|beat|raise|approval|acquisition|merger|record|surge|above|upgrade)/.test(
      text
    );
    const confidence =
      this.opts.materialityConfidence ?? (strong ? 0.85 : 0.45);
    return {
      data: {
        isMaterial: confidence >= 0.7,
        confidence,
        reasoning: strong
          ? "Headline describes a forward-looking, expectation-changing development."
          : "Headline appears routine; limited forward impact.",
        category: strong ? "GUIDANCE" : "OTHER",
      },
      usage: { model: "stub", latencyMs: 0 },
    };
  }

  async composeExplanation(ev: ExplanationEvidence): Promise<LlmResult<ExplanationSections>> {
    this.explanationCalls++;
    return {
      data: {
        evidenceChecklist: ev.checklist
          .filter((c) => c.passed)
          .map((c) => `${c.label}: ${c.detail}`),
        whyThisEntry: `The initial move in ${ev.symbol} was extended; entering on the controlled pullback into ${ev.levels.entryLow}-${ev.levels.entryHigh} establishes a closer invalidation at ${ev.levels.stop} and preserves a ${ev.levels.rewardRisk.toFixed(1)}:1 reward/risk.`,
        invalidation: ev.invalidationHints.length
          ? ev.invalidationHints
          : [`Loss of the stop at ${ev.levels.stop} on expanding volume.`],
        patternLesson: `A ${ev.setupName} qualifies only when catalyst, participation, relative strength, and structure align — not on any single factor.`,
        reflectionPrompts: [
          "Is the catalyst actually new?",
          "Is volume confirming real participation?",
          "Is the sector supporting the move?",
          "Where is the cleanest invalidation?",
          "Am I entering at confirmation or chasing?",
        ],
      },
      usage: { model: "stub", latencyMs: 0 },
    };
  }

  async composeReview(ev: ReviewEvidence): Promise<LlmResult<ReviewSections>> {
    this.reviewCalls++;
    const r = ev.realizedR;
    return {
      data: {
        whatHappened: `${ev.symbol} ${ev.direction} closed with realized ${r === null ? "unknown" : r.toFixed(2)}R across ${ev.exits.length} exit(s).`,
        thesisAssessment:
          ev.originalChecklist.every((c) => c.passed)
            ? "The original thesis was structurally sound at entry."
            : "The setup was armed with at least one weak criterion; revisit the gate.",
        executionAssessment: ev.followedPlan
          ? "Execution followed the planned entry and management."
          : "Execution deviated from the plan; note the discipline gap.",
        exitAssessment: `Exits: ${ev.exits.map((e) => `${e.portionPercent}% @ ${e.price} (${e.reason})`).join(", ") || "none recorded"}.`,
        patternLesson:
          "Outcome does not equal quality: a controlled loss on a valid setup is a good trade; a lucky win on a bad one is not.",
      },
      usage: { model: "stub", latencyMs: 0 },
    };
  }
}
