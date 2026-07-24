import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/server/config/env";
import { runPoll } from "@/server/monitoring/poll";

/**
 * The continuous fast-loop endpoint. A real cron calls this every few minutes.
 * Deterministic and LLM-free (the guarantee lives in runPoll). Protected by a
 * shared secret in the Authorization header (Bearer <CRON_SECRET>) or the
 * x-cron-secret header — Vercel Cron sends the former automatically.
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return true; // local dev convenience; set CRON_SECRET before deploying
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await runPoll();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("poll error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
