import { prisma } from "@/server/db/client";
import { getEnv } from "@/server/config/env";
import { formatTicket, type TicketView } from "@/server/telegram/format-ticket";
import { sendMessage } from "@/server/telegram/client";
import { etDateKey } from "@/lib/time";

/**
 * Send every armed-but-unsent ticket for today via Telegram (or dry-run log).
 * This is the ONLY step that pushes a ticket to the user. The explanation is
 * already generated and stored (during morning-scan) — it is not sent here; it
 * unlocks only when the user responds.
 */
export async function sendTickets(): Promise<number> {
  const dateKey = etDateKey();
  const day = await prisma.tradingDay.findUnique({ where: { dateKey } });
  if (!day) {
    console.log(`No trading day for ${dateKey}. Run morning-scan first.`);
    return 0;
  }

  const chatId = (await resolveChatId()) ?? "dry-run";

  const tickets = await prisma.ticket.findMany({
    where: {
      sentAt: null,
      candidate: { tradingDayId: day.id, status: "ARMED" },
    },
    include: { candidate: { include: { setup: true } } },
  });

  if (tickets.length === 0) {
    console.log("No unsent armed tickets.");
    return 0;
  }

  await prisma.tradingDay.update({ where: { dateKey }, data: { sendStatus: "SENDING" } });

  let sent = 0;
  for (const t of tickets) {
    const view: TicketView = {
      ticketId: t.id,
      symbol: t.candidate.symbol,
      direction: t.candidate.direction,
      setupName: t.candidate.setup.name,
      entryLow: t.entryLow,
      entryHigh: t.entryHigh,
      triggerCondition: t.triggerCondition,
      stopPrice: t.stopPrice,
      target1Price: t.target1Price,
      target2Price: t.target2Price,
      maxEntryPrice: t.maxEntryPrice,
      positionSize: t.positionSize,
      sizeUnit: t.sizeUnit,
      maxDollarLoss: t.maxDollarLoss,
      runnerPlan: t.runnerPlan,
      orderTypeNote: t.orderTypeNote,
      alertExpiresAt: t.alertExpiresAt,
    };
    const { text, inlineKeyboard } = formatTicket(view);
    const res = await sendMessage(chatId, text, inlineKeyboard);
    await prisma.ticket.update({
      where: { id: t.id },
      data: {
        sentAt: new Date(),
        telegramChatId: res.chatId ?? chatId,
        telegramMessageId: res.messageId ? String(res.messageId) : null,
      },
    });
    await prisma.candidate.update({ where: { id: t.candidateId }, data: { status: "SENT" } });
    sent++;
  }

  await prisma.tradingDay.update({ where: { dateKey }, data: { sendStatus: "COMPLETE" } });
  console.log(`Sent ${sent} ticket(s)${getEnv().TELEGRAM_BOT_TOKEN ? "" : " (dry-run)"}.`);
  return 0;
}

async function resolveChatId(): Promise<string | undefined> {
  const cfg = await prisma.deskConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.telegramChatId ?? getEnv().TELEGRAM_CHAT_ID ?? undefined;
}
