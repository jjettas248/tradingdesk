import { getEnv, isTelegramDryRun } from "@/server/config/env";
import type { InlineButton } from "@/server/telegram/format-ticket";

/**
 * Thin Telegram Bot API client. When TELEGRAM_BOT_TOKEN is unset it runs in
 * DRY-RUN mode: every outbound message is logged instead of sent, so the entire
 * system is exercisable end-to-end with no bot and no account. This is what lets
 * `send-tickets`, the fast loop's exception alerts, and the webhook follow-ups
 * all run locally in a test.
 */

export interface SendMessageResult {
  ok: boolean;
  dryRun: boolean;
  messageId?: number;
  chatId?: string;
}

function apiUrl(method: string): string {
  const token = getEnv().TELEGRAM_BOT_TOKEN;
  return `https://api.telegram.org/bot${token}/${method}`;
}

function inlineMarkup(keyboard?: InlineButton[][]): object | undefined {
  if (!keyboard) return undefined;
  return { inline_keyboard: keyboard };
}

export async function sendMessage(
  chatId: string,
  text: string,
  keyboard?: InlineButton[][]
): Promise<SendMessageResult> {
  if (isTelegramDryRun()) {
    console.log(`\n----- [telegram dry-run] → chat ${chatId} -----\n${text}`);
    if (keyboard) {
      const labels = keyboard.flat().map((b) => b.text).join("  |  ");
      console.log(`[buttons] ${labels}`);
    }
    console.log("-----------------------------------------------\n");
    return { ok: true, dryRun: true, chatId };
  }

  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: inlineMarkup(keyboard),
      disable_web_page_preview: true,
    }),
  });
  const json = (await res.json()) as { ok: boolean; result?: { message_id: number } };
  return {
    ok: json.ok,
    dryRun: false,
    messageId: json.result?.message_id,
    chatId,
  };
}

/** Answer a callback query (the little toast after a button tap). */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (isTelegramDryRun()) {
    console.log(`[telegram dry-run] answerCallbackQuery: ${text ?? "(ack)"}`);
    return;
  }
  await fetch(apiUrl("answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

/** Strip the inline keyboard off a message once a decision is recorded. */
export async function clearInlineKeyboard(chatId: string, messageId: number): Promise<void> {
  if (isTelegramDryRun()) {
    console.log(`[telegram dry-run] clearInlineKeyboard on message ${messageId}`);
    return;
  }
  await fetch(apiUrl("editMessageReplyMarkup"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  });
}
