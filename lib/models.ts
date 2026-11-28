import type { Currency, TransactionType } from "./domain";

export type WalletRecord = {
  id: string;
  name: string;
  currency: Currency;
  openingBalance: number;
  kind?: "cash" | "credit";
  creditLimit?: number;
  statementClosingDay?: number;
  paymentDueDay?: number;
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
  transferId?: string;
  recurringRuleId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetRecord = {
  id: string;
  walletId: string;
  categoryId: string;
  month: string;
  amount: number;
  alertThresholds?: BudgetAlertThreshold[];
  createdAt: string;
  updatedAt: string;
};

export const BUDGET_ALERT_THRESHOLDS = [80, 100] as const;
export type BudgetAlertThreshold = (typeof BUDGET_ALERT_THRESHOLDS)[number];

export type ExchangeRateCache = {
  id: "JPY_IDR";
  base: "JPY";
  quote: "IDR";
  rate: number;
  source: string;
  fetchedAt: string;
  cachedAt: string;
};

export type ExchangeRateSource = "manual" | "api";

export type ExchangeRateHistoryRecord = {
  id: string;
  date: string;
  rateScaled: number;
  source: ExchangeRateSource;
  provider?: string;
  createdAt: string;
};

export type ExchangeRateSnapshot = {
  date: string;
  rateScaled: number;
  source: ExchangeRateSource;
};

export type TransferRecord = {
  id: string;
  kind: "transfer" | "conversion";
  date: string;
  fromWalletId: string;
  toWalletId: string;
  fromAmount: number;
  toAmount: number;
  feeAmount: number;
  rate?: ExchangeRateSnapshot;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export type RecurringRule = {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  note?: string;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  dayOfMonth?: number;
  active: boolean;
  lastGeneratedDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecurringDraft = {
  id: string;
  ruleId: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  date: string;
  note?: string;
  createdAt: string;
};

export const BACKUP_REMINDER_OPTIONS = [7, 14, 30] as const;
export type BackupReminderDays = (typeof BACKUP_REMINDER_OPTIONS)[number];

export type Preferences = {
  theme: "light" | "dark";
  backupReminderDays?: BackupReminderDays;
  displayCurrency?: Currency;
  showEquivalentInReports?: boolean;
};

export type BackupEnvelope = {
  schemaVersion: 8;
  exportedAt: string;
  app: "Cuanku";
  wallets: WalletRecord[];
  transactions: TransactionRecord[];
  categories: Category[];
  budgets: BudgetRecord[];
  exchangeRateHistory: ExchangeRateHistoryRecord[];
  transfers: TransferRecord[];
  recurringRules: RecurringRule[];
  recurringDrafts: RecurringDraft[];
  preferences?: Preferences;
};
