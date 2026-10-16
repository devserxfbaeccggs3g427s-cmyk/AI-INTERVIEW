/**
 * Log có cấu trúc, chỉ nhận trường đã được cho phép — T-2.2.
 *
 * Hàm này **không** nhận object tự do. Kiểu tham số khai báo đúng những trường
 * được phép ghi ra log, nên thêm một trường mới (ví dụ `answer`, `cvText`,
 * `apiKey`) là lỗi biên dịch chứ không phải quyết định lúc viết code.
 *
 * Lý do phải cấm thế: NFR-11 nói rõ transcript, CV và báo cáo đều ghi thẳng nội
 * dung người dùng xuống đĩa, nên `redact()` giữ nghĩa với chúng chứ không chỉ với
 * key. "Ghi log đầy đủ" ở đâc nghĩa là *đủ để chẩn đoán*, không phải *đủ dữ liệu*.
 * `check-secrets.sh` phạt mọi `console.log` trong `src/lib`; `console.error` ở đây
 * là đường thoát duy nhất, và nó không thể nhận trường ngoài danh sách dưới đây.
 */

export type LogFields = {
  /** Đối chiếu khi người dùng báo sự cố. Bắt buộc có ở mọi log lỗi. */
  requestId?: string;
  event: string;
  provider?: string;
  /** Mã đã phân loại, không phải message thô của SDK. */
  code?: string;
  status?: number;
  sessionId?: string;
  questionNumber?: number;
  stopReason?: string;
  cacheRead?: number | null;
  cacheWrite?: number | null;
};

/**
 * Ghi một dòng JSON ra `stderr`.
 *
 * `stderr` chứ không phải `stdout`: stdout của tiến trình Next có thể bị gom lại
 * thành log HTTP của request, và một dòng lẫn vào đó dễ bị đọc nhầm là nội dung
 * response.
 */
export function logEvent(fields: LogFields): void {
  // Object được dựng từ đúng các trường của `LogFields` ở trên — không có đường
  // nào để chen thêm dữ liệu người dùng vào đây mà không sửa kiểu.
  console.error(JSON.stringify(fields));
}