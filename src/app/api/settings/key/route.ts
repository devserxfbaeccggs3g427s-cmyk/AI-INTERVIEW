/**
 * `GET/POST /api/settings/key` — quản lý khóa API Anthropic (S15 · task 9.3 / 9.4).
 *
 * ⚠️ AC-16 — yêu cầu cứng nhất của nhóm này:
 *   - Key CHỈ nằm trong `.env.local` trên máy người dùng.
 *   - KHÔNG commit (`.env.local` đã nằm trong `.gitignore`).
 *   - KHÔNG hiển thị đầy đủ trong UI → route `GET` chỉ trả key đã che.
 *   - KHÔNG gửi qua dịch vụ trung gian / cloud storage.
 *
 * Endpoint này KHÔNG đưa key lên cloud: ping gọi **thẳng** từ máy người dùng
 * tới `https://api.anthropic.com/v1/messages`, không qua proxy trung gian nào.
 *
 * Xem tasks.md 9.3 / 9.4 / 17.9 · design.md §4.15 · requirements.md AC-16.
 */

import { NextResponse } from "next/server";
import {
  MASKED_KEY,
  maskApiKey,
  resolveApiKey,
  validateApiKey,
  writeEnvLocalKey,
} from "@/lib/settings-api-key";

/** Endpoint Messages của Anthropic — gọi thẳng, không qua server trung gian. */
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

/**
 * Model nhỏ nhất / rẻ nhất để ping — chỉ cần 1 token để xác nhận key sống.
 * Dùng model Flash (Haiku 4.5) vì đây là request kiểm tra, không phải task thật.
 */
const PING_MODEL = "claude-haiku-4-5";

/** Phiên bản API bắt buộc của header `anthropic-version`. */
const ANTHROPIC_VERSION = "2023-06-01";

/** Timeout cho 1 request ping — không để treo tab người dùng. */
const PING_TIMEOUT_MS = 10_000;

/**
 * `GET /api/settings/key` — trạng thái cấu hình + key **đã che**.
 *
 * TUYỆT ĐỐI không trả key đầy đủ (AC-16).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const key = resolveApiKey();
    return NextResponse.json({
      ok: true,
      data: {
        configured: key !== null,
        masked: key === null ? null : MASKED_KEY,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "read_failed", message: "Không đọc được cấu hình." } },
      { status: 500 },
    );
  }
}

type SaveResponse = {
  ok: true;
  data: { masked: string };
};

type ErrorResponse = {
  ok: false;
  error: { code: string; message: string };
};

type PingResponse =
  | { ok: true; data: { latencyMs: number; status: number; detail: string } }
  | ErrorResponse;

/**
 * `POST /api/settings/key` — 2 chế độ:
 *
 *   - `{ apiKey: string }` → validate + ghi `.env.local` (server-side).
 *   - `{ action: "ping" }` → 1 request tối thiểu tới Anthropic để đo độ trễ.
 *
 * Cả hai đều **không** bao giờ trả key đầy đủ.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Body phải là JSON hợp lệ." } },
      { status: 400 },
    );
  }

  const body = (raw ?? {}) as { apiKey?: unknown; action?: unknown };

  // ── Chế độ ping ────────────────────────────────────────────────────────
  if (body.action === "ping") {
    return pingAnthropic();
  }

  // ── Chế độ lưu key ─────────────────────────────────────────────────────
  if (typeof body.apiKey !== "string") {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "Thiếu khóa API." } },
      { status: 400 },
    );
  }

  const validated = validateApiKey(body.apiKey);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: validated.message } },
      { status: 400 },
    );
  }

  try {
    // Ghi server-side vào `.env.local` ở thư mục gốc project (ngoài `public/`).
    writeEnvLocalKey(validated.key);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "write_failed", message: "Không ghi được .env.local trên máy." },
      },
      { status: 500 },
    );
  }

  // Trả về **masked** — không phải key thật.
  const payload: SaveResponse = { ok: true, data: { masked: maskApiKey(validated.key) } };
  return NextResponse.json(payload);
}

/**
 * Ping 1 request tối thiểu tới Anthropic — đo độ trễ (ms).
 *
 * Gọi thẳng `fetch` tới endpoint Anthropic từ máy người dùng (không qua server
 * trung gian). Key chỉ đi trong header `x-api-key` và **không bao giờ** được log.
 */
async function pingAnthropic(): Promise<NextResponse> {
  const key = resolveApiKey();
  if (!key) {
    const payload: ErrorResponse = {
      ok: false,
      error: { code: "no_key", message: "Chưa cấu hình API key." },
    };
    return NextResponse.json(payload, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: PING_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const latencyMs = Date.now() - startedAt;

    if (response.ok) {
      const payload: PingResponse = {
        ok: true,
        data: { latencyMs, status: response.status, detail: "200 OK" },
      };
      return NextResponse.json(payload);
    }

    // 401/403 → key sai. 429 → bị chặn tần suất. 5xx → lỗi phía Anthropic.
    if (response.status === 401 || response.status === 403) {
      const payload: ErrorResponse = {
        ok: false,
        error: { code: "invalid_key", message: "Key không hợp lệ." },
      };
      return NextResponse.json(payload, { status: 200 });
    }
    if (response.status === 429) {
      const payload: ErrorResponse = {
        ok: false,
        error: { code: "rate_limited", message: "Bị giới hạn tần suất, thử lại sau." },
      };
      return NextResponse.json(payload, { status: 200 });
    }
    const payload: ErrorResponse = {
      ok: false,
      error: {
        code: "upstream_error",
        message: `Anthropic trả lỗi ${response.status}.`,
      },
    };
    return NextResponse.json(payload, { status: 200 });
  } catch {
    // Abort (timeout) hoặc lỗi mạng → không kết nối được.
    const payload: ErrorResponse = {
      ok: false,
      error: { code: "network_error", message: "Không kết nối được." },
    };
    return NextResponse.json(payload, { status: 200 });
  } finally {
    clearTimeout(timer);
  }
}
