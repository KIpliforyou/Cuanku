import { describe, expect, it } from "vitest";
import { getBudgetAlertLevel, getCrossedBudgetThresholds } from "./budget-alerts";

describe("budget alert thresholds", () => {
  it("detects exact 80% and 100% boundaries and overages", () => {
    expect(getBudgetAlertLevel(0, 0)).toBeNull();
    expect(getBudgetAlertLevel(79, 100)).toBeNull();
    expect(getBudgetAlertLevel(80, 100)).toBe(80);
    expect(getBudgetAlertLevel(99, 100)).toBe(80);
    expect(getBudgetAlertLevel(100, 100)).toBe(100);
    expect(getBudgetAlertLevel(125, 100)).toBe(100);
  });

  it("emits only thresholds crossed by an expense change", () => {
    expect(getCrossedBudgetThresholds(79, 80, 100)).toEqual([80]);
    expect(getCrossedBudgetThresholds(80, 101, 100)).toEqual([100]);
    expect(getCrossedBudgetThresholds(75, 110, 100)).toEqual([80, 100]);
    expect(getCrossedBudgetThresholds(0, 1, 0)).toEqual([]);
  });
});
