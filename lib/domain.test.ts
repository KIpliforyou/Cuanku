import { describe, expect, it } from "vitest";
import {
  calculateBudgetSpent,
  calculateCurrencyBalances,
  calculateEstimatedTotalInIdr,
  calculateEstimatedTotalInJpy,
  calculateMonthlyTotals,
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

  it("applies transfers to each wallet without counting them as income or expense", () => {
    const sameCurrencyWallets: Wallet[] = [
      { id: "from", currency: "JPY", openingBalance: 1000 },
      { id: "to", currency: "JPY", openingBalance: 100 },
    ];
    const transfer = [{ fromWalletId: "from", toWalletId: "to", fromAmount: 300, toAmount: 300 }];
    const fee = [{ walletId: "from", type: "expense" as const, amount: 10 }];

    expect(calculateCurrencyBalances(sameCurrencyWallets, [], transfer)).toEqual({ JPY: 1100, IDR: 0 });
    expect(calculateCurrencyBalances(sameCurrencyWallets, fee, transfer)).toEqual({ JPY: 1090, IDR: 0 });
  });

  it("calculates credit wallet debt separately and excludes it from cash balances", () => {
    const creditWallet: Wallet = {
      id: "credit",
      currency: "IDR",
      openingBalance: 500000,
      kind: "credit",
      creditLimit: 5000000,
    };
    const cashWallet: Wallet = {
      id: "bank",
      currency: "IDR",
      openingBalance: 1000000,
      kind: "cash",
    };
    const purchases = [{ walletId: "credit", type: "expense" as const, amount: 250000 }];
    const payment = [{ fromWalletId: "bank", toWalletId: "credit", fromAmount: 300000, toAmount: 300000 }];

    expect(calculateWalletBalance(creditWallet, purchases, payment)).toBe(450000);
    expect(calculateCurrencyBalances([creditWallet, cashWallet], purchases, payment)).toEqual({
      JPY: 0,
      IDR: 700000,
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

  it("counts only expenses matching budget wallet, category, and month", () => {
    const spent = calculateBudgetSpent(
      { walletId: "idr-wallet", categoryId: "food", month: "2026-11" },
      [
        { walletId: "idr-wallet", categoryId: "food", type: "expense", amount: 100, date: "2026-11-02T12:00:00.000Z" },
        { walletId: "idr-wallet", categoryId: "food", type: "income", amount: 25, date: "2026-11-03T12:00:00.000Z" },
        { walletId: "idr-wallet", categoryId: "food", type: "expense", amount: 50, date: "2026-10-30T12:00:00.000Z" },
        { walletId: "jpy-wallet", categoryId: "food", type: "expense", amount: 75, date: "2026-11-04T12:00:00.000Z" },
        { walletId: "idr-wallet", categoryId: "transport", type: "expense", amount: 60, date: "2026-11-05T12:00:00.000Z" },
      ],
    );

    expect(spent).toBe(100);
  });

  it("calculates monthly income and expense without including other months", () => {
    expect(
      calculateMonthlyTotals(
        [
          { type: "income", amount: 1000, date: "2026-11-02T12:00:00.000Z" },
          { type: "expense", amount: 250, date: "2026-11-03T12:00:00.000Z" },
          { type: "income", amount: 500, date: "2026-10-31T12:00:00.000Z" },
        ],
        "2026-11",
      ),
    ).toEqual({ income: 1000, expense: 250 });
  });
});
