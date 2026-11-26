export type Currency = "JPY" | "IDR";
export type TransactionType = "income" | "expense";

export type Wallet = {
  id: string;
  name?: string;
  currency: Currency;
  openingBalance: number;
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

export function calculateWalletBalance(wallet: Wallet, transactions: Transaction[]): number {
  return wallet.openingBalance + transactions
    .filter((transaction) => transaction.walletId === wallet.id)
    .reduce(
      (balance, transaction) => balance + (transaction.type === "income" ? transaction.amount : -transaction.amount),
      0,
    );
}

export function calculateCurrencyBalances(
  wallets: Wallet[],
  transactions: Transaction[],
): Record<Currency, number> {
  return {
    JPY: wallets
      .filter((wallet) => wallet.currency === "JPY")
      .reduce((total, wallet) => total + calculateWalletBalance(wallet, transactions), 0),
    IDR: wallets
      .filter((wallet) => wallet.currency === "IDR")
      .reduce((total, wallet) => total + calculateWalletBalance(wallet, transactions), 0),
  };
}

export function calculateEstimatedTotalInIdr(
  balances: Record<Currency, number>,
  jpyToIdr: number,
): number {
  if (!Number.isFinite(jpyToIdr) || jpyToIdr <= 0) {
    throw new Error("Exchange rate must be a positive finite number");
  }
  return balances.IDR + balances.JPY * jpyToIdr;
}

export function calculateEstimatedTotalInJpy(
  balances: Record<Currency, number>,
  jpyToIdr: number,
): number {
  if (!Number.isFinite(jpyToIdr) || jpyToIdr <= 0) {
    throw new Error("Exchange rate must be a positive finite number");
  }
  return balances.JPY + balances.IDR / jpyToIdr;
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === "JPY" ? "ja-JP" : "id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
