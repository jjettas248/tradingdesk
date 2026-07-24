import { CORRELATION_BUCKETS } from "@/server/config/constants";
import { UNIVERSE_BY_SYMBOL } from "@/server/market-data/universe";
import type { Direction } from "@/server/market-data/types";

/**
 * v1 heuristic correlation estimate. There is no real return-covariance data yet
 * (no trade history, and mock data can't manufacture meaningful covariance), so
 * this uses a static bucket table keyed on sector / instrument / direction. Its
 * whole job is to stop the Risk Manager from disguising one oversized directional
 * bet as N "independent" tickets. Flagged as tunable; replace with computed
 * statistics once enough closed trades exist.
 */

export interface PositionLike {
  symbol: string;
  direction: Direction;
  sectorEtf?: string | null;
  assetClass?: string;
}

/** Pairwise correlation estimate between two positions. */
export function pairwiseCorrelation(a: PositionLike, b: PositionLike): number {
  if (a.symbol === b.symbol) return 1;

  const ua = UNIVERSE_BY_SYMBOL.get(a.symbol);
  const ub = UNIVERSE_BY_SYMBOL.get(b.symbol);
  const sectorA = a.sectorEtf ?? ua?.sectorEtf ?? null;
  const sectorB = b.sectorEtf ?? ub?.sectorEtf ?? null;
  const classA = a.assetClass ?? ua?.assetClass;
  const classB = b.assetClass ?? ub?.assetClass;

  const sameDirection = a.direction === b.direction;
  const dirSign = sameDirection ? 1 : -1;

  // Two index futures the same day (MES + MNQ) move almost together.
  if (classA === "INDEX_FUTURE" && classB === "INDEX_FUTURE") {
    return dirSign * CORRELATION_BUCKETS.SAME_INSTRUMENT;
  }

  // Same sector.
  if (sectorA && sectorB && sectorA === sectorB) {
    return dirSign * CORRELATION_BUCKETS.SAME_SECTOR;
  }

  // A single-name equity vs. index futures, or cross-sector equities: broad-market
  // beta linkage.
  if (classA === "INDEX_FUTURE" || classB === "INDEX_FUTURE") {
    return dirSign * CORRELATION_BUCKETS.CROSS_SECTOR_SAME_DIR;
  }
  if (sectorA && sectorB && sectorA !== sectorB) {
    return dirSign * CORRELATION_BUCKETS.CROSS_SECTOR_SAME_DIR;
  }

  return dirSign * CORRELATION_BUCKETS.UNRELATED;
}

/**
 * Average pairwise correlation of `candidate` against a set of `others`
 * (existing open positions + the day's other armed candidates). Returns 0 when
 * there are no others. Negative correlations are floored at 0 for sizing purposes
 * — we never *increase* size on a claimed hedge in v1 (conservative).
 */
export function averageCorrelation(candidate: PositionLike, others: PositionLike[]): number {
  if (others.length === 0) return 0;
  const sum = others.reduce(
    (acc, o) => acc + Math.max(0, pairwiseCorrelation(candidate, o)),
    0
  );
  return sum / others.length;
}
