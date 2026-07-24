import { PIPELINE_STAGES, SETUP_KEYS } from "@/server/config/constants";
import type { PipelineDeps, PipelineCandidate } from "@/server/pipeline/context";
import { reject, isActive } from "@/server/pipeline/context";

/**
 * Stage 6 — Chief Trader. Ranks the survivors with a DETERMINISTIC weighted score
 * over already-computed fields (never a fresh "ask the LLM to rank" call — that
 * would reintroduce the unconstrained-judgment / false-consensus failure mode),
 * then caps the day at the remaining ticket budget. It is the only stage that
 * marks a candidate ARMED. Survivors beyond the cap are rejected here so the
 * journal records they were real but didn't make the cut.
 */
export function runChiefTrader(candidates: PipelineCandidate[], deps: PipelineDeps): void {
  const survivors = candidates.filter((c) => isActive(c) && c.levels && c.sizing);

  const scored = survivors
    .map((c) => ({ c, score: rankScore(c) }))
    .sort((a, b) => b.score - a.score);

  const budget = Math.max(0, deps.config.maxDailyTickets - deps.risk.dailyTicketsUsed);

  scored.forEach((entry, idx) => {
    entry.c.rank = idx + 1;
    if (idx < budget) {
      entry.c.status = "ARMED";
    } else {
      reject(
        entry.c,
        PIPELINE_STAGES.CHIEF_TRADER,
        `Ranked #${idx + 1}; daily ticket budget (${budget} remaining of ${deps.config.maxDailyTickets}) already filled`
      );
    }
  });
}

/** Weighted score from computed evidence — no model call. */
function rankScore(c: PipelineCandidate): number {
  const rr = c.levels?.rewardRisk ?? 0;
  const materiality =
    c.setupKey === SETUP_KEYS.CATALYST_CONTINUATION ? c.materialityConfidence ?? 0 : 0;
  const flow = c.flowConfirmed ? 0.5 : 0;
  const trend = c.snapshot.trendStrength;
  const passedOptional = c.checks.filter((k) => !k.required && k.passed).length * 0.25;
  return rr * 1.0 + materiality * 2.0 + flow + trend + passedOptional;
}
