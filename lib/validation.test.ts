import { describe, expect, it } from "vitest";
import { validateBackup } from "./validation";

const backup = {
  schemaVersion: 1,
  exportedAt: "2026-11-27T00:00:00.000Z",
  app: "Cuanku",
  wallets: [{
    id: "wallet-1",
    name: "Dompet",
    currency: "JPY",
    openingBalance: 1000,
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
  }],
  transactions: [{
    id: "transaction-1",
    walletId: "wallet-1",
    type: "expense",
    amount: 100,
    categoryId: "expense-food",
    date: "2026-11-27T12:00:00.000Z",
    createdAt: "2026-11-27T12:00:00.000Z",
    updatedAt: "2026-11-27T12:00:00.000Z",
  }],
  categories: [{ id: "expense-food", name: "Makan", type: "expense" }],
};

describe("backup validation", () => {
  it("accepts a valid backup", () => {
    expect(validateBackup(backup)).toMatchObject(backup);
    expect(validateBackup(backup).budgets).toEqual([]);
  });

  it("accepts older categories without icons and rejects unknown icons", () => {
    expect(validateBackup(backup).categories[0]).not.toHaveProperty("icon");
    const invalid = {
      ...backup,
      categories: [{ ...backup.categories[0], icon: "unknown-icon" }],
    };

    expect(() => validateBackup(invalid)).toThrow();
  });

  it("rejects orphaned transactions without changing input", () => {
    const invalid = {
      ...backup,
      transactions: [{ ...backup.transactions[0], walletId: "missing-wallet" }],
    };

    expect(() => validateBackup(invalid)).toThrow(/wallet that does not exist/i);
    expect(invalid.transactions[0].walletId).toBe("missing-wallet");
  });

  it("rejects transactions whose category has the wrong type", () => {
    const invalid = {
      ...backup,
      categories: [{ id: "expense-food", name: "Makan", type: "income" }],
    };

    expect(() => validateBackup(invalid)).toThrow(/category does not match/i);
  });

  it("rejects duplicate category IDs", () => {
    const invalid = {
      ...backup,
      categories: [
        { id: "expense-food", name: "Makan", type: "expense" },
        { id: "expense-food", name: "Duplikat", type: "expense" },
      ],
    };

    expect(() => validateBackup(invalid)).toThrow(/duplicate category IDs/i);
  });

  it("accepts a monthly budget linked to a wallet and expense category", () => {
    const valid = {
      ...backup,
      budgets: [{
        id: "budget-1",
        walletId: "wallet-1",
        categoryId: "expense-food",
        month: "2026-11",
        amount: 5000,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      }],
    };

    expect(validateBackup(valid).budgets).toEqual(valid.budgets);
  });

  it("rejects a budget linked to a missing wallet", () => {
    const invalid = {
      ...backup,
      budgets: [{
        id: "budget-1",
        walletId: "missing-wallet",
        categoryId: "expense-food",
        month: "2026-11",
        amount: 5000,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      }],
    };

    expect(() => validateBackup(invalid)).toThrow(/budget refers to a wallet/i);
  });

  it("rejects budgets for income categories and duplicate monthly categories", () => {
    const budget = {
      id: "budget-1",
      walletId: "wallet-1",
      categoryId: "expense-food",
      month: "2026-11",
      amount: 5000,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    const incomeCategoryBackup = {
      ...backup,
      categories: [{ id: "expense-food", name: "Gaji", type: "income" }],
      transactions: [],
      budgets: [budget],
    };
    const duplicateBudgetBackup = {
      ...backup,
      transactions: [],
      budgets: [budget, { ...budget, id: "budget-2" }],
    };

    expect(() => validateBackup(incomeCategoryBackup)).toThrow(/expense category/i);
    expect(() => validateBackup(duplicateBudgetBackup)).toThrow(/duplicate budgets/i);
  });
});
