import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from "idb";
import type {
  BackupReminderDays,
  BudgetRecord,
  Category,
  ExchangeRateCache,
  ExchangeRateHistoryRecord,
  RecurringDraft,
  RecurringRule,
  TransactionRecord,
  TransferRecord,
  WalletRecord,
} from "./models";
import { getDueRecurringDates } from "./recurring";
import { getTokyoDateString, rateFromScaled } from "./exchange-rate";

export const DATABASE_SCHEMA_VERSION = 7;

export interface CuankuDB extends DBSchema {
  wallets: { key: string; value: WalletRecord };
  transactions: { key: string; value: TransactionRecord };
  categories: { key: string; value: Category };
  budgets: { key: string; value: BudgetRecord };
  exchangeRate: { key: string; value: ExchangeRateCache };
  exchangeRateHistory: { key: string; value: ExchangeRateHistoryRecord };
  transfers: { key: string; value: TransferRecord };
  recurringRules: { key: string; value: RecurringRule };
  recurringDrafts: { key: string; value: RecurringDraft };
  meta: { key: string; value: unknown };
}

function isBackupReminderDays(value: unknown): value is BackupReminderDays {
  return value === 7 || value === 14 || value === 30;
}

export function applyCuankuMigrations(
  db: IDBPDatabase<CuankuDB>,
  oldVersion: number,
  transaction: IDBPTransaction<CuankuDB, StoreNames<CuankuDB>[], "versionchange">,
) {
  if (oldVersion < 1) {
    db.createObjectStore("wallets", { keyPath: "id" });
    db.createObjectStore("transactions", { keyPath: "id" });
    db.createObjectStore("categories", { keyPath: "id" });
    db.createObjectStore("exchangeRate", { keyPath: "id" });
    db.createObjectStore("meta");
  }
  if (oldVersion < 2) {
    db.createObjectStore("budgets", { keyPath: "id" });
  }
  if (oldVersion < 4) {
    db.createObjectStore("exchangeRateHistory", { keyPath: "id" });
  }
  if (oldVersion < 5) {
    db.createObjectStore("transfers", { keyPath: "id" });
  }
  if (oldVersion < 6) {
    db.createObjectStore("recurringRules", { keyPath: "id" });
    db.createObjectStore("recurringDrafts", { keyPath: "id" });
  }
  if (oldVersion < 7) {
    const budgetStore = transaction.objectStore("budgets");
    void budgetStore.getAll().then((budgets) => {
      for (const budget of budgets) {
        if (!Array.isArray(budget.alertThresholds)) {
          void budgetStore.put({ ...budget, alertThresholds: [80, 100] });
        }
      }
    });
  }
  if (oldVersion < DATABASE_SCHEMA_VERSION) {
    void transaction.objectStore("meta").put(DATABASE_SCHEMA_VERSION, "schemaVersion");
  }
}

let dbPromise: Promise<IDBPDatabase<CuankuDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    let activeDb: IDBPDatabase<CuankuDB> | null = null;
    let blockedTimeout: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const opening = new Promise<IDBPDatabase<CuankuDB>>((resolve, reject) => {
      const request = openDB<CuankuDB>("cuanku", DATABASE_SCHEMA_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          applyCuankuMigrations(db, oldVersion, transaction);
        },
        blocked() {
          if (blockedTimeout) return;
          blockedTimeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            dbPromise = null;
            reject(new Error(
              "Database lokal sedang dibuka oleh tab Cuanku lain. Tutup tab Cuanku lainnya, lalu coba lagi.",
            ));
          }, 8000);
        },
        blocking() {
          activeDb?.close();
          activeDb = null;
          dbPromise = null;
        },
        terminated() {
          activeDb = null;
          dbPromise = null;
        },
      });

      request.then(
        (db) => {
          if (blockedTimeout) clearTimeout(blockedTimeout);
          if (settled) {
            db.close();
            return;
          }
          settled = true;
          activeDb = db;
          resolve(db);
        },
        (error: unknown) => {
          if (blockedTimeout) clearTimeout(blockedTimeout);
          if (settled) return;
          settled = true;
          dbPromise = null;
          reject(error);
        },
      );
    });
    dbPromise = opening;
  }
  return dbPromise;
}

export async function getWallets() {
  return (await getDb()).getAll("wallets");
}
export async function putWallet(wallet: WalletRecord) {
  return (await getDb()).put("wallets", wallet);
}
export async function deleteWallet(id: string) {
  return (await getDb()).delete("wallets", id);
}

export async function getTransactions() {
  return (await getDb()).getAll("transactions");
}
export async function putTransaction(transaction: TransactionRecord) {
  return (await getDb()).put("transactions", transaction);
}
export async function getTransfers() {
  return (await getDb()).getAll("transfers");
}
export async function getBudgets() {
  return (await getDb()).getAll("budgets");
}
export async function putBudget(budget: BudgetRecord) {
  return (await getDb()).put("budgets", budget);
}
export async function deleteBudget(id: string) {
  return (await getDb()).delete("budgets", id);
}
export async function deleteTransaction(id: string) {
  return (await getDb()).delete("transactions", id);
}

export async function getCategories() {
  return (await getDb()).getAll("categories");
}
export async function putCategories(categories: Category[]) {
  const db = await getDb();
  const tx = db.transaction("categories", "readwrite");
  await Promise.all(categories.map((category) => tx.store.put(category)));
  await tx.done;
}
export async function deleteCategory(id: string) {
  return (await getDb()).delete("categories", id);
}

export async function saveTransfer(transfer: TransferRecord) {
  const db = await getDb();
  const tx = db.transaction(["transfers", "transactions", "categories"], "readwrite");
  const feeTransactionId = `transfer-fee-${transfer.id}`;
  const previousFee = await tx.objectStore("transactions").get(feeTransactionId);
  await tx.objectStore("transfers").put(transfer);
  if (transfer.feeAmount > 0) {
    const feeCategoryId = "expense-transfer-fee";
    const feeCategory = await tx.objectStore("categories").get(feeCategoryId);
    if (!feeCategory) {
      await tx.objectStore("categories").put({
        id: feeCategoryId,
        name: "Biaya transfer",
        type: "expense",
        icon: "receipt",
      });
    }
    await tx.objectStore("transactions").put({
      id: feeTransactionId,
      walletId: transfer.fromWalletId,
      type: "expense",
      amount: transfer.feeAmount,
      categoryId: feeCategoryId,
      date: new Date(`${transfer.date}T12:00:00.000Z`).toISOString(),
      note: `Biaya transfer${transfer.note ? ` · ${transfer.note}` : ""}`,
      transferId: transfer.id,
      createdAt: previousFee?.createdAt ?? transfer.createdAt,
      updatedAt: transfer.updatedAt,
    } satisfies TransactionRecord);
  } else {
    await tx.objectStore("transactions").delete(feeTransactionId);
  }
  await tx.done;
}

export async function deleteTransfer(id: string) {
  const db = await getDb();
  const tx = db.transaction(["transfers", "transactions"], "readwrite");
  await Promise.all([
    tx.objectStore("transfers").delete(id),
    tx.objectStore("transactions").delete(`transfer-fee-${id}`),
  ]);
  await tx.done;
}

export async function getExchangeRate() {
  return (await getDb()).get("exchangeRate", "JPY_IDR");
}
export async function getExchangeRateHistory() {
  return (await getDb()).getAll("exchangeRateHistory");
}
export async function getLatestManualExchangeRate() {
  const rates = await getExchangeRateHistory();
  return rates
    .filter((rate) => rate.source === "manual")
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
export async function putExchangeRate(
  rate: ExchangeRateCache,
  historyRecord?: ExchangeRateHistoryRecord,
) {
  const db = await getDb();
  const tx = db.transaction(
    historyRecord ? ["exchangeRate", "exchangeRateHistory"] : ["exchangeRate"],
    "readwrite",
  );
  await tx.objectStore("exchangeRate").put(rate);
  if (historyRecord) await tx.objectStore("exchangeRateHistory").put(historyRecord);
  await tx.done;
}

export async function getRecurringRules() {
  return (await getDb()).getAll("recurringRules");
}

export async function getRecurringDrafts() {
  return (await getDb()).getAll("recurringDrafts");
}

export async function putRecurringRule(rule: RecurringRule) {
  return (await getDb()).put("recurringRules", rule);
}

export async function generateDueRecurringDrafts(throughDate = getTokyoDateString()) {
  const db = await getDb();
  const tx = db.transaction(["recurringRules", "recurringDrafts"], "readwrite");
  const [rules, existingDrafts] = await Promise.all([
    tx.objectStore("recurringRules").getAll(),
    tx.objectStore("recurringDrafts").getAll(),
  ]);
  const draftIds = new Set(existingDrafts.map((draft) => draft.id));
  const writes: Promise<unknown>[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const dueDates = getDueRecurringDates(rule, throughDate);
    for (const date of dueDates) {
      const id = `${rule.id}:${date}`;
      if (draftIds.has(id)) continue;
      draftIds.add(id);
      writes.push(tx.objectStore("recurringDrafts").put({
        id,
        ruleId: rule.id,
        walletId: rule.walletId,
        type: rule.type,
        amount: rule.amount,
        categoryId: rule.categoryId,
        date,
        note: rule.note,
        createdAt: new Date().toISOString(),
      }));
    }
    const lastGeneratedDate = dueDates.at(-1);
    if (lastGeneratedDate && lastGeneratedDate !== rule.lastGeneratedDate) {
      writes.push(tx.objectStore("recurringRules").put({
        ...rule,
        lastGeneratedDate,
        updatedAt: new Date().toISOString(),
      }));
    }
  }
  await Promise.all(writes);
  await tx.done;
  return db.getAll("recurringDrafts");
}

export async function approveRecurringDraft(id: string) {
  const db = await getDb();
  const tx = db.transaction(["recurringDrafts", "transactions"], "readwrite");
  const draft = await tx.objectStore("recurringDrafts").get(id);
  if (!draft) {
    await tx.done;
    return null;
  }
  const now = new Date().toISOString();
  const transaction: TransactionRecord = {
    id: draft.id,
    walletId: draft.walletId,
    type: draft.type,
    amount: draft.amount,
    categoryId: draft.categoryId,
    date: new Date(`${draft.date}T12:00:00.000Z`).toISOString(),
    note: draft.note,
    recurringRuleId: draft.ruleId,
    createdAt: draft.createdAt,
    updatedAt: now,
  };
  await Promise.all([
    tx.objectStore("transactions").put(transaction),
    tx.objectStore("recurringDrafts").delete(id),
  ]);
  await tx.done;
  return transaction;
}

export async function discardRecurringDraft(id: string) {
  return (await getDb()).delete("recurringDrafts", id);
}

export async function deleteRecurringRule(id: string) {
  const db = await getDb();
  const tx = db.transaction(["recurringRules", "recurringDrafts"], "readwrite");
  const [drafts] = await Promise.all([
    tx.objectStore("recurringDrafts").getAll(),
    tx.objectStore("recurringRules").delete(id),
  ]);
  await Promise.all(
    drafts.filter((draft) => draft.ruleId === id)
      .map((draft) => tx.objectStore("recurringDrafts").delete(draft.id)),
  );
  await tx.done;
}

export async function claimBudgetAlert(budgetId: string, month: string, threshold: number) {
  const db = await getDb();
  const key = `budget-alert:${budgetId}:${month}:${threshold}`;
  const tx = db.transaction("meta", "readwrite");
  const existing = await tx.store.get(key);
  if (existing !== undefined) {
    await tx.done;
    return false;
  }
  await tx.store.put(new Date().toISOString(), key);
  await tx.done;
  return true;
}

export async function getLastBackupAt(): Promise<string | null> {
  const value = await (await getDb()).get("meta", "lastBackupAt");
  if (value === undefined) return null;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  console.warn("Invalid backup timestamp found in local metadata; showing the backup reminder.");
  return null;
}

export async function getBackupReminderDays(): Promise<BackupReminderDays> {
  const value = await (await getDb()).get("meta", "backupReminderDays");
  if (value === undefined) return 14;
  if (isBackupReminderDays(value)) return value;
  console.warn("Invalid backup reminder interval found in local metadata; using 14 days.");
  return 14;
}

export async function putBackupMetadata(
  lastBackupAt: string | null,
  backupReminderDays?: BackupReminderDays,
) {
  if (lastBackupAt !== null && !Number.isFinite(Date.parse(lastBackupAt))) {
    throw new Error("Backup timestamp must be a valid date");
  }
  if (backupReminderDays !== undefined && !isBackupReminderDays(backupReminderDays)) {
    throw new Error("Backup reminder interval is not supported");
  }
  const db = await getDb();
  const tx = db.transaction("meta", "readwrite");
  if (lastBackupAt === null) {
    await tx.store.delete("lastBackupAt");
  } else {
    await tx.store.put(lastBackupAt, "lastBackupAt");
  }
  if (backupReminderDays !== undefined) {
    await tx.store.put(backupReminderDays, "backupReminderDays");
  }
  await tx.done;
}

export async function replaceAllData(data: {
  wallets: WalletRecord[];
  transactions: TransactionRecord[];
  categories: Category[];
  budgets: BudgetRecord[];
  exchangeRateHistory?: ExchangeRateHistoryRecord[];
  transfers?: TransferRecord[];
  recurringRules?: RecurringRule[];
  recurringDrafts?: RecurringDraft[];
  lastBackupAt?: string | null;
  backupReminderDays?: BackupReminderDays;
}) {
  if (
    typeof data.lastBackupAt === "string" &&
    !Number.isFinite(Date.parse(data.lastBackupAt))
  ) {
    throw new Error("Backup timestamp must be a valid date");
  }
  if (data.backupReminderDays !== undefined && !isBackupReminderDays(data.backupReminderDays)) {
    throw new Error("Backup reminder interval is not supported");
  }
  const db = await getDb();
  const exchangeRateHistory = data.exchangeRateHistory ?? [];
  const tx = db.transaction([
    "wallets",
    "transactions",
    "categories",
    "budgets",
    "exchangeRate",
    "exchangeRateHistory",
    "transfers",
    "recurringRules",
    "recurringDrafts",
    "meta",
  ], "readwrite");
  await Promise.all([
    tx.objectStore("wallets").clear(),
    tx.objectStore("transactions").clear(),
    tx.objectStore("categories").clear(),
    tx.objectStore("budgets").clear(),
    tx.objectStore("exchangeRate").clear(),
    tx.objectStore("exchangeRateHistory").clear(),
    tx.objectStore("transfers").clear(),
    tx.objectStore("recurringRules").clear(),
    tx.objectStore("recurringDrafts").clear(),
  ]);
  await Promise.all([
    ...data.wallets.map((wallet) => tx.objectStore("wallets").put(wallet)),
    ...data.transactions.map((transaction) => tx.objectStore("transactions").put(transaction)),
    ...data.categories.map((category) => tx.objectStore("categories").put(category)),
    ...data.budgets.map((budget) => tx.objectStore("budgets").put(budget)),
    ...exchangeRateHistory.map((rate) => tx.objectStore("exchangeRateHistory").put(rate)),
    ...(data.transfers ?? []).map((transfer) => tx.objectStore("transfers").put(transfer)),
    ...(data.recurringRules ?? []).map((rule) => tx.objectStore("recurringRules").put(rule)),
    ...(data.recurringDrafts ?? []).map((draft) => tx.objectStore("recurringDrafts").put(draft)),
  ]);
  const latestRate = [...exchangeRateHistory].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  if (latestRate) {
    await tx.objectStore("exchangeRate").put({
      id: "JPY_IDR",
      base: "JPY",
      quote: "IDR",
      rate: rateFromScaled(latestRate.rateScaled),
      source: latestRate.source === "api" ? latestRate.provider ?? "API" : "manual",
      fetchedAt: latestRate.createdAt,
      cachedAt: latestRate.createdAt,
    });
  }
  if (data.lastBackupAt === null) {
    await tx.objectStore("meta").delete("lastBackupAt");
  } else if (data.lastBackupAt) {
    await tx.objectStore("meta").put(data.lastBackupAt, "lastBackupAt");
  }
  if (data.backupReminderDays !== undefined) {
    await tx.objectStore("meta").put(data.backupReminderDays, "backupReminderDays");
  }
  await tx.done;
}
