import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrate";

let database: DatabaseSync | undefined;

export function databasePath(): string {
  const directory = process.env["DATA_DIR"] || "data";
  return isAbsolute(directory) ? join(directory, "app.db") : join(process.cwd(), directory, "app.db");
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    if (path !== ":memory:") {
      const mode = (db.prepare("PRAGMA journal_mode = WAL").get() as { journal_mode: string }).journal_mode;
      if (mode !== "wal") throw new Error("Không bật được SQLite WAL");
    }
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
    if ((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys !== 1) {
      throw new Error("Không bật được SQLite foreign_keys");
    }
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDatabase(): DatabaseSync {
  return database ??= openDatabase(databasePath());
}
