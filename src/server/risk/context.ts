import { prisma } from "@/server/db/client";
import { getEnv } from "@/server/config/env";
import {
  SEEDED_EDGE_PRIORS,
  EMPIRICAL_EDGE_MIN_SAMPLE,
  PRIOR_PSEUDO_COUNT,
  MAX_PORTFOLIO_HEAT,
  FUTURES_POINT_VALUE,
  SETUP_KEYS,
} from "@/server/config/constants";
import { UNIVERSE_BY_SYMBOL } from "@/server/market-data/universe";
import type { RiskContext, PipelineConfig, CommittedPosition } from "@/server/pipeline/context";
import { etDateKey } from "@/lib/time";

/**
 * Assemble the RiskContext the pipeline's Risk Manager needs, entirely from
 * persisted account state: equity curve, open positions (for correlation + heat),
 * today's ticket/entry counts, halt state, and per-setup edge priors blended with
 * empirical stats once enough trades have closed.
 */
export async function buildRiskContext(asOf: Date = new Date()): Promise<RiskContext> {
  const env = getEnv();

  const equitySnaps = await prisma.equitySnapshot.findMany({ orderBy: { asOf: "asc" } });
  const equitySeries = equitySnaps.map((e) => e.equityValue);
  const currentEquity = equitySeries.length ? equitySeries[equitySeries.length - 1] : env.STARTING_EQUITY;

  const openPositions = await prisma.position.findMany({ where: { status: "OPEN" } });
  const committedPositions: CommittedPosition[] = openPositions.map((p) => {
    const perUnitRisk = Math.abs((p.actualEntryPrice ?? p.plannedEntryLow) - p.stopPrice);
    const pointValue = p.assetClass === "INDEX_FUTURE" ? FUTURES_POINT_VALUE[p.symbol] ?? 1 : 1;
    const dollarRisk = perUnitRisk * p.positionSize * pointValue;
    return {
      symbol: p.symbol,
      direction: p.direction as "LONG" | "SHORT",
      sectorEtf: UNIVERSE_BY_SYMBOL.get(p.symbol)?.sectorEtf ?? null,
      assetClass: p.assetClass,
      riskFraction: currentEquity > 0 ? dollarRisk / currentEquity : 0,
    };
  });

  const dateKey = etDateKey(asOf);
  const day = await prisma.tradingDay.findUnique({ where: { dateKey } });

  const halt = await prisma.riskHaltState.findFirst({ where: { active: true } });

  const { edgeBySetup, sampleSizeBySetup } = await computeEdges();

  return {
    currentEquity,
    equitySeries,
    committedPositions,
    dailyTicketsUsed: day?.ticketsArmed ?? 0,
    dailyEntriesUsed: day?.entriesLogged ?? 0,
    haltActive: !!halt,
    sampleSizeBySetup,
    edgeBySetup,
  };
}

/** Per-setup edge: empirical once >= EMPIRICAL_EDGE_MIN_SAMPLE closed trades, else seeded prior. */
async function computeEdges(): Promise<{
  edgeBySetup: Record<string, { winProb: number; rewardRisk: number }>;
  sampleSizeBySetup: Record<string, number>;
}> {
  const edgeBySetup: Record<string, { winProb: number; rewardRisk: number }> = {};
  const sampleSizeBySetup: Record<string, number> = {};

  for (const setupKey of Object.values(SETUP_KEYS)) {
    const closed = await prisma.position.findMany({
      where: { setupKey, status: "CLOSED" },
      include: { exits: true },
    });
    // Aggregate realized R per position (sum across partial exits).
    const rMultiples = closed
      .map((p) => p.exits.reduce((sum, e) => sum + (e.realizedR ?? 0) * (e.portionPercent / 100), 0))
      .filter((r) => Number.isFinite(r));

    if (rMultiples.length >= EMPIRICAL_EDGE_MIN_SAMPLE) {
      const wins = rMultiples.filter((r) => r > 0);
      const losses = rMultiples.filter((r) => r <= 0);
      const winProb = wins.length / rMultiples.length;
      const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
      const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 1;
      const rewardRisk = avgLoss > 0 ? avgWin / avgLoss : SEEDED_EDGE_PRIORS[setupKey].rewardRisk;
      edgeBySetup[setupKey] = { winProb, rewardRisk: Math.max(0.5, rewardRisk) };
      // Confidence grows with real trades once past the empirical threshold.
      sampleSizeBySetup[setupKey] = rMultiples.length;
    } else {
      // Cold start / thin sample: use the conservative seeded prior, credited
      // with a pseudo-count so Kelly doesn't shrink the position to zero.
      edgeBySetup[setupKey] = SEEDED_EDGE_PRIORS[setupKey];
      sampleSizeBySetup[setupKey] = PRIOR_PSEUDO_COUNT + rMultiples.length;
    }
  }
  return { edgeBySetup, sampleSizeBySetup };
}

/** Pipeline config assembled from env + constants. */
export function buildPipelineConfig(): PipelineConfig {
  const env = getEnv();
  return {
    lambda: env.KELLY_LAMBDA,
    hardCapPct: env.KELLY_HARD_CAP_PCT,
    maxDailyTickets: env.MAX_DAILY_TICKETS,
    maxDailyEntries: env.MAX_DAILY_ENTRIES,
    minEntryWindowMinutes: env.MIN_ENTRY_WINDOW_MINUTES,
    maxTotalHeat: MAX_PORTFOLIO_HEAT,
  };
}
