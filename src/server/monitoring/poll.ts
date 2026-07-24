import { prisma } from "@/server/db/client";
import { getMarketDataProvider } from "@/server/market-data";
import { sendMessage } from "@/server/telegram/client";
import { getEnv } from "@/server/config/env";
import { etDateKey, isExtendedHoursET } from "@/lib/time";
import { EQUITY_TRADE_CANDIDATES } from "@/server/market-data/universe";
import { INDEX_FUTURE_SYMBOLS, SETUP_KEYS } from "@/server/config/constants";
import { DEFAULT_SETUP1_THRESHOLDS } from "@/server/pipeline/setups/thresholds";
import { classifyException } from "@/server/monitoring/exceptions";

/**
 * The continuous fast loop. Runs every few minutes via a real cron hitting
 * /api/cron/poll. DETERMINISTIC — it never calls the LLM and never sends a
 * ticket. Its three jobs:
 *   1. Incrementally ingest news/flow into MarketEvent (advancing ProviderCursor).
 *   2. Watch every OPEN position against stop/targets and fire immediate
 *      exception alerts (deduped) — the highest-value part of running all day.
 *   3. FLAG qualifying symbols so the next hourly Routine runs them through the
 *      full LLM-inclusive pipeline. It only flags; it never arms.
 */

export interface PollResult {
  ingestedEvents: number;
  exceptionsAlerted: number;
  flagged: number;
  llmCalls: 0; // structural: this path never calls the LLM
  skippedOutsideHours: boolean;
}

export async function runPoll(asOf: Date = new Date()): Promise<PollResult> {
  const provider = getMarketDataProvider({ asOf });
  const result: PollResult = {
    ingestedEvents: 0,
    exceptionsAlerted: 0,
    flagged: 0,
    llmCalls: 0,
    skippedOutsideHours: false,
  };

  // 2. Position exceptions — always checked (positions may be held any time).
  result.exceptionsAlerted = await checkOpenPositions(provider, asOf);

  // 1 & 3 only make sense while the market (or extended session) is live.
  if (!isExtendedHoursET(asOf)) {
    result.skippedOutsideHours = true;
    return result;
  }

  const symbols = [...EQUITY_TRADE_CANDIDATES, ...INDEX_FUTURE_SYMBOLS];
  for (const symbol of symbols) {
    const ingested = await ingestSymbol(provider, symbol, asOf);
    result.ingestedEvents += ingested;
  }

  result.flagged = await flagCandidates(provider, asOf);
  return result;
}

/** Incrementally pull events since the per-symbol cursor and store them. */
async function ingestSymbol(
  provider: ReturnType<typeof getMarketDataProvider>,
  symbol: string,
  asOf: Date
): Promise<number> {
  const cursor = await prisma.providerCursor.findUnique({ where: { symbol } });
  const since = cursor?.lastSeenAt ?? new Date(asOf.getTime() - 24 * 3600_000);
  const events = await provider.getEventsSince(symbol, since, asOf);

  let count = 0;
  let maxSeen = since;
  for (const ev of events) {
    await prisma.marketEvent.create({
      data: {
        symbol: ev.symbol,
        eventType: ev.eventType,
        occurredAt: ev.occurredAt,
        headline: ev.headline ?? null,
        summary: ev.summary ?? null,
        payload: ev.payload as object,
      },
    });
    if (ev.occurredAt > maxSeen) maxSeen = ev.occurredAt;
    count++;
  }

  await prisma.providerCursor.upsert({
    where: { symbol },
    update: { lastSeenAt: maxSeen },
    create: { symbol, lastSeenAt: maxSeen },
  });
  return count;
}

/** Check each OPEN position against stop/targets; alert on a fresh breach. */
async function checkOpenPositions(
  provider: ReturnType<typeof getMarketDataProvider>,
  asOf: Date
): Promise<number> {
  const positions = await prisma.position.findMany({ where: { status: "OPEN" } });
  const chatId = (await resolveChatId()) ?? "dry-run";
  let alerts = 0;

  for (const p of positions) {
    const price = await provider.getCurrentPrice(p.symbol, asOf);
    if (price === null) continue;

    const exceptionType = classifyException(
      p.direction as "LONG" | "SHORT",
      price,
      p.stopPrice,
      p.target1Price,
      p.target2Price
    );

    if (!exceptionType) continue;
    // Dedup: don't re-alert the same exception type.
    if (p.lastExceptionType === exceptionType) continue;

    await prisma.position.update({
      where: { id: p.id },
      data: { lastExceptionType: exceptionType, lastExceptionAt: asOf },
    });

    const verb =
      exceptionType === "STOP"
        ? "hit its STOP"
        : exceptionType === "TARGET2"
          ? "reached TARGET 2"
          : "reached TARGET 1";
    await sendMessage(
      chatId,
      `⚠️ Position #${p.shortCode} ${p.symbol} ${verb} at ${price.toFixed(2)}. Manage per your plan (${p.status}).`
    );
    alerts++;
  }
  return alerts;
}

/**
 * Pre-screen: a symbol with a fresh NEWS event AND snapshot gap+RVOL above the
 * scanner floors gets a FLAGGED candidate on today's TradingDay — a cheap,
 * deterministic hint for the next hourly pipeline pass. Never builds a ticket.
 */
async function flagCandidates(
  provider: ReturnType<typeof getMarketDataProvider>,
  asOf: Date
): Promise<number> {
  const dateKey = etDateKey(asOf);
  const day = await prisma.tradingDay.upsert({
    where: { dateKey },
    update: {},
    create: { dateKey },
  });

  const t = DEFAULT_SETUP1_THRESHOLDS;
  const freshCutoff = asOf.getTime() - t.maxCatalystAgeHours * 3600_000;
  let flagged = 0;

  for (const symbol of EQUITY_TRADE_CANDIDATES) {
    const freshNews = await prisma.marketEvent.findFirst({
      where: { symbol, eventType: "NEWS", occurredAt: { gte: new Date(freshCutoff) } },
      orderBy: { occurredAt: "desc" },
    });
    if (!freshNews) continue;

    const snap = await provider.getSnapshot(symbol, asOf);
    if (!snap) continue;
    if (Math.abs(snap.gapPercent) < t.minGapPercent) continue;
    if (snap.relativeVolume < t.minRelativeVolume) continue;

    // Skip if the symbol already has a live candidate today.
    const already = await prisma.candidate.findFirst({
      where: { tradingDayId: day.id, symbol, status: { in: ["FLAGGED", "ARMED", "SENT"] } },
    });
    if (already) continue;

    await prisma.candidate.create({
      data: {
        tradingDayId: day.id,
        setupKey: SETUP_KEYS.CATALYST_CONTINUATION,
        symbol,
        assetClass: "EQUITY",
        direction: snap.changePercent >= 0 ? "LONG" : "SHORT",
        status: "FLAGGED",
        evidence: {
          symbol,
          reason: "fast-loop pre-screen",
          gapPercent: round2(snap.gapPercent),
          relativeVolume: round2(snap.relativeVolume),
          freshHeadline: freshNews.headline,
        } as object,
      },
    });
    flagged++;
  }
  return flagged;
}

async function resolveChatId(): Promise<string | undefined> {
  const cfg = await prisma.deskConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.telegramChatId ?? getEnv().TELEGRAM_CHAT_ID ?? undefined;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
