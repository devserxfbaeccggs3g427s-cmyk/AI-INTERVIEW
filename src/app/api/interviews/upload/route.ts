/**
 * `POST /api/interviews/upload` — T-2.5.
 *
 * Trả **token**, không trả `file_id` thô (docs/02-DESIGN.md §7.5). CV thật nằm ở
 * bảng `cv_uploads` mà token trỏ tới — xem §7.4.
 *
 * Header `x-provider-key` bắt buộc ở đây **kể cả khi chỉ trích text**: đường đọc
 * thẳng phải upload lên Files API bằng đúng key mà `/start` sẽ dùng, và `file_id`
 * thuộc workspace của key đó. Hỏi key ngay từ đầu tốt hơn là nhận token rồi mới
 * hỏng ở giữa.
 *
 * Cấu hình provider/model đi bằng header `x-ai`, không phải query string: query bị
 * ghi vào log proxy, và quy tắc của thiết kế là không có gì nhạy cảm đi qua đó. Body
 * request là tệp nhị phân nên không thể mang JSON — header là chỗ duy nhất còn lại
 * mà vẫn nằm ngoài body.
 */

import { saveCvUpload } from "@/lib/cv-store";
import { AppError, classifyProviderError, errorResponse, requestId } from "@/lib/errors";
import { authFromRequest, keyFingerprint } from "@/lib/interviews/auth";
import { MAX_PDF_BYTES, extractPdfText, readLimitedBody } from "@/lib/pdf";
import { capabilitiesFor } from "@/lib/providers/capabilities";
import { getProviderAdapter } from "@/lib/providers/registry";
import { aiConfigSchema } from "@/lib/schemas";
import { signCvToken } from "@/lib/token";

const AI_HEADER = "x-ai";

export async function POST(request: Request) {
  const id = requestId();
  try {
    const auth = authFromRequest(request, id);

    const rawAi = request.headers.get(AI_HEADER);
    if (!rawAi) throw new AppError("unsupported_file_type", id);
    const ai = aiConfigSchema.parse(JSON.parse(rawAi) as unknown);
    // Trích text chỉ chạy trên máy chủ này; ở `direct` không có máy chủ nào để trích,
    // và upload lên Files API bằng key của trình duyệt là việc khác hẳn (T-3.5).
    if (ai.callMode !== "proxy") throw new AppError("unsupported_file_type", id);

    const { bytes, filename } = await readLimitedBody(request, MAX_PDF_BYTES, id);

    // Nạp adapter **trước** khi trích: adapter custom dựng dispatcher đã ghim địa
    // chỉ ở đây, và adapter không có `upload` sẽ nói ra bằng lỗi tường minh thay vì
    // để người dùng tải xong rồi mới biết đường đọc thẳng không dùng được.
    const adapter = getProviderAdapter(ai);

    const extracted = await extractPdfText(bytes, id);

    // Đường đọc thẳng chỉ khi adapter có Files API **và** model này thật sự đọc
    // được PDF.
    //
    // Cờ phải lấy từ `capabilitiesFor(provider, model)`, không lấy từ việc "có
    // `upload` không": ba adapter khai báo `upload` vô điều kiện, nên kiểm tra đó
    // chỉ nói "hãng có Files API" chứ không nói "model này đọc PDF được". Với
    // `claude-haiku-4-5` hay `o3` (`readsPdf: false`) cách cũ vẫn tải cả tệp lên
    // hãng, lưu `file_id`, rồi báo `canReadDirectly: true` — để `start` ném lỗi
    // thuần và người dùng ăn 500 sau khi đã trả tiền cho lần tải vô ích đó.
    const canReadDirectly = adapter.upload !== undefined && capabilitiesFor(ai.provider, ai.model).readsPdf;
    let uploaded = null;
    if (canReadDirectly && adapter.upload) {
      // Lỗi SDK ở đây là 401/402/429 thật sự, không phải lỗi nội bộ: bọc lại để
      // `errorResponse` dịch đúng mã thay vì đổi hết thành 500.
      try {
        uploaded = await adapter.upload(auth, new Blob([bytes.slice() as BlobPart], { type: "application/pdf" }));
      } catch (error) {
        const failure = classifyProviderError(error);
        throw new AppError(failure.code, id);
      }
    }

    const stored = saveCvUpload({
      provider: ai.provider,
      model: ai.model,
      extractedText: extracted.text,
      fileId: uploaded?.id ?? null,
      keyFingerprint: keyFingerprint(auth.apiKey),
      filename,
      sizeBytes: bytes.byteLength,
    });

    const expiresAt = stored.expiresAt;
    return Response.json(
      {
        token: signCvToken.sign(stored.id, Math.floor(expiresAt / 1000)),
        filename,
        sizeBytes: stored.sizeBytes,
        expiresAt: new Date(expiresAt).toISOString(),
        // Cờ cho UI (T-3.5): lựa chọn "provider đọc thẳng" chỉ hiện khi cột này
        // đúng. Server vẫn kiểm lại ở `start` — UI chỉ để không chọn được.
        canReadDirectly: canReadDirectly && uploaded !== null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}