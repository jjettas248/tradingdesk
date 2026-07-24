/**
 * Pure position-exception classifier used by the fast loop. Separated out so it
 * can be unit-tested without a database or provider. Returns the exception type a
 * given price crosses, or null. STOP takes priority, then TARGET2, then TARGET1.
 */
export type ExceptionType = "STOP" | "TARGET1" | "TARGET2";

export function classifyException(
  direction: "LONG" | "SHORT",
  price: number,
  stopPrice: number,
  target1: number,
  target2: number
): ExceptionType | null {
  const long = direction === "LONG";
  if (long ? price <= stopPrice : price >= stopPrice) return "STOP";
  if (long ? price >= target2 : price <= target2) return "TARGET2";
  if (long ? price >= target1 : price <= target1) return "TARGET1";
  return null;
}
