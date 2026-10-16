import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/lib/db/client.ts";
import { migrate } from "../src/lib/db/migrate.ts";
import { SqliteSessionRepository } from "../src/lib/db/session-repo.ts";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "LOI "} ${label} → ${JSON.stringify(actual)} (cần ${JSON.stringify(wanted)})`);
}

const memory = new DatabaseSync(":memory:");
try {
  migrate(memory);
  const tables = (memory.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  expect("bốn bảng", tables, ["ai_settings", "evaluations", "sessions", "turns"]);
  expect("user_version", (memory.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1);
  migrate(memory);
  expect("migration chạy lại", (memory.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1);
  const indexes = (memory.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sessions_recent'").all() as { name: string }[]).map((r) => r.name);
  expect("index lịch sử", indexes, ["sessions_recent"]);

  const broken = new DatabaseSync(":memory:");
  try {
    let rolledBack = false;
    try { migrate(broken, ["CREATE TABLE temporary_table (id INTEGER); INVALID SQL;"]); }
    catch { rolledBack = true; }
    expect("migration lỗi bị từ chối", rolledBack, true);
    expect("rollback phiên bản", (broken.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 0);
    expect("rollback bảng", broken.prepare("SELECT name FROM sqlite_master WHERE name = 'temporary_table'").get(), undefined);
  } finally { broken.close(); }

  const repo = new SqliteSessionRepository(memory);
  const ai = { provider: "anthropic" as const, model: "claude-opus-5", reasoning: "medium" as const, callMode: "proxy" as const };
  const config = { role: "Kỹ sư", language: "vi" as const, mode: "strict" as const, length: "short" as const };
  const { id } = await repo.create({ config, ai, cvText: "CV_SENTINEL" });
  await repo.appendTurn(id, { role: "user", text: "bắt đầu", synthetic: true });
  const blocks = [{ type: "thinking", thinking: "bí mật", signature: "sig-test-123" }, { type: "text", text: "Câu hỏi?" }];
  await repo.appendTurn(id, { role: "assistant", blocks });
  await repo.appendTurn(id, { role: "user", text: "ANSWER_SENTINEL" });
  const loaded = await repo.load(id);
  expect("CV lưu riêng", loaded?.cvText, "CV_SENTINEL");
  expect("config không chứa CV", JSON.stringify(loaded?.config).includes("CV_SENTINEL"), false);
  expect("lượt theo thứ tự", loaded?.turns.map((t) => t.seq), [0, 1, 2]);
  expect("synthetic được giữ", loaded?.turns[0].role === "user" && loaded.turns[0].synthetic, true);
  expect("JSON blocks giữ nguyên byte", JSON.stringify(loaded?.turns[1].role === "assistant" && loaded.turns[1].blocks), JSON.stringify(blocks));
  expect("số câu trả lời không tính synthetic", loaded?.turns.filter((t) => t.role === "user" && !t.synthetic).length, 1);
  let duplicate = false;
  try { await repo.appendTurn(id, { role: "user", text: "dup" }, 1); }
  catch (error) { duplicate = (error as Error).message.includes("UNIQUE constraint failed: turns.session_id, turns.seq"); }
  expect("seq trùng bị SQLite chặn", duplicate, true);
  expect("append rollback sau lỗi", (await repo.load(id))?.turns.length, 3);
  await repo.saveEvaluation(id, { report: "REPORT_SENTINEL" }, true);
  expect("đánh giá partial", (await repo.load(id))?.evaluation?.partial, true);
  await repo.saveSettings(ai);
  expect("settings không key", await repo.getSettings(), ai);
  expect("list có phiên", (await repo.list(10)).length, 1);
  expect("delete thành công", await repo.delete(id), true);
  expect("cascade lượt", (memory.prepare("SELECT COUNT(*) AS n FROM turns").get() as { n: number }).n, 0);
  expect("cascade đánh giá", (memory.prepare("SELECT COUNT(*) AS n FROM evaluations").get() as { n: number }).n, 0);
  await repo.create({ config, ai });
  expect("purge trả số phiên", await repo.purge(), 1);
  expect("purge cả settings", await repo.getSettings(), null);
} finally { memory.close(); }

const directory = mkdtempSync(join(tmpdir(), "probe-db-"));
try {
  const db = openDatabase(join(directory, "app.db"));
  try {
    expect("WAL trên đĩa", (db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode, "wal");
    expect("foreign keys", (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
    expect("busy timeout", (db.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout, 5000);
  } finally { db.close(); }
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log(failures === 0 ? "\nTẤT CẢ ĐÚNG" : `\n${failures} MỤC SAI`);
process.exitCode = failures === 0 ? 0 : 1;
