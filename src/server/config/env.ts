import { z } from "zod";

/**
 * Single source of truth for the environment contract. Everything reads config
 * from here — never `process.env` directly — so the shape is validated once and
 * typed everywhere.
 *
 * Parsing is lazy (on first `getEnv()` call) rather than at module load, so that
 * importing a pure function for a unit test doesn't require a fully-populated
 * environment.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./prisma/dev.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_MATERIALITY: z.string().default("claude-sonnet-5"),
  ANTHROPIC_MODEL_PROSE: z.string().default("claude-sonnet-5"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  POLL_INTERVAL_MINUTES: z.coerce.number().positive().default(3),

  DASHBOARD_BASIC_AUTH_USER: z.string().optional(),
  DASHBOARD_BASIC_AUTH_PASS: z.string().optional(),

  MARKET_DATA_PROVIDER: z.enum(["mock", "alpaca"]).default("mock"),

  STARTING_EQUITY: z.coerce.number().positive().default(10000),
  KELLY_LAMBDA: z.coerce.number().positive().max(1).default(0.25),
  KELLY_HARD_CAP_PCT: z.coerce.number().positive().max(1).default(0.02),
  MAX_DAILY_TICKETS: z.coerce.number().int().positive().default(3),
  MAX_DAILY_ENTRIES: z.coerce.number().int().positive().default(2),
  MIN_ENTRY_WINDOW_MINUTES: z.coerce.number().positive().default(5),

  MOCK_SEED: z.coerce.number().int().default(42),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — force a re-parse (e.g. after mutating process.env in a test). */
export function resetEnvCache(): void {
  cached = null;
}

/** True when no real Telegram bot token is configured — messages are logged. */
export function isTelegramDryRun(): boolean {
  return !getEnv().TELEGRAM_BOT_TOKEN;
}

/** True when no Anthropic key is configured — LLM calls must be stubbed. */
export function isLlmConfigured(): boolean {
  return !!getEnv().ANTHROPIC_API_KEY;
}
