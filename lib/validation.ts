import { z } from "zod";
import type { BudgetRecord } from "./models";

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
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["income", "expense"]),
});

export const budgetSchema = z.object({
  id: z.string().min(1),
  walletId: z.string().min(1),
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: z.number().safe().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const backupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  app: z.literal("Cuanku"),
  wallets: z.array(walletSchema),
  transactions: z.array(transactionSchema),
  categories: z.array(categorySchema),
  budgets: z.array(budgetSchema).optional(),
  preferences: z.object({ theme: z.enum(["light", "dark", "system"]) }).optional(),
});

export function validateBackup(value: unknown) {
  const parsed = backupSchema.parse(value);
  const budgets: BudgetRecord[] = parsed.budgets ?? [];
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
  return { ...parsed, budgets };
}
