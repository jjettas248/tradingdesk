import { prisma } from "@/server/db/client";

/**
 * Idempotent sweep: mark ARMED/SENT candidates whose ticket passed its
 * alertExpiresAt and got no decision as EXPIRED, so the journal doesn't show
 * them stuck forever. Run opportunistically at the top of each desk cycle. This
 * is the whole "alert expiration" mechanism — no timers or long-running process
 * required (a late tap is captured by the TOO_LATE decision type instead).
 */
export async function expireTickets(): Promise<number> {
  const now = new Date();
  const stale = await prisma.ticket.findMany({
    where: {
      alertExpiresAt: { lt: now },
      decision: null,
      candidate: { status: { in: ["ARMED", "SENT"] } },
    },
    include: { candidate: true },
  });

  for (const t of stale) {
    await prisma.candidate.update({ where: { id: t.candidateId }, data: { status: "EXPIRED" } });
  }

  console.log(`Expired ${stale.length} unaddressed ticket(s).`);
  return 0;
}
