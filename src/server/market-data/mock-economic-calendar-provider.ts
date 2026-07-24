import {
  type EconomicCalendarProvider,
  type EconomicRelease,
} from "@/server/market-data/types";

/**
 * Mock economic calendar. Kept separate from MarketDataProvider because a real
 * economic-calendar source is a different vendor than a market-data source
 * (Alpaca, for instance, has no economic calendar). A scenario can declare a
 * release N minutes out to exercise the Setup 2 "no imminent major release" gate.
 */
export class MockEconomicCalendarProvider implements EconomicCalendarProvider {
  readonly name = "mock";
  private readonly releaseInMinutes: number | null;
  private readonly asOf: Date;

  constructor(opts: { releaseInMinutes?: number | null; asOf?: Date } = {}) {
    this.releaseInMinutes = opts.releaseInMinutes ?? null;
    this.asOf = opts.asOf ?? new Date();
  }

  async getUpcomingReleases(withinMinutes: number, asOf?: Date): Promise<EconomicRelease[]> {
    if (this.releaseInMinutes === null) return [];
    if (this.releaseInMinutes > withinMinutes) return [];
    const base = (asOf ?? this.asOf).getTime();
    return [
      {
        name: "Mock High-Importance Release (CPI)",
        scheduledAt: new Date(base + this.releaseInMinutes * 60_000),
        importance: "HIGH",
      },
    ];
  }
}
