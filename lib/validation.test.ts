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
    expect(validateBackup(backup)).toEqual(backup);
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
});
