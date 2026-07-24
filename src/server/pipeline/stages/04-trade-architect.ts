import { PIPELINE_STAGES, SETUP_KEYS } from "@/server/config/constants";
import type { PipelineDeps, PipelineCandidate } from "@/server/pipeline/context";
import { reject, isActive } from "@/server/pipeline/context";
import type { TicketLevels } from "@/server/pipeline/types";
import { checkRewardRisk as checkRR1 } from "@/server/pipeline/setups/setup1-catalyst-continuation";
import { checkRewardRisk as checkRR2 } from "@/server/pipeline/setups/setup2-index-trend-pullback";

/**
 * Stage 4 — Trade Architect. Turns a qualified structure into concrete order
 * levels: entry band, trigger, structural stop, two targets, chase limit, runner
 * plan, and alert expiration. Reward/risk is computed from a STRUCTURAL stop and
 * a STRUCTURAL target (a measured move) — not derived as a fixed multiple of risk
 * — so the R:R check is a real gate, not a tautology.
 */
export async function runTradeArchitect(
  candidates: PipelineCandidate[],
  deps: PipelineDeps
): Promise<void> {
  const windowMin = Math.max(deps.config.minEntryWindowMinutes, 35);

  for (const c of candidates) {
    if (!isActive(c)) continue;

    const s = c.snapshot;
    const isFuture = c.assetClass === "INDEX_FUTURE";
    const tick = isFuture ? 0.25 : 0.01;
    const round = (x: number) => Math.round(x / tick) * tick;

    const long = c.direction === "LONG";
    const sign = long ? 1 : -1;
    const range = Math.max(s.sessionHigh - s.sessionLow, s.priorClose * 0.002);
    const entryRef = s.lastPrice;

    // Structural stop: beyond anchored VWAP and the session extreme, with a buffer.
    const structuralLevel = long
      ? Math.min(s.anchoredVwap, s.sessionLow)
      : Math.max(s.anchoredVwap, s.sessionHigh);
    const stopPrice = round(structuralLevel - sign * 0.1 * range);
    const perUnitRisk = Math.abs(entryRef - stopPrice);

    // Structural targets: measured moves off the impulse, independent of the stop.
    const measuredMove = Math.max((s.impulseMovePct / 100) * s.priorClose, 0.5 * range);
    const target1Price = round(entryRef + sign * 1.0 * measuredMove);
    const target2Price = round(entryRef + sign * 1.75 * measuredMove);

    const rewardRisk = perUnitRisk > 0 ? Math.abs(target1Price - entryRef) / perUnitRisk : 0;

    // Entry band around the confirmation/pullback zone + chase limit.
    const entryLow = round(long ? entryRef - 0.05 * range : entryRef - 0.1 * range);
    const entryHigh = round(long ? entryRef + 0.1 * range : entryRef + 0.05 * range);
    const maxEntryPrice = round(entryRef + sign * 0.2 * range);

    const alertExpiresAt = new Date(deps.asOf.getTime() + windowMin * 60_000);

    const levels: TicketLevels = {
      entryLow: Math.min(entryLow, entryHigh),
      entryHigh: Math.max(entryLow, entryHigh),
      triggerCondition: long
        ? `5-minute hold above ${round(entryRef).toFixed(2)}`
        : `5-minute hold below ${round(entryRef).toFixed(2)}`,
      stopPrice,
      target1Price,
      target2Price,
      maxEntryPrice,
      rewardRisk,
      runnerPlan:
        "Scale 70% at Target 1, trail the remaining 30% to breakeven, close the runner at Target 2 or session end.",
      alertExpiresAt,
    };
    c.levels = levels;

    // R:R gate (stage-tagged TRADE_ARCHITECT).
    const rrCheck =
      c.setupKey === SETUP_KEYS.CATALYST_CONTINUATION
        ? checkRR1({
            snapshot: s,
            market: c.market,
            thresholds: deps.thresholds.setup1,
            catalystAgeHours: c.catalystAgeHours,
            materialityConfidence: c.materialityConfidence,
            rewardRisk,
          })
        : checkRR2({
            snapshot: s,
            market: c.market,
            thresholds: deps.thresholds.setup2,
            economicReleaseInMinutes: c.economicReleaseInMinutes,
            rewardRisk,
          });
    c.checks.push(rrCheck);
    if (!rrCheck.passed) {
      reject(c, PIPELINE_STAGES.TRADE_ARCHITECT, rrCheck.detail);
      continue;
    }

    // Entry-window sanity: never ship a ticket with sub-tolerance reaction time.
    const windowActualMin = (alertExpiresAt.getTime() - deps.asOf.getTime()) / 60_000;
    if (windowActualMin < deps.config.minEntryWindowMinutes) {
      reject(
        c,
        PIPELINE_STAGES.TRADE_ARCHITECT,
        `Entry window ${windowActualMin.toFixed(0)}m below ${deps.config.minEntryWindowMinutes}m minimum`
      );
    }
  }
}
