import { PIPELINE_STAGES, FUTURES_POINT_VALUE } from "@/server/config/constants";
import type {
  PipelineDeps,
  PipelineCandidate,
  CommittedPosition,
} from "@/server/pipeline/context";
import { reject, isActive } from "@/server/pipeline/context";
import { computeRiskFraction } from "@/server/risk/kelly";
import { averageCorrelation } from "@/server/risk/correlation";
import { applyHeatCap } from "@/server/risk/portfolio-heat";
import { evaluateDrawdown, type DrawdownState } from "@/server/risk/drawdown-throttle";
import type { SizingResult } from "@/server/pipeline/types";
import { UNIVERSE_BY_SYMBOL } from "@/server/market-data/universe";

export interface RiskManagerOutcome {
  drawdown: DrawdownState;
  haltTriggered: boolean;
}

/**
 * Stage 5 — Risk Manager. Deterministic sizing:
 *   fractional-Kelly (conservative, shrunk) -> correlation adjust (vs. open
 *   positions AND the day's already-sized candidates) -> drawdown throttle ->
 *   hard cap -> portfolio-heat cap -> convert to whole shares/contracts.
 *
 * If the drawdown throttle says halt (-15%), or a halt is already active, every
 * remaining candidate is rejected here and haltTriggered is surfaced so the
 * orchestrator can persist a RiskHaltState.
 */
export async function runRiskManager(
  candidates: PipelineCandidate[],
  deps: PipelineDeps
): Promise<RiskManagerOutcome> {
  const drawdown = evaluateDrawdown(deps.risk.equitySeries);
  const haltTriggered = drawdown.shouldHalt;
  const halted = deps.risk.haltActive || haltTriggered;

  // Running list of everything committed today: pre-existing + newly sized.
  const committed: CommittedPosition[] = [...deps.risk.committedPositions];

  for (const c of candidates) {
    if (!isActive(c) || !c.levels) continue;

    if (halted) {
      reject(
        c,
        PIPELINE_STAGES.RISK_MANAGER,
        halted && haltTriggered
          ? `Risk halt: drawdown ${drawdown.drawdownPercent.toFixed(1)}% at/beyond -15%`
          : "Risk halt active — human resolution required"
      );
      continue;
    }

    const edge = deps.risk.edgeBySetup[c.setupKey] ?? { winProb: 0.45, rewardRisk: c.levels.rewardRisk };
    const sampleSize = deps.risk.sampleSizeBySetup[c.setupKey] ?? 0;

    const others = committed;
    const correlation = averageCorrelation(
      {
        symbol: c.symbol,
        direction: c.direction,
        sectorEtf: c.snapshot.sectorEtf,
        assetClass: c.assetClass,
      },
      others
    );

    const risk = computeRiskFraction({
      winProb: edge.winProb,
      rewardRisk: edge.rewardRisk,
      sampleSize,
      lambda: deps.config.lambda,
      correlatedCount: others.length + 1,
      correlation,
      hardCapPct: deps.config.hardCapPct,
      drawdownMultiplier: drawdown.multiplier,
    });

    const notes: string[] = [];
    if (sampleSize === 0) notes.push("No live sample yet — using seeded prior with full shrinkage.");
    if (correlation > 0) notes.push(`Correlation-adjusted (avg ρ=${correlation.toFixed(2)}, n=${others.length + 1}).`);
    if (drawdown.multiplier < 1) notes.push(`Drawdown throttle ×${drawdown.multiplier} (${drawdown.tierLabel}).`);

    // Portfolio-heat cap across all committed risk fractions.
    const heat = applyHeatCap({
      existingFractions: committed.map((p) => p.riskFraction),
      proposedFraction: risk.fraction,
      maxTotalHeat: deps.config.maxTotalHeat,
    });
    if (heat.rejected) {
      reject(c, PIPELINE_STAGES.RISK_MANAGER, "Portfolio heat cap reached — no risk headroom left");
      continue;
    }
    if (heat.capped) notes.push("Reduced to fit portfolio heat cap.");

    const allowedFraction = heat.allowedFraction;
    const riskDollars = allowedFraction * deps.risk.currentEquity;

    // Convert to whole shares (equity) or contracts (futures).
    const perUnitRiskPrice = Math.abs(c.snapshot.lastPrice - c.levels.stopPrice);
    let positionSize = 0;
    let maxDollarLoss = 0;
    let sizeUnit: SizingResult["sizeUnit"];

    if (c.assetClass === "INDEX_FUTURE") {
      sizeUnit = "CONTRACTS";
      const pointValue = FUTURES_POINT_VALUE[c.symbol] ?? 1;
      const dollarRiskPerContract = perUnitRiskPrice * pointValue;
      positionSize = dollarRiskPerContract > 0 ? Math.floor(riskDollars / dollarRiskPerContract) : 0;
      maxDollarLoss = positionSize * dollarRiskPerContract;
    } else {
      sizeUnit = "SHARES";
      positionSize = perUnitRiskPrice > 0 ? Math.floor(riskDollars / perUnitRiskPrice) : 0;
      maxDollarLoss = positionSize * perUnitRiskPrice;
    }

    if (positionSize < 1) {
      reject(
        c,
        PIPELINE_STAGES.RISK_MANAGER,
        `Risk budget $${riskDollars.toFixed(0)} too small for even one ${sizeUnit === "CONTRACTS" ? "contract" : "share"} at $${perUnitRiskPrice.toFixed(2)}/unit risk`
      );
      continue;
    }

    const actualFraction = maxDollarLoss / deps.risk.currentEquity;
    c.sizing = {
      positionSize,
      sizeUnit,
      maxDollarLoss,
      riskFraction: actualFraction,
      perShareRisk: perUnitRiskPrice,
      notes,
    };

    committed.push({
      symbol: c.symbol,
      direction: c.direction,
      sectorEtf: c.snapshot.sectorEtf,
      assetClass: c.assetClass,
      riskFraction: actualFraction,
    });
  }

  return { drawdown, haltTriggered };
}
