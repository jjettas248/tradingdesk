import { TIMEZONE } from "@/server/config/constants";

/**
 * Eastern-Time helpers. The desk operates on ET regardless of where the server
 * runs, so all "what trading day is it / is the market open" logic goes through
 * here. Uses the built-in Intl API (DST-aware) rather than a date library.
 */

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour12: false,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** ET calendar date as "YYYY-MM-DD" — the stable key for a TradingDay. */
export function etDateKey(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return dateKeyFormatter.format(at);
}

interface EtParts {
  weekday: string; // "Mon".."Sun"
  hour: number; // 0-23 ET
  minute: number; // 0-59
}

export function etParts(at: Date = new Date()): EtParts {
  const parts = partsFormatter.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  // Intl can emit "24" for midnight in some environments; normalize.
  if (hour === 24) hour = 0;
  return {
    weekday: get("weekday"),
    hour,
    minute: parseInt(get("minute"), 10),
  };
}

/** Minutes since ET midnight — handy for market-hours comparisons. */
export function etMinutesOfDay(at: Date = new Date()): number {
  const { hour, minute } = etParts(at);
  return hour * 60 + minute;
}

const WEEKENDS = new Set(["Sat", "Sun"]);

export function isWeekdayET(at: Date = new Date()): boolean {
  return !WEEKENDS.has(etParts(at).weekday);
}

const MARKET_OPEN_MIN = 9 * 60 + 30; // 09:30 ET
const MARKET_CLOSE_MIN = 16 * 60; // 16:00 ET

/**
 * Regular-session market hours (does NOT account for holidays — the mock
 * universe doesn't model them, and for a decision-support tool a holiday simply
 * yields no candidates rather than anything unsafe).
 */
export function isMarketHoursET(at: Date = new Date()): boolean {
  if (!isWeekdayET(at)) return false;
  const m = etMinutesOfDay(at);
  return m >= MARKET_OPEN_MIN && m < MARKET_CLOSE_MIN;
}

/** Pre-market through close, used to decide whether the fast loop should poll. */
export function isExtendedHoursET(at: Date = new Date()): boolean {
  if (!isWeekdayET(at)) return false;
  const m = etMinutesOfDay(at);
  return m >= 4 * 60 && m < MARKET_CLOSE_MIN + 60; // 04:00–17:00 ET
}
