import { convertAmount } from "./exchange-rate";

export type Currency = "JPY" | "IDR";
export type TransactionType = "income" | "expense";

export type BudgetTransaction = {
  walletId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  date: string;
};

export type PeriodTransaction = Pick<BudgetTransaction, "amount" | "type" | "date">;

export type Wallet = {
  id: string;
  name?: string;
  currency: Currency;
  openingBalance: number;
  kind?: "cash" | "credit";
  creditLimit?: number;
  statementClosingDay?: number;
  paymentDueDay?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Transaction = {
  id?: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  categoryId?: string;
  date?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WalletTransfer = {
  fromWalletId: string;
  toWalletId: string;
  fromAmount: number;
  toAmount: number;
};

export function calculateWalletBalance(
  wallet: Wallet,
  transactions: Transaction[],
  transfers: WalletTransfer[] = [],
): number {
  if (wallet.kind === "credit") {
    const purchases = transactions
      .filter((transaction) => transaction.walletId === wallet.id)
      .reduce((balance, transaction) =>
        balance + (transaction.type === "expense" ? transaction.amount : -transaction.amount),
      0);
    const payments = transfers.reduce((balance, transfer) =>
      balance +
      (transfer.toWalletId === wallet.id ? -transfer.toAmount : 0) +
      (transfer.fromWalletId === wallet.id ? transfer.fromAmount : 0),
    0);
    return Math.max(0, wallet.openingBalance + purchases + payments);
  }
  const transactionBalance = transactions
    .filter((transaction) => transaction.walletId === wallet.id)
    .reduce(
      (balance, transaction) => balance + (transaction.type === "income" ? transaction.amount : -transaction.amount),
      0,
    );
  const transferBalance = transfers.reduce(
    (balance, transfer) => balance +
      (transfer.toWalletId === wallet.id ? transfer.toAmount : 0) -
      (transfer.fromWalletId === wallet.id ? transfer.fromAmount : 0),
    0,
  );
  return wallet.openingBalance + transactionBalance + transferBalance;
}

export function calculateCurrencyBalances(
  wallets: Wallet[],
  transactions: Transaction[],
  transfers: WalletTransfer[] = [],
): Record<Currency, number> {
  return {
    JPY: wallets
      .filter((wallet) => wallet.currency === "JPY" && wallet.kind !== "credit")
      .reduce((total, wallet) => total + calculateWalletBalance(wallet, transactions, transfers), 0),
    IDR: wallets
      .filter((wallet) => wallet.currency === "IDR" && wallet.kind !== "credit")
      .reduce((total, wallet) => total + calculateWalletBalance(wallet, transactions, transfers), 0),
  };
}

export function calculateEstimatedTotalInIdr(
  balances: Record<Currency, number>,
  jpyToIdr: number,
): number {
  if (!Number.isFinite(jpyToIdr) || jpyToIdr <= 0) {
    throw new Error("Exchange rate must be a positive finite number");
  }
  return balances.IDR + convertAmount(
    balances.JPY,
    "JPY",
    "IDR",
    Math.round(jpyToIdr * 10_000),
  );
}

export function calculateEstimatedTotalInJpy(
  balances: Record<Currency, number>,
  jpyToIdr: number,
): number {
  if (!Number.isFinite(jpyToIdr) || jpyToIdr <= 0) {
    throw new Error("Exchange rate must be a positive finite number");
  }
  return balances.JPY + convertAmount(
    balances.IDR,
    "IDR",
    "JPY",
    Math.round(jpyToIdr * 10_000),
  );
}

export function calculateBudgetSpent(
  budget: Pick<BudgetTransaction, "walletId" | "categoryId"> & { month: string },
  transactions: BudgetTransaction[],
): number {
  return transactions
    .filter((transaction) =>
      transaction.walletId === budget.walletId &&
      transaction.categoryId === budget.categoryId &&
      transaction.type === "expense" &&
      transaction.date.startsWith(budget.month),
    )
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function calculateMonthlyTotals(
  transactions: PeriodTransaction[],
  month: string,
): { income: number; expense: number } {
  return transactions
    .filter((transaction) => transaction.date.startsWith(month))
    .reduce(
      (totals, transaction) => {
        totals[transaction.type] += transaction.amount;
        return totals;
      },
      { income: 0, expense: 0 },
    );
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === "JPY" ? "ja-JP" : "id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
