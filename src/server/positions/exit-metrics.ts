import type { Bar } from "@/server/market-data/types";
import { FUTURES_POINT_VALUE } from "@/server/config/constants";

/**
 * Pure computation of realized P&L, R multiple, and max favorable/adverse
 * excursion for a (possibly partial) exit. Shared by the Telegram `/exit`
 * handler and the `log-exit` CLI so both compute the same numbers.
 */

export interface ExitMetricsInput {
  symbol: string;
  assetClass: "EQUITY" | "INDEX_FUTURE";
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  exitPrice: number;
  positionSize: number; // shares or contracts (full position)
  portionPercent: number; // portion being closed by this exit, 0-100
  intradayBars?: Bar[]; // optional path for MFE/MAE
}

export interface ExitMetrics {
  realizedPnl: number;
  realizedR: number;
  maxFavorableExcursion: number | null;
  maxAdverseExcursion: number | null;
}

export function computeExitMetrics(i: ExitMetricsInput): ExitMetrics {
  const dirSign = i.direction === "LONG" ? 1 : -1;
  const perUnitRisk = Math.abs(i.entryPrice - i.stopPrice);
  const perUnitPnl = dirSign * (i.exitPrice - i.entryPrice);
  const rMultiple = perUnitRisk > 0 ? perUnitPnl / perUnitRisk : 0;

  const contracts = (i.positionSize * i.portionPercent) / 100;
  const dollarPerPoint =
    i.assetClass === "INDEX_FUTURE" ? FUTURES_POINT_VALUE[i.symbol] ?? 1 : 1;
  const realizedPnl = perUnitPnl * contracts * dollarPerPoint;

  let mfe: number | null = null;
  let mae: number | null = null;
  if (i.intradayBars && i.intradayBars.length > 0) {
    let bestFavorable = -Infinity;
    let worstAdverse = Infinity;
    for (const bar of i.intradayBars) {
      const favorable = dirSign === 1 ? bar.high : bar.low;
      const adverse = dirSign === 1 ? bar.low : bar.high;
      const favExcursion = dirSign * (favorable - i.entryPrice);
      const advExcursion = dirSign * (adverse - i.entryPrice);
      bestFavorable = Math.max(bestFavorable, favExcursion);
      worstAdverse = Math.min(worstAdverse, advExcursion);
    }
    // Express excursions in R for comparability.
    mfe = perUnitRisk > 0 ? bestFavorable / perUnitRisk : null;
    mae = perUnitRisk > 0 ? worstAdverse / perUnitRisk : null;
  }

  return {
    realizedPnl,
    realizedR: rMultiple,
    maxFavorableExcursion: mfe,
    maxAdverseExcursion: mae,
  };
}
