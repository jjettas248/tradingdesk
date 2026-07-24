import type { ExplanationSections } from "@/server/llm/types";

/** Render the revealed pre-trade explanation into a Telegram message. */
export function formatExplanation(symbol: string, setupName: string, s: ExplanationSections): string {
  const lines = [
    `📘 Why this trade qualified — ${symbol}`,
    `Setup: ${setupName}`,
    ``,
    `What the desk recognized:`,
    ...s.evidenceChecklist.map((c) => `• ${c}`),
    ``,
    `Why this entry:`,
    s.whyThisEntry,
    ``,
    `What would disprove it:`,
    ...s.invalidation.map((c) => `• ${c}`),
    ``,
    `Pattern lesson:`,
    s.patternLesson,
    ``,
    `Ask yourself next time:`,
    ...s.reflectionPrompts.map((c) => `• ${c}`),
  ];
  return lines.join("\n");
}
