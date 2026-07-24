import { prisma } from "@/server/db/client";

/**
 * The ONLY mutation ever applied to an Explanation after insert: flip revealedAt
 * from null to now, exactly once. The `revealedAt: null` guard makes it
 * idempotent (a duplicate Telegram callback can't move the timestamp) and ensures
 * the content columns are never touched. This narrow function is the entire
 * write surface for the explanation-reveal invariant.
 *
 * Returns the revealed explanation (with its sections) so the caller can send it,
 * or null if the ticket has no explanation.
 */
export async function revealExplanation(ticketId: string): Promise<{
  id: string;
  sections: unknown;
  alreadyRevealed: boolean;
} | null> {
  const explanation = await prisma.explanation.findUnique({ where: { ticketId } });
  if (!explanation) return null;

  if (explanation.revealedAt) {
    return { id: explanation.id, sections: explanation.sections, alreadyRevealed: true };
  }

  // Guarded update — only flips if still unrevealed.
  await prisma.explanation.updateMany({
    where: { id: explanation.id, revealedAt: null },
    data: { revealedAt: new Date() },
  });

  return { id: explanation.id, sections: explanation.sections, alreadyRevealed: false };
}
