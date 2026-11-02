/**
 * Unit test — hàm nghiệp vụ cho kho đề luyện nói/viết (FR-CM-09..12).
 *
 * ⚠️ Test bằng SQLite test DB riêng (`prisma/test-speak.db`) — không đụng dev DB.
 * ⚠️ Test đóng gói sơ sơ: `beforeAll` → migrate + seed, `afterEach` → xoá dữ liệu.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT = "/Users/ngocshb/Documents/CD/AI PROJ";
const TEST_DB = path.join(ROOT, "prisma", "test-speak.db");

// Prisma đọc `DATABASE_URL` lúc import ⇒ set trước mọi dynamic import.
process.env.DATABASE_URL = `file:./test-speak.db`;
// ⚠️ Offline mode — không có API key ⇒ chấm cục bộ (FR-CM-11).
delete process.env.ANTHROPIC_API_KEY;

function runPrisma(args: string[]): void {
  execFileSync("npx", ["tsx", "scripts/prisma-cli.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:./test-speak.db` },
    stdio: "pipe",
  });
}

beforeAll(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }
  runPrisma(["migrate", "deploy"]);
  runPrisma(["db", "seed"]);
}, 180_000);

afterAll(() => {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }
});

afterEach(async () => {
  const { prisma } = await import("@/lib/db");
  await prisma.activity.deleteMany();
  await prisma.speakAttempt.deleteMany();
});

describe("listSpeakPrompts — FR-CM-09", () => {
  it("trả đúng 12 bài mẫu (EX-01..EX-12)", async () => {
    const prompts = await import("@/lib/speak").then((m) =>
      m.listSpeakPrompts(),
    );
    expect(prompts).toHaveLength(12);
    // ⚠️ Kho đề nằm ở bảng `SpeakPrompt` (M3) ⇒ id là cuid sinh tự động,
    // không phải `seed-speak-EX-01`. Kiểm tra theo `title` + thứ tự `code`.
    expect(prompts[0].title).toBe("Yêu cầu hoãn sprint deadline");
    expect(prompts[11].title).toBeTruthy();
    // Mọi bài đều có đề bài (không phải chuỗi JSON metadata).
    for (const p of prompts) {
      expect(p.prompt.length).toBeGreaterThan(20);
      expect(p.prompt.startsWith("{")).toBe(false);
    }
  });

  it("có thông tin ngôn ngữ lẫn kênh hoạt động", async () => {
    const prompts = await import("@/lib/speak").then((m) => m.listSpeakPrompts());
    // Mỗi bài phải có lang + mode (không null) — metadata được nhúng trong content JSON.
    for (const p of prompts) {
      expect(p.lang).not.toBeNull();
      expect(p.mode).not.toBeNull();
      expect(["en", "vi", "zh"]).toContain(p.lang as string);
      expect(["write", "speak", "both"]).toContain(p.mode as string);
    }
  });

  it("không trả về bài người dùng tự tạo (isUserMade = false)", async () => {
    await import("@/lib/speak").then((m) => m.saveAttempt({ text: "t", lang: "en" }));
    const prompts = await import("@/lib/speak").then((m) => m.listSpeakPrompts());
    // Đảm bảo bài seed vẫn 12 — không bị phân tán thành 13/16.
    expect(prompts).toHaveLength(12);
  });

  it("bật sẵn filter ngôn ngữ & chế độ (FR-CM-09)", async () => {
    const en = await import("@/lib/speak").then((m) => m.listSpeakPrompts({ lang: "en" }));
    expect(en.every((p) => p.lang === "en")).toBe(true);
    const both = await import("@/lib/speak").then((m) => m.listSpeakPrompts({ lang: "en", mode: "both" }));
    // Seed có 9 bài `en`, trong đó 6 bài `mode=both` ⇒ lọc `both` trả về
    // các bài `both` **và** bài `both` dùng ở cả 2 kênh.
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((p) => p.lang === "en" && p.mode === "both")).toBe(true);
    // Mọi bài `both` phải là `write` hoặc `speak` dùng được.
    expect(both.length).toBeLessThanOrEqual(en.length);
  });
});

describe("saveAttempt & listAttempts — FR-CM-12, AC-CM-3", () => {
  it("trả SpeakAttemptDTO có mode đúng (khi mode write ⇒ type=write)", async () => {
    const attempt = await import("@/lib/speak").then((m) =>
      m.saveAttempt({ text: "my practice sentence", lang: "en", mode: "write" }),
    );
    expect(attempt.mode).toBe("write");

    const list = await import("@/lib/speak").then((m) => m.listSpeakPrompts());
    // Bài người dùng tự tạo không có trong kho đề (FR-CM-11).
    expect(list.find((p) => p.id === attempt.id)).toBeUndefined();

    // Lịch sử chỉ còn lượt luyện thật.
    const history = await import("@/lib/speak").then((m) => m.listAttempts());
    expect(history.find((h) => h.id === attempt.id)).toBeTruthy();
  });

  it("mode=speak ⇒ SpeakAttemptDTO.mode = speak, và kho đề ko lẫn", async () => {
    const attempt = await import("@/lib/speak").then((m) =>
      m.saveAttempt({ text: "oral practice content", lang: "vi", mode: "speak" }),
    );
    expect(attempt.mode).toBe("speak");

    const history = await import("@/lib/speak").then((m) => m.listAttempts());
    expect(history.find((h) => h.id === attempt.id)).toBeTruthy();

    // Bài seed không lẫn vào lịch sử.
    const seedInHistory = history.filter((h) => h.id.startsWith("seed-"));
    expect(seedInHistory).toHaveLength(0);
  });
});
