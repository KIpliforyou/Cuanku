import { BUDGET_ALERT_THRESHOLDS, type BudgetAlertThreshold } from "./models";

export function getBudgetAlertLevel(spent: number, budgetAmount: number): BudgetAlertThreshold | null {
  if (!Number.isSafeInteger(spent) || !Number.isSafeInteger(budgetAmount) || budgetAmount <= 0) {
    return null;
  }
  const spentPercent = BigInt(spent) * 100n;
  const amount = BigInt(budgetAmount);
  if (spentPercent >= amount * 100n) return 100;
  if (spentPercent >= amount * 80n) return 80;
  return null;
}

export function getCrossedBudgetThresholds(
  previousSpent: number,
  nextSpent: number,
  budgetAmount: number,
  enabled: BudgetAlertThreshold[] = [...BUDGET_ALERT_THRESHOLDS],
): BudgetAlertThreshold[] {
  if (
    !Number.isSafeInteger(previousSpent) ||
    !Number.isSafeInteger(nextSpent) ||
    !Number.isSafeInteger(budgetAmount) ||
    budgetAmount <= 0
  ) return [];

  const previous = BigInt(previousSpent) * 100n;
  const next = BigInt(nextSpent) * 100n;
  const amount = BigInt(budgetAmount);
  return BUDGET_ALERT_THRESHOLDS.filter((threshold) =>
    enabled.includes(threshold) &&
    previous < amount * BigInt(threshold) &&
    next >= amount * BigInt(threshold),
  );
}
