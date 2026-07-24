import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramSignature } from "@/server/telegram/verify-signature";
import { handleTelegramUpdate, type TelegramUpdate } from "@/server/telegram/webhook-handler";

// Telegram calls this. Thin wrapper: verify the secret token, parse, delegate.
// All logic (and the guarantee that no LLM runs here) lives in the handler.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyTelegramSignature(token)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    // Always 200 to Telegram so it doesn't hammer retries; log for debugging.
    console.error("webhook handler error:", err);
  }
  return NextResponse.json({ ok: true });
}
