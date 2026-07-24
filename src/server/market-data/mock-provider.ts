import {
  type MarketDataProvider,
  type SymbolSnapshot,
  type MarketContext,
  type NewsItem,
  type FlowSignal,
  type Bar,
  type MarketEventRecord,
  type Direction,
} from "@/server/market-data/types";
import {
  UNIVERSE,
  UNIVERSE_BY_SYMBOL,
  SECTOR_ETFS,
  type UniverseSymbol,
} from "@/server/market-data/universe";
import { Rng, deriveSeed } from "@/server/market-data/rng";
import { etDateKey } from "@/lib/time";

/**
 * Instruction to force a specific symbol into a fully-qualifying setup. Used by
 * scenarios (tests, demos) so a known-good candidate is guaranteed to appear.
 */
export interface ArmedInstruction {
  symbol: string;
  direction: Direction;
  /** Override the auto material-news with a specific headline/summary. */
  news?: { headline: string; summary: string; ageHours?: number };
}

export interface MockScenario {
  /** Force these symbols into qualifying setups. */
  arm?: ArmedInstruction[];
  /** Arbitrary per-symbol snapshot field overrides applied last. */
  overrides?: Record<string, Partial<SymbolSnapshot>>;
  /** Extra news to inject. */
  news?: NewsItem[];
  /** Extra flow signals to inject. */
  flow?: FlowSignal[];
  /** Force market-wide context fields. */
  marketContext?: Partial<MarketContext>;
  /** Minutes until the next high-importance economic release (undefined = none soon). */
  economicReleaseInMinutes?: number;
}

export interface MockProviderOptions {
  seed?: number;
  asOf?: Date;
  scenario?: MockScenario;
}

interface GeneratedDay {
  asOf: Date;
  marketFactor: number; // whole-market % move for the day
  sectorFactor: Record<string, number>; // per sector ETF % move
  snapshots: Map<string, SymbolSnapshot>;
  news: NewsItem[];
  flow: FlowSignal[];
  breadthRatio: number;
  relatedMarketAgreement: number;
  economicReleaseInMinutes: number | null;
}

/**
 * Deterministic mock market-data provider. Generates a correlated day:
 *   market factor -> per-sector factor -> per-symbol return
 * so that sector-confirmation and breadth checks reflect real structure rather
 * than independent noise. Given the same seed + date it produces identical data.
 */
export class MockProvider implements MarketDataProvider {
  readonly name = "mock";
  private readonly seed: number;
  private readonly asOf: Date;
  private readonly scenario: MockScenario;
  private day: GeneratedDay | null = null;

  constructor(opts: MockProviderOptions = {}) {
    this.seed = opts.seed ?? 42;
    this.asOf = opts.asOf ?? new Date();
    this.scenario = opts.scenario ?? {};
  }

  // --- interface methods -------------------------------------------------

  async getUniverse(): Promise<SymbolSnapshot[]> {
    return [...this.generate().snapshots.values()];
  }

  async getSnapshot(symbol: string): Promise<SymbolSnapshot | null> {
    return this.generate().snapshots.get(symbol) ?? null;
  }

  async getMarketContext(): Promise<MarketContext> {
    const day = this.generate();
    const base: MarketContext = {
      asOf: day.asOf,
      spyChangePercent: day.snapshots.get("SPY")?.changePercent ?? day.marketFactor,
      breadthRatio: day.breadthRatio,
      sectorChangePercent: day.sectorFactor,
      relatedMarketAgreement: day.relatedMarketAgreement,
    };
    return { ...base, ...(this.scenario.marketContext ?? {}) };
  }

  async getRecentNews(symbol: string, sinceHours: number): Promise<NewsItem[]> {
    const cutoff = this.asOf.getTime() - sinceHours * 3600_000;
    return this.generate().news.filter(
      (n) => n.symbol === symbol && n.publishedAt.getTime() >= cutoff
    );
  }

  async getFlowSignals(symbol: string, sinceHours: number): Promise<FlowSignal[]> {
    const cutoff = this.asOf.getTime() - sinceHours * 3600_000;
    return this.generate().flow.filter(
      (f) => f.symbol === symbol && f.observedAt.getTime() >= cutoff
    );
  }

  async getCurrentPrice(symbol: string): Promise<number | null> {
    return this.generate().snapshots.get(symbol)?.lastPrice ?? null;
  }

  async getEventsSince(symbol: string, since: Date): Promise<MarketEventRecord[]> {
    const day = this.generate();
    const events: MarketEventRecord[] = [];
    for (const n of day.news) {
      if (n.symbol === symbol && n.publishedAt.getTime() > since.getTime()) {
        events.push({
          symbol,
          eventType: "NEWS",
          occurredAt: n.publishedAt,
          headline: n.headline,
          summary: n.summary,
          payload: { source: n.source },
        });
      }
    }
    for (const f of day.flow) {
      if (f.symbol === symbol && f.observedAt.getTime() > since.getTime()) {
        events.push({
          symbol,
          eventType: "FLOW",
          occurredAt: f.observedAt,
          payload: {
            direction: f.direction,
            notional: f.notional,
            kind: f.kind,
            referencePrice: f.referencePrice,
          },
        });
      }
    }
    return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  // --- generation --------------------------------------------------------

  private generate(): GeneratedDay {
    if (this.day) return this.day;

    const dateKey = etDateKey(this.asOf);
    const rng = new Rng(deriveSeed(this.seed, dateKey));

    // 1. Market factor for the day.
    const marketFactor = rng.normal(0.1, 0.7); // slight positive drift, ~0.7% stdev

    // 2. Per-sector factors: beta to the market plus own component.
    const sectorFactor: Record<string, number> = {};
    for (const sector of SECTOR_ETFS) {
      const beta = rng.range(0.7, 1.3);
      sectorFactor[sector] = beta * marketFactor + rng.normal(0, 0.5);
    }

    const armMap = new Map<string, ArmedInstruction>(
      (this.scenario.arm ?? []).map((a) => [a.symbol, a])
    );

    const snapshots = new Map<string, SymbolSnapshot>();
    const news: NewsItem[] = [...(this.scenario.news ?? [])];
    const flow: FlowSignal[] = [...(this.scenario.flow ?? [])];
    let advancers = 0;

    for (const u of UNIVERSE) {
      const symRng = new Rng(deriveSeed(deriveSeed(this.seed, dateKey), u.symbol));
      const armed = armMap.get(u.symbol);
      const snap = this.buildSnapshot(u, symRng, marketFactor, sectorFactor, armed, news, flow);
      if (snap.changePercent > 0) advancers++;
      snapshots.set(u.symbol, snap);
    }

    // Apply raw overrides last.
    for (const [symbol, patch] of Object.entries(this.scenario.overrides ?? {})) {
      const existing = snapshots.get(symbol);
      if (existing) snapshots.set(symbol, { ...existing, ...patch });
    }

    const breadthRatio = advancers / UNIVERSE.length;
    // Related-market agreement: do SPY/QQQ/IWM/DIA share the market direction sign.
    const indexSigns = ["SPY", "QQQ", "IWM", "DIA"].map((s) =>
      Math.sign(snapshots.get(s)?.changePercent ?? 0)
    );
    const dominant = Math.sign(marketFactor) || 1;
    const relatedMarketAgreement =
      indexSigns.filter((s) => s === dominant).length / indexSigns.length;

    this.day = {
      asOf: this.asOf,
      marketFactor,
      sectorFactor,
      snapshots,
      news,
      flow,
      breadthRatio,
      relatedMarketAgreement,
      economicReleaseInMinutes: this.scenario.economicReleaseInMinutes ?? null,
    };
    return this.day;
  }

  private buildSnapshot(
    u: UniverseSymbol,
    rng: Rng,
    marketFactor: number,
    sectorFactor: Record<string, number>,
    armed: ArmedInstruction | undefined,
    news: NewsItem[],
    flow: FlowSignal[]
  ): SymbolSnapshot {
    const sectorMove = u.sectorEtf ? sectorFactor[u.sectorEtf] ?? marketFactor : marketFactor;

    // Symbol return driven by sector (with beta) + idiosyncratic noise.
    let changePercent = 0.9 * sectorMove + rng.normal(0, 0.6 * u.vol);
    let gapPercent = 0.5 * changePercent + rng.normal(0, 0.4 * u.vol);
    let relativeVolume = Math.max(0.4, rng.normal(1.0, 0.35));
    const dir: Direction = armed?.direction ?? (changePercent >= 0 ? "LONG" : "SHORT");

    // If armed, force a qualifying catalyst-continuation / index-trend structure.
    if (armed) {
      const sign = dir === "LONG" ? 1 : -1;
      gapPercent = sign * rng.range(3.0, 6.0); // significant gap
      changePercent = sign * rng.range(3.5, 7.0); // continuation beyond the gap
      relativeVolume = rng.range(2.2, 4.5); // abnormal participation
      // Ensure the symbol's sector agrees (nudge sector factor via reported context
      // is not possible per-symbol; instead the buildSnapshot for the sector ETF
      // is handled separately — but we also set the equity's own move strongly so
      // sector RS check compares favorably).
    }

    const priorClose = u.basePrice;
    const openPrice = priorClose * (1 + gapPercent / 100);
    const lastPrice = priorClose * (1 + changePercent / 100);

    // Impulse = the initial thrust; for armed setups it's the gap-and-go leg.
    const impulseMovePct = Math.abs(gapPercent) + (armed ? rng.range(0.5, 1.5) : rng.range(0, 0.5));

    // First pullback depth as a fraction of the impulse. Armed => controlled.
    const firstPullbackDepthPct = armed
      ? rng.range(20, 42) // controlled: shallower than the 50% max
      : rng.range(20, 90);

    // Anchored VWAP sits between prior close and last; reclaim if price is on the
    // correct side of it for the direction.
    const anchoredVwap = priorClose * (1 + (gapPercent * 0.6) / 100);
    const distanceToVwapPct = ((lastPrice - anchoredVwap) / anchoredVwap) * 100;
    const reclaimedVwap = armed
      ? true
      : dir === "LONG"
        ? distanceToVwapPct > -0.2
        : distanceToVwapPct < 0.2;

    const trendStrength = armed
      ? rng.range(0.55, 0.85)
      : Math.min(1, Math.abs(changePercent) / 4 + rng.range(0, 0.2));

    const sessionHigh = Math.max(openPrice, lastPrice) * (1 + rng.range(0, 0.4) / 100);
    const sessionLow = Math.min(openPrice, lastPrice) * (1 - rng.range(0, 0.4) / 100);

    const intradayBars = this.buildIntradayPath(
      rng,
      this.asOf,
      openPrice,
      lastPrice,
      sessionHigh,
      sessionLow,
      dir
    );

    // Inject a fresh material-looking catalyst + confirming flow for armed symbols.
    if (armed && u.assetClass === "EQUITY") {
      const ageHours = armed.news?.ageHours ?? rng.range(1, 6);
      const publishedAt = new Date(this.asOf.getTime() - ageHours * 3600_000);
      news.push({
        symbol: u.symbol,
        headline: armed.news?.headline ?? `${u.symbol} reports major positive catalyst`,
        summary:
          armed.news?.summary ??
          `${u.symbol} announced a materially better-than-expected development that changes forward expectations; shares gapped and are extending on heavy volume.`,
        publishedAt,
        source: "MockWire",
      });
      // Flow observed earlier, and price has since confirmed the direction.
      flow.push({
        symbol: u.symbol,
        observedAt: new Date(this.asOf.getTime() - rng.range(0.5, 2) * 3600_000),
        direction: dir,
        notional: rng.range(2_000_000, 12_000_000),
        kind: rng.pick(["OPTIONS_SWEEP", "BLOCK_TRADE", "UNUSUAL_VOLUME"]),
        referencePrice: openPrice,
      });
    }

    return {
      symbol: u.symbol,
      assetClass: u.assetClass,
      sectorEtf: u.sectorEtf,
      asOf: this.asOf,
      priorClose,
      openPrice,
      lastPrice,
      sessionHigh,
      sessionLow,
      gapPercent,
      changePercent,
      relativeVolume,
      anchoredVwap,
      distanceToVwapPct,
      reclaimedVwap,
      firstPullbackDepthPct,
      impulseMovePct,
      trendStrength,
      intradayBars,
    };
  }

  /** A coarse intraday path consistent with open/high/low/last, used for MFE/MAE. */
  private buildIntradayPath(
    rng: Rng,
    asOf: Date,
    open: number,
    last: number,
    high: number,
    low: number,
    dir: Direction
  ): Bar[] {
    const bars: Bar[] = [];
    const n = 26; // ~ 6.5h in 15-min bars
    // Start at open, dip toward the pullback, then resolve toward last.
    let price = open;
    const start = new Date(asOf);
    start.setHours(9, 30, 0, 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // Blend a controlled pullback (early) into the final resolution.
      const target =
        t < 0.35
          ? open + (dir === "LONG" ? -1 : 1) * (open - low) * rng.range(0.2, 0.7) * (t / 0.35)
          : open + (last - open) * ((t - 0.35) / 0.65);
      price = target + rng.normal(0, (high - low) * 0.06);
      const barHigh = Math.min(high, price + Math.abs(rng.normal(0, (high - low) * 0.05)));
      const barLow = Math.max(low, price - Math.abs(rng.normal(0, (high - low) * 0.05)));
      const time = new Date(start.getTime() + i * 15 * 60_000);
      bars.push({
        time,
        open: i === 0 ? open : bars[i - 1].close,
        high: Math.max(barHigh, price),
        low: Math.min(barLow, price),
        close: price,
        volume: Math.round(rng.range(50_000, 500_000)),
      });
    }
    // Pin the final close to `last`.
    bars[bars.length - 1].close = last;
    return bars;
  }
}

/** Convenience: is this symbol a real single-name equity (not an ETF/future)? */
export function isTradableEquity(symbol: string): boolean {
  const u = UNIVERSE_BY_SYMBOL.get(symbol);
  return !!u && u.assetClass === "EQUITY" && u.sectorEtf !== null && !SECTOR_ETFS.includes(symbol);
}
