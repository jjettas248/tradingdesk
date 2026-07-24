import { PIPELINE_STAGES, SETUP_KEYS, PROMPT_VERSIONS } from "@/server/config/constants";
import type { PipelineDeps, PipelineCandidate } from "@/server/pipeline/context";
import { reject, isActive } from "@/server/pipeline/context";
import {
  checkFreshness,
  checkMateriality,
} from "@/server/pipeline/setups/setup1-catalyst-continuation";
import type { CheckResult } from "@/server/pipeline/types";

/**
 * Stage 2 — Catalyst/Flow. For Setup 1 only:
 *   - Freshness is DETERMINISTIC (catalyst timestamp vs. session).
 *   - Materiality is the ONE LLM call — and even it doesn't decide anything: it
 *     returns a scored judgment, and checkMateriality() applies the deterministic
 *     confidence threshold. There is exactly one materiality call per candidate,
 *     so there is no panel of agents to manufacture false consensus.
 *   - Money-flow is deterministic and only counts as evidence when price
 *     subsequently confirmed it — never money-flow alone.
 *
 * Setup 2 has no news/materiality step and passes through untouched.
 */
export async function runCatalystFlow(
  candidates: PipelineCandidate[],
  deps: PipelineDeps
): Promise<void> {
  for (const c of candidates) {
    if (!isActive(c)) continue;
    if (c.setupKey !== SETUP_KEYS.CATALYST_CONTINUATION) continue;

    // 1. Freshest catalyst.
    const lookbackHours = deps.thresholds.setup1.maxCatalystAgeHours * 3;
    const news = await deps.provider.getRecentNews(c.symbol, lookbackHours);
    const freshest = news.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0];
    if (freshest) {
      c.catalystHeadline = freshest.headline;
      c.catalystSummary = freshest.summary;
      c.catalystPublishedAt = freshest.publishedAt;
      c.catalystAgeHours = (deps.asOf.getTime() - freshest.publishedAt.getTime()) / 3600_000;
    }

    const freshnessInputs = {
      snapshot: c.snapshot,
      market: c.market,
      thresholds: deps.thresholds.setup1,
      catalystAgeHours: c.catalystAgeHours,
      materialityConfidence: null,
      rewardRisk: null,
    };
    const fresh = checkFreshness(freshnessInputs);
    c.checks.push(fresh);
    if (!fresh.passed) {
      reject(c, PIPELINE_STAGES.CATALYST_FLOW, fresh.detail);
      continue;
    }

    // 2. Materiality — the single LLM judgment. Only reached once freshness passed.
    const sessionContext = `${c.direction} setup; gapped ${c.snapshot.gapPercent.toFixed(1)}% on ${c.snapshot.relativeVolume.toFixed(1)}x relative volume`;
    const res = await deps.llm.assessMateriality({
      symbol: c.symbol,
      headline: c.catalystHeadline ?? "",
      summary: c.catalystSummary ?? "",
      sourceTimestamp: (c.catalystPublishedAt ?? deps.asOf).toISOString(),
      sessionContext,
    });
    c.materialityConfidence = res.data.confidence;
    c.materialityReasoning = res.data.reasoning;
    deps.onLlmCall?.({
      purpose: "CATALYST_MATERIALITY",
      relatedSymbol: c.symbol,
      model: res.usage.model,
      promptVersion: PROMPT_VERSIONS.CATALYST_MATERIALITY,
      request: { headline: c.catalystHeadline, summary: c.catalystSummary },
      response: res.data,
      latencyMs: res.usage.latencyMs,
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
    });

    const material = checkMateriality({ ...freshnessInputs, materialityConfidence: c.materialityConfidence });
    c.checks.push(material);
    if (!material.passed) {
      reject(c, PIPELINE_STAGES.CATALYST_FLOW, material.detail);
      continue;
    }

    // 3. Money-flow confirmation (deterministic, informational). A flow signal
    //    only counts if price has since moved in the flow's direction.
    const flows = await deps.provider.getFlowSignals(c.symbol, lookbackHours);
    const confirmed = flows.filter((f) => {
      if (f.direction !== c.direction) return false;
      const priceNow = c.snapshot.lastPrice;
      return c.direction === "LONG"
        ? priceNow > f.referencePrice
        : priceNow < f.referencePrice;
    });
    c.flowConfirmed = confirmed.length > 0;
    const flowCheck: CheckResult = {
      key: "flow_confirmation",
      label: "Money-flow confirmed by subsequent price",
      stage: PIPELINE_STAGES.CATALYST_FLOW,
      passed: c.flowConfirmed,
      required: false, // supporting evidence, never sufficient on its own
      value: confirmed.length,
      detail: c.flowConfirmed
        ? `${confirmed.length} flow signal(s) confirmed by price direction`
        : "No confirmed money-flow (informational)",
    };
    c.checks.push(flowCheck);
  }
}
