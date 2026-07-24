/**
 * Single CLI entrypoint. Invoked as `npm run desk -- <subcommand> [flags]`.
 * A Routine-driven session runs these commands per the RUNBOOK; they are also the
 * primary way to exercise the system locally.
 */
import { prisma } from "@/server/db/client";
import { morningScan } from "@/cli/commands/morning-scan";
import { sendTickets } from "@/cli/commands/send-tickets";
import { expireTickets } from "@/cli/commands/expire-tickets";
import { status } from "@/cli/commands/status";
import { runReviews } from "@/cli/commands/run-reviews";
import { updateEquity } from "@/cli/commands/update-equity";
import { resolveHalt } from "@/cli/commands/resolve-halt";
import { logExit } from "@/cli/commands/log-exit";
import { poll } from "@/cli/commands/poll";

const COMMANDS: Record<string, (args: string[]) => Promise<number>> = {
  "morning-scan": morningScan,
  "send-tickets": () => sendTickets(),
  "expire-tickets": () => expireTickets(),
  status: () => status(),
  "run-reviews": () => runReviews(),
  "update-equity": updateEquity,
  "resolve-halt": resolveHalt,
  "log-exit": logExit,
  poll: () => poll(),
};

async function main() {
  const [, , sub, ...args] = process.argv;
  if (!sub || sub === "help" || sub === "--help") {
    console.log("Apex Morning Trading Desk CLI\n\nCommands:");
    for (const name of Object.keys(COMMANDS)) console.log(`  ${name}`);
    console.log("\nExamples:");
    console.log("  npm run desk -- morning-scan --scenario goldenSetup1");
    console.log("  npm run desk -- send-tickets");
    console.log("  npm run desk -- status");
    return 0;
  }
  const cmd = COMMANDS[sub];
  if (!cmd) {
    console.error(`Unknown command: ${sub}. Run 'help' for the list.`);
    return 64;
  }
  return cmd(args);
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code ?? 0);
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
