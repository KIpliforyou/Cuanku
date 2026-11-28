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
  it("migrates a valid version 1 backup without losing transactions", () => {
    const migrated = validateBackup(backup);
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.transactions).toEqual(backup.transactions);
    expect(migrated.budgets).toEqual([]);
    expect(migrated.exchangeRateHistory).toEqual([]);
    expect(migrated.transfers).toEqual([]);
    expect(migrated.recurringRules).toEqual([]);
  });

  it("adds the default reminder interval when migrating legacy preferences", () => {
    const migrated = validateBackup({ ...backup, preferences: { theme: "dark" } });
    expect(migrated.preferences).toEqual({
      theme: "dark",
      backupReminderDays: 14,
      displayCurrency: "IDR",
      showEquivalentInReports: false,
    });
  });

  it("accepts older categories without icons and rejects unknown icons", () => {
    expect(validateBackup(backup).categories[0]).not.toHaveProperty("icon");
    const invalid = {
      ...backup,
      categories: [{ ...backup.categories[0], icon: "unknown-icon" }],
    };

    expect(() => validateBackup(invalid)).toThrow();
  });

  it("preserves current backup preferences and budgets", () => {
    const current = validateBackup({
      ...backup,
      schemaVersion: 8,
      budgets: [{
        id: "budget-1",
        walletId: "wallet-1",
        categoryId: "expense-food",
        month: "2026-11",
        amount: 5000,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      }],
      exchangeRateHistory: [],
      transfers: [],
      recurringRules: [],
      recurringDrafts: [],
      preferences: {
        theme: "dark",
        backupReminderDays: 30,
        displayCurrency: "JPY",
        showEquivalentInReports: true,
      },
    });

    expect(current.preferences).toEqual({
      theme: "dark",
      backupReminderDays: 30,
      displayCurrency: "JPY",
      showEquivalentInReports: true,
    });
    expect(current.budgets).toHaveLength(1);
  });

  it("migrates version 6 transfers to same-currency transfers", () => {
    const migrated = validateBackup({
      ...backup,
      schemaVersion: 6,
      budgets: [],
      exchangeRateHistory: [],
      transfers: [{
        id: "transfer-1",
        date: "2026-11-27",
        fromWalletId: "wallet-1",
        toWalletId: "wallet-3",
        fromAmount: 100,
        toAmount: 100,
        feeAmount: 0,
        createdAt: "2026-11-27T00:00:00.000Z",
        updatedAt: "2026-11-27T00:00:00.000Z",
      }, {
        id: "conversion-1",
        date: "2026-11-27",
        fromWalletId: "wallet-1",
        toWalletId: "wallet-2",
        fromAmount: 1000,
        toAmount: 150000,
        feeAmount: 0,
        rate: { date: "2026-11-27", rateScaled: 1_500_000, source: "manual" },
        createdAt: "2026-11-27T00:00:00.000Z",
        updatedAt: "2026-11-27T00:00:00.000Z",
      }],
      recurringRules: [],
      recurringDrafts: [],
      wallets: [
        backup.wallets[0],
        { ...backup.wallets[0], id: "wallet-2", currency: "IDR" as const },
        { ...backup.wallets[0], id: "wallet-3" },
      ],
    });

    expect(migrated.transfers.map((transfer) => transfer.kind)).toEqual(["transfer", "conversion"]);
  });

  it("migrates legacy wallets as cash and accepts credit wallet settings", () => {
    const migrated = validateBackup({
      ...backup,
      schemaVersion: 7,
      budgets: [],
      exchangeRateHistory: [],
      transfers: [],
      recurringRules: [],
      recurringDrafts: [],
    });
    expect(migrated.wallets[0].kind).toBe("cash");

    const credit = validateBackup({
      ...backup,
      schemaVersion: 8,
      budgets: [],
      exchangeRateHistory: [],
      transfers: [],
      recurringRules: [],
      recurringDrafts: [],
      wallets: [{
        ...backup.wallets[0],
        kind: "credit",
        creditLimit: 5000000,
        statementClosingDay: 20,
        paymentDueDay: 5,
      }],
    });
    expect(credit.wallets[0]).toMatchObject({
      kind: "credit",
      creditLimit: 5000000,
      statementClosingDay: 20,
      paymentDueDay: 5,
    });
  });

  it("requires matching currencies for transfers and an accurate snapshot for conversions", () => {
    const wallets = [
      backup.wallets[0],
      { ...backup.wallets[0], id: "idr-wallet", currency: "IDR" as const },
    ];
    const base = {
      ...backup,
      schemaVersion: 7,
      wallets,
      transactions: [],
      budgets: [],
      exchangeRateHistory: [],
      recurringRules: [],
      recurringDrafts: [],
    };
    const conversion = {
      id: "conversion-1",
      kind: "conversion",
      date: "2026-11-27",
      fromWalletId: "wallet-1",
      toWalletId: "idr-wallet",
      fromAmount: 1000,
      toAmount: 150000,
      feeAmount: 0,
      rate: { date: "2026-11-27", rateScaled: 1_500_000, source: "manual" },
      createdAt: "2026-11-27T00:00:00.000Z",
      updatedAt: "2026-11-27T00:00:00.000Z",
    };

    expect(validateBackup({ ...base, transfers: [conversion] }).transfers[0].kind).toBe("conversion");
    expect(() => validateBackup({
      ...base,
      transfers: [{ ...conversion, kind: "transfer", rate: undefined }],
    })).toThrow(/same currency/i);
    expect(() => validateBackup({
      ...base,
      transfers: [{ ...conversion, toAmount: 149999 }],
    })).toThrow(/saved exchange rate/i);
  });

  it("rejects unsupported backup versions with a clear error", () => {
    expect(() => validateBackup({ ...backup, schemaVersion: 99 })).toThrow(/tidak didukung/i);
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

    expect(validateBackup(valid).budgets).toMatchObject([
      { ...valid.budgets[0], alertThresholds: [80, 100] },
    ]);
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
