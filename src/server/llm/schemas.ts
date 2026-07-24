import { z } from "zod";

/**
 * Zod schemas for validating LLM structured output on our side, plus the
 * equivalent JSON Schemas handed to the Anthropic API via output_config.format.
 * The API's json_schema mode doesn't support string length / numeric bound
 * constraints, so the JSON Schemas below stay to types + enums + required, and
 * any finer validation happens in Zod after parsing.
 */

export const MaterialityZ = z.object({
  isMaterial: z.boolean(),
  confidence: z.number(),
  reasoning: z.string(),
  category: z.string(),
});

export const ExplanationZ = z.object({
  evidenceChecklist: z.array(z.string()),
  whyThisEntry: z.string(),
  invalidation: z.array(z.string()),
  patternLesson: z.string(),
  reflectionPrompts: z.array(z.string()),
});

export const ReviewZ = z.object({
  whatHappened: z.string(),
  thesisAssessment: z.string(),
  executionAssessment: z.string(),
  exitAssessment: z.string(),
  patternLesson: z.string(),
});

export const MATERIALITY_JSON_SCHEMA = {
  type: "object",
  properties: {
    isMaterial: { type: "boolean" },
    confidence: { type: "number" },
    reasoning: { type: "string" },
    category: {
      type: "string",
      enum: ["EARNINGS", "GUIDANCE", "MA", "REGULATORY", "PRODUCT", "MACRO", "OTHER"],
    },
  },
  required: ["isMaterial", "confidence", "reasoning", "category"],
  additionalProperties: false,
} as const;

export const EXPLANATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    evidenceChecklist: { type: "array", items: { type: "string" } },
    whyThisEntry: { type: "string" },
    invalidation: { type: "array", items: { type: "string" } },
    patternLesson: { type: "string" },
    reflectionPrompts: { type: "array", items: { type: "string" } },
  },
  required: [
    "evidenceChecklist",
    "whyThisEntry",
    "invalidation",
    "patternLesson",
    "reflectionPrompts",
  ],
  additionalProperties: false,
} as const;

export const REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    whatHappened: { type: "string" },
    thesisAssessment: { type: "string" },
    executionAssessment: { type: "string" },
    exitAssessment: { type: "string" },
    patternLesson: { type: "string" },
  },
  required: [
    "whatHappened",
    "thesisAssessment",
    "executionAssessment",
    "exitAssessment",
    "patternLesson",
  ],
  additionalProperties: false,
} as const;
