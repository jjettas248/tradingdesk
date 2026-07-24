import { getEnv } from "@/server/config/env";

/**
 * Telegram lets you set a secret token when registering a webhook; it then sends
 * that token back in the X-Telegram-Bot-Api-Secret-Token header on every update.
 * We verify it so the public webhook route only acts on genuine Telegram traffic.
 *
 * If TELEGRAM_WEBHOOK_SECRET is unset (pure local dev), verification is skipped
 * and this returns true — but you should always set it before deploying.
 */
export function verifyTelegramSignature(headerToken: string | null): boolean {
  const secret = getEnv().TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true; // dev convenience; set the secret in any real deployment
  return headerToken === secret;
}
