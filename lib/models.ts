import type { Currency, TransactionType } from "./domain";

export type WalletRecord = {
  id: string;
  name: string;
  currency: Currency;
  openingBalance: number;
  createdAt: string;
  updatedAt: string;
};

export const CATEGORY_ICON_IDS = [
  "briefcase",
  "sparkles",
  "gift",
  "rotate",
  "tag",
  "utensils",
  "bus",
  "shopping",
  "home",
  "receipt",
  "phone",
  "heart",
  "users",
  "book",
  "shield",
] as const;

export type CategoryIconId = (typeof CATEGORY_ICON_IDS)[number];

export type Category = {
  id: string;
  name: string;
  type: TransactionType;
  icon?: CategoryIconId;
};

export type TransactionRecord = {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  date: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetRecord = {
  id: string;
  walletId: string;
  categoryId: string;
  month: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};

export type ExchangeRateCache = {
  id: "JPY_IDR";
  base: "JPY";
  quote: "IDR";
  rate: number;
  source: string;
  fetchedAt: string;
  cachedAt: string;
};

export type Preferences = {
  theme: "light" | "dark" | "system";
};

export type BackupEnvelope = {
  schemaVersion: 1;
  exportedAt: string;
  app: "Cuanku";
  wallets: WalletRecord[];
  transactions: TransactionRecord[];
  categories: Category[];
  budgets?: BudgetRecord[];
  preferences?: Preferences;
};
