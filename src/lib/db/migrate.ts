import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const migrations = ["0001_init.sql", "0002_cv_uploads.sql"] as const;

export function migrate(db: DatabaseSync, scripts: readonly string[] = migrations.map(
  (file) => readFileSync(join(process.cwd(), "src/lib/db/migrations", file), "utf8"),
)): void {
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version > scripts.length) {
    throw new Error("Phiên bản cơ sở dữ liệu mới hơn ứng dụng");
  }

  for (let index = version; index < scripts.length; index++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(scripts[index]);
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
