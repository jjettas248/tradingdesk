/**
 * Pure ticket formatter: a Ticket-like view -> Telegram message text + inline
 * keyboard. Kept free of Prisma types so it's trivially unit-testable. The whole
 * point is a ticket the user can read and act on in ~15 seconds — terse, no essay.
 */

export interface TicketView {
  ticketId: string;
  symbol: string;
  direction: string; // LONG | SHORT
  setupName: string;
  entryLow: number;
  entryHigh: number;
  triggerCondition: string;
  stopPrice: number;
  target1Price: number;
  target2Price: number;
  maxEntryPrice: number;
  positionSize: number;
  sizeUnit: string; // SHARES | CONTRACTS
  maxDollarLoss: number;
  runnerPlan: string;
  orderTypeNote: string;
  alertExpiresAt: Date;
  timeZoneLabel?: string; // e.g. "ET"
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface FormattedTicket {
  text: string;
  inlineKeyboard: InlineButton[][];
}

/** Compact callback_data: "d:<ticketId>:<code>" — must stay < 64 bytes. */
export function decisionCallbackData(ticketId: string, code: "E" | "S" | "T" | "R"): string {
  const data = `d:${ticketId}:${code}`;
  if (Buffer.byteLength(data, "utf8") >= 64) {
    // Telegram hard-caps callback_data at 64 bytes; a cuid ticketId leaves plenty
    // of room, but guard so a future id scheme can't silently break sends.
    throw new Error(`callback_data too long (${data.length} bytes): ${data}`);
  }
  return data;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtExpiry(at: Date, tz: string): string {
  const t = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  return `${t} ${tz}`;
}

export function formatTicket(t: TicketView): FormattedTicket {
  const tz = t.timeZoneLabel ?? "ET";
  const unit = t.sizeUnit === "CONTRACTS" ? "contracts" : "shares";
  const lines = [
    `🎯 ENTRY READY — ${t.symbol} ${t.direction}`,
    `Setup: ${t.setupName}`,
    ``,
    `Entry: ${money(t.entryLow)}–${money(t.entryHigh)}`,
    `Trigger: ${t.triggerCondition}`,
    `Stop: ${money(t.stopPrice)}`,
    `Target 1: ${money(t.target1Price)}`,
    `Target 2: ${money(t.target2Price)}`,
    `Max entry: ${money(t.maxEntryPrice)}`,
    `Size: ${t.positionSize} ${unit}`,
    `Max loss: ${money(t.maxDollarLoss)}`,
    `Runner: ${t.runnerPlan}`,
    `Expires: ${fmtExpiry(t.alertExpiresAt, tz)}`,
    `Order: ${t.orderTypeNote}`,
  ];

  const inlineKeyboard: InlineButton[][] = [
    [
      { text: "✅ Entered", callback_data: decisionCallbackData(t.ticketId, "E") },
      { text: "⏭️ Skipped", callback_data: decisionCallbackData(t.ticketId, "S") },
    ],
    [
      { text: "⌛ Too Late", callback_data: decisionCallbackData(t.ticketId, "T") },
      { text: "🚫 Reject", callback_data: decisionCallbackData(t.ticketId, "R") },
    ],
  ];

  return { text: lines.join("\n"), inlineKeyboard };
}

const CODE_TO_DECISION: Record<string, "ENTERED" | "SKIPPED" | "TOO_LATE" | "REJECTED"> = {
  E: "ENTERED",
  S: "SKIPPED",
  T: "TOO_LATE",
  R: "REJECTED",
};

/** Parse a callback_data string back into {ticketId, decisionType}. */
export function parseDecisionCallback(
  data: string
): { ticketId: string; decisionType: "ENTERED" | "SKIPPED" | "TOO_LATE" | "REJECTED" } | null {
  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "d") return null;
  const decisionType = CODE_TO_DECISION[parts[2]];
  if (!decisionType) return null;
  return { ticketId: parts[1], decisionType };
}
