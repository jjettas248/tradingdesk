import { prisma } from "@/server/db/client";
import { evaluateDrawdown } from "@/server/risk/drawdown-throttle";
import { etDateKey } from "@/lib/time";
import { getEnv } from "@/server/config/env";

/**
 * Read-only orientation command. A Routine-driven session runs this first (and
 * last) to understand desk state and to abort if a halt is active. Also the
 * quickest local health check.
 */
export async function status(): Promise<number> {
  const dateKey = etDateKey();
  const env = getEnv();

  const equitySnaps = await prisma.equitySnapshot.findMany({ orderBy: { asOf: "asc" } });
  const equitySeries = equitySnaps.map((e) => e.equityValue);
  const dd = evaluateDrawdown(equitySeries.length ? equitySeries : [env.STARTING_EQUITY]);

  const halt = await prisma.riskHaltState.findFirst({ where: { active: true } });
  const day = await prisma.tradingDay.findUnique({ where: { dateKey } });
  const open = await prisma.position.findMany({ where: { status: { in: ["AWAITING_FILL", "OPEN"] } } });

  const armedToday = day
    ? await prisma.candidate.count({ where: { tradingDayId: day.id, status: { in: ["ARMED", "SENT"] } } })
    : 0;
  const decisionsToday = day
    ? await prisma.decision.count({ where: { ticket: { candidate: { tradingDayId: day.id } } } })
    : 0;

  console.log(`=== Apex Morning Trading Desk — ${dateKey} (ET) ===`);
  console.log(`Provider: ${env.MARKET_DATA_PROVIDER}   LLM: ${env.ANTHROPIC_API_KEY ? "live" : "stub"}   Telegram: ${env.TELEGRAM_BOT_TOKEN ? "live" : "dry-run"}`);
  console.log(`Equity: $${dd.currentEquity.toFixed(0)}   Peak: $${dd.peakEquity.toFixed(0)}   Drawdown: ${dd.drawdownPercent.toFixed(1)}% (${dd.tierLabel}, size ×${dd.multiplier})`);
  if (halt) {
    console.log(`🛑 RISK HALT ACTIVE since ${halt.triggeredAt.toISOString()} — drawdown ${halt.triggerDrawdownPercent.toFixed(1)}%. Investigate, then 'resolve-halt'.`);
  }
  console.log(`Today: scan=${day?.scanStatus ?? "PENDING"} send=${day?.sendStatus ?? "PENDING"} armed=${armedToday} decisions=${decisionsToday} entries=${day?.entriesLogged ?? 0}`);
  console.log(`Open/awaiting positions: ${open.length}`);
  for (const p of open) {
    console.log(`  #${p.shortCode} ${p.symbol} ${p.direction} ${p.status} (stop ${p.stopPrice}, T1 ${p.target1Price})`);
  }

  return halt ? 1 : 0;
}
