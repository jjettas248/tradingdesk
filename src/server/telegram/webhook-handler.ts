import { prisma } from "@/server/db/client";
import { getEnv } from "@/server/config/env";
import { MAX_DECISION_AGE_MS } from "@/server/config/constants";
import { parseDecisionCallback } from "@/server/telegram/format-ticket";
import { formatExplanation } from "@/server/telegram/format-explanation";
import { revealExplanation } from "@/server/explanation/reveal";
import { sendMessage, answerCallbackQuery, clearInlineKeyboard } from "@/server/telegram/client";
import { computeExitMetrics } from "@/server/positions/exit-metrics";
import { getMarketDataProvider } from "@/server/market-data";
import { etDateKey } from "@/lib/time";
import type { ExplanationSections } from "@/server/llm/types";

/**
 * ALL Telegram inbound handling. This module NEVER calls the LLM and NEVER
 * touches explanation/review CONTENT — it only records decisions/fills/exits and
 * flips the explanation's visibility. That's the structural guarantee behind
 * "never fabricate a hindsight explanation": there is no code path here that
 * could generate one.
 */

interface TgChat {
  id: number | string;
}
interface TgMessage {
  message_id: number;
  chat: TgChat;
  text?: string;
}
interface TgCallbackQuery {
  id: string;
  data?: string;
  message?: TgMessage;
}
export interface TelegramUpdate {
  update_id?: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

async function authorizedChat(chatId: string): Promise<boolean> {
  const cfg = await prisma.deskConfig.findUnique({ where: { id: "singleton" } });
  const allowed = cfg?.telegramChatId ?? getEnv().TELEGRAM_CHAT_ID;
  if (!allowed) return true; // not yet configured (local dev)
  return String(allowed) === chatId;
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
  } else if (update.message?.text) {
    await handleMessage(update.message);
  }
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const chatId = String(cb.message?.chat.id ?? "");
  if (!(await authorizedChat(chatId))) {
    await answerCallbackQuery(cb.id, "Not authorized.");
    return;
  }

  const parsed = cb.data ? parseDecisionCallback(cb.data) : null;
  if (!parsed) {
    await answerCallbackQuery(cb.id, "Unrecognized action.");
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.ticketId },
    include: { candidate: { include: { setup: true } }, decision: true, position: true },
  });
  if (!ticket) {
    await answerCallbackQuery(cb.id, "Ticket not found.");
    return;
  }

  // Idempotency: a duplicate Telegram delivery must not double-record.
  if (ticket.decision) {
    await answerCallbackQuery(cb.id, `Already recorded: ${ticket.decision.decisionType}.`);
    return;
  }

  // Staleness guard against a resurrected/buggy tap long after the fact.
  if (ticket.sentAt && Date.now() - ticket.sentAt.getTime() > MAX_DECISION_AGE_MS) {
    await answerCallbackQuery(cb.id, "This ticket is too old to act on.");
    return;
  }

  const cfg = await prisma.deskConfig.findUnique({ where: { id: "singleton" } });
  const stage = cfg?.currentStage ?? "FOLLOW_AND_STUDY";

  await prisma.decision.create({
    data: {
      ticketId: ticket.id,
      decisionType: parsed.decisionType,
      traderStageAtDecision: stage,
      rawCallbackData: cb.data,
    },
  });

  // Reveal the pre-generated explanation (never regenerated here).
  const revealed = await revealExplanation(ticket.id);
  await answerCallbackQuery(cb.id, `Recorded: ${parsed.decisionType}`);
  if (chatId && cb.message) {
    await clearInlineKeyboard(chatId, cb.message.message_id);
  }
  if (revealed) {
    const sections = revealed.sections as unknown as ExplanationSections;
    await sendMessage(chatId, formatExplanation(ticket.candidate.symbol, ticket.candidate.setup.name, sections));
  }

  if (parsed.decisionType === "ENTERED") {
    await createPositionForTicket(ticket.id, chatId);
  }
}

async function createPositionForTicket(ticketId: string, chatId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { candidate: true, position: true },
  });
  if (!ticket || ticket.position) return;

  const dateKey = etDateKey();
  const day = await prisma.tradingDay.findUnique({ where: { dateKey } });
  const entriesToday = day?.entriesLogged ?? 0;
  const cap = getEnv().MAX_DAILY_ENTRIES;
  if (entriesToday >= cap) {
    await sendMessage(
      chatId,
      `⚠️ Decision recorded as ENTERED, but the daily entry cap (${cap}) is already reached — this position is not being tracked. Review your risk before adding more.`
    );
    return;
  }

  // Allocate a human-friendly short code atomically.
  const bumped = await prisma.deskConfig.update({
    where: { id: "singleton" },
    data: { nextShortCode: { increment: 1 } },
  });
  const shortCode = bumped.nextShortCode - 1;

  await prisma.position.create({
    data: {
      ticketId: ticket.id,
      shortCode,
      symbol: ticket.candidate.symbol,
      setupKey: ticket.candidate.setupKey,
      assetClass: ticket.candidate.assetClass,
      direction: ticket.candidate.direction,
      plannedEntryLow: ticket.entryLow,
      plannedEntryHigh: ticket.entryHigh,
      positionSize: ticket.positionSize,
      sizeUnit: ticket.sizeUnit,
      stopPrice: ticket.stopPrice,
      target1Price: ticket.target1Price,
      target2Price: ticket.target2Price,
      status: "AWAITING_FILL",
    },
  });

  if (day) {
    await prisma.tradingDay.update({
      where: { dateKey },
      data: { entriesLogged: { increment: 1 } },
    });
  }

  await sendMessage(
    chatId,
    `Logged as position #${shortCode}. When filled, reply:  /fill ${shortCode} <price>`
  );
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId = String(msg.chat.id);
  if (!(await authorizedChat(chatId))) return;
  const text = (msg.text ?? "").trim();

  if (text.startsWith("/fill")) return handleFill(chatId, text);
  if (text.startsWith("/exit")) return handleExit(chatId, text);
  if (text.startsWith("/help") || text.startsWith("/start")) {
    await sendMessage(
      chatId,
      [
        "Apex Morning Trading Desk — commands:",
        "/fill <id> <price>  — mark a position filled",
        "/exit <id> <price> [reason]  — close a position (reason: STOP|TARGET1|TARGET2|MANUAL|EOD)",
        "Ticket buttons: Entered / Skipped / Too Late / Reject",
      ].join("\n")
    );
    return;
  }
  // Unknown text — stay quiet unless it looks like an attempted command.
  if (text.startsWith("/")) {
    await sendMessage(chatId, "Unknown command. Try /help.");
  }
}

async function handleFill(chatId: string, text: string): Promise<void> {
  const parts = text.split(/\s+/);
  const code = Number(parts[1]);
  const price = Number(parts[2]);
  if (!Number.isFinite(code) || !Number.isFinite(price)) {
    await sendMessage(chatId, "Usage: /fill <id> <price>");
    return;
  }
  const position = await prisma.position.findUnique({ where: { shortCode: code } });
  if (!position) {
    await sendMessage(chatId, `No position #${code}.`);
    return;
  }
  if (position.status !== "AWAITING_FILL") {
    await sendMessage(chatId, `Position #${code} is ${position.status}, not awaiting a fill.`);
    return;
  }
  await prisma.position.update({
    where: { id: position.id },
    data: { actualEntryPrice: price, actualEntryAt: new Date(), status: "OPEN" },
  });
  await sendMessage(chatId, `Position #${code} ${position.symbol} filled at ${price}. Now OPEN.`);
}

async function handleExit(chatId: string, text: string): Promise<void> {
  const parts = text.split(/\s+/);
  const code = Number(parts[1]);
  const price = Number(parts[2]);
  const reasonRaw = (parts[3] ?? "MANUAL").toUpperCase();
  const reason = ["STOP", "TARGET1", "TARGET2", "MANUAL", "EOD", "OTHER"].includes(reasonRaw)
    ? reasonRaw
    : "MANUAL";
  if (!Number.isFinite(code) || !Number.isFinite(price)) {
    await sendMessage(chatId, "Usage: /exit <id> <price> [reason]");
    return;
  }
  const position = await prisma.position.findUnique({ where: { shortCode: code } });
  if (!position) {
    await sendMessage(chatId, `No position #${code}.`);
    return;
  }
  if (position.status === "CLOSED") {
    await sendMessage(chatId, `Position #${code} is already closed.`);
    return;
  }

  const entryPrice = position.actualEntryPrice ?? (position.plannedEntryLow + position.plannedEntryHigh) / 2;

  // MFE/MAE from the provider's intraday path (deterministic; no LLM).
  let intradayBars;
  try {
    const provider = getMarketDataProvider();
    const snapshot = await provider.getSnapshot(position.symbol);
    intradayBars = snapshot?.intradayBars;
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
    portionPercent: 100, // v1 webhook exit is a full close; partials via CLI/log-exit
    intradayBars,
  });

  await prisma.exit.create({
    data: {
      positionId: position.id,
      portionPercent: 100,
      exitPrice: price,
      exitReason: reason,
      maxFavorableExcursion: metrics.maxFavorableExcursion,
      maxAdverseExcursion: metrics.maxAdverseExcursion,
      realizedPnl: metrics.realizedPnl,
      realizedR: metrics.realizedR,
    },
  });
  await prisma.position.update({ where: { id: position.id }, data: { status: "CLOSED" } });

  const rTxt = `${metrics.realizedR >= 0 ? "+" : ""}${metrics.realizedR.toFixed(2)}R`;
  await sendMessage(
    chatId,
    `Position #${code} ${position.symbol} closed at ${price} (${reason}). Result ${rTxt}, P&L $${metrics.realizedPnl.toFixed(0)}. Review will follow after the next desk cycle.`
  );
}
