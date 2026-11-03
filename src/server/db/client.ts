import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { createCategory, STARTER_CATEGORIES } from "../items";

export type Db = ReturnType<typeof openDb>;

export function openDb(file: string, migrationsFolder = "drizzle") {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  if (!db.select({ id: schema.categories.id }).from(schema.categories).get()) {
    for (const c of STARTER_CATEGORIES) createCategory(db, c);
  }
  return db;
}
