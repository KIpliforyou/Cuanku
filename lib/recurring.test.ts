import { describe, expect, it } from "vitest";
import { getDueRecurringDates } from "./recurring";
import type { RecurringRule } from "./models";

const rule = (values: Partial<RecurringRule>): RecurringRule => ({
  id: "rule-1",
  walletId: "wallet-1",
  type: "expense",
  amount: 100,
  categoryId: "food",
  frequency: "monthly",
  startDate: "2026-01-31",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...values,
});

describe("recurring schedule dates", () => {
  it("clamps monthly day 31 to the last day of short and leap-year months", () => {
    expect(getDueRecurringDates(rule({}), "2026-03-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(getDueRecurringDates(rule({ startDate: "2024-01-31" }), "2024-03-31")).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
    ]);
  });

  it("keeps yearly dates stable across leap years and year boundaries", () => {
    expect(getDueRecurringDates(
      rule({ frequency: "yearly", startDate: "2024-02-29" }),
      "2027-02-28",
    )).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28"]);
  });

  it("generates weekly dates without duplicates after the last processed occurrence", () => {
    expect(getDueRecurringDates(
      rule({ frequency: "weekly", startDate: "2026-12-25", lastGeneratedDate: "2026-12-25" }),
      "2027-01-08",
    )).toEqual(["2027-01-01", "2027-01-08"]);
  });
});
