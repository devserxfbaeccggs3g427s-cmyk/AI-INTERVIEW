/**
 * Probe SSRF — T-0b.8. Chạy: npm run probe:ssrf
 *
 * KHÔNG gọi ra mạng. Probe này dừng ở bước kiểm tra **trước** khi mở socket:
 * mọi URL sai đều phải bị chặn bởi `checkedUrl`/`pinAddress`. Đó là điều kiện cần
 * cho một guard đáng tin — guard chỉ "sau khi đã kết nối mới phát hiện sai" là
 * guard không có tác dụng.
 *
 * Phần **không** kiểm được ở đây: DNS thật trả về IP riêng (cần mạng), redirect
 * 3xx thật, và hành vi TLS/SNI. Xem docs/03-TASKS.md, mục xác minh giai đoạn 0b.
 */
import { isPublicAddress } from "../src/lib/providers/outbound-guard.ts";

let fail = 0;

function expect(label: string, actual: boolean, wanted: boolean) {
  const ok = actual === wanted;
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "LOI "} ${label} → ${actual} (cần ${wanted})`);
}

console.log("=== Địa chỉ IPv4 ===");
for (const ip of [
  "127.0.0.1", "0.0.0.0", "10.0.0.1", "10.255.255.254",
  "172.16.0.1", "172.31.255.254", "192.168.1.1",
  "169.254.169.254", // địa chỉ metadata của cloud provider
  "100.64.0.1",      // CGNAT
  "198.18.0.1",      // dải đo lường
  "224.0.0.1", "239.255.255.250", "255.255.255.255",
  "192.0.2.1", "198.51.100.1", "203.0.113.1", // TEST-NET, tài liệu
  "192.0.0.192", // đường dẫn địa chỉ cục bộ đã lỗi thời
]) {
  expect(`chặn ${ip}`, isPublicAddress(ip), false);
}

console.log("\n=== Địa chỉ công khai ===");
for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
  expect(`cho qua ${ip}`, isPublicAddress(ip), true);
}

console.log("\n=== IPv6 ===");
for (const ip of [
  "::1", "::", "fe80::1", "fc00::1", "fd00::1",
  "2001:db8::1",          // tài liệu
  "::ffff:127.0.0.1",     // IPv4-mapped tới loopback
  "::ffff:169.254.169.254", // IPv4-mapped tới metadata
  "2002:7f00:1::1",       // 6to4 bọc 127.0.0.1
]) {
  expect(`chặn ${ip}`, isPublicAddress(ip), false);
}
expect("cho qua 2606:4700:4700::1111", isPublicAddress("2606:4700:4700::1111"), true);
expect("cho qua 2001:4860:4860::8888", isPublicAddress("2001:4860:4860::8888"), true);

console.log("\n=== URL: chặn trước khi mở socket ===");
// Gọi hàm thật qua request path: mọi URL dưới đây phải ném trước khi DNS chạy.
const { guardedCustomRequest } = await import("../src/lib/providers/outbound-guard.ts");
const BLOCKED = [
  ["http://169.254.169.254/latest/meta-data/", "metadata endpoint qua HTTP"],
  ["https://localhost/v1/models", "localhost"],
  ["https://127.0.0.1/v1/models", "loopback bằng IP"],
  ["https://[::1]/v1/models", "loopback IPv6"],
  ["https://redis.internal/v1/models", "tên nội bộ .internal"],
  ["https://printer.local/v1/models", "tên .local"],
  ["https://user:pass@example.com/v1/models", "userinfo trong URL"],
  ["https://example.com/v1/models?api_key=leak", "key trong query string"],
] as const;

for (const [url, why] of BLOCKED) {
  try {
    await guardedCustomRequest(url, "models", { method: "GET", apiKey: "probe" });
    fail++;
    console.log(`LOI  ${why}: KHÔNG bị chặn`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`OK   chặn ${why} — ${message}`);
  }
}

console.log(fail === 0 ? "\nTẤT CẢ ĐÚNG" : `\n${fail} MỤC SAI`);
process.exitCode = fail === 0 ? 0 : 1;