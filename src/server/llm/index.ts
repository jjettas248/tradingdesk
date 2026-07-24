import { isLlmConfigured } from "@/server/config/env";
import type { LlmClient } from "@/server/llm/types";
import { StubLlmClient } from "@/server/llm/stub-client";
import { AnthropicLlmClient } from "@/server/llm/anthropic-client";

/**
 * LLM client factory. Returns the real Anthropic client when a key is
 * configured, otherwise the deterministic stub so the whole system runs
 * end-to-end in dry-run/demo mode with no network calls.
 */
export function getLlmClient(): LlmClient {
  if (isLlmConfigured()) {
    return new AnthropicLlmClient();
  }
  return new StubLlmClient();
}
