import { describe, expect, it } from "vitest";
import {
  convertAmount,
  getTokyoDateString,
  parseRateInput,
  rateFromScaled,
} from "./exchange-rate";

describe("exchange rate precision", () => {
  it("parses rates as four-decimal fixed-point integers", () => {
    expect(parseRateInput("112.3456")).toBe(1_123_456);
    expect(parseRateInput("112")).toBe(1_120_000);
    expect(parseRateInput("0.0001")).toBe(1);
    expect(parseRateInput("0")).toBeNull();
    expect(parseRateInput("1.12345")).toBeNull();
    expect(rateFromScaled(1_123_456)).toBe(112.3456);
  });

  it("converts in both directions with integer rounding", () => {
    expect(convertAmount(100, "JPY", "IDR", 1_123_456)).toBe(11_235);
    expect(convertAmount(11_235, "IDR", "JPY", 1_123_456)).toBe(100);
    expect(convertAmount(123, "JPY", "JPY", 1_123_456)).toBe(123);
    expect(convertAmount(-100, "JPY", "IDR", 1_123_456)).toBe(-11_235);
  });

  it("uses the Tokyo calendar date around UTC day boundaries", () => {
    expect(getTokyoDateString(new Date("2026-11-27T14:59:59.000Z"))).toBe("2026-11-27");
    expect(getTokyoDateString(new Date("2026-11-27T15:00:00.000Z"))).toBe("2026-11-28");
  });
});
