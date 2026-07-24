import { getMarketDataProvider, getEconomicCalendarProvider } from "@/server/market-data";
import { getLlmClient } from "@/server/llm";
import { runMorningPipeline } from "@/server/pipeline/run-morning-pipeline";
import { persistPipelineResult } from "@/server/pipeline/persist";
import { buildRiskContext, buildPipelineConfig } from "@/server/risk/context";
import { getScenario } from "@/server/market-data/mock-scenarios";
import { prisma } from "@/server/db/client";
import { etDateKey } from "@/lib/time";
import {
  DEFAULT_SETUP1_THRESHOLDS,
  DEFAULT_SETUP2_THRESHOLDS,
  type Setup1Thresholds,
  type Setup2Thresholds,
} from "@/server/pipeline/setups/thresholds";
import { SETUP_KEYS } from "@/server/config/constants";

/**
 * Run the full morning pipeline against the configured provider and persist the
 * results (candidates, tickets, immutable explanations). Also processes any
 * FLAGGED candidates the fast loop surfaced. Idempotency: aborts if the day is
 * already SCANNED unless --force (which clears the day's un-decided candidates).
 */
export async function morningScan(args: string[]): Promise<number> {
  const force = args.includes("--force");
  const scenarioName = flagValue(args, "--scenario");
  const seedArg = flagValue(args, "--seed");
  const seed = seedArg ? Number(seedArg) : undefined;
  const asOf = new Date();
  const dateKey = etDateKey(asOf);

  // Halt guard.
  const halt = await prisma.riskHaltState.findFirst({ where: { active: true } });
  if (halt) {
    console.error(
      `Risk halt is ACTIVE (drawdown ${halt.triggerDrawdownPercent.toFixed(1)}%). Resolve it with 'resolve-halt' before scanning.`
    );
    return 2;
  }

  const existing = await prisma.tradingDay.findUnique({ where: { dateKey } });
  if (existing?.scanStatus === "SCANNED" && !force) {
    console.error(`${dateKey} already scanned. Re-run with --force to rescan.`);
    return 3;
  }
  if (existing?.scanStatus === "SCANNED" && force) {
    await clearUndecided(existing.id);
    console.log(`--force: cleared un-decided candidates for ${dateKey}.`);
  }

  const scenario = getScenario(scenarioName);
  const provider = getMarketDataProvider({ asOf, seed, scenario });
  const economic = getEconomicCalendarProvider({
    asOf,
    releaseInMinutes: scenario?.economicReleaseInMinutes ?? null,
  });
  const llm = getLlmClient();
  const risk = await buildRiskContext(asOf);
  const config = buildPipelineConfig();
  const thresholds = await loadThresholds();

  const collectedLogs: unknown[] = [];
  const result = await runMorningPipeline({
    provider,
    economic,
    llm,
    asOf,
    risk,
    config,
    thresholds,
    onLlmCall: (log) => {
      collectedLogs.push(log);
    },
  });

  // Persist materiality LLM logs collected during the pipeline.
  for (const log of collectedLogs as Array<Record<string, unknown>>) {
    await prisma.llmCallLog.create({
      data: {
        purpose: String(log.purpose),
        model: String(log.model),
        promptVersion: String(log.promptVersion),
        requestSummary: (log.request ?? {}) as object,
        responseSummary: (log.response ?? {}) as object,
        latencyMs: Number(log.latencyMs ?? 0),
        inputTokens: (log.inputTokens as number) ?? null,
        outputTokens: (log.outputTokens as number) ?? null,
      },
    });
  }

  const { armedTicketIds } = await persistPipelineResult({ result, asOf, llm });

  const rejected = result.candidates.filter((c) => c.status === "REJECTED").length;
  console.log(
    `Scan ${dateKey}: ${result.candidates.length} evaluated, ${result.armed.length} armed, ${rejected} rejected.`
  );
  if (result.risk.haltTriggered) {
    console.log(`⚠️  Drawdown halt triggered (${result.risk.drawdown.drawdownPercent.toFixed(1)}%).`);
  }
  for (const c of result.armed) {
    console.log(`  ARMED  ${c.symbol} ${c.direction} — ${c.sizing?.positionSize} ${c.sizing?.sizeUnit}, R:R ${c.levels?.rewardRisk.toFixed(1)}`);
  }
  console.log(`${armedTicketIds.length} ticket(s) ready to send.`);
  return 0;
}

async function clearUndecided(tradingDayId: string): Promise<void> {
  // Delete candidates for the day that carry no recorded decision, cascading
  // their tickets + explanations. Candidates with a decision are preserved.
  const candidates = await prisma.candidate.findMany({
    where: { tradingDayId },
    include: { ticket: { include: { decision: true, explanation: true, position: true } } },
  });
  for (const c of candidates) {
    if (c.ticket?.decision || c.ticket?.position) continue; // keep decided ones
    if (c.ticket?.explanation) {
      await prisma.explanation.delete({ where: { id: c.ticket.explanation.id } });
    }
    if (c.ticket) {
      await prisma.ticket.delete({ where: { id: c.ticket.id } });
    }
    await prisma.candidate.delete({ where: { id: c.id } });
  }
}

async function loadThresholds(): Promise<{ setup1: Setup1Thresholds; setup2: Setup2Thresholds }> {
  const setups = await prisma.playbookSetup.findMany();
  const s1 = setups.find((s) => s.key === SETUP_KEYS.CATALYST_CONTINUATION);
  const s2 = setups.find((s) => s.key === SETUP_KEYS.INDEX_TREND_PULLBACK);
  return {
    setup1: ((s1?.thresholds as unknown) as Setup1Thresholds) ?? DEFAULT_SETUP1_THRESHOLDS,
    setup2: ((s2?.thresholds as unknown) as Setup2Thresholds) ?? DEFAULT_SETUP2_THRESHOLDS,
  };
}

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}
