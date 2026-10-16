import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError } from "../src/lib/errors.ts";
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
  expect("năm bảng", tables, ["ai_settings", "cv_uploads", "evaluations", "sessions", "turns"]);
  expect("user_version", (memory.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
  migrate(memory);
  // Chạy lại phải **không** làm gì: `PRAGMA user_version` là bản số thứ tự script, nên
  // nó bằng số migration mới là bằng chứng migration đã chạy hết và chạy lại vô hại.
  expect("migration chạy lại", (memory.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
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
  // `UNIQUE (session_id, seq)` là bất biản "chỉ append" của §4.5, thực thi ở tầng
  // dữ liệu. `appendTurn` tự tính `seq` nên phải ghi trực tiếp mới chạm tới ràng buộc —
  // gọi hàm không còn tham số `expectedSeq` nên không còn đường nào cho nó chạy trùng.
  let duplicate = false;
  try {
    memory.prepare(`INSERT INTO turns (session_id, seq, role, text, blocks, synthetic, created_at)
      VALUES (?, 1, 'user', 'dup', NULL, 0, 0)`).run(id);
  } catch (error) {
    duplicate = (error as Error).message.includes("UNIQUE constraint failed: turns.session_id, turns.seq");
  }
  expect("seq trùng bị SQLite chặn", duplicate, true);
  expect("append rollback sau lỗi", (await repo.load(id))?.turns.length, 3);

  // `appendExchange` — §8.1. Ba mục này là cả T-2.9 ở tầng lưu trữ: cặp lượt nguyên tử,
  // `MAX(seq)` lệch thì 409 chứ không phải ghi đè, và lượt đã hỏi lên phiên đã đóng thì
  // 422 chứ không phải nối thêm.
  expect("countQuestions đếm lượt assistant", await repo.countQuestions(id), 1);
  expect("lastSeq là lượt cuối", await repo.lastSeq(id), 2);
  await repo.appendExchange(id, { role: "user", text: "C2" }, blocks, 3, "req-1");
  expect("appendExchange ghi hai lượt", (await repo.load(id))?.turns.map((t) => t.seq), [0, 1, 2, 3, 4]);
  expect("countQuestions sau cặp mới", await repo.countQuestions(id), 2);
  let conflicted = false;
  try { await repo.appendExchange(id, { role: "user", text: "C3" }, blocks, 3, "req-2"); }
  catch (error) { conflicted = error instanceof AppError && error.code === "session_conflict"; }
  expect("appendExchange lệch seq → session_conflict", conflicted, true);
  expect("lệch seq không ghi gì", (await repo.load(id))?.turns.length, 5);
  await repo.saveEvaluation(id, {}, false);
  let finished = false;
  try { await repo.appendExchange(id, { role: "user", text: "C4" }, blocks, 5, "req-3"); }
  catch (error) { finished = error instanceof AppError && error.code === "session_complete"; }
  expect("appendExchange lên phiên đã đóng → session_complete", finished, true);
  expect("phiên đã đóng không ghi thêm", (await repo.load(id))?.turns.length, 5);
  await repo.saveEvaluation(id, { report: "REPORT_SENTINEL" }, true);
  expect("đánh giá partial", (await repo.load(id))?.evaluation?.partial, true);
  await repo.saveSettings(ai);
  expect("settings không key", await repo.getSettings(), ai);
  expect("list có phiên", (await repo.list(10)).length, 1);
  expect("delete thành công", await repo.delete(id), true);
  expect("cascade lượt", (memory.prepare("SELECT COUNT(*) AS n FROM turns").get() as { n: number }).n, 0);
  expect("cascade đánh giá", (memory.prepare("SELECT COUNT(*) AS n FROM evaluations").get() as { n: number }).n, 0);
  const uploadId = "cv-upload-test";
  memory.prepare(`INSERT INTO cv_uploads
    (id, provider, model, extracted_text, file_id, key_fingerprint, filename, size_bytes, created_at, expires_at)
    VALUES (?, 'anthropic', 'claude-opus-5', 'CV_SENTINEL', 'file-private', 'fingerprint', 'cv.pdf', 10, 0, 9999999999999)`)
    .run(uploadId);
  const uploadedSession = await repo.create({ config, ai, cvText: "CV_SENTINEL", cvUploadId: uploadId });
  memory.prepare("DELETE FROM cv_uploads WHERE id = ?").run(uploadId);
  expect("CV staging xoá được sau khi phiên đã tham chiếu", memory.prepare("SELECT id FROM cv_uploads WHERE id = ?").get(uploadId), undefined);
  expect("phiên giữ CV sau khi xoá staging", (await repo.load(uploadedSession.id))?.cvText, "CV_SENTINEL");
  expect("lượt sau không còn file_id thô", await repo.loadCvRef(uploadedSession.id), null);
  await repo.delete(uploadedSession.id);
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
