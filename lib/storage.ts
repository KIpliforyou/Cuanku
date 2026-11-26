import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ExchangeRateCache, WalletRecord, TransactionRecord, Category } from "./models";

interface CuankuDB extends DBSchema {
  wallets: { key: string; value: WalletRecord };
  transactions: { key: string; value: TransactionRecord };
  categories: { key: string; value: Category };
  exchangeRate: { key: string; value: ExchangeRateCache };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<CuankuDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<CuankuDB>("cuanku", 1, {
      upgrade(db) {
        db.createObjectStore("wallets", { keyPath: "id" });
        db.createObjectStore("transactions", { keyPath: "id" });
        db.createObjectStore("categories", { keyPath: "id" });
        db.createObjectStore("exchangeRate", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
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
}) {
  const db = await getDb();
  const tx = db.transaction(["wallets", "transactions", "categories"], "readwrite");
  await Promise.all([
    tx.objectStore("wallets").clear(),
    tx.objectStore("transactions").clear(),
    tx.objectStore("categories").clear(),
  ]);
  await Promise.all([
    ...data.wallets.map((wallet) => tx.objectStore("wallets").put(wallet)),
    ...data.transactions.map((transaction) => tx.objectStore("transactions").put(transaction)),
    ...data.categories.map((category) => tx.objectStore("categories").put(category)),
  ]);
  await tx.done;
}
