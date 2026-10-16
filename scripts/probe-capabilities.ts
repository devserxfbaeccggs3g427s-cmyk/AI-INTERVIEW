/**
 * Probe ma trận năng lực — chạy: npm run probe:capabilities
 *
 * Mục tiêu: chứng minh rằng adapter KHÔNG gửi tham số mà model không nhận.
 * Đây là điều kiện "sai là trả 400" ở production.
 */
import {
  capabilitiesFor,
  supportedReasoningLevel,
  ALL_REASONING_LEVELS,
} from "../src/lib/providers/capabilities.ts";

let fail = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "LOI "} ${label} → ${JSON.stringify(actual)} (cần ${JSON.stringify(wanted)})`);
}

console.log("--- Gemini: mức suy luận theo từng model ---");
expect("gemini-2.5-pro + medium", supportedReasoningLevel("gemini", "gemini-2.5-pro", "medium"), null);
expect("gemini-2.5-pro + high", supportedReasoningLevel("gemini", "gemini-2.5-pro", "high"), "high");
expect("gemini-3-pro-preview + medium", supportedReasoningLevel("gemini", "gemini-3-pro-preview", "medium"), null);
expect("gemini-3.6-flash + medium", supportedReasoningLevel("gemini", "gemini-3.6-flash", "medium"), "medium");
expect("gemini-2.5-flash (chưa xác nhận) + high", supportedReasoningLevel("gemini", "gemini-2.5-flash", "high"), null);

console.log("\n--- OpenAI: có model từ chối `none` ---");
expect("gpt-4o + high", supportedReasoningLevel("openai", "gpt-4o", "high"), null);
expect("gpt-4o + reasoning=false", capabilitiesFor("openai", "gpt-4o").reasoning, false);
expect("gpt-5 + high", supportedReasoningLevel("openai", "gpt-5", "high"), "high");

console.log("\n--- Custom: không hỗ trợ gì ngoài streaming ---");
const custom = capabilitiesFor("custom", "");
expect("structuredOutput", custom.structuredOutput, false);
expect("readsPdf", custom.readsPdf, false);
expect("reasoning", custom.reasoning, false);
expect("explicitCache", custom.explicitCache, false);
expect("reportsCacheUsage", custom.reportsCacheUsage, false);
expect("supportsDirect", custom.supportsDirect, false);
expect("streaming (adapter có hiện thực luồng)", custom.streaming, true);

console.log("\n--- Cờ chỉ bật ở Anthropic ---");
for (const id of ["anthropic", "openai", "gemini", "custom"] as const) {
  const c = capabilitiesFor(id, "x");
  console.log(`     ${id.padEnd(10)} midConversationSystem=${String(c.midConversationSystem).padEnd(5)} explicitCache=${c.explicitCache}`);
  if (id !== "anthropic" && (c.midConversationSystem || c.explicitCache)) fail++;
}

console.log("\n--- Anthropic: model không đọc PDF ---");
expect("claude-haiku-4-5 readsPdf", capabilitiesFor("anthropic", "claude-haiku-4-5").readsPdf, false);
expect("claude-opus-5 readsPdf", capabilitiesFor("anthropic", "claude-opus-5").readsPdf, true);

console.log("\n--- Mọi mức 'off' đều hợp lệ (bỏ tham số, không gửi giá trị sai) ---");
for (const id of ["anthropic", "openai", "gemini", "custom"] as const) {
  const r = supportedReasoningLevel(id, "claude-opus-5", "off");
  expect(`${id} off`, r, "off");
  if (r !== "off") fail++;
}
expect("tập mức khai báo", ALL_REASONING_LEVELS, ["off", "low", "medium", "high"]);

console.log(fail === 0 ? "\nTẤT CẢ ĐÚNG" : `\n${fail} MỤC SAI`);
process.exitCode = fail === 0 ? 0 : 1;