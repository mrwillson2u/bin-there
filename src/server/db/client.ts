import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { createCategory, indexItem, STARTER_CATEGORIES } from "../items";
import { migrateFields } from "../fields";

export type Db = ReturnType<typeof openDb>;

export function openDb(file: string, migrationsFolder = "drizzle") {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  // Name-derived field keys become field IDs, once (DEC-071); the parts touched are re-indexed for search.
  for (const id of migrateFields(db)) indexItem(db, id);
  if (!db.select({ id: schema.categories.id }).from(schema.categories).get()) {
    for (const c of STARTER_CATEGORIES) createCategory(db, c);
  }
  return db;
}
