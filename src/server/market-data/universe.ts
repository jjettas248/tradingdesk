import type { AssetClass } from "@/server/market-data/types";

/**
 * The fixed mock universe. Chosen so that sector/breadth/related-market checks
 * are actually meaningful: every equity maps to a sector ETF, and the mock
 * generator drives returns from a market factor -> sector factor -> symbol, so
 * "sector confirmation" reflects real (simulated) structure rather than noise.
 */
export interface UniverseSymbol {
  symbol: string;
  assetClass: AssetClass;
  sectorEtf: string | null; // the symbol's own sector ETF; null for indices/futures
  /** Rough baseline price, so mock prices look plausible per symbol. */
  basePrice: number;
  /** Per-name idiosyncratic volatility multiplier. */
  vol: number;
}

// Sector ETFs (these ARE their own sector).
const SECTOR_ETFS = ["XLK", "XLC", "XLY", "XLF", "XLV", "XLE", "XLI"];

// Broad index ETFs — used for breadth/related-market context, tradable=false-ish
// (the pipeline only arms equities + MES/MNQ, but these inform context).
const INDEX_ETFS = ["SPY", "QQQ", "IWM", "DIA"];

export const UNIVERSE: UniverseSymbol[] = [
  // Index / broad ETFs
  { symbol: "SPY", assetClass: "EQUITY", sectorEtf: null, basePrice: 545, vol: 0.6 },
  { symbol: "QQQ", assetClass: "EQUITY", sectorEtf: null, basePrice: 470, vol: 0.8 },
  { symbol: "IWM", assetClass: "EQUITY", sectorEtf: null, basePrice: 220, vol: 0.9 },
  { symbol: "DIA", assetClass: "EQUITY", sectorEtf: null, basePrice: 410, vol: 0.5 },

  // Sector ETFs
  { symbol: "XLK", assetClass: "EQUITY", sectorEtf: "XLK", basePrice: 235, vol: 0.9 },
  { symbol: "XLC", assetClass: "EQUITY", sectorEtf: "XLC", basePrice: 105, vol: 0.9 },
  { symbol: "XLY", assetClass: "EQUITY", sectorEtf: "XLY", basePrice: 195, vol: 1.0 },
  { symbol: "XLF", assetClass: "EQUITY", sectorEtf: "XLF", basePrice: 46, vol: 0.7 },
  { symbol: "XLV", assetClass: "EQUITY", sectorEtf: "XLV", basePrice: 150, vol: 0.6 },
  { symbol: "XLE", assetClass: "EQUITY", sectorEtf: "XLE", basePrice: 92, vol: 1.1 },
  { symbol: "XLI", assetClass: "EQUITY", sectorEtf: "XLI", basePrice: 138, vol: 0.7 },

  // Technology (XLK)
  { symbol: "AAPL", assetClass: "EQUITY", sectorEtf: "XLK", basePrice: 228, vol: 1.0 },
  { symbol: "MSFT", assetClass: "EQUITY", sectorEtf: "XLK", basePrice: 430, vol: 1.0 },
  { symbol: "NVDA", assetClass: "EQUITY", sectorEtf: "XLK", basePrice: 184, vol: 1.8 },
  { symbol: "AMD", assetClass: "EQUITY", sectorEtf: "XLK", basePrice: 165, vol: 1.9 },
  { symbol: "AVGO", assetClass: "EQUITY", sectorEtf: "XLK", basePrice: 175, vol: 1.5 },
  { symbol: "CRM", assetClass: "EQUITY", sectorEtf: "XLK", basePrice: 265, vol: 1.3 },

  // Communication Services (XLC)
  { symbol: "META", assetClass: "EQUITY", sectorEtf: "XLC", basePrice: 720, vol: 1.5 },
  { symbol: "GOOGL", assetClass: "EQUITY", sectorEtf: "XLC", basePrice: 195, vol: 1.2 },
  { symbol: "NFLX", assetClass: "EQUITY", sectorEtf: "XLC", basePrice: 1180, vol: 1.6 },
  { symbol: "DIS", assetClass: "EQUITY", sectorEtf: "XLC", basePrice: 115, vol: 1.1 },

  // Consumer Discretionary (XLY)
  { symbol: "AMZN", assetClass: "EQUITY", sectorEtf: "XLY", basePrice: 225, vol: 1.3 },
  { symbol: "TSLA", assetClass: "EQUITY", sectorEtf: "XLY", basePrice: 340, vol: 2.2 },
  { symbol: "HD", assetClass: "EQUITY", sectorEtf: "XLY", basePrice: 415, vol: 0.9 },
  { symbol: "NKE", assetClass: "EQUITY", sectorEtf: "XLY", basePrice: 78, vol: 1.1 },

  // Financials (XLF)
  { symbol: "JPM", assetClass: "EQUITY", sectorEtf: "XLF", basePrice: 285, vol: 0.9 },
  { symbol: "BAC", assetClass: "EQUITY", sectorEtf: "XLF", basePrice: 46, vol: 1.0 },
  { symbol: "GS", assetClass: "EQUITY", sectorEtf: "XLF", basePrice: 620, vol: 1.1 },
  { symbol: "MS", assetClass: "EQUITY", sectorEtf: "XLF", basePrice: 135, vol: 1.0 },

  // Health Care (XLV)
  { symbol: "UNH", assetClass: "EQUITY", sectorEtf: "XLV", basePrice: 305, vol: 1.2 },
  { symbol: "LLY", assetClass: "EQUITY", sectorEtf: "XLV", basePrice: 790, vol: 1.3 },
  { symbol: "JNJ", assetClass: "EQUITY", sectorEtf: "XLV", basePrice: 165, vol: 0.6 },
  { symbol: "PFE", assetClass: "EQUITY", sectorEtf: "XLV", basePrice: 25, vol: 0.8 },

  // Energy (XLE)
  { symbol: "XOM", assetClass: "EQUITY", sectorEtf: "XLE", basePrice: 118, vol: 0.9 },
  { symbol: "CVX", assetClass: "EQUITY", sectorEtf: "XLE", basePrice: 158, vol: 0.9 },
  { symbol: "OXY", assetClass: "EQUITY", sectorEtf: "XLE", basePrice: 48, vol: 1.2 },

  // Industrials (XLI)
  { symbol: "CAT", assetClass: "EQUITY", sectorEtf: "XLI", basePrice: 395, vol: 1.0 },
  { symbol: "BA", assetClass: "EQUITY", sectorEtf: "XLI", basePrice: 180, vol: 1.4 },
  { symbol: "HON", assetClass: "EQUITY", sectorEtf: "XLI", basePrice: 215, vol: 0.7 },

  // Micro futures (index trend pullback setup) — priced in index points
  { symbol: "MES", assetClass: "INDEX_FUTURE", sectorEtf: null, basePrice: 5450, vol: 0.6 },
  { symbol: "MNQ", assetClass: "INDEX_FUTURE", sectorEtf: null, basePrice: 19300, vol: 0.8 },
];

export const UNIVERSE_BY_SYMBOL: Map<string, UniverseSymbol> = new Map(
  UNIVERSE.map((u) => [u.symbol, u])
);

export { SECTOR_ETFS, INDEX_ETFS };

/** Symbols that are actual single-name equities eligible for Setup 1. */
export const EQUITY_TRADE_CANDIDATES = UNIVERSE.filter(
  (u) => u.assetClass === "EQUITY" && u.sectorEtf !== null && !SECTOR_ETFS.includes(u.symbol)
).map((u) => u.symbol);
