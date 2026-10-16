/**
 * Probe `Usage` — T-0b.9. Chạy: npm run probe:usage
 *
 * Điểm đáng kiểm ở đây rất nhỏ nhưng dễ sai: `null` (hãng không công bố) khác hẳn
 * `0` (hãng báo ra 0 token). UI hiển thị "—" cho `null`; nếu adapter ghi `0` thay vì
 * `null` thì báo cáo sẽ khẳng định một con số mà hãng chưa từng nói. Xem FR-16, NFR-6.
 */
import { cacheCell, normalizeUsage, totalInputTokens } from "../src/lib/usage.ts";

let fail = 0;

function expect(label: string, actual: unknown, wanted: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "LOI "} ${label} → ${JSON.stringify(actual)} (cần ${JSON.stringify(wanted)})`);
}

console.log("=== Hãng không công bố cache → null, KHÔNG phải 0 ===");
const unreported = normalizeUsage({ input: 1200, output: 80, cacheRead: undefined, cacheWrite: undefined });
expect("cacheRead = null", unreported.cacheRead, null);
expect("cacheWrite = null", unreported.cacheWrite, null);
expect("input đo được vẫn là số", unreported.input, 1200);

console.log("\n=== Hãng có công bố cache → giữ nguyên số, kể cả 0 ===");
const reported = normalizeUsage({ input: 1200, output: 80, cacheRead: 1024, cacheWrite: 0 });
expect("cacheRead giữ số", reported.cacheRead, 1024);
expect("cacheWrite giữ 0 (không thành null)", reported.cacheWrite, 0);

console.log("\n=== Ô hiển thị: null để UI in '—' ===");
expect("chưa công bố", cacheCell(unreported), { read: null, write: null, available: false });
expect("đã công bố 0 → available=true", cacheCell(reported).available, true);
expect("đã công bố 1024 → giữ số", cacheCell(reported).read, 1024);
expect("đã công bố 0 → vẫn 0 chứ không phải '—'",
  cacheCell(normalizeUsage({ input: 1, output: 1, cacheRead: 0 })).read, 0);

console.log("\n=== Giá trị không hợp lệ → null ===");
expect("cacheRead NaN", normalizeUsage({ input: 1, output: 1, cacheRead: Number.NaN }).cacheRead, null);
expect("cacheWrite Infinity", normalizeUsage({ input: 1, output: 1, cacheWrite: Infinity }).cacheWrite, null);

console.log("\n=== Thiếu hoàn toàn usage vẫn không ném lỗi ===");
expect("input thiếu → 0", normalizeUsage({}).input, 0);

console.log("\n=== Tổng token đầu vào để hiển thị: KHÔNG cộng thêm cache ===");
// Với provider có cache, `input` đã bao gồm phần đọc cache. Cộng thêm lần nữa sẽ
// thổi phóng to chi phí — hàm này chỉ để hiển thị, không để tính tiền.
expect("không cộng trùng cache đọc", totalInputTokens(reported), 1200);
expect("provider không cache", totalInputTokens(normalizeUsage({ input: 1200, output: 80 })), 1200);

console.log(fail === 0 ? "\nTẤT CẢ ĐÚNG" : `\n${fail} MỤC SAI`);
process.exitCode = fail === 0 ? 0 : 1;