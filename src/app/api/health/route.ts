/**
 * `GET /api/health` — T-2.11.
 *
 * Kiểm tra **key + model** (docs/02-DESIGN.md §3.6, cây thư mục ở §2) bằng cách gọi
 * endpoint danh sách model của hãng: đây là lời gọi **miễn phí** và **không suy luận**.
 * Nếu gọi `messages.create` để xác nhận model thì mỗi lần bấm "kiểm tra" là một
 * lượt suy luận có tính phí, và một key hết hạn sẽ bị 429 *vì chính lời gọi thăm dò*
 * chứ không phải vì người dùng dùng sai (NFR-4).
 *
 * Cấu hình provider đi bằng header `x-ai` — cùng cách `POST /api/interviews/upload`
 * làm, và cùng lý do: query string bị ghi vào log proxy.
 *
 * ## Không bao giờ đọc lời giải thích của SDK
 *
 * Toàn bộ nhánh lỗi đi qua `classifyProviderError()`, mà hàm đó chỉ so
 * `status`/`code`. Không có dòng nào ở đây đọc `error.message`, `error.headers` hay
 * body của phản hồi:
 * Anthropic, OpenAI và Gemini đều đặt tên model, tên workspace và đôi khi lặp lại
 * thông điệp vào message. NFR-3 cấm lộ response thô, và đây là chỗ duy nhất dễ
 * phạm — xem `errors.ts`.
 */

import { ZodError } from "zod";

import {
  AppError,
  classifyProviderError,
  httpStatus,
  messageFor,
  requestId,
  validationResponse,
  type ClassifiedError,
} from "@/lib/errors";
import { authFromRequest } from "@/lib/interviews/auth";
import { logEvent } from "@/lib/log";
import { capabilitiesFor } from "@/lib/providers/capabilities";
import { getProviderAdapter } from "@/lib/providers/registry";
import type { AiConfig, Capability, ModelInfo, ProviderId } from "@/lib/providers/types";
import { storedAiSettingsSchema } from "@/lib/schemas";

/** Cùng tên và cùng ý nghĩa với `interviews/upload/route.ts`. */
const AI_HEADER = "x-ai";

/**
 * Trần thời gian cho một lần thăm dò.
 *
 * Không có trần này thì một hãng treo kết nối sẽ treo luôn request health, và
 * `next start` sẽ giữ worker mãi. Cũng để SDK bỏ retry: một key đang bị 429 sẽ
 * bị thử lại vài lần trước khi trả về, biến một lỗi tức thời thành một lần chờ
 * dài không có lý do.
 *
 * Lưu ý: adapter không nhận `signal`, nên hết thời gian ở đây chỉ **ngừng chờ** —
 * request tới hãng vẫn chạy nền tới khi tự kết thúc. Bỏ trần, không để lời gọi
 * treo trong bộ nhớ.
 */
const PROBE_TIMEOUT_MS = 15_000;

/** Hết thời gian chờ — lỗi của route này, không phải lỗi trả về từ hãng. */
const TIMED_OUT = Symbol("health_timeout");

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(TIMED_OUT), PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Năng lực thật của cặp provider + model.
 *
 * Bảng tĩnh là mặc định; `verified` của hãng đè lên nó khi hãng **tự** công bố
 * (Anthropic trả cờ năng lực theo từng model, FR-16). Không suy ngược lại: không
 * có `verified` thì giữ bảng tĩnh, không đoán từ tên model.
 */
function resolveCapabilities(
  provider: ProviderId,
  model: string,
  verified: Capability | null,
): Capability {
  const base = capabilitiesFor(provider, model);
  return verified === null ? base : { ...base, ...verified };
}

export async function GET(request: Request) {
  const id = requestId();
  let provider: ProviderId | undefined;

  try {
    const auth = authFromRequest(request, id);

    // Thiếu header không phải lỗi 500: parse `undefined` để Zod báo đúng trường
    // thiếu, thay vì tự chế một thông báo không ai định nghĩa được.
    const rawAi = request.headers.get(AI_HEADER);
    const settings = storedAiSettingsSchema.parse(
      rawAi === null ? undefined : (JSON.parse(rawAi) as unknown),
    );
    provider = settings.provider;

    // Endpoint này **luôn** chạy trên máy chủ, nên lời gọi luôn là `proxy` bất kể
    // người dùng đang để cờ `callMode` thế nào trong cấu hình đã lưu. Adapter
    // `custom` từ chối cấu hình không phải `proxy`, và việc đó là đúng — nhưng nó
    // làm health fail với 500 "Endpoint tuỳ chỉnh" chỉ vì người dùng đang bật chế
    // độ gọi trực tiếp cho một lần kiểm tra chạy ngoài trình duyệt.
    //
    // `persistKey` là cờ của trình duyệt, không có ở đây (docs/02-DESIGN.md §3.2);
    // đặt `false` vì server không bao giờ ghi key đi đâu cả.
    const ai: AiConfig = { ...settings, callMode: "proxy", persistKey: false };
    const adapter = getProviderAdapter(ai);

    // Cả bốn adapter đều có `listModels`; `ProviderAdapter` để tuỳ chọn là vì
    // interface dùng chung cả hai đường gọi. Thiếu thì không có cách nào xác minh
    // key mà không tốn tiền, nên nói thẳng thay vì trả `ok` cho một kiểm tra chưa
    // diễn ra.
    if (!adapter.listModels) throw new Error("Adapter không hỗ trợ kiểm tra key");

    const models: ModelInfo[] = await withTimeout(adapter.listModels(auth, ai));

    const found = models.find((entry) => entry.id === settings.model);
    if (!found) {
      // Danh sách là bằng chứng duy nhất về model mà không phải sinh một lượt suy
      // luận. Hãng trả 404/403 cho model không tồn tại hoặc tài khoản chưa có quyền,
      // và đó là cùng một thông báo với cả hai trường hợp (docs/02-DESIGN.md §2.2
      // của `errors.ts`) vì người dùng không tự phân biệt được.
      throw new ProviderRejected(settings.model);
    }

    logEvent({
      event: "health_ok",
      requestId: id,
      provider: settings.provider,
    });

    return Response.json(
      {
        ok: true,
        provider: settings.provider,
        model: found.id,
        capabilities: resolveCapabilities(settings.provider, found.id, found.verified),
      },
      // Không bao giờ cache: một response 200 của hãng này là câu trả lời cho *key
      // này*, và cache dùng chung sẽ trả kết quả hợp lệ của một người cho người khác.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return validationResponse(
        error instanceof ZodError
          ? error
          : new ZodError([
              { code: "custom", path: [AI_HEADER], message: "Cấu hình AI không phải JSON hợp lệ" },
            ]),
      );
    }

    // `classify()` không dùng ở đây vì nó tự ghi log `request_failed` mà không kèm
    // `provider`, và route này cần trường đó để chẩn đoán. Phân loại và ghi log
    // tách ra để mỗi lần thất bại chỉ sinh **một** dòng log.
    const failure: ClassifiedError =
      error === TIMED_OUT
        ? { code: "network", message: messageFor("network"), status: httpStatus("network") }
        : error instanceof AppError
          ? { code: error.code, message: messageFor(error.code), status: httpStatus(error.code) }
          : classifyProviderError(error);

    logEvent({
      event: "health_failed",
      requestId: id,
      provider,
      code: failure.code,
      status: failure.status,
    });

    return Response.json(
      { error: failure.message, code: failure.code, requestId: id },
      { status: failure.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/**
 * Model không có trong danh sách của hãng.
 *
 * Mang `status` để `classifyProviderError()` ra đúng mã `model_not_found` (404)
 * thay vì rơi vào nhánh 500 chung — cùng cách lỗi SDK được phân loại. Không đọc
 * đâu ra thô ở đây: thông báo do `errors.ts` soạn, không phải do hãng.
 */
class ProviderRejected extends Error {
  readonly status = 404;
  readonly code = "not_found_error";

  constructor(model: string) {
    super(`Model không có trong danh sách: ${model}`);
    this.name = "ProviderRejected";
  }
}