/**
 * The market-data abstraction. v1 ships a MockProvider; a future AlpacaProvider
 * is a drop-in swap. Everything the pipeline needs about a symbol on a given day
 * comes through this interface — the pipeline never touches a provider SDK
 * directly.
 *
 * Design intent: the shapes here are deliberately "computed features" (relative
 * volume, gap %, VWAP, breadth) rather than raw tick data, because the
 * deterministic setup checks operate on features. A real provider implementation
 * is responsible for computing these from whatever raw data it has.
 */

export type AssetClass = "EQUITY" | "INDEX_FUTURE";
export type Direction = "LONG" | "SHORT";

/** One OHLCV bar. Prices are in dollars (equities) or index points (futures). */
export interface Bar {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A news item for a symbol. `materiality` is NOT set here — that's the LLM's job. */
export interface NewsItem {
  symbol: string;
  headline: string;
  summary: string;
  publishedAt: Date;
  source: string;
}

/**
 * A money-flow observation (unusual options activity, block prints, etc.). This
 * is deliberately ambiguous on its own — the pipeline requires subsequent price
 * confirmation before treating it as evidence, per the design.
 */
export interface FlowSignal {
  symbol: string;
  observedAt: Date;
  direction: Direction; // implied directional lean of the flow
  notional: number; // dollar size of the flow
  kind: "OPTIONS_SWEEP" | "BLOCK_TRADE" | "UNUSUAL_VOLUME";
  /**
   * Price at the moment the flow was observed, so a later poll can check whether
   * price actually confirmed the flow's directional lean.
   */
  referencePrice: number;
}

/**
 * The per-symbol snapshot the Scanner and Quant stages screen against. All the
 * derived structural features live here.
 */
export interface SymbolSnapshot {
  symbol: string;
  assetClass: AssetClass;
  sectorEtf: string | null; // null for indices/futures
  asOf: Date;

  // Price + gap
  priorClose: number;
  openPrice: number;
  lastPrice: number;
  sessionHigh: number;
  sessionLow: number;
  gapPercent: number; // (open - priorClose) / priorClose * 100
  changePercent: number; // (last - priorClose) / priorClose * 100

  // Volume / participation
  relativeVolume: number; // today's volume vs. its own average (1.0 = normal)

  // Structure
  anchoredVwap: number; // VWAP anchored to session open (or catalyst)
  distanceToVwapPct: number; // (last - vwap) / vwap * 100
  reclaimedVwap: boolean; // price is holding above (long) / below (short) VWAP
  firstPullbackDepthPct: number; // how deep the first pullback retraced the impulse (%)
  impulseMovePct: number; // size of the initial directional impulse (%)
  trendStrength: number; // 0-1 directional strength of the opening structure

  intradayBars: Bar[]; // fine-grained path, used for MFE/MAE after the fact
}

/** Market-wide + sector context for confirmation checks. */
export interface MarketContext {
  asOf: Date;
  spyChangePercent: number;
  breadthRatio: number; // fraction of the universe advancing (0-1)
  sectorChangePercent: Record<string, number>; // keyed by sector ETF symbol
  /**
   * Related-market agreement for index futures, e.g. do SPY/QQQ/IWM agree on
   * direction. 0-1 fraction confirming.
   */
  relatedMarketAgreement: number;
}

/** A discrete market event for the continuous fast loop's incremental ingestion. */
export interface MarketEventRecord {
  symbol: string;
  eventType: "NEWS" | "FLOW" | "PRICE";
  occurredAt: Date;
  headline?: string;
  summary?: string;
  payload: Record<string, unknown>;
}

export interface MarketDataProvider {
  readonly name: string;

  /** The tradable universe this provider knows about. */
  getUniverse(): Promise<SymbolSnapshot[]>;

  /** Snapshot for a single symbol (null if not in the universe). */
  getSnapshot(symbol: string, asOf?: Date): Promise<SymbolSnapshot | null>;

  /** Market-wide + per-sector context. */
  getMarketContext(asOf?: Date): Promise<MarketContext>;

  /** Recent news for a symbol (materiality is decided downstream, not here). */
  getRecentNews(symbol: string, sinceHours: number): Promise<NewsItem[]>;

  /** Recent money-flow signals for a symbol. */
  getFlowSignals(symbol: string, sinceHours: number): Promise<FlowSignal[]>;

  /**
   * Current price for a symbol, used by the fast loop to check open positions
   * and confirm earlier flow signals.
   */
  getCurrentPrice(symbol: string, asOf?: Date): Promise<number | null>;

  /**
   * Incremental events since a cursor — the fast loop calls this every poll so it
   * only pulls what's new. Returns events strictly after `since`.
   */
  getEventsSince(symbol: string, since: Date, asOf?: Date): Promise<MarketEventRecord[]>;
}

/** Economic-calendar is a SEPARATE interface — a real source for it won't be the
 * same vendor as market data (e.g. Alpaca has no economic calendar). Splitting it
 * now avoids a painful refactor later. */
export interface EconomicRelease {
  name: string;
  scheduledAt: Date;
  importance: "LOW" | "MEDIUM" | "HIGH";
}

export interface EconomicCalendarProvider {
  readonly name: string;
  /** High-importance releases within the given window around `asOf`. */
  getUpcomingReleases(withinMinutes: number, asOf?: Date): Promise<EconomicRelease[]>;
}
