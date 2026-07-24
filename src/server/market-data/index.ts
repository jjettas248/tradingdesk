import { getEnv } from "@/server/config/env";
import {
  type MarketDataProvider,
  type EconomicCalendarProvider,
} from "@/server/market-data/types";
import { MockProvider, type MockScenario } from "@/server/market-data/mock-provider";
import { MockEconomicCalendarProvider } from "@/server/market-data/mock-economic-calendar-provider";

/**
 * Provider factories. The pipeline calls these — it never news up a concrete
 * provider itself — so swapping mock -> alpaca is a single-file change here.
 */

export interface ProviderFactoryOptions {
  asOf?: Date;
  seed?: number;
  scenario?: MockScenario;
}

export function getMarketDataProvider(opts: ProviderFactoryOptions = {}): MarketDataProvider {
  const env = getEnv();
  switch (env.MARKET_DATA_PROVIDER) {
    case "mock":
      return new MockProvider({
        seed: opts.seed ?? env.MOCK_SEED,
        asOf: opts.asOf,
        scenario: opts.scenario,
      });
    case "alpaca":
      // Future drop-in. Intentionally not implemented in v1.
      throw new Error(
        "AlpacaProvider is not implemented in v1. Set MARKET_DATA_PROVIDER=mock or add the provider."
      );
    default:
      throw new Error(`Unknown MARKET_DATA_PROVIDER: ${env.MARKET_DATA_PROVIDER}`);
  }
}

export function getEconomicCalendarProvider(
  opts: { asOf?: Date; releaseInMinutes?: number | null } = {}
): EconomicCalendarProvider {
  const env = getEnv();
  switch (env.MARKET_DATA_PROVIDER) {
    case "mock":
      return new MockEconomicCalendarProvider({
        asOf: opts.asOf,
        releaseInMinutes: opts.releaseInMinutes ?? null,
      });
    case "alpaca":
      throw new Error(
        "No economic-calendar provider wired for alpaca in v1 (Alpaca has no economic calendar feed)."
      );
    default:
      throw new Error(`Unknown MARKET_DATA_PROVIDER: ${env.MARKET_DATA_PROVIDER}`);
  }
}
