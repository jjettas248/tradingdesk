import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/server/config/env";
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
import {
  MaterialityZ,
  ExplanationZ,
  ReviewZ,
  MATERIALITY_JSON_SCHEMA,
  EXPLANATION_JSON_SCHEMA,
  REVIEW_JSON_SCHEMA,
} from "@/server/llm/schemas";
import type { z } from "zod";

/**
 * Real Anthropic-backed LLM client. Uses the Messages API with
 * output_config.format (JSON-schema structured output) so responses are
 * guaranteed to parse into the expected shape, then validates with Zod.
 *
 * Two — and only two — kinds of call live here:
 *   1. assessMateriality: a scored classification (never a bare pass/fail).
 *   2. composeExplanation / composeReview: prose FROM already-computed evidence.
 *
 * SDK v0.68 exposes neither messages.parse() nor the zod output helper, so we
 * call messages.create() and pass output_config through (cast), extract the text
 * block, JSON.parse, and Zod-validate.
 */
export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly materialityModel: string;
  private readonly proseModel: string;

  constructor() {
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("AnthropicLlmClient requires ANTHROPIC_API_KEY");
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.materialityModel = env.ANTHROPIC_MODEL_MATERIALITY;
    this.proseModel = env.ANTHROPIC_MODEL_PROSE;
  }

  async assessMateriality(req: MaterialityRequest): Promise<LlmResult<MaterialityResult>> {
    const system =
      "You are the Catalyst analyst on a disciplined trading desk. You assess whether a news item is MATERIAL — significant enough to change forward price expectations — NOT whether the trade is good. Judge the content only. Output a scored judgment; a downstream deterministic gate decides pass/fail from your confidence, so calibrate confidence honestly. Material examples: earnings beat-and-raise, FDA approval, M&A, major guidance change. Immaterial: routine analyst tweaks, vague sentiment, reiterated ratings.";
    const user = `Symbol: ${req.symbol}\nHeadline: ${req.headline}\nSummary: ${req.summary}\nPublished: ${req.sourceTimestamp}\nSession context: ${req.sessionContext}\n\nAssess materiality.`;

    const { data, usage } = await this.call(
      this.materialityModel,
      512,
      system,
      user,
      MATERIALITY_JSON_SCHEMA,
      MaterialityZ
    );
    return { data: data as MaterialityResult, usage };
  }

  async composeExplanation(ev: ExplanationEvidence): Promise<LlmResult<ExplanationSections>> {
    const system =
      "You are the Review Coach on a trading desk. Write a concise, teaching 'why this trade qualified' explanation FROM the structured evidence provided. NEVER reference price outcomes — you are writing before the trade is even entered. Base every statement only on the evidence given. Be specific and instructive, not verbose.";
    const user = `Compose the explanation for this armed ticket.\n\n${JSON.stringify(ev, null, 2)}\n\nProduce: evidenceChecklist (what the desk recognized, one line each), whyThisEntry (why wait for the pullback / this entry), invalidation (conditions that would disprove the thesis), patternLesson (one durable lesson), reflectionPrompts (questions the trader should ask themselves before reading the desk's reasoning).`;

    const { data, usage } = await this.call(
      this.proseModel,
      2048,
      system,
      user,
      EXPLANATION_JSON_SCHEMA,
      ExplanationZ
    );
    return { data: data as ExplanationSections, usage };
  }

  async composeReview(ev: ReviewEvidence): Promise<LlmResult<ReviewSections>> {
    const system =
      "You are the Review Coach. The trade has closed. Write an honest post-trade review FROM the structured evidence. Profit does not automatically mean a good trade, and a controlled loss does not automatically mean a bad one — judge thesis and execution separately from outcome. Be concise and instructive.";
    const user = `Compose the post-trade review.\n\n${JSON.stringify(ev, null, 2)}\n\nProduce: whatHappened, thesisAssessment (was the original thesis right?), executionAssessment (did execution follow the plan?), exitAssessment (did the exit match the plan? MFE/MAE context), patternLesson (one chart-recognition lesson).`;

    const { data, usage } = await this.call(
      this.proseModel,
      2048,
      system,
      user,
      REVIEW_JSON_SCHEMA,
      ReviewZ
    );
    return { data: data as ReviewSections, usage };
  }

  /** Shared call path: structured output + Zod validation + usage/latency. */
  private async call<T>(
    model: string,
    maxTokens: number,
    system: string,
    user: string,
    jsonSchema: object,
    validator: z.ZodType<T>
  ): Promise<{ data: T; usage: { model: string; inputTokens?: number; outputTokens?: number; latencyMs: number } }> {
    const start = Date.now();
    // output_config is not in the v0.68 param types; pass it through via cast.
    const params = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema: jsonSchema } },
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;

    const response = await this.client.messages.create(params);
    const latencyMs = Date.now() - start;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`LLM returned non-JSON output for model ${model}: ${text.slice(0, 200)}`);
    }
    const data = validator.parse(parsed);

    return {
      data,
      usage: {
        model: response.model ?? model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        latencyMs,
      },
    };
  }
}
