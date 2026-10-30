/**
 * AI Router — nguồn duy nhất chọn provider cho mọi lượt gọi AI (FR-AI-09).
 *
 * ```txt
 * route handler → router.route(task) → { provider, model, effort }
 *                 ├─ local     → Ollama HTTP (0 token, offline-safe)
 *                 └─ anthropic → Anthropic SDK (streaming + prompt cache)
 * ```
 *
 * `ROUTES` là **nguồn sự thật duy nhất** cho nhóm task (design.md §6.9) —
 * nhóm local / nhóm anthropic / task không gọi AI đều suy ra từ đây, không
 * hardcode ở nơi khác.
 *
 * Fallback chain (design.md §6.2): `anthropic → local → rule cục bộ`.
 * - Bước 1 thất bại → thử provider local (nếu task cho phép).
 * - Bước 2 thất bại → thử rule cục bộ (chỉ `daily_plan` có rule: `generateLocalPlan`).
 * - Không bao giờ trả lỗi trần cho UI (AC-8).
 *
 * Xem tasks.md 2.4 / 2.5 · design.md §6.1 / §6.2 / §6.9.
 */

import type { z } from "zod";

import {
  AiUnavailableError,
  toAiErrorCode,
  type AiErrorCode,
} from "@/lib/errors";
import { generateLocalPlan, type LocalPlanContext } from "@/lib/plan";
import { readEnvLocalKeyCached } from "@/lib/settings-api-key";
import type { AiEnvelope } from "@/lib/types";
import { callAnthropicDetailed, estimateCost, writeAiCall } from "@/lib/ai/anthropic";
import { callLocal } from "@/lib/ai/ollama";
import { prisma } from "@/lib/db";

/** 18 task mà router điều phối (design.md §6.1). */
export type AiTask =
  // ── local (7) ────────────────────────────────────────────────────────────
  | "autofill"
  | "classify"
  | "language_correct"
  | "language_level"
  | "test_from_content"
  | "biometric_correlate"
  | "mock_next_question"
  // ── anthropic (10) ───────────────────────────────────────────────────────
  | "daily_plan"
  | "grading"
  | "journal_feedback"
  | "weekly_review"
  | "roleplay"
  | "language_cards"
  | "mock_interview"
  | "mock_interview_turn"
  | "mock_interview_report"
  | "language_test_grade"
  // ── không gọi AI (1) ─────────────────────────────────────────────────────
  | "test_blueprint";

/** Kết quả định tuyến — `model` + `effort` là metadata của route. */
export type AiRoute = {
  provider: "local" | "anthropic";
  model: string;
  effort: "low" | "medium" | "high";
};

/**
 * Bảng định tuyến bắt buộc (design.md §6.1).
 *
 * `effort` là **metadata nội bộ** của route (dùng để chọn mức suy luận/temperature),
 * KHÔNG gửi lên API — SDK `@anthropic-ai/sdk@0.72` chưa có trường `effort`
 * trong `output_config` nên ta giữ nó ở tầng router.
 */
export const ROUTES: Readonly<Record<AiTask, AiRoute>> = {
  // ── local ────────────────────────────────────────────────────────────────
  autofill: { provider: "local", model: "qwen2.5:7b", effort: "low" },
  classify: { provider: "local", model: "qwen2.5:7b", effort: "low" },
  language_correct: { provider: "local", model: "qwen2.5-coder:7b-instruct", effort: "low" },
  language_level: { provider: "local", model: "qwen2.5-coder:7b-instruct", effort: "low" },
  test_from_content: { provider: "local", model: "qwen2.5:7b", effort: "medium" },
  biometric_correlate: { provider: "local", model: "llama3.3", effort: "low" },
  mock_next_question: { provider: "local", model: "llama3.3", effort: "low" },
  // ── anthropic ────────────────────────────────────────────────────────────
  daily_plan: { provider: "anthropic", model: "claude-opus-5", effort: "medium" },
  grading: { provider: "anthropic", model: "claude-opus-5", effort: "medium" },
  journal_feedback: { provider: "anthropic", model: "claude-opus-5", effort: "low" },
  weekly_review: { provider: "anthropic", model: "claude-opus-5", effort: "high" },
  roleplay: { provider: "anthropic", model: "claude-opus-5", effort: "medium" },
  language_cards: { provider: "anthropic", model: "claude-haiku-4-5", effort: "low" },
  mock_interview: { provider: "anthropic", model: "claude-opus-5", effort: "medium" },
  mock_interview_turn: { provider: "anthropic", model: "claude-opus-5", effort: "medium" },
  mock_interview_report: { provider: "anthropic", model: "claude-opus-5", effort: "high" },
  language_test_grade: { provider: "anthropic", model: "claude-opus-5", effort: "medium" },
  // ── không gọi AI ──────────────────────────────────────────────────────────
  // AI-14 chọn lọc tất định từ thẻ đến hạn + ngân hàng seed (FR-LT-12).
  // Vẫn khai báo provider "anthropic" để `route()` luôn trả đủ 3 trường.
  test_blueprint: { provider: "anthropic", model: "claude-opus-5", effort: "low" },
};

/** Nhóm task chạy local (7) — suy ra từ `ROUTES`, không hardcode (design.md §6.9). */
export const LOCAL_TASKS: readonly AiTask[] = (Object.keys(ROUTES) as AiTask[]).filter(
  (task) => ROUTES[task].provider === "local",
);

/** Nhóm task cần Anthropic (10) — suy ra từ `ROUTES`. */
export const ANTHROPIC_TASKS: readonly AiTask[] = (Object.keys(ROUTES) as AiTask[]).filter(
  (task) => ROUTES[task].provider === "anthropic" && task !== "test_blueprint",
);

/** Task **không** gọi AI (1) — `test_blueprint` (design.md §6.1 ghi chú 3). */
export const NON_AI_TASKS: readonly AiTask[] = ["test_blueprint"];

/**
 * Task chấm điểm — **luôn** dùng provider anthropic (design.md §10, rủi ro
 * "model local yếu hơn cloud → chấm điểm sai"). Các task này KHÔNG được
 * fallback sang Ollama — chấm sai còn tệ hơn báo lỗi.
 */
const SCORING_TASKS: readonly AiTask[] = [
  "grading",
  "language_test_grade",
  "mock_interview_turn",
  "mock_interview_report",
];

/**
 * Model local tương đương cho từng task anthropic (design.md §6.2 bước 2:
 * "chỉ dùng được … khi local có model tương đương").
 */
const LOCAL_FALLBACK_MODEL: Partial<Record<AiTask, string>> = {
  daily_plan: "qwen2.5:7b",
  journal_feedback: "qwen2.5:7b",
  weekly_review: "qwen2.5:7b",
  roleplay: "qwen2.5:7b",
  language_cards: "qwen2.5:7b",
  mock_interview: "qwen2.5:7b",
};

/** Task này có cần gọi AI không? */
export function isAiFreeTask(task: AiTask): boolean {
  return NON_AI_TASKS.includes(task);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chế độ khẩn cấp tiết kiệm (task 17.6)
// ─────────────────────────────────────────────────────────────────────────────

/** Model rẻ nhất của Anthropic — dùng khi bật chế độ khẩn cấp. */
export const EMERGENCY_CLOUD_MODEL = "claude-haiku-4-5";

/**
 * Cache trạng thái chế độ khẩn cấp trong tiến trình.
 *
 * Vì sao cache: `route()` được gọi **mỗi lượt gọi AI** — đọc DB mỗi lần là
 * 1 query thừa. Đọc 1 lần rồi cache, đổi cờ qua API settings sẽ xoá cache.
 */
let emergencyModeCache: boolean | null = null;

/** Đọc cờ `UserProfile.emergencyMode` (có cache trong tiến trình). */
export async function isEmergencyMode(): Promise<boolean> {
  if (emergencyModeCache !== null) return emergencyModeCache;
  try {
    const profile = await prisma.userProfile.findFirst({
      select: { emergencyMode: true },
      orderBy: { createdAt: "asc" },
    });
    emergencyModeCache = profile?.emergencyMode ?? false;
  } catch {
    // DB lỗi → không chặn người dùng, coi như không bật chế độ khẩn cấp.
    emergencyModeCache = false;
  }
  return emergencyModeCache;
}

/** Xoá cache chế độ khẩn cấp — gọi sau khi bật/tắt trong S15. */
export function resetEmergencyModeCache(): void {
  emergencyModeCache = null;
}

/**
 * Route đã điều chỉnh theo chế độ khẩn cấp.
 *
 * - Task **local** → giữ nguyên provider `local` (đã 0 token).
 * - Task **cloud** → đổi model sang `claude-haiku-4-5` (rẻ nhất).
 *
 * Task chấm điểm cũng dùng Haiku — đánh đổi chất lượng chấm lấy chi phí, đúng
 * như ý nghĩa "khẩn cấp tiết kiệm" (task 17.6).
 */
export function applyEmergencyMode(target: AiRoute): AiRoute {
  if (target.provider === "local") return target;
  return { ...target, model: EMERGENCY_CLOUD_MODEL };
}

/** Chọn provider theo bảng định tuyến (design.md §6.1). */
export function route(task: AiTask): AiRoute {
  return ROUTES[task];
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Override — model local do người dùng chọn (task 17.10)
// ─────────────────────────────────────────────────────────────────────────────

/** Cache model override cho từng task local. */
let routeOverrideCache: Record<string, string> | null = null;

/** Đọc model override từ DB (có cache tiến trình). */
async function getRouteOverrides(): Promise<Record<string, string>> {
  if (routeOverrideCache !== null) return routeOverrideCache;
  try {
    const overrides = await prisma.routeOverride.findMany({
      select: { task: true, model: true },
    });
    routeOverrideCache = Object.fromEntries(overrides.map((o) => [o.task, o.model]));
  } catch {
    routeOverrideCache = {};
  }
  return routeOverrideCache;
}

/** Xoá cache override — gọi sau khi cập nhật model local trong S15. */
export function resetRouteOverrideCache(): void {
  routeOverrideCache = null;
}

/**
 * Route có tính tới: chế độ khẩn cấp + override model local (task 17.10).
 *
 * - Task local: áp dụng override nếu có (người dùng chọn model khác).
 * - Task cloud: áp dụng chế độ khẩn cấp (đổi sang Haiku).
 * - Task không gọi AI: trả về route gốc.
 *
 * Khác `route()` ở chỗ: đây là hàm async vì phải đọc DB.
 */
export async function resolveRoute(task: AiTask): Promise<AiRoute> {
  const target = ROUTES[task];
  const emergency = await isEmergencyMode();

  // Task local → áp override model (nếu có) trước, rồi mới xét emergency
  if (target.provider === "local") {
    const overrides = await getRouteOverrides();
    const customModel = overrides[task];
    const withOverride = customModel ? { ...target, model: customModel } : target;
    if (emergency) return applyEmergencyMode(withOverride);
    return withOverride;
  }

  // Task cloud / không AI → chỉ áp emergency
  if (emergency) return applyEmergencyMode(target);
  return target;
}

/** Task được phép fallback sang provider local không (bước 2 của fallback chain). */
function supportsLocalFallback(task: AiTask): boolean {
  return !SCORING_TASKS.includes(task);
}

/**
 * Có thể gọi cloud không?
 *
 * Nhận cả `ANTHROPIC_API_KEY` (chuẩn) và `ANTHROPIC_AUTH_TOKEN` (gateway) —
 * phải khớp với `getAnthropicClient()` trong `anthropic.ts`, nếu không router
 * sẽ nghĩ là offline trong khi client thực tế có thể gọi được.
 *
 * ⚠️ AC-16 — đọc key từ `.env.local` **lúc runtime** (nguồn sự thật theo
 * tasks.md 17.9), fallback `process.env`. Phải khớp **đúng** logic với
 * `getAnthropicClient()` — nếu lệch, router sẽ tưởng offline trong khi client
 * có thể gọi được (hoặc ngược lại).
 */
function hasApiKey(): boolean {
  const apiKey = readEnvLocalKeyCached() ?? process.env.ANTHROPIC_API_KEY?.trim();
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  return Boolean(apiKey || authToken);
}

/** Tuỳ chọn gửi kèm `callAi` cho provider local. */
export type CallAiOptions<T> = {
  /** System prompt — phải tĩnh (FR-AI-09). */
  system: string;
  /** User message — dữ liệu động nằm ở đây. */
  user: string;
  /** Schema structured output → zod validate kết quả. */
  schema?: z.ZodType<T>;
  /** Model ghi đè (mặc định lấy từ `ROUTES`). */
  model?: string;
  /** Mức suy luận (metadata của route). */
  effort?: "low" | "medium" | "high";
  /** Bật streaming (chỉ provider anthropic). */
  stream?: boolean;
  /** Ngữ cảnh rule cục bộ — chỉ dùng cho fallback cuối của `daily_plan`. */
  localContext?: LocalPlanContext;
};

/** Kết quả nội bộ của 1 lượt gọi — kèm metadata ghi log. */
type CallResult<T> = {
  data: T;
  provider: "local" | "anthropic";
  model: string;
  effort: "low" | "medium" | "high";
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  estimatedCost: number;
  latencyMs: number;
  /** Provider gốc bị lỗi (nếu đã fallback). */
  fallbackFrom?: string;
};

/**
 * Fallback chain (design.md §6.2): `anthropic → local → rule cục bộ`.
 *
 * - `anthropic` lỗi → thử `local` (nếu task cho phép — task chấm điểm thì không).
 * - `local` lỗi → thử rule cục bộ (chỉ `daily_plan` có rule: `generateLocalPlan`).
 * - Hết đường → ném lỗi gốc (route handler bắt → `{ok:false}`).
 *
 * `fallbackFrom` = provider **gốc** đã lỗi, để S15 hiển thị đúng "3 offline fallback".
 */
export async function runWithFallback<T>(
  task: AiTask,
  opts: CallAiOptions<T>,
): Promise<CallResult<T>> {
  // `resolveRoute` áp dụng chế độ khẩn cấp tiết kiệm (task 17.6) — nếu bật,
  // task cloud chạy `claude-haiku-4-5` thay vì model đắt.
  const target = await resolveRoute(task);
  const model = opts.model ?? target.model;
  const effort = opts.effort ?? target.effort;

  // ── Bước 1: provider chính theo bảng định tuyến ──────────────────────────
  try {
    if (target.provider === "anthropic") {
      if (!hasApiKey()) {
        throw new AiUnavailableError("Chưa cấu hình Anthropic API key.", "no_api_key");
      }
      const result = await callAnthropicDetailed<T>({
        task,
        system: opts.system,
        user: opts.user,
        ...(opts.schema ? { schema: opts.schema } : {}),
        model,
        effort,
        ...(opts.stream ? { stream: true } : {}),
      });
      return {
        data: result.data,
        provider: "anthropic",
        model,
        effort,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheRead: result.usage.cacheRead,
        cacheWrite: result.usage.cacheWrite,
        estimatedCost: result.usage.estimatedCost,
        latencyMs: result.usage.latencyMs,
      };
    }

    const data = await callLocal<T>({
      task,
      system: opts.system,
      user: opts.user,
      ...(opts.schema ? { schema: opts.schema } : {}),
      model,
    });
    return {
      data,
      provider: "local",
      model,
      effort,
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      estimatedCost: 0,
      latencyMs: 0,
    };
  } catch (primaryError) {
    // ── Bước 2: provider local ─────────────────────────────────────────────
    if (target.provider === "anthropic" && supportsLocalFallback(task)) {
      try {
        const data = await callLocal<T>({
          task,
          system: opts.system,
          user: opts.user,
          ...(opts.schema ? { schema: opts.schema } : {}),
          model: LOCAL_FALLBACK_MODEL[task] ?? "qwen2.5:7b",
        });
        return {
          data,
          provider: "local",
          model: LOCAL_FALLBACK_MODEL[task] ?? "qwen2.5:7b",
          effort,
          inputTokens: 0,
          outputTokens: 0,
          cacheRead: 0,
          cacheWrite: 0,
          estimatedCost: 0,
          latencyMs: 0,
          fallbackFrom: "anthropic",
        };
      } catch {
        // Bước 2 thất bại → rơi xuống bước 3.
      }
    }

    // ── Bước 3: rule cục bộ ────────────────────────────────────────────────
    // Chỉ `daily_plan` có rule sinh slot (design.md §6.2 bước 3).
    if (task === "daily_plan" && opts.localContext) {
      const slots = generateLocalPlan(opts.localContext);
      return {
        data: slots as unknown as T,
        provider: "local",
        model: "rule-cục-bộ",
        effort: "low",
        inputTokens: 0,
        outputTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        estimatedCost: 0,
        latencyMs: 0,
        fallbackFrom: "anthropic",
      };
    }

    // Hết đường → ném lỗi gốc để route handler map sang mã lỗi ổn định.
    throw primaryError;
  }
}

/**
 * Public API của tầng AI — **không bao giờ throw ra ngoài**.
 *
 * Luôn trả `AiEnvelope<T>`:
 *   - thành công → `{ok:true, data, meta}` với `meta` là `AiCallMeta`.
 *   - thất bại → `{ok:false, error:{code, message}}`, code ∈
 *     `refusal | rate_limit | network | timeout | no_api_key | ollama_down | schema | unavailable`.
 *
 * `callAi` **tự ghi** dòng `AiCall` (FR-AI-07 / FR-AI-13 / FR-AI-14) — route
 * handler chỉ gọi và trả về, không đụng DB.
 */
export async function callAi<T>(task: AiTask, opts: CallAiOptions<T>): Promise<AiEnvelope<T>> {
  // Task không gọi AI (AI-14) → trả lỗi có kiểu, không gọi mạng.
  if (isAiFreeTask(task)) {
    return {
      ok: false,
      error: {
        code: "unavailable",
        message: `Task "${task}" không gọi AI — dùng quy tắc chọn lọc tất định trong DB.`,
      },
    };
  }

  const started = Date.now();

  try {
    const result = await runWithFallback<T>(task, opts);
    const latencyMs = result.latencyMs || Date.now() - started;

    // Đúng 1 dòng `AiCall` cho mỗi lượt gọi → số lượt ở S15 chính xác.
    await writeAiCall({
      feature: task,
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheRead: result.cacheRead,
      cacheWrite: result.cacheWrite,
      estimatedCost: result.provider === "local" ? 0 : result.estimatedCost,
      latencyMs,
      ok: true,
      fallbackFrom: result.fallbackFrom ?? null,
    });

    return {
      ok: true,
      data: result.data,
      meta: {
        provider: result.provider,
        model: result.model,
        effort: result.effort,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheRead: result.cacheRead,
        cacheWrite: result.cacheWrite,
        estimatedCost: result.estimatedCost,
        latencyMs,
        fallbackFrom: result.fallbackFrom ?? null,
      },
    };
  } catch (error) {
    const code: AiErrorCode = toAiErrorCode(error);
    const message = error instanceof Error ? error.message : "AI không trả lời được.";

    // Ghi log lượt gọi thất bại để S15 hiện đúng số lượt lỗi / offline fallback.
    // Dùng route đã áp chế độ khẩn cấp để `model` khớp với cái thực sự đã thử.
    const failedRoute = await resolveRoute(task);
    await writeAiCall({
      feature: task,
      provider: failedRoute.provider,
      model: failedRoute.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      estimatedCost: 0,
      latencyMs: Date.now() - started,
      ok: false,
      error: code,
      fallbackFrom: null,
    });

    return { ok: false, error: { code, message } };
  }
}

/** Alias giữ tên cũ — route handler nào đã import `runAiTask` vẫn chạy được. */
export const runAiTask = callAi;

/**
 * Tiện ích cho route handler: map mã lỗi → HTTP status phù hợp (design.md §7.2).
 *
 * Dùng trong route handler mỏng (không có business logic): chỉ chọn status.
 */
export function aiErrorStatus(code: string): number {
  switch (code) {
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    case "network":
      return 503;
    case "no_api_key":
    case "ollama_down":
    case "unavailable":
      return 503;
    case "refusal":
      return 422;
    case "schema":
      return 502;
    default:
      return 500;
  }
}

/** Re-export để route handler chỉ cần import 1 chỗ. */
export { AiUnavailableError, estimateCost };
export type { AiEnvelope };
