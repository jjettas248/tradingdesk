import { prisma } from "@/server/db/client";
import type { LlmClient, ExplanationEvidence } from "@/server/llm/types";
import type { PipelineResult } from "@/server/pipeline/run-morning-pipeline";
import { toEvidence } from "@/server/pipeline/run-morning-pipeline";
import type { PipelineCandidate } from "@/server/pipeline/context";
import { generateExplanation } from "@/server/explanation/generate";
import { etDateKey } from "@/lib/time";

/**
 * Persist a pipeline run: TradingDay, every Candidate (with full evidence trail),
 * a Ticket per ARMED candidate, and the immutable pre-trade Explanation for each
 * ticket — generated HERE, before send-tickets ever runs. Also records a
 * RiskHaltState if the drawdown throttle tripped.
 */
export async function persistPipelineResult(args: {
  result: PipelineResult;
  asOf: Date;
  llm: LlmClient;
}): Promise<{ tradingDayId: string; armedTicketIds: string[] }> {
  const { result, asOf, llm } = args;
  const dateKey = etDateKey(asOf);

  const armedCount = result.armed.length;
  const day = await prisma.tradingDay.upsert({
    where: { dateKey },
    update: {
      scanStatus: "SCANNED",
      riskMultiplier: result.risk.drawdown.multiplier,
      haltActiveAtScan: result.risk.haltTriggered,
      ticketsArmed: armedCount,
    },
    create: {
      dateKey,
      scanStatus: "SCANNED",
      riskMultiplier: result.risk.drawdown.multiplier,
      haltActiveAtScan: result.risk.haltTriggered,
      ticketsArmed: armedCount,
    },
  });

  // Record a halt if the throttle tripped and none is already active.
  if (result.risk.haltTriggered) {
    const existing = await prisma.riskHaltState.findFirst({ where: { active: true } });
    if (!existing) {
      await prisma.riskHaltState.create({
        data: {
          active: true,
          triggerDrawdownPercent: result.risk.drawdown.drawdownPercent,
          triggerNote: `Auto-halt at scan on ${dateKey}: drawdown ${result.risk.drawdown.drawdownPercent.toFixed(1)}%`,
        },
      });
    }
  }

  const setups = await prisma.playbookSetup.findMany();
  const versionByKey = new Map(setups.map((s) => [s.key, s.version]));

  const armedTicketIds: string[] = [];

  for (const c of result.candidates) {
    const candidate = await prisma.candidate.create({
      data: {
        tradingDayId: day.id,
        setupKey: c.setupKey,
        symbol: c.symbol,
        assetClass: c.assetClass,
        direction: c.direction,
        status: c.status,
        rejectedAtStage: c.rejectedAtStage ?? null,
        rejectionReason: c.rejectionReason ?? null,
        evidence: toEvidence(c) as unknown as object,
        playbookVersion: versionByKey.get(c.setupKey) ?? 1,
        rank: c.rank ?? null,
      },
    });

    if (c.status === "ARMED" && c.levels && c.sizing) {
      const ticket = await prisma.ticket.create({
        data: {
          candidateId: candidate.id,
          entryLow: c.levels.entryLow,
          entryHigh: c.levels.entryHigh,
          triggerCondition: c.levels.triggerCondition,
          stopPrice: c.levels.stopPrice,
          target1Price: c.levels.target1Price,
          target2Price: c.levels.target2Price,
          maxEntryPrice: c.levels.maxEntryPrice,
          positionSize: c.sizing.positionSize,
          sizeUnit: c.sizing.sizeUnit,
          maxDollarLoss: c.sizing.maxDollarLoss,
          runnerPlan: c.levels.runnerPlan,
          alertExpiresAt: c.levels.alertExpiresAt,
        },
      });

      // Generate the immutable explanation NOW (before the ticket is sent).
      const evidence = buildExplanationEvidence(c);
      await generateExplanation(ticket.id, evidence, llm, async (log) => {
        await prisma.llmCallLog.create({
          data: {
            purpose: log.purpose,
            relatedCandidateId: candidate.id,
            model: log.model,
            promptVersion: log.promptVersion,
            requestSummary: log.request as object,
            responseSummary: log.response as object,
            latencyMs: log.latencyMs,
            inputTokens: log.inputTokens ?? null,
            outputTokens: log.outputTokens ?? null,
          },
        });
      });

      armedTicketIds.push(ticket.id);
    }
  }

  return { tradingDayId: day.id, armedTicketIds };
}

/** Build the evidence object the explanation LLM prompt is composed from. */
function buildExplanationEvidence(c: PipelineCandidate): ExplanationEvidence {
  const setupName =
    c.setupKey === "SETUP_1_CATALYST_CONTINUATION"
      ? "Catalyst Continuation Pullback"
      : "Index Trend Pullback";
  return {
    symbol: c.symbol,
    setupName,
    direction: c.direction,
    checklist: c.checks.map((k) => ({ label: k.label, detail: k.detail, passed: k.passed })),
    levels: {
      entryLow: c.levels!.entryLow,
      entryHigh: c.levels!.entryHigh,
      stop: c.levels!.stopPrice,
      target1: c.levels!.target1Price,
      target2: c.levels!.target2Price,
      maxEntry: c.levels!.maxEntryPrice,
      rewardRisk: c.levels!.rewardRisk,
      positionSize: c.sizing!.positionSize,
      sizeUnit: c.sizing!.sizeUnit,
      maxDollarLoss: c.sizing!.maxDollarLoss,
    },
    invalidationHints: c.checks
      .filter((k) => k.required)
      .map((k) => `Loss of: ${k.label}`),
  };
}
