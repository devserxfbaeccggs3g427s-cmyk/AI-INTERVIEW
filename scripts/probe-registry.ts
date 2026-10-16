/**
 * Probe registry — T-0b.3. Chạy: npm run probe:registry
 *
 * Điều đáng kiểm ở đây là **sự thất bại phải nói ra**: một provider lạ phải báo
 * lỗi, không được âm thầm rơi về một hãng khác. Rơi về Anthropic khi người dùng
 * gõ `provider: "anthropci"` nghĩa là câu trả lời do hãng họ không chọn tạo ra,
 * và hoá đơn rơi vào key họ không nhìn thấy.
 *
 * Nạp **module thật** của app, không sao chép logic — bản sao sẽ trôi lệch và
 * probe sẽ báo đạt trong khi `registry.ts` đã hỏng.
 */
import { getProviderAdapter } from "../src/lib/providers/registry.ts";
import type { AiConfig, ProviderId } from "../src/lib/providers/types.ts";

let fail = 0;

function config(over: Partial<AiConfig> = {}): AiConfig {
  return { provider: "anthropic", model: "claude-opus-5", reasoning: "off",
    callMode: "proxy", persistKey: false, ...over };
}

console.log("=== Provider lạ phải báo lỗi, không fallback ===");
for (const bogus of ["anthropci", "OpenAI", "claude", "", "azure"]) {
  try {
    const adapter = getProviderAdapter(config({ provider: bogus as ProviderId }));
    fail++;
    console.log(`LOI  "${bogus}" → im lặng trả về provider "${adapter.id}"`);
  } catch (error) {
    console.log(`OK   "${bogus}" → ${error instanceof Error ? error.message : String(error)}`);
  }
}

const cases: Array<[ProviderId, string, string?]> = [
  ["anthropic", "claude-opus-5"],
  ["openai", "gpt-5"],
  ["gemini", "gemini-3.6-flash"],
  ["custom", "llama-3.3-70b", "https://api.vendor.example/v1"],
];

console.log("\n=== Bốn provider hợp lệ trả về đúng adapter của mình ===");
for (const [provider, model, baseUrl] of cases) {
  try {
    const adapter = getProviderAdapter(config({ provider, model, ...(baseUrl ? { baseUrl } : {}) }));
    const ok = adapter.id === provider;
    if (!ok) fail++;
    console.log(`${ok ? "OK  " : "LOI "} ${provider} → adapter.id = ${adapter.id}`);
  } catch (error) {
    fail++; console.log(`LOI  ${provider} ném lỗi: ${error instanceof Error ? error.message : error}`);
  }
}

console.log("\n=== Custom thiếu base URL phải báo lỗi, không tự đoán ===");
try {
  getProviderAdapter(config({ provider: "custom", model: "llama-3.3-70b" }));
  fail++; console.log("LOI  thiếu base URL vẫn tạo được adapter");
} catch (error) {
  console.log(`OK   ${error instanceof Error ? error.message : String(error)}`);
}

console.log("\n=== Mọi adapter cùng một hình dạng ProviderAdapter ===");
for (const [provider, model, baseUrl] of cases) {
  const adapter = getProviderAdapter(config({ provider, model, ...(baseUrl ? { baseUrl } : {}) }));
  const problems = [
    ...(["stream", "structured"] as const)
      .filter((m) => typeof adapter[m] !== "function").map((m) => `thiếu ${m}()`),
    ...(typeof adapter.capabilities?.streaming !== "boolean"
      ? ["capabilities.streaming không phải boolean"] : []),
    ...(!Array.isArray(adapter.capabilities?.reasoningLevels)
      ? ["reasoningLevels không phải mảng"] : []),
  ];
  if (problems.length) { fail++; console.log(`LOI  ${provider}: ${problems.join("; ")}`); }
  else console.log(`OK   ${provider}: có stream/structured/capabilities`);
}

console.log(fail === 0 ? "\nTẤT CẢ ĐÚNG" : `\n${fail} MỤC SAI`);
process.exitCode = fail === 0 ? 0 : 1;