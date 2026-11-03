import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

export type Db = ReturnType<typeof openDb>;

export function openDb(file: string, migrationsFolder = "drizzle") {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  seed(db);
  return db;
}

// The put-back bin is a built-in location (see PRD F6).
function seed(db: ReturnType<typeof drizzle<typeof schema>>) {
  const existing = db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(eq(schema.locations.type, "put_back"))
    .get();
  if (!existing) {
    db.insert(schema.locations).values({ type: "put_back", name: "Put-back bin" }).run();
  }
}
