import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCuankuMigrations,
  DATABASE_SCHEMA_VERSION,
} from "./storage";
import type { CuankuDB } from "./storage";
import type { IDBPDatabase } from "idb";
import type { TransactionRecord } from "./models";

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => deleteDB(name)));
});

describe("IndexedDB schema migrations", () => {
  it("preserves existing transactions and records the current schema version", async () => {
    const name = `cuanku-migration-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const transaction: TransactionRecord = {
      id: "transaction-1",
      walletId: "wallet-1",
      type: "expense",
      amount: 1250,
      categoryId: "expense-food",
      date: "2026-11-27T12:00:00.000Z",
      createdAt: "2026-11-27T12:00:00.000Z",
      updatedAt: "2026-11-27T12:00:00.000Z",
    };

    let legacy: IDBPDatabase<CuankuDB> | undefined;
    let upgraded: IDBPDatabase<CuankuDB> | undefined;
    try {
      legacy = await openDB<CuankuDB>(name, 2, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            db.createObjectStore("wallets", { keyPath: "id" });
            db.createObjectStore("transactions", { keyPath: "id" });
            db.createObjectStore("categories", { keyPath: "id" });
            db.createObjectStore("exchangeRate", { keyPath: "id" });
            db.createObjectStore("meta");
          }
          if (oldVersion < 2) db.createObjectStore("budgets", { keyPath: "id" });
        },
      });
      await legacy.put("transactions", transaction);
      legacy.close();
      legacy = undefined;

      upgraded = await openDB<CuankuDB>(name, DATABASE_SCHEMA_VERSION, {
        upgrade(db, oldVersion, _newVersion, upgradeTransaction) {
          applyCuankuMigrations(db, oldVersion, upgradeTransaction);
        },
      });

      expect(await upgraded.get("transactions", transaction.id)).toEqual(transaction);
      expect(await upgraded.get("meta", "schemaVersion")).toBe(DATABASE_SCHEMA_VERSION);
    } finally {
      legacy?.close();
      upgraded?.close();
    }
  });
});
