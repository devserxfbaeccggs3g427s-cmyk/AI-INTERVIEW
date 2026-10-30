/**
 * Đọc biến môi trường — 1 chỗ duy nhất (FR-AF-26).
 *
 * - Thiếu `DATABASE_URL` → throw lỗi có hướng dẫn cụ thể (app không thể chạy).
 * - Thiếu `ANTHROPIC_API_KEY` → **không** throw, chỉ bật offline mode (FR-AI-06).
 * - Không bao giờ log giá trị key đầy đủ — chỉ mask.
 */

function maskKey(key: string): string {
  if (!key) return "";
  return `sk-ant-…${key.slice(-4)}`;
}

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "Thiếu DATABASE_URL. Copy .env.example → .env.local rồi chạy `npm run db:migrate`.",
    );
  }
  return value;
}

export const env = {
  databaseUrl: requireDatabaseUrl(),

  /** `null` = offline mode. Không phải lỗi. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,

  nodeEnv: process.env.NODE_ENV ?? "development",

  get isOffline(): boolean {
    return !this.anthropicApiKey;
  },

  /** Key đã mask — dùng cho UI hiển thị. */
  get maskedKey(): string {
    return this.anthropicApiKey ? maskKey(this.anthropicApiKey) : "";
  },
};

if (env.isOffline && env.nodeEnv === "development") {
  console.warn(
    "[daily-loop] Không có ANTHROPIC_API_KEY — đang chạy OFFLINE MODE. " +
      "Tính năng AI sẽ hiện 'cần API key' thay vì gọi API.",
  );
}
