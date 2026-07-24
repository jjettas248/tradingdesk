import { prisma } from "@/server/db/client";
import { getLlmClient } from "@/server/llm";
import { contentHash } from "@/server/explanation/hash";
import { PROMPT_VERSIONS } from "@/server/config/constants";
import { formatReview } from "@/server/telegram/format-review";
import { sendMessage } from "@/server/telegram/client";
import { getEnv } from "@/server/config/env";
import { evaluateDrawdown } from "@/server/risk/drawdown-throttle";
import {
  tradingResultsScore,
  executionQuality,
} from "@/server/scoring/trading-results-score";
import { traderDevelopmentScore } from "@/server/scoring/trader-development-score";
import type { ReviewEvidence, ExplanationEvidence } from "@/server/llm/types";

/**
 * Generate the delayed post-trade review for every fully-closed position that
 * doesn't have one yet, persist it (insert-only + hash), update BOTH score
 * tracks with a ScoreSnapshot, and deliver the review over Telegram. This is the
 * only place review prose is generated — never in the webhook.
 */
export async function runReviews(): Promise<number> {
  const llm = getLlmClient();
  const closed = await prisma.position.findMany({
    where: { status: "CLOSED", review: null },
    include: {
      exits: true,
      ticket: { include: { candidate: { include: { setup: true } }, decision: true, explanation: true } },
    },
  });

  if (closed.length === 0) {
    console.log("No closed positions awaiting review.");
    return 0;
  }

  const chatId = (await resolveChatId()) ?? "dry-run";
  const cfg = await prisma.deskConfig.findUnique({ where: { id: "singleton" } });
  const stage = cfg?.currentStage ?? "FOLLOW_AND_STUDY";

  for (const p of closed) {
    const realizedR = p.exits.reduce((s, e) => s + (e.realizedR ?? 0) * (e.portionPercent / 100), 0);
    const mfe = maxOf(p.exits.map((e) => e.maxFavorableExcursion));
    const mae = minOf(p.exits.map((e) => e.maxAdverseExcursion));

    const originalChecklist =
      (p.ticket?.explanation?.evidenceSnapshot as unknown as ExplanationEvidence | undefined)?.checklist ??
      [];

    const evidence: ReviewEvidence = {
      symbol: p.symbol,
      setupName: p.ticket?.candidate.setup.name ?? p.setupKey,
      direction: p.direction,
      decisionType: p.ticket?.decision?.decisionType ?? "ENTERED",
      plannedEntryLow: p.plannedEntryLow,
      plannedEntryHigh: p.plannedEntryHigh,
      actualEntryPrice: p.actualEntryPrice,
      stop: p.stopPrice,
      target1: p.target1Price,
      target2: p.target2Price,
      exits: p.exits.map((e) => ({ portionPercent: e.portionPercent, price: e.exitPrice, reason: e.exitReason })),
      realizedR,
      maxFavorableExcursion: mfe,
      maxAdverseExcursion: mae,
      followedPlan: didFollowPlan(p),
      originalChecklist,
    };

    const result = await llm.composeReview(evidence);

    const createdAt = new Date();
    const hash = contentHash({
      evidenceSnapshot: evidence,
      sections: result.data,
      model: result.usage.model,
      promptVersion: PROMPT_VERSIONS.POSTTRADE_REVIEW,
      createdAt,
    });

    await prisma.postTradeReview.create({
      data: {
        positionId: p.id,
        sections: result.data as unknown as object,
        model: result.usage.model,
        promptVersion: PROMPT_VERSIONS.POSTTRADE_REVIEW,
        contentHash: hash,
        createdAt,
        deliveredAt: null,
      },
    });
    await prisma.llmCallLog.create({
      data: {
        purpose: "POSTTRADE_REVIEW",
        relatedPositionId: p.id,
        model: result.usage.model,
        promptVersion: PROMPT_VERSIONS.POSTTRADE_REVIEW,
        requestSummary: { symbol: p.symbol, realizedR } as object,
        responseSummary: result.data as object,
        latencyMs: result.usage.latencyMs,
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
      },
    });

    await writeScores(p, realizedR, stage);

    // Deliver the review.
    await sendMessage(chatId, formatReview(p.symbol, evidence.setupName, realizedR, result.data));
    await prisma.postTradeReview.updateMany({ where: { positionId: p.id }, data: { deliveredAt: new Date() } });

    console.log(`Reviewed #${p.shortCode} ${p.symbol}: ${realizedR >= 0 ? "+" : ""}${realizedR.toFixed(2)}R`);
  }

  console.log(`${closed.length} review(s) generated${getEnv().TELEGRAM_BOT_TOKEN ? "" : " (dry-run)"}.`);
  return 0;
}

/** Compute + persist both score-track snapshots for a closed trade. */
async function writeScores(
  p: {
    id: string;
    positionSize: number;
    actualEntryPrice: number | null;
    stopPrice: number;
    direction: string;
    ticket: { maxEntryPrice: number; positionSize: number } | null;
  },
  realizedR: number,
  stage: string
): Promise<void> {
  // Rolling expectancy over recent closed trades.
  const recent = await prisma.exit.findMany({ orderBy: { exitAt: "desc" }, take: 40 });
  const closedR = groupRealizedR(recent);

  const equity = await prisma.equitySnapshot.findMany({ orderBy: { asOf: "asc" } });
  const dd = evaluateDrawdown(equity.map((e) => e.equityValue));

  // Per-trade execution signals.
  const entry = p.actualEntryPrice ?? 0;
  const long = p.direction === "LONG";
  const chase = p.ticket?.maxEntryPrice ?? entry;
  const enteredPastChaseLimit = p.actualEntryPrice !== null && (long ? entry > chase : entry < chase);
  const perUnitRisk = Math.abs(entry - p.stopPrice) || 1;
  const slippageR = enteredPastChaseLimit ? Math.abs(entry - chase) / perUnitRisk : 0;
  const exitDeviated = realizedR < -1.3; // lost meaningfully more than the 1R stop implied
  const execQuality = executionQuality({ enteredPastChaseLimit, slippageR, exitDeviatedFromPlan: exitDeviated });

  const trading = tradingResultsScore({
    closedRMultiples: closedR,
    avgExecutionQuality: execQuality,
    currentDrawdownPercent: dd.drawdownPercent,
  });

  // Development components.
  const patience = enteredPastChaseLimit ? 55 : 90;
  const sizeRatio = p.ticket?.positionSize ? p.positionSize / p.ticket.positionSize : 1;
  const sizingDiscipline = 100 - Math.min(60, Math.abs(1 - sizeRatio) * 100);
  const ruleAdherence = realizedR < -1.5 ? 50 : 90; // blowing well past the stop = poor adherence
  const setupRecognition = stage === "FOLLOW_AND_STUDY" ? null : 70;
  const development = traderDevelopmentScore({ patience, sizingDiscipline, ruleAdherence, setupRecognition });

  await prisma.scoreSnapshot.create({
    data: { track: "TRADING_RESULTS", positionId: p.id, score: trading.score, components: trading.components as object },
  });
  await prisma.scoreSnapshot.create({
    data: { track: "TRADER_DEVELOPMENT", positionId: p.id, score: development.score, components: development.components as object },
  });
}

function groupRealizedR(exits: Array<{ positionId: string; realizedR: number | null; portionPercent: number }>): number[] {
  const byPos = new Map<string, number>();
  for (const e of exits) {
    byPos.set(e.positionId, (byPos.get(e.positionId) ?? 0) + (e.realizedR ?? 0) * (e.portionPercent / 100));
  }
  return [...byPos.values()];
}

function didFollowPlan(p: { exits: Array<{ exitReason: string }> }): boolean {
  return p.exits.every((e) => ["STOP", "TARGET1", "TARGET2", "EOD"].includes(e.exitReason));
}

function maxOf(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}
function minOf(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.min(...v) : null;
}

async function resolveChatId(): Promise<string | undefined> {
  const cfg = await prisma.deskConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.telegramChatId ?? getEnv().TELEGRAM_CHAT_ID ?? undefined;
}
