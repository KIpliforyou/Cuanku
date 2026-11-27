import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  BudgetRecord,
  Category,
  ExchangeRateCache,
  TransactionRecord,
  WalletRecord,
} from "./models";

interface CuankuDB extends DBSchema {
  wallets: { key: string; value: WalletRecord };
  transactions: { key: string; value: TransactionRecord };
  categories: { key: string; value: Category };
  budgets: { key: string; value: BudgetRecord };
  exchangeRate: { key: string; value: ExchangeRateCache };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<CuankuDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    let activeDb: IDBPDatabase<CuankuDB> | null = null;
    let blockedTimeout: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const opening = new Promise<IDBPDatabase<CuankuDB>>((resolve, reject) => {
      const request = openDB<CuankuDB>("cuanku", 2, {
        upgrade(db, oldVersion) {
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

export async function getExchangeRate() {
  return (await getDb()).get("exchangeRate", "JPY_IDR");
}
export async function putExchangeRate(rate: ExchangeRateCache) {
  return (await getDb()).put("exchangeRate", rate);
}

export async function replaceAllData(data: {
  wallets: WalletRecord[];
  transactions: TransactionRecord[];
  categories: Category[];
  budgets: BudgetRecord[];
}) {
  const db = await getDb();
  const tx = db.transaction(["wallets", "transactions", "categories", "budgets"], "readwrite");
  await Promise.all([
    tx.objectStore("wallets").clear(),
    tx.objectStore("transactions").clear(),
    tx.objectStore("categories").clear(),
    tx.objectStore("budgets").clear(),
  ]);
  await Promise.all([
    ...data.wallets.map((wallet) => tx.objectStore("wallets").put(wallet)),
    ...data.transactions.map((transaction) => tx.objectStore("transactions").put(transaction)),
    ...data.categories.map((category) => tx.objectStore("categories").put(category)),
    ...data.budgets.map((budget) => tx.objectStore("budgets").put(budget)),
  ]);
  await tx.done;
}
