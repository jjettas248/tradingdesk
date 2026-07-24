import { runPoll } from "@/server/monitoring/poll";

/** Run one fast-loop poll cycle (also exposed via the /api/cron/poll route). */
export async function poll(): Promise<number> {
  const r = await runPoll();
  console.log(
    `Poll: ingested ${r.ingestedEvents} event(s), ${r.exceptionsAlerted} exception alert(s), ${r.flagged} flagged, ${r.llmCalls} LLM calls${r.skippedOutsideHours ? " (outside market hours — ingest/flag skipped)" : ""}.`
  );
  return 0;
}
