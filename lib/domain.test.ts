import { describe, expect, it } from "vitest";
import {
  calculateCurrencyBalances,
  calculateEstimatedTotalInIdr,
  calculateEstimatedTotalInJpy,
  calculateWalletBalance,
  type Transaction,
  type Wallet,
} from "./domain";

const wallets: Wallet[] = [
  { id: "jpy-wallet", currency: "JPY", openingBalance: 1000 },
  { id: "idr-wallet", currency: "IDR", openingBalance: 500000 },
];

const transactions: Transaction[] = [
  { walletId: "jpy-wallet", type: "income", amount: 500 },
  { walletId: "jpy-wallet", type: "expense", amount: 200 },
  { walletId: "idr-wallet", type: "expense", amount: 100000 },
];

describe("domain balance calculations", () => {
  it("adds income and subtracts expense from opening balance", () => {
    expect(calculateWalletBalance(wallets[0], transactions)).toBe(1300);
  });

  it("keeps JPY and IDR totals separate", () => {
    expect(calculateCurrencyBalances(wallets, transactions)).toEqual({
      JPY: 1300,
      IDR: 400000,
    });
  });

  it("calculates estimated total in IDR using JPY rate", () => {
    expect(
      calculateEstimatedTotalInIdr({ JPY: 1300, IDR: 400000 }, 108.42),
    ).toBeCloseTo(540946.0, 5);
  });

  it("rejects non-positive or non-finite exchange rates", () => {
    expect(() => calculateEstimatedTotalInIdr({ JPY: 1, IDR: 1 }, 0)).toThrow();
    expect(() => calculateEstimatedTotalInIdr({ JPY: 1, IDR: 1 }, Number.NaN)).toThrow();
  });

  it("calculates estimated total in JPY using the inverse rate", () => {
    expect(calculateEstimatedTotalInJpy({ JPY: 1300, IDR: 400000 }, 100)).toBeCloseTo(5300, 5);
  });
});
