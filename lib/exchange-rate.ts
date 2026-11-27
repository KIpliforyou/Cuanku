import type { Currency } from "./domain";

export const EXCHANGE_RATE_SCALE = 10_000;

export function parseRateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const scaled = Number(whole) * EXCHANGE_RATE_SCALE + Number(fraction.padEnd(4, "0"));
  return Number.isSafeInteger(scaled) && scaled > 0 ? scaled : null;
}

export function rateFromScaled(rateScaled: number): number {
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) {
    throw new Error("Exchange rate must be a positive scaled integer");
  }
  return rateScaled / EXCHANGE_RATE_SCALE;
}

function roundRatio(numerator: bigint, denominator: bigint): bigint {
  const zero = BigInt(0);
  const two = BigInt(2);
  const negative = numerator < zero;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / two) / denominator;
  return negative ? -rounded : rounded;
}

export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rateScaled: number,
): number {
  if (!Number.isSafeInteger(amount)) throw new Error("Amount must be a safe integer");
  if (!Number.isSafeInteger(rateScaled) || rateScaled <= 0) {
    throw new Error("Exchange rate must be a positive scaled integer");
  }
  if (from === to) return amount;

  const amountValue = BigInt(amount);
  const rateValue = BigInt(rateScaled);
  const converted = from === "JPY"
    ? roundRatio(amountValue * rateValue, BigInt(EXCHANGE_RATE_SCALE))
    : roundRatio(amountValue * BigInt(EXCHANGE_RATE_SCALE), rateValue);
  const result = Number(converted);
  if (!Number.isSafeInteger(result)) throw new Error("Converted amount exceeds the safe integer range");
  return result;
}

export function getTokyoDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
