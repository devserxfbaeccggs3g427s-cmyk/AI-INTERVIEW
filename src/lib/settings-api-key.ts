/**
 * Quản lý khóa API Anthropic — **server-side only** (AC-16 · tech.md rule 6).
 *
 * Nguyên tắc bất di bất dịch:
 *   1. Key chỉ nằm trong file `.env.local` ở thư mục gốc project (KHÔNG nằm trong `public/`).
 *   2. `.env.local` đã nằm trong `.gitignore` → không bao giờ bị commit.
 *   3. Hàm ở đây **không bao giờ** trả key đầy đủ cho phía client — chỉ trả chuỗi đã che.
 *   4. Không `console.log` key ở bất kỳ đâu; lỗi trả về chỉ mang mã lỗi + thông báo chung.
 *
 * File này là NEW (file `src/lib/settings-*.ts` được phép tạo mới theo phân công).
 * Xem tasks.md 9.3 / 9.4 / 17.9 · requirements.md AC-16.
 */

import "server-only";

import fs from "node:fs";
import path from "node:path";

/** Tên biến môi trường chuẩn của Anthropic. */
export const API_KEY_ENV_NAME = "ANTHROPIC_API_KEY";

/** Tên file chứa key — luôn ở thư mục gốc project, KHÔNG trong `public/`. */
export const ENV_LOCAL_FILENAME = ".env.local";

/**
 * Chuỗi che dùng cho mọi phản hồi về key.
 *
 * Cố tình **không** phụ thuộc độ dài key thật → không rò rỉ thông tin gì.
 * `sk-ant-••••••••` là dạng masked chuẩn của API (`GET /api/settings/key`).
 */
export const MASKED_KEY = "sk-ant-••••••••";

/** Độ dài hợp lệ của key Anthropic (thực tế ~100 ký tự; test dùng chuỗi giả ngắn hơn). */
const MIN_KEY_LENGTH = 20;
const MAX_KEY_LENGTH = 200;

/**
 * Đường dẫn tuyệt đối tới `.env.local` ở thư mục gốc project.
 *
 * Ghi đè được bằng biến `ENV_LOCAL_PATH` — hook cho **unit test**: test phải
 * trỏ tới file tạm, không được đọc/ghi `.env.local` thật của máy dev (sẽ làm
 * hỏng key đang cấu hình, và làm test phụ thuộc trạng thái máy).
 */
export function envLocalPath(): string {
  const override = process.env.ENV_LOCAL_PATH?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), ENV_LOCAL_FILENAME);
}

/** Che key — luôn trả về cùng một chuỗi, không phụ thuộc key thật. */
export function maskApiKey(_key: string): string {
  return MASKED_KEY;
}

export type ApiKeyValidation =
  | { ok: true; key: string }
  | { ok: false; message: string };

/**
 * Kiểm tra key trước khi ghi.
 *
 * - Phải bắt đầu bằng tiền tố `sk-ant-` (tiền tố chính thức của Anthropic).
 * - Độ dài trong khoảng hợp lý.
 * - Không chứa khoảng trắng / ký tự xuống dòng (tránh bị chèn dòng env khác).
 */
export function validateApiKey(raw: string): ApiKeyValidation {
  const key = raw.trim();

  if (key.length === 0) {
    return { ok: false, message: "Chưa nhập khóa API." };
  }
  if (!key.startsWith("sk-ant-")) {
    return { ok: false, message: "Khóa phải bắt đầu bằng `sk-ant-`." };
  }
  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
    return { ok: false, message: "Độ dài khóa không hợp lệ." };
  }
  if (/\s/.test(key)) {
    return { ok: false, message: "Khóa chứa ký tự không hợp lệ." };
  }
  return { ok: true, key };
}

/**
 * Đọc key từ `.env.local`.
 *
 * Chỉ đọc file — KHÔNG log, KHÔNG trả về cho client trực tiếp.
 * Trả `null` nếu file không tồn tại hoặc biến rỗng.
 */
export function readEnvLocalKey(): string | null {
  const filePath = envLocalPath();
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*ANTHROPIC_API_KEY\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const raw = (match[1] ?? "").trim();
    const unquoted =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1).trim()
        : raw;
    return unquoted.length > 0 ? unquoted : null;
  }
  return null;
}

/**
 * Key dùng cho việc kiểm tra kết nối.
 *
 * Ưu tiên `.env.local` (nguồn sự thật sau khi người dùng bấm "Lưu khóa"),
 * fallback sang `process.env` cho lúc app vừa khởi động.
 */
export function resolveApiKey(): string | null {
  const fromFile = readEnvLocalKey();
  if (fromFile) return fromFile;

  const fromEnv = process.env[API_KEY_ENV_NAME]?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

/**
 * Cache của key đã đọc từ `.env.local` — dùng cho **đường gọi AI nóng**.
 *
 * Vì sao cần cache:
 *   `callAi()` được gọi ở mọi route AI. Đọc file `.env.local` ở mỗi lượt gọi
 *   là 1 syscall `stat` + 1 `readFile` trên mỗi request — thừa, vì file này
 *   gần như không đổi (chỉ đổi khi người dùng bấm "Lưu khóa").
 *
 * Vì sao cache theo `mtimeMs` chứ không cache mãi:
 *   Next.js chỉ nạp `.env.local` **một lần lúc khởi động process**. Người dùng
 *   bấm "Lưu khóa" giữa phiên làm việc → file đổi nhưng `process.env` không
 *   đổi → key mới **không** có hiệu lực tới khi restart app. Đọc lại file khi
 *   `mtimeMs` đổi là cách sửa đúng mà không cần restart.
 */
let cachedKey: { value: string | null; mtimeMs: number } | null = null;

/**
 * Đọc key từ `.env.local` — có cache theo `mtimeMs` của file.
 *
 * Khác `readEnvLocalKey()` ở chỗ: hàm này **cache** kết quả, nên chỉ dùng ở
 * đường nóng (gọi AI). Chỗ cần luôn thấy file mới (route GET/POST) dùng
 * `readEnvLocalKey()`.
 */
export function readEnvLocalKeyCached(): string | null {
  const filePath = envLocalPath();

  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // File không tồn tại → không có key trong file.
    cachedKey = { value: null, mtimeMs: -1 };
    return null;
  }

  if (cachedKey && cachedKey.mtimeMs === mtimeMs) {
    return cachedKey.value;
  }

  const value = readEnvLocalKey();
  cachedKey = { value, mtimeMs };
  return value;
}

/**
 * Xoá cache key — gọi sau khi **ghi** `.env.local` để lượt gọi AI kế tiếp
 * thấy key mới ngay (không cần restart app).
 */
export function invalidateEnvLocalKeyCache(): void {
  cachedKey = null;
}

/**
 * Ghi key vào `.env.local` — thay dòng cũ nếu có, nếu không thì thêm vào cuối.
 *
 * Không phá vỡ các biến khác đang có trong file (DATABASE_URL, OLLAMA_* …).
 * File được ghi với quyền 600 (chỉ user hiện tại đọc được) trên macOS/Linux.
 */
export function writeEnvLocalKey(apiKey: string): void {
  const filePath = envLocalPath();
  const keyLine = `${API_KEY_ENV_NAME}=${apiKey}`;

  let existing = "";
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, "utf8");
  }

  const lines = existing.split(/\r?\n/);
  let replaced = false;
  const next = lines.map((line) => {
    if (/^\s*ANTHROPIC_API_KEY\s*=/.test(line)) {
      replaced = true;
      return keyLine;
    }
    return line;
  });

  if (!replaced) {
    // Bỏ các dòng trống cuối file rồi nối dòng mới — giữ file gọn và dễ đọc.
    while (next.length > 0 && (next[next.length - 1] ?? "").trim() === "") {
      next.pop();
    }
    next.push(keyLine);
  }

  const output = `${next.join("\n").replace(/\n+$/, "")}\n`;
  fs.writeFileSync(filePath, output, { encoding: "utf8", mode: 0o600 });

  // `mode` chỉ áp dụng lúc tạo file — chmod lại cho file đã tồn tại.
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows / hệ thống file không hỗ trợ → bỏ qua, không làm hỏng luồng chính.
  }

  // Xoá cache → lượt gọi AI kế tiếp dùng key vừa lưu (không cần restart app).
  invalidateEnvLocalKeyCache();
}
