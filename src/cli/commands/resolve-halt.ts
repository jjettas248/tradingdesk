import { prisma } from "@/server/db/client";

/**
 * Clear an active risk halt. Halts NEVER auto-clear — a human runs this after
 * investigating the drawdown. Requires a note documenting the resolution.
 */
export async function resolveHalt(args: string[]): Promise<number> {
  const note = args.join(" ").trim();
  if (!note) {
    console.error("Usage: resolve-halt <note describing the investigation/resolution>");
    return 64;
  }
  const halt = await prisma.riskHaltState.findFirst({ where: { active: true } });
  if (!halt) {
    console.log("No active halt.");
    return 0;
  }
  await prisma.riskHaltState.update({
    where: { id: halt.id },
    data: { active: false, resolvedAt: new Date(), resolvedNote: note },
  });
  console.log("Halt resolved. Trading may resume on the next scan.");
  return 0;
}
