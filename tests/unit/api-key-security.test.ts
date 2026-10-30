/**
 * Unit test — AC-16 bảo mật API key (P6 STRICT · tasks.md 17.9).
 *
 * AC-16: *"THE SYSTEM SHALL lưu API key chỉ trong `.env.local` trên máy người
 * dùng; SHALL KHÔNG commit; SHALL KHÔNG hiển thị đầy đủ trong UI; SHALL KHÔNG
 * gửi qua dịch vụ trung gian hoặc cloud storage"*
 *
 * Test bảo vệ 5 thứ:
 *   1. **Không còn literal key** trong `src/` hay HTML mockup — regex bắt chuỗi
 *      dạng `sk-ant-` + 20 ký tự trở lên (key Anthropic thật dài ~100 ký tự).
 *      Đây là "grep `sk-ant-` trong CI" mà requirements.md AC-16 yêu cầu.
 *   2. `.env.local` **không** được commit — `.gitignore` chặn, và git không
 *      track file nào tên `.env.local`.
 *   3. `maskApiKey()` luôn trả chuỗi đã che — **không** phụ thuộc độ dài key
 *      thật (tránh rò rỉ thông tin qua độ dài).
 *   4. `validateApiKey()` chặn key sai định dạng (thiếu `sk-ant-`, quá ngắn,
 *      quá dài, chứa khoảng trắng).
 *   5. Key lưu được **đọc lại** từ `.env.local` và có hiệu lực lúc runtime —
 *      `readEnvLocalKeyCached()` trả key mới ngay sau khi ghi, **không** cần
 *      restart app (Next.js chỉ nạp `.env.local` lúc boot).
 *
 * ⚠️ Test này **không** đọc/ghi `.env.local` thật — dùng `ENV_LOCAL_PATH` trỏ
 * tới file tạm trong `os.tmpdir()`.
 *
 * Xem tasks.md 9.3 / 9.4 / 17.9 · requirements.md AC-16 · design.md §4.15.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  API_KEY_ENV_NAME,
  ENV_LOCAL_FILENAME,
  MASKED_KEY,
  envLocalPath,
  invalidateEnvLocalKeyCache,
  maskApiKey,
  readEnvLocalKey,
  readEnvLocalKeyCached,
  validateApiKey,
  writeEnvLocalKey,
} from "@/lib/settings-api-key";

/** Thư mục gốc project — dùng để quét `src/` và đọc `.gitignore`. */
const ROOT = path.resolve(__dirname, "..", "..");

/**
 * Regex bắt literal API key.
 *
 * `sk-ant-` + **ít nhất 20** ký tự tiếp theo — khớp định dạng key Anthropic
 * thật (~100 ký tự) và các chuỗi giả dài tương tự. Cố tình **không** bắt:
 *   - `sk-ant-••••••••` (chuỗi đã che — dấu `•` không thuộc `[A-Za-z0-9_-]`)
 *   - `sk-ant-test-key`, `sk-ant-test-fixture-000` (fixture test, < 20 ký tự)
 */
const KEY_LITERAL_RE = /sk-ant-[A-Za-z0-9_-]{20,}/;

/**
 * Key giả hợp lệ về định dạng — đủ dài (≥ 20 ký tự sau prefix).
 *
 * ⚠️ **Dựng bằng string concat, không viết literal** — nếu viết thẳng chuỗi
 * `sk-ant-<40 ký tự>` vào file này thì chính file test cũng bị regex của
 * test quét `src/`… và repo bị "grep `sk-ant-`" dính lỗi. Ghép từ 2 mảnh để
 * không có literal dạng key nào trong source.
 */
const FAKE_KEY = `sk-ant-${"api03-fixture".repeat(4)}`;

/** Key giả thứ 2 — dùng để kiểm tra cache được làm mới khi ghi lại key. */
const SECOND_FAKE_KEY = `sk-ant-${"api03-second".repeat(4)}`;

/** File `.env.local` tạm cho test — không đụng file thật của máy dev. */
let tmpDir = "";
let tmpEnvLocal = "";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Không còn literal key trong source
// ─────────────────────────────────────────────────────────────────────────────

/** Liệt kê mọi file text trong 1 thư mục (bỏ qua `node_modules`, `.next`). */
function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx|html|css|json|md)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("AC-16 — không còn literal API key trong source", () => {
  it("src/ không chứa chuỗi dạng key thật", () => {
    const offenders: string[] = [];
    for (const file of collectFiles(path.join(ROOT, "src"))) {
      const content = fs.readFileSync(file, "utf8");
      if (KEY_LITERAL_RE.test(content)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("mockup HTML không chứa chuỗi dạng key thật", () => {
    const offenders: string[] = [];
    for (const file of collectFiles(path.join(ROOT, "stitch_daily_loop_os"))) {
      const content = fs.readFileSync(file, "utf8");
      if (KEY_LITERAL_RE.test(content)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("chuỗi đã che (`sk-ant-••••••••`) không bị regex bắt nhầm", () => {
    // Chống hồi quy: nếu regex siết quá, test trên sẽ "xanh" vì lỗi.
    expect(KEY_LITERAL_RE.test(MASKED_KEY)).toBe(false);
    expect(KEY_LITERAL_RE.test("sk-ant-test-key")).toBe(false);
    expect(KEY_LITERAL_RE.test(FAKE_KEY)).toBe(true);
  });

  it("chính file test này không chứa literal dạng key", () => {
    // Nếu file test tự chứa literal dạng key thì "grep `sk-ant-` trong repo"
    // (AC-16) sẽ dính lỗi ngay trong repo của chính ta.
    const self = fs.readFileSync(__filename, "utf8");
    expect(KEY_LITERAL_RE.test(self)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. `.env.local` không được commit
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-16 — `.env.local` không được commit", () => {
  it(".gitignore chặn `.env.local`", () => {
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    const patterns = gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(patterns).toContain(".env.local");
  });

  it("git không track file nào tên `.env.local`", () => {
    // `.gitignore` là tín hiệu đủ, nhưng check thật cho chắc: file có thể đã
    // được `git add -f` trước đó mà quên thêm vào ignore.
    const tracked = execGit(["ls-files"]);
    expect(tracked.some((f) => path.basename(f) === ENV_LOCAL_FILENAME)).toBe(false);
  });

  it("`.env.example` được track (hướng dẫn) và không chứa key thật", () => {
    const example = path.join(ROOT, ".env.example");
    if (!fs.existsSync(example)) return;
    const content = fs.readFileSync(example, "utf8");
    expect(KEY_LITERAL_RE.test(content)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Che key
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-16 — UI chỉ hiện key đã che", () => {
  it("maskApiKey luôn trả cùng một chuỗi, không phụ thuộc độ dài key", () => {
    expect(maskApiKey(FAKE_KEY)).toBe(MASKED_KEY);
    expect(maskApiKey("sk-ant-x")).toBe(MASKED_KEY);
    // 2 key khác độ dài → cùng 1 chuỗi che → không rò rỉ độ dài key thật.
    expect(maskApiKey(FAKE_KEY)).toBe(maskApiKey(`sk-ant-${"short"}`));
  });

  it("chuỗi che không chứa 4 ký tự cuối của key thật", () => {
    const masked = maskApiKey(FAKE_KEY);
    expect(masked).not.toContain(FAKE_KEY.slice(-4));
    // Chuỗi che chỉ gồm prefix + dấu chấm → không chứa ký tự hex nào của key.
    expect(masked).toBe("sk-ant-••••••••");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Validate key
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-16 — validate trước khi ghi", () => {
  it("key hợp lệ → ok", () => {
    const result = validateApiKey(FAKE_KEY);
    expect(result.ok).toBe(true);
  });

  it("thiếu prefix `sk-ant-` → bị chặn", () => {
    const result = validateApiKey("not-a-real-anthropic-key");
    expect(result.ok).toBe(false);
  });

  it("quá ngắn → bị chặn", () => {
    expect(validateApiKey("sk-ant-short").ok).toBe(false);
  });

  it("quá dài (> 200) → bị chặn", () => {
    expect(validateApiKey(`sk-ant-${"a".repeat(300)}`).ok).toBe(false);
  });

  it("chứa khoảng trắng → bị chặn", () => {
    expect(validateApiKey("sk-ant-abc def").ok).toBe(false);
  });

  it("chuỗi rỗng → bị chặn", () => {
    expect(validateApiKey("").ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Key có hiệu lực lúc runtime (không cần restart app)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-16 — key lưu trong `.env.local` có hiệu lực lúc runtime", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-os-key-"));
    tmpEnvLocal = path.join(tmpDir, ENV_LOCAL_FILENAME);
    process.env.ENV_LOCAL_PATH = tmpEnvLocal;
    invalidateEnvLocalKeyCache();
  });

  afterEach(() => {
    delete process.env.ENV_LOCAL_PATH;
    invalidateEnvLocalKeyCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ghi key → đọc lại được từ `.env.local`", () => {
    writeEnvLocalKey(FAKE_KEY);
    expect(fs.existsSync(tmpEnvLocal)).toBe(true);
    expect(readEnvLocalKey()).toBe(FAKE_KEY);
  });

  it("ghi key → `readEnvLocalKeyCached()` thấy key MỚI ngay (không cần restart)", () => {
    expect(readEnvLocalKeyCached()).toBeNull();

    writeEnvLocalKey(FAKE_KEY);

    // `process.env` KHÔNG được set từ key vừa ghi → key chỉ nằm ở file.
    // Nếu `readEnvLocalKeyCached()` vẫn trả key thì nó đọc từ **file**,
    // tức là có hiệu lực lúc runtime mà không cần restart app.
    expect(process.env[API_KEY_ENV_NAME]).not.toBe(FAKE_KEY);
    expect(readEnvLocalKeyCached()).toBe(FAKE_KEY);
  });

  it("ghi key lần 2 → cache được làm mới, trả key mới", () => {
    writeEnvLocalKey(FAKE_KEY);
    expect(readEnvLocalKeyCached()).toBe(FAKE_KEY);

    const second = SECOND_FAKE_KEY;
    writeEnvLocalKey(second);
    expect(readEnvLocalKeyCached()).toBe(second);
  });

  it("ghi key không phá các biến khác trong file", () => {
    fs.writeFileSync(
      tmpEnvLocal,
      'DATABASE_URL="file:./dev.db"\nOLLAMA_BASE_URL="http://localhost:11434"\n',
      "utf8",
    );

    writeEnvLocalKey(FAKE_KEY);

    const content = fs.readFileSync(tmpEnvLocal, "utf8");
    expect(content).toContain("DATABASE_URL=");
    expect(content).toContain("OLLAMA_BASE_URL=");
    expect(content).toContain(`${API_KEY_ENV_NAME}=${FAKE_KEY}`);
  });

  it("ghi 2 lần → không nhân bản dòng key", () => {
    writeEnvLocalKey(FAKE_KEY);
    writeEnvLocalKey(FAKE_KEY);

    const lines = fs
      .readFileSync(tmpEnvLocal, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.startsWith(`${API_KEY_ENV_NAME}=`));
    expect(lines).toHaveLength(1);
  });

  it("file `.env.local` có quyền 600 (chỉ user hiện tại đọc được)", () => {
    writeEnvLocalKey(FAKE_KEY);
    // Skip trên Windows — POSIX mode không áp dụng.
    if (process.platform === "win32") return;
    const mode = fs.statSync(tmpEnvLocal).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("`envLocalPath()` tôn trọng `ENV_LOCAL_PATH`", () => {
    expect(envLocalPath()).toBe(tmpEnvLocal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

/** Chạy 1 lệnh git, trả về stdout (không throw nếu lệnh fail). */
function execGit(args: string[]): string[] {
  try {
    const out = execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
    return out.split(/\r?\n/).filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}
