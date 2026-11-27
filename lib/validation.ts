import { z } from "zod";
import { CATEGORY_ICON_IDS } from "./models";
import type {
  BackupEnvelope,
  BudgetRecord,
  BudgetAlertThreshold,
  Preferences,
} from "./models";
import { convertAmount } from "./exchange-rate";

export const walletSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  currency: z.enum(["JPY", "IDR"]),
  openingBalance: z.number().safe().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const transactionSchema = z.object({
  id: z.string().min(1),
  walletId: z.string().min(1),
  type: z.enum(["income", "expense"]),
  amount: z.number().safe().int().positive(),
  categoryId: z.string().min(1),
  date: z.iso.datetime({ offset: true }),
  note: z.string().max(500).optional(),
  transferId: z.string().min(1).optional(),
  recurringRuleId: z.string().min(1).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  type: z.enum(["income", "expense"]),
  icon: z.enum(CATEGORY_ICON_IDS).optional(),
});

export const budgetSchema = z.object({
  id: z.string().min(1),
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: z.number().safe().int().positive(),
  alertThresholds: z.array(z.union([z.literal(80), z.literal(100)])).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const exchangeRateCacheSchema = z.object({
  id: z.literal("JPY_IDR"),
  base: z.literal("JPY"),
  quote: z.literal("IDR"),
  rate: z.number().finite().positive(),
  source: z.string().min(1).max(200),
  fetchedAt: z.iso.datetime({ offset: true }),
  cachedAt: z.iso.datetime({ offset: true }),
});

const backupContents = {
  exportedAt: z.iso.datetime({ offset: true }),
  app: z.literal("Cuanku"),
  wallets: z.array(walletSchema),
  transactions: z.array(transactionSchema),
  categories: z.array(categorySchema),
  budgets: z.array(budgetSchema).optional(),
};

const preferenceV1Schema = z.object({
  theme: z.enum(["light", "dark", "system"]),
});

const preferenceV2Schema = preferenceV1Schema.extend({
  backupReminderDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
});

const preferenceV6Schema = preferenceV2Schema.extend({
  displayCurrency: z.enum(["JPY", "IDR"]).optional(),
  showEquivalentInReports: z.boolean().optional(),
});

const rateHistorySchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rateScaled: z.number().safe().int().positive(),
  source: z.enum(["manual", "api"]),
  provider: z.string().max(200).optional(),
  createdAt: z.iso.datetime({ offset: true }),
});

const rateSnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rateScaled: z.number().safe().int().positive(),
  source: z.enum(["manual", "api"]),
});

const transferSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["transfer", "conversion"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromWalletId: z.string().min(1),
  toWalletId: z.string().min(1),
  fromAmount: z.number().safe().int().positive(),
  toAmount: z.number().safe().int().positive(),
  feeAmount: z.number().safe().int().nonnegative(),
  rate: rateSnapshotSchema.optional(),
  note: z.string().max(500).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

const legacyTransferSchema = transferSchema.omit({ kind: true }).transform((transfer) => ({
  ...transfer,
  kind: transfer.rate ? "conversion" as const : "transfer" as const,
}));

const recurringRuleSchema = z.object({
  id: z.string().min(1),
  walletId: z.string().min(1),
  type: z.enum(["income", "expense"]),
  amount: z.number().safe().int().positive(),
  categoryId: z.string().min(1),
  note: z.string().max(500).optional(),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  active: z.boolean(),
  lastGeneratedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

const recurringDraftSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().min(1),
  walletId: z.string().min(1),
  type: z.enum(["income", "expense"]),
  amount: z.number().safe().int().positive(),
  categoryId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
  createdAt: z.iso.datetime({ offset: true }),
});

const backupV1Schema = z.object({
  ...backupContents,
  schemaVersion: z.literal(1),
  preferences: preferenceV1Schema.optional(),
});

const backupV2Schema = z.object({
  ...backupContents,
  schemaVersion: z.literal(2),
  preferences: preferenceV2Schema.optional(),
});

const backupV3Schema = z.object({
  ...backupContents,
  schemaVersion: z.literal(3),
  exchangeRateHistory: z.array(rateHistorySchema),
  preferences: preferenceV2Schema.optional(),
});

const backupV4Schema = backupV3Schema.extend({
  schemaVersion: z.literal(4),
  transfers: z.array(legacyTransferSchema),
});

const backupV5Schema = backupV4Schema.extend({
  schemaVersion: z.literal(5),
  recurringRules: z.array(recurringRuleSchema),
  recurringDrafts: z.array(recurringDraftSchema),
});

const backupV6Schema = backupV5Schema.extend({
  schemaVersion: z.literal(6),
  budgets: z.array(budgetSchema),
  preferences: preferenceV6Schema.optional(),
});

export const backupSchema = backupV6Schema.extend({
  schemaVersion: z.literal(7),
  transfers: z.array(transferSchema),
});

type ParsedBackup = {
  exportedAt: string;
  app: "Cuanku";
  wallets: z.infer<typeof walletSchema>[];
  transactions: z.infer<typeof transactionSchema>[];
  categories: z.infer<typeof categorySchema>[];
  budgets?: z.infer<typeof budgetSchema>[];
  exchangeRateHistory?: z.infer<typeof rateHistorySchema>[];
  transfers?: z.infer<typeof transferSchema>[];
  recurringRules?: z.infer<typeof recurringRuleSchema>[];
  recurringDrafts?: z.infer<typeof recurringDraftSchema>[];
  preferences?: Preferences;
};

function normalizeBackup(parsed: ParsedBackup): BackupEnvelope {
  return {
    schemaVersion: 7,
    exportedAt: parsed.exportedAt,
    app: parsed.app,
    wallets: parsed.wallets,
    transactions: parsed.transactions,
    categories: parsed.categories,
    budgets: (parsed.budgets ?? []).map((budget) => ({
      ...budget,
      alertThresholds: budget.alertThresholds ?? [80, 100],
    })),
    exchangeRateHistory: parsed.exchangeRateHistory ?? [],
    transfers: parsed.transfers ?? [],
    recurringRules: parsed.recurringRules ?? [],
    recurringDrafts: parsed.recurringDrafts ?? [],
    preferences: parsed.preferences
      ? {
          theme: parsed.preferences.theme,
          backupReminderDays: parsed.preferences.backupReminderDays ?? 14,
          displayCurrency: parsed.preferences.displayCurrency ?? "IDR",
          showEquivalentInReports: parsed.preferences.showEquivalentInReports ?? false,
        }
      : undefined,
  };
}

function parseBackupVersion(value: unknown): BackupEnvelope {
  const version = z.object({ schemaVersion: z.number().int() }).safeParse(value);
  if (!version.success) throw new Error("File backup rusak atau tidak memiliki versi skema.");

  const failures: Record<number, string> = {
    1: "Struktur backup versi lama tidak valid. Data lokal tidak diubah.",
    2: "Struktur backup versi 2 tidak valid. Data lokal tidak diubah.",
    3: "Struktur backup versi 3 tidak valid. Data lokal tidak diubah.",
    4: "Struktur backup versi 4 tidak valid. Data lokal tidak diubah.",
    5: "Struktur backup versi 5 tidak valid. Data lokal tidak diubah.",
    6: "Struktur backup versi 6 tidak valid. Data lokal tidak diubah.",
    7: "Struktur file backup tidak valid. Data lokal tidak diubah.",
  };
  const schemas = {
    1: backupV1Schema,
    2: backupV2Schema,
    3: backupV3Schema,
    4: backupV4Schema,
    5: backupV5Schema,
    6: backupV6Schema,
    7: backupSchema,
  } as const;
  const schema = schemas[version.data.schemaVersion as keyof typeof schemas];
  if (!schema) throw new Error(`Versi backup ${version.data.schemaVersion} tidak didukung.`);
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(failures[version.data.schemaVersion] ?? "Struktur file backup tidak valid.");
  return normalizeBackup(result.data);
}

export function validateBackup(value: unknown) {
  const parsed = parseBackupVersion(value);
  const budgets: BudgetRecord[] = parsed.budgets;
  const walletIds = new Set(parsed.wallets.map((wallet) => wallet.id));
  const categoryIds = new Set(parsed.categories.map((category) => category.id));
  if (new Set(parsed.wallets.map((wallet) => wallet.id)).size !== parsed.wallets.length) {
    throw new Error("Backup contains duplicate wallet IDs");
  }
  if (new Set(parsed.transactions.map((transaction) => transaction.id)).size !== parsed.transactions.length) {
    throw new Error("Backup contains duplicate transaction IDs");
  }
  if (new Set(parsed.categories.map((category) => category.id)).size !== parsed.categories.length) {
    throw new Error("Backup contains duplicate category IDs");
  }
  if ([...parsed.transactions].some((transaction) => !walletIds.has(transaction.walletId))) {
    throw new Error("A transaction refers to a wallet that does not exist");
  }
  if ([...parsed.transactions].some((transaction) => !categoryIds.has(transaction.categoryId))) {
    throw new Error("A transaction refers to a category that does not exist");
  }
  const categoriesById = new Map(parsed.categories.map((category) => [category.id, category]));
  if (parsed.transactions.some((transaction) => categoriesById.get(transaction.categoryId)?.type !== transaction.type)) {
    throw new Error("A transaction category does not match its type");
  }
  if (new Set(budgets.map((budget) => budget.id)).size !== budgets.length) {
    throw new Error("Backup contains duplicate budget IDs");
  }
  const categoryIdsByType = new Map(parsed.categories.map((category) => [category.id, category.type]));
  if (budgets.some((budget) => !walletIds.has(budget.walletId))) {
    throw new Error("A budget refers to a wallet that does not exist");
  }
  if (budgets.some((budget) => categoryIdsByType.get(budget.categoryId) !== "expense")) {
    throw new Error("A budget must refer to an expense category");
  }
  const budgetKeys = budgets.map((budget) => `${budget.walletId}:${budget.categoryId}:${budget.month}`);
  if (new Set(budgetKeys).size !== budgetKeys.length) {
    throw new Error("Backup contains duplicate budgets for the same month and category");
  }
  if (parsed.exchangeRateHistory.some((rate) => rate.id !== `${rate.date}:${rate.source}`)) {
    throw new Error("Exchange rate history contains an invalid ID");
  }
  if (new Set(parsed.exchangeRateHistory.map((rate) => rate.id)).size !== parsed.exchangeRateHistory.length) {
    throw new Error("Backup contains duplicate exchange rate history entries");
  }
  const walletsById = new Map(parsed.wallets.map((wallet) => [wallet.id, wallet]));
  if (new Set(parsed.transfers.map((transfer) => transfer.id)).size !== parsed.transfers.length) {
    throw new Error("Backup contains duplicate transfer IDs");
  }
  for (const transfer of parsed.transfers) {
    const from = walletsById.get(transfer.fromWalletId);
    const to = walletsById.get(transfer.toWalletId);
    if (!from || !to) throw new Error("A transfer refers to a wallet that does not exist");
    if (from.id === to.id) throw new Error("A transfer cannot use the same wallet as its source and destination");
    if (transfer.kind === "transfer") {
      if (from.currency !== to.currency) {
        throw new Error("Transfers must use wallets with the same currency; use a conversion instead");
      }
      if (transfer.rate || transfer.fromAmount !== transfer.toAmount) {
        throw new Error("Same-currency transfers must use equal amounts and no exchange rate");
      }
    } else {
      if (from.currency === to.currency) {
        throw new Error("Currency conversions must use wallets with different currencies");
      }
      if (!transfer.rate) throw new Error("Cross-currency transfers require an exchange rate snapshot");
      const expected = convertAmount(
        transfer.fromAmount,
        from.currency,
        to.currency,
        transfer.rate.rateScaled,
      );
      if (expected !== transfer.toAmount) {
        throw new Error("Transfer destination amount does not match its saved exchange rate");
      }
    }
  }
  const transferIds = new Set(parsed.transfers.map((transfer) => transfer.id));
  const feeTransactions = parsed.transactions.filter((transaction) => transaction.transferId);
  if (feeTransactions.some((transaction) => !transferIds.has(transaction.transferId!))) {
    throw new Error("A transfer fee transaction refers to a missing transfer");
  }
  if (new Set(feeTransactions.map((transaction) => transaction.transferId)).size !== feeTransactions.length) {
    throw new Error("A transfer cannot have duplicate fee transactions");
  }
  for (const transfer of parsed.transfers) {
    const fee = feeTransactions.find((transaction) => transaction.transferId === transfer.id);
    if (transfer.feeAmount > 0) {
      if (
        !fee ||
        fee.walletId !== transfer.fromWalletId ||
        fee.type !== "expense" ||
        fee.amount !== transfer.feeAmount
      ) throw new Error("A transfer must have one matching fee expense");
    } else if (fee) {
      throw new Error("A transfer without a fee cannot have a fee expense");
    }
  }
  const recurringRuleIds = new Set(parsed.recurringRules.map((rule) => rule.id));
  if (recurringRuleIds.size !== parsed.recurringRules.length) {
    throw new Error("Backup contains duplicate recurring rule IDs");
  }
  if (parsed.recurringRules.some((rule) =>
    !walletIds.has(rule.walletId) || categoryIdsByType.get(rule.categoryId) !== rule.type,
  )) throw new Error("A recurring rule refers to an invalid wallet or category");
  if (new Set(parsed.recurringDrafts.map((draft) => draft.id)).size !== parsed.recurringDrafts.length) {
    throw new Error("Backup contains duplicate recurring draft IDs");
  }
  if (parsed.recurringDrafts.some((draft) =>
    !recurringRuleIds.has(draft.ruleId) ||
    !walletIds.has(draft.walletId) ||
    categoryIdsByType.get(draft.categoryId) !== draft.type,
  )) throw new Error("A recurring draft refers to an invalid rule, wallet, or category");
  const allowedThresholds = new Set<BudgetAlertThreshold>([80, 100]);
  if (budgets.some((budget) => {
    const thresholds = budget.alertThresholds ?? [];
    return thresholds.some((threshold) => !allowedThresholds.has(threshold)) ||
      new Set(thresholds).size !== thresholds.length;
  })) throw new Error("A budget has invalid or duplicate alert thresholds");
  return parsed;
}
