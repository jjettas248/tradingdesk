import type { ScoreResult } from "@/server/scoring/trading-results-score";

/**
 * Trader-development score (0-100). Separate from trading results by design:
 * a controlled loss on a well-recognized, well-managed setup is good DEVELOPMENT
 * even if the trade lost money. First-pass heuristic; tunable weights.
 *
 * Components (each 0-100):
 *  - patience: entered within the planned window vs. chasing / letting it lapse
 *  - sizingDiscipline: actual size vs. suggested size (when self-reported)
 *  - ruleAdherence: respected the stop, acted within the entry window
 *  - setupRecognition: only meaningful at Stage 2+ (predict-before-reveal); null in
 *    Stage 1, where a weak engagement proxy stands in and is noted as such.
 */

export interface DevelopmentInput {
  patience: number;
  sizingDiscipline: number;
  ruleAdherence: number;
  setupRecognition: number | null; // null in Stage 1
}

const WEIGHTS = {
  patience: 0.3,
  sizingDiscipline: 0.25,
  ruleAdherence: 0.3,
  setupRecognition: 0.15,
};

export function traderDevelopmentScore(input: DevelopmentInput): ScoreResult {
  const parts: Array<[number, number]> = [
    [clamp(input.patience), WEIGHTS.patience],
    [clamp(input.sizingDiscipline), WEIGHTS.sizingDiscipline],
    [clamp(input.ruleAdherence), WEIGHTS.ruleAdherence],
  ];
  if (input.setupRecognition !== null) {
    parts.push([clamp(input.setupRecognition), WEIGHTS.setupRecognition]);
  }
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0);
  const score = parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight;

  return {
    score: clamp(score),
    components: {
      patience: round2(input.patience),
      sizingDiscipline: round2(input.sizingDiscipline),
      ruleAdherence: round2(input.ruleAdherence),
      setupRecognition: input.setupRecognition === null ? -1 : round2(input.setupRecognition),
    },
  };
}

function clamp(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, x));
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
