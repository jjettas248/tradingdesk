import { prisma } from "@/server/db/client";
import { computeExitMetrics } from "@/server/positions/exit-metrics";
import { getMarketDataProvider } from "@/server/market-data";

/**
 * CLI exit logger — the fallback/partial-aware path (Telegram /exit does full
 * closes only). Supports scaling out: pass a portion percent; the position stays
 * OPEN until cumulative closed reaches 100%.
 *
 * Usage: log-exit <shortCode> <price> [reason] [portionPercent]
 */
export async function logExit(args: string[]): Promise<number> {
  const code = Number(args[0]);
  const price = Number(args[1]);
  const reasonRaw = (args[2] ?? "MANUAL").toUpperCase();
  const portion = args[3] !== undefined ? Number(args[3]) : 100;
  const reason = ["STOP", "TARGET1", "TARGET2", "MANUAL", "EOD", "OTHER"].includes(reasonRaw)
    ? reasonRaw
    : "MANUAL";

  if (!Number.isFinite(code) || !Number.isFinite(price) || !Number.isFinite(portion) || portion <= 0 || portion > 100) {
    console.error("Usage: log-exit <shortCode> <price> [reason] [portionPercent 1-100]");
    return 64;
  }

  const position = await prisma.position.findUnique({ where: { shortCode: code }, include: { exits: true } });
  if (!position) {
    console.error(`No position #${code}.`);
    return 65;
  }
  if (position.status === "CLOSED") {
    console.error(`Position #${code} already closed.`);
    return 66;
  }

  const alreadyClosed = position.exits.reduce((s, e) => s + e.portionPercent, 0);
  const remaining = 100 - alreadyClosed;
  const thisPortion = Math.min(portion, remaining);

  const entryPrice = position.actualEntryPrice ?? (position.plannedEntryLow + position.plannedEntryHigh) / 2;
  let intradayBars;
  try {
    const snap = await getMarketDataProvider().getSnapshot(position.symbol);
    intradayBars = snap?.intradayBars;
  } catch {
    intradayBars = undefined;
  }

  const metrics = computeExitMetrics({
    symbol: position.symbol,
    assetClass: position.assetClass as "EQUITY" | "INDEX_FUTURE",
    direction: position.direction as "LONG" | "SHORT",
    entryPrice,
    stopPrice: position.stopPrice,
    exitPrice: price,
    positionSize: position.positionSize,
    portionPercent: thisPortion,
    intradayBars,
  });

  await prisma.exit.create({
    data: {
      positionId: position.id,
      portionPercent: thisPortion,
      exitPrice: price,
      exitReason: reason,
      maxFavorableExcursion: metrics.maxFavorableExcursion,
      maxAdverseExcursion: metrics.maxAdverseExcursion,
      realizedPnl: metrics.realizedPnl,
      realizedR: metrics.realizedR,
    },
  });

  const totalClosed = alreadyClosed + thisPortion;
  const nowClosed = totalClosed >= 99.999;
  if (nowClosed) {
    await prisma.position.update({ where: { id: position.id }, data: { status: "CLOSED" } });
  }

  console.log(
    `Logged exit on #${code}: ${thisPortion.toFixed(0)}% @ ${price} (${reason}), ${metrics.realizedR >= 0 ? "+" : ""}${metrics.realizedR.toFixed(2)}R. ` +
      (nowClosed ? "Position CLOSED." : `${(100 - totalClosed).toFixed(0)}% still open.`)
  );
  return 0;
}
