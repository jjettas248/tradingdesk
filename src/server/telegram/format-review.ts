import type { ReviewSections } from "@/server/llm/types";

/** Render the post-trade review into a Telegram message. */
export function formatReview(
  symbol: string,
  setupName: string,
  realizedR: number | null,
  s: ReviewSections
): string {
  const rLine = realizedR === null ? "" : `Result: ${realizedR >= 0 ? "+" : ""}${realizedR.toFixed(2)}R`;
  const lines = [
    `📗 Trade review — ${symbol}`,
    `Setup: ${setupName}`,
    rLine,
    ``,
    `What happened:`,
    s.whatHappened,
    ``,
    `Thesis:`,
    s.thesisAssessment,
    ``,
    `Execution:`,
    s.executionAssessment,
    ``,
    `Exit:`,
    s.exitAssessment,
    ``,
    `Lesson:`,
    s.patternLesson,
  ].filter((l) => l !== "" || true); // keep blank separators
  return lines.filter((l, i) => !(l === "" && lines[i - 1] === "")).join("\n");
}
