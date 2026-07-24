import type { PipelineDeps, PipelineCandidate } from "@/server/pipeline/context";
import type { CandidateEvidence } from "@/server/pipeline/types";
import { runScanner } from "@/server/pipeline/stages/01-scanner";
import { runCatalystFlow } from "@/server/pipeline/stages/02-catalyst-flow";
import { runQuant } from "@/server/pipeline/stages/03-quant";
import { runTradeArchitect } from "@/server/pipeline/stages/04-trade-architect";
import { runRiskManager, type RiskManagerOutcome } from "@/server/pipeline/stages/05-risk-manager";
import { runChiefTrader } from "@/server/pipeline/stages/06-chief-trader";

export interface PipelineResult {
  candidates: PipelineCandidate[];
  armed: PipelineCandidate[];
  risk: RiskManagerOutcome;
}

/**
 * The full six-stage morning pipeline, run against injected dependencies. Pure
 * with respect to persistence — it reads market/LLM/risk inputs and returns
 * evaluated candidates. The caller (CLI morning-scan) is responsible for writing
 * results to the database. This separation is what makes the integration test
 * able to run the whole pipeline with a stub LLM and no DB.
 */
export async function runMorningPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  const candidates = await runScanner(deps);
  await runCatalystFlow(candidates, deps);
  await runQuant(candidates, deps);
  await runTradeArchitect(candidates, deps);
  const risk = await runRiskManager(candidates, deps);
  runChiefTrader(candidates, deps);

  const armed = candidates.filter((c) => c.status === "ARMED");
  return { candidates, armed, risk };
}

/** Summarize a working candidate's scratch data into the persisted evidence shape. */
export function toEvidence(c: PipelineCandidate): CandidateEvidence {
  return {
    symbol: c.symbol,
    setupKey: c.setupKey,
    assetClass: c.assetClass,
    direction: c.direction,
    checks: c.checks,
    context: {
      gapPercent: round2(c.snapshot.gapPercent),
      changePercent: round2(c.snapshot.changePercent),
      relativeVolume: round2(c.snapshot.relativeVolume),
      anchoredVwap: round2(c.snapshot.anchoredVwap),
      distanceToVwapPct: round2(c.snapshot.distanceToVwapPct),
      firstPullbackDepthPct: round2(c.snapshot.firstPullbackDepthPct),
      trendStrength: round2(c.snapshot.trendStrength),
      catalystHeadline: c.catalystHeadline,
      catalystAgeHours: c.catalystAgeHours === null ? null : round2(c.catalystAgeHours),
      materialityConfidence: c.materialityConfidence,
      materialityReasoning: c.materialityReasoning,
      flowConfirmed: c.flowConfirmed,
      economicReleaseInMinutes: c.economicReleaseInMinutes,
      rewardRisk: c.levels ? round2(c.levels.rewardRisk) : null,
      rank: c.rank ?? null,
      sizingNotes: c.sizing ? c.sizing.notes.join(" ") : null,
    },
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
