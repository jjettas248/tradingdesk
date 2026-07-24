import { prisma } from "@/server/db/client";
import type { LlmClient, ExplanationEvidence } from "@/server/llm/types";
import { contentHash } from "@/server/explanation/hash";
import { PROMPT_VERSIONS } from "@/server/config/constants";

/**
 * Generate and persist the immutable pre-trade explanation. Called during
 * morning-scan, BEFORE the ticket is sent. The prose is composed by the LLM from
 * the structured evidence only (never from any price outcome), hashed together
 * with its creation timestamp, and INSERTed once. It is never updated afterward
 * except the single revealedAt flip in reveal.ts.
 *
 * Returns the created explanation id. If one already exists for the ticket
 * (idempotent re-run), returns the existing id without regenerating.
 */
export async function generateExplanation(
  ticketId: string,
  evidence: ExplanationEvidence,
  llm: LlmClient,
  onLlmCall?: (log: {
    purpose: string;
    relatedCandidateId?: string;
    model: string;
    promptVersion: string;
    request: unknown;
    response: unknown;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  }) => Promise<void> | void
): Promise<string> {
  const existing = await prisma.explanation.findUnique({ where: { ticketId } });
  if (existing) return existing.id;

  const result = await llm.composeExplanation(evidence);

  await onLlmCall?.({
    purpose: "PRETRADE_EXPLANATION",
    model: result.usage.model,
    promptVersion: PROMPT_VERSIONS.PRETRADE_EXPLANATION,
    request: { symbol: evidence.symbol, setup: evidence.setupName },
    response: result.data,
    latencyMs: result.usage.latencyMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  // createdAt is fixed here and folded into the hash, so the "generated before"
  // timestamp is itself tamper-evident.
  const createdAt = new Date();
  const hash = contentHash({
    evidenceSnapshot: evidence,
    sections: result.data,
    model: result.usage.model,
    promptVersion: PROMPT_VERSIONS.PRETRADE_EXPLANATION,
    createdAt,
  });

  const created = await prisma.explanation.create({
    data: {
      ticketId,
      evidenceSnapshot: evidence as unknown as object,
      sections: result.data as unknown as object,
      model: result.usage.model,
      promptVersion: PROMPT_VERSIONS.PRETRADE_EXPLANATION,
      contentHash: hash,
      createdAt,
      revealedAt: null,
    },
  });
  return created.id;
}
