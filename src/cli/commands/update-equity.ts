import { prisma } from "@/server/db/client";

/** Record a new account equity value (drives the drawdown throttle). */
export async function updateEquity(args: string[]): Promise<number> {
  const value = Number(args[0]);
  const note = args.slice(1).join(" ") || undefined;
  if (!Number.isFinite(value) || value <= 0) {
    console.error("Usage: update-equity <value> [note]");
    return 64;
  }
  await prisma.equitySnapshot.create({
    data: { equityValue: value, source: "MANUAL", note },
  });
  console.log(`Recorded equity $${value.toFixed(2)}${note ? ` (${note})` : ""}.`);
  return 0;
}
