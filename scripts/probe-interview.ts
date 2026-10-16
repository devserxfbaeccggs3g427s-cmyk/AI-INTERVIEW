/**
 * Probe giai đoạn 1 — chạy: npm run probe:interview
 *
 * Kiểm ba thứ dễ vỡ âm thầm: prompt lõi có nội suy, bố cục prompt lệch vị trí
 * theo từng provider, và parser chế độ kèm góp ý vỡ trên chuỗi sai định dạng.
 */
import { capabilitiesFor } from "../src/lib/providers/capabilities.ts";
import type { ChatRequest, ProviderId, TranscriptTurn } from "../src/lib/providers/types.ts";
import { buildCvBlocks, buildMessages, splitInterviewText } from "../src/lib/interview.ts";
import { CORE_SYSTEM, questionsTotal, renderSessionConfig } from "../src/lib/prompts.ts";
import { settingsSchema } from "../src/lib/db/validation.ts";
import { aiConfigSchema, cvSchema, startRequestSchema, storedAiSettingsSchema, turnRequestSchema } from "../src/lib/schemas.ts";
import { z } from "zod";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "LOI "} ${label} → ${JSON.stringify(actual)} (cần ${JSON.stringify(wanted)})`);
}
function ok(label: string, condition: boolean) {
  expect(label, condition, true);
}
function throws(label: string, run: () => unknown) {
  let threw = false;
  try { run(); } catch { threw = true; }
  expect(label, threw, true);
}
/** Đường dẫn trường Zod mà `errorResponse()` sẽ trả về cho người dùng. */
function pathsOf(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}
/** Trường lạ mà Zod nêu tên — `path` gốc không đủ, phải đọc `keys` (chỉ có ở `unrecognized_keys`). */
function keysOf(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys" ? [...(issue.keys ?? [])] : []);
}

console.log("--- T-1.1: schema đường biên ---");
const ai = { provider: "anthropic", model: "claude-opus-5", reasoning: "medium", callMode: "proxy" };
const config = { role: "Kỹ sư", language: "vi", mode: "strict", length: "short" };
expect("cấu hình AI hợp lệ", pathsOf(aiConfigSchema, ai), []);
expect("provider lạ bị từ chối", pathsOf(aiConfigSchema, { ...ai, provider: "cohere" }), ["provider"]);
expect("thiếu trường bắt buộc có đường dẫn", pathsOf(aiConfigSchema, { ...ai, model: undefined }), ["model"]);
expect("custom thiếu baseUrl có đường dẫn",
  pathsOf(aiConfigSchema, { ...ai, provider: "custom", model: "llama" }), ["baseUrl"]);
throws("apiKey trong body cấu hình bị từ chối", () => aiConfigSchema.parse({ ...ai, apiKey: "sk-test" }));
expect("persistKey thuộc body cấu hình AI", pathsOf(aiConfigSchema, { ...ai, persistKey: true }), []);
throws("persistKey không được lưu trong settings", () => storedAiSettingsSchema.parse({ ...ai, persistKey: true }));
expect("custom có baseUrl HTTPS hợp lệ",
  pathsOf(aiConfigSchema, { ...ai, provider: "custom", baseUrl: "https://llm.example.com/v1" }), []);
expect("custom với baseUrl không phải HTTPS bị từ chối",
  pathsOf(aiConfigSchema, { ...ai, provider: "custom", baseUrl: "http://llm.example.com" }), ["baseUrl"]);
// Một nguồn validation: schema của endpoint 0c phải **là** schema trong `schemas.ts`.
ok("endpoint 0c dùng đúng schema của lớp mới", settingsSchema === storedAiSettingsSchema);
throws("settings của 0c không nhận persistKey", () => settingsSchema.parse({ ...ai, persistKey: true }));

console.log("\n--- T-1.1: ba nguồn CV ---");
for (const cv of [
  { kind: "none" },
  { kind: "text", text: "Kỹ sư phần mềm 5 năm" },
  { kind: "file", token: "signed-token-value", mode: "direct" },
  { kind: "file", token: "signed-token-value", mode: "extract" },
]) {
  expect(`nguồn CV hợp lệ: ${JSON.stringify(cv)}`, pathsOf(cvSchema, cv), []);
}
ok("file không khai báo mode bị từ chối",
  pathsOf(cvSchema, { kind: "file", token: "t" }).includes("mode"));
ok("CV dán rỗng bị từ chối", pathsOf(cvSchema, { kind: "text", text: "   " }).includes("text"));
ok("CV dán quá 20 000 ký tự bị từ chối",
  pathsOf(cvSchema, { kind: "text", text: "x".repeat(20_001) }).includes("text"));
ok("kind lạ bị từ chối", pathsOf(cvSchema, { kind: "url", url: "https://x" }).length > 0);

console.log("\n--- T-1.1: không nhận transcript lẫn turnCount ---");
const turnOk = { ai, sessionId: "3f6b1c2e-9a4d-4c8b-8e2a-1d5f7b9c0d1e", answer: "Tôi làm backend 3 năm." };
expect("lượt trả lời hợp lệ", pathsOf(turnRequestSchema, turnOk), []);
throws("transcript trong body bị từ chối", () => turnRequestSchema.parse({ ...turnOk, transcript: [] }));
throws("turnCount trong body bị từ chối", () => turnRequestSchema.parse({ ...turnOk, turnCount: 3 }));
// Zod 4 gộp mọi trường lạ thành **một** issue `unrecognized_keys` ở `path` gốc, và
// tên các khoá nằm ở `issue.keys`. Đây là lý do `errorResponse()` chưa đủ thông tin
// cho UI; ghi lại ở đây để đổi hành vi Zod sau này không âm thầm làm hỏng kỳ vọng.
expect("trường lạ nêu đích danh ở issue.keys",
  keysOf(turnRequestSchema, { ...turnOk, transcript: [], turnCount: 3 }).sort(), ["transcript", "turnCount"]);
ok("câu trả lời quá 4 000 ký tự bị từ chối",
  pathsOf(turnRequestSchema, { ...turnOk, answer: "x".repeat(4001) }).includes("answer"));
ok("sessionId không phải UUID bị từ chối", pathsOf(turnRequestSchema, { ...turnOk, sessionId: "abc" }).includes("sessionId"));
expect("mở phiên hợp lệ", pathsOf(startRequestSchema, { ai, config, cv: { kind: "none" } }), []);
ok("start thiếu cv bị từ chối", pathsOf(startRequestSchema, { ai, config }).includes("cv"));
ok("start thiếu mode bị từ chối",
  pathsOf(startRequestSchema, { ai, config: { ...config, mode: undefined }, cv: { kind: "none" } }).includes("config.mode"));

console.log("--- T-1.2: prompt lõi bất biến ---");
ok("không có nội suy trong prompt lõi", !CORE_SYSTEM.includes("$" + "{"));
ok("không gọi Date/UUID/Math.random", !/Date\.now|randomUUID|Math\.random/.test(CORE_SYSTEM));
ok("byte giống nhau qua các lần gọi", CORE_SYSTEM === CORE_SYSTEM);
ok("dài hơn ngưỡng cache 512 token của Anthropic", CORE_SYSTEM.length > 1200);

console.log("\n--- T-1.3: cấu hình phiên đủ 2 ngôn ngữ × 2 chế độ × 3 độ dài ---");
expect("bảng số câu khớp T-1.3", [questionsTotal("short"), questionsTotal("medium"), questionsTotal("long")], [5, 8, 12]);
const LENGTHS = { short: 5, medium: 8, long: 12 } as const;
let combos = 0;
for (const language of ["vi", "en"] as const) {
  for (const mode of ["strict", "coaching"] as const) {
    for (const [length, questions] of Object.entries(LENGTHS) as Array<[keyof typeof LENGTHS, number]>) {
      const text = renderSessionConfig({ role: "Kỹ sư phần mềm", language, mode, length });
      combos++;
      ok(`${language}/${mode}/${length} có số câu ${questions}`, text.includes(String(questions)));
      ok(`${language}/${mode}/${length} không có timestamp/ID`, !/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}/.test(text));
      ok(`${language}/${mode}/${length} nhắc đúng ngôn ngữ`, text.includes(language === "vi" ? "tiếng Việt" : "English"));
      ok(`${language}/${mode}/${length} có tên vị trí`, text.includes("Kỹ sư phần mềm"));
      ok(`${language}/${mode}/${length} ${mode === "coaching" ? "có" : "không có"} thẻ góp ý`,
        text.includes("<feedback>") === (mode === "coaching"));
    }
  }
}
expect("số tổ hợp", combos, 12);
const same = renderSessionConfig({ role: "Kỹ sư", language: "vi", mode: "strict", length: "short" })
  === renderSessionConfig({ role: "Kỹ sư", language: "vi", mode: "strict", length: "short" });
ok("render thuần khiến, giống nhau qua các lần gọi", same);
ok("đổi vai trò thì đổi kết quả",
  renderSessionConfig({ role: "Bác sĩ", language: "vi", mode: "strict", length: "short" })
  !== renderSessionConfig({ role: "Kỹ sư", language: "vi", mode: "strict", length: "short" }));

console.log("\n--- T-1.4: ba nguồn CV ---");
expect("không CV → không khối nào", buildCvBlocks({ kind: "none" }, "anthropic", "claude-opus-5"), []);
const pasted = buildCvBlocks({ kind: "text", text: "Kỹ sư phần mềm, 5 năm" }, "anthropic", "claude-opus-5");
expect("dán CV → một khối text", pasted.length, 1);
ok("dán CV có delimiter", pasted[0].text!.startsWith("<<<CV>>>") && pasted[0].text!.endsWith("<<<END CV>>>"));
expect("PDF trực tiếp khi model đọc được",
  buildCvBlocks({ kind: "file", mode: "direct", fileId: "file_1" }, "anthropic", "claude-opus-5"),
  [{ kind: "file", fileId: "file_1", mediaType: "application/pdf" }]);
throws("PDF trực tiếp khi model không đọc được (không âm thầm bỏ qua)",
  () => buildCvBlocks({ kind: "file", mode: "direct", fileId: "file_1" }, "anthropic", "claude-haiku-4-5"));
throws("PDF trực tiếp với custom (chỉ trích text được)",
  () => buildCvBlocks({ kind: "file", mode: "direct", fileId: "file_1" }, "custom", ""));
const extracted = buildCvBlocks({ kind: "file", mode: "extract", text: "Nội dung trích từ PDF" }, "custom", "");
ok("PDF đã trích → khối text có delimiter", extracted[0].kind === "text" && extracted[0].text!.includes("<<<CV>>>"));
throws("CV rỗng bị từ chối", () => buildCvBlocks({ kind: "text", text: "   " }, "openai", "gpt-5"));
expect("file thiếu id bị từ chối",
  throwsTolerant(() => buildCvBlocks({ kind: "file", mode: "direct", fileId: " " }, "anthropic", "claude-opus-5")), true);
ok("định vị cấu hình phiên theo §5.2",
  capabilitiesFor("anthropic", "claude-opus-5").cacheableSessionConfig === true
  && ["openai", "gemini", "custom"].every((id) => !capabilitiesFor(id as ProviderId, "").cacheableSessionConfig));

console.log("\n--- T-1.5: một nơi quyết định bố cục ---");
function request(provider: ProviderId, model: string, history: TranscriptTurn[], attachments?: ChatRequest["attachments"]): ChatRequest {
  return {
    model, coreSystem: CORE_SYSTEM, sessionConfig: renderSessionConfig({ role: "Kỹ sư", language: "vi", mode: "strict", length: "short" }),
    attachments, history, newTurn: "Tôi đã làm việc tại công ty X 3 năm.",
    reasoning: "medium", maxTokens: 2000, language: "vi",
  };
}
const cvBlock = [{ kind: "text" as const, text: "<<<CV>>>\nCV\n<<<END CV>>>" }];
const opening: TranscriptTurn = { role: "user", text: "Bắt đầu phỏng vấn.", synthetic: true };
const assistantTurn: TranscriptTurn = { role: "assistant", blocks: [{ type: "thinking", thinking: "giữ nguyên" }, { type: "text", text: "Bạn từng làm gì?" }] };
const answer: TranscriptTurn = { role: "user", text: "Tôi làm backend 3 năm." };

for (const [provider, model] of [["anthropic", "claude-opus-5"], ["openai", "gpt-5"], ["gemini", "gemini-3.6-flash"], ["custom", ""]] as Array<[ProviderId, string]>) {
  const first = buildMessages(request(provider, model, [], cvBlock), provider);
  const later = buildMessages(request(provider, model, [opening, assistantTurn, answer], cvBlock), provider);
  const midSystem = capabilitiesFor(provider, model).midConversationSystem;

  expect(`${provider}: lượt mở đầu có CV ngay đầu`, (first.messages[0] as { content: unknown[] }).content.length, 2);
  expect(`${provider}: message system sau user mở đầu`,
    first.messages.map((m) => m.role), midSystem ? ["user", "system"] : ["user"]);
  expect(`${provider}: chỉ thị đầu có cấu hình phiên khi provider không có system giữa cuộc trò chuyện`,
    first.leadingInstruction, midSystem ? CORE_SYSTEM : first.leadingInstruction);
  ok(`${provider}: cấu hình phiên luôn ở trong prompt`,
    midSystem ? first.leadingInstruction === CORE_SYSTEM : first.leadingInstruction.includes("Kỹ sư"));
  expect(`${provider}: lượt sau giữ nguyên vị trí CV và cấu hình`,
    later.messages.slice(0, 2).map((m) => m.role), midSystem ? ["user", "system"] : ["user", "assistant"]);
  expect(`${provider}: lượt cuối là lượt mới`,
    later.messages[later.messages.length - 1].role, "user");
  ok(`${provider}: CV chỉ xuất hiện một lần`,
    JSON.stringify(later.messages).split("<<<CV>>>").length - 1 === 1);
  expect(`${provider}: khối assistant phát lại nguyên vẹn`,
    later.messages.filter((m) => m.role === "assistant").map((m) => (m as { blocks: unknown }).blocks), [assistantTurn.blocks]);
  const firstAgain = buildMessages(request(provider, model, [], cvBlock), provider);
  const stableLabel = `${provider}: lượt mở đầu dựng lại giống hệt nhau (byte ổn định)`;
  expect(stableLabel, JSON.stringify(firstAgain), JSON.stringify(first));
}

throws("thiếu lượt mở đầu tổng hợp bị từ chối",
  () => buildMessages(request("anthropic", "claude-opus-5", [answer]), "anthropic"));
throws("lượt mở đầu ở sai vị trí bị từ chối",
  () => buildMessages(request("anthropic", "claude-opus-5", [answer, opening]), "anthropic"));

console.log("\n--- T-1.6: tách góp ý / câu hỏi ---");
expect("coaching đúng định dạng",
  splitInterviewText("<feedback>Câu trả lời thiếu số liệu.</feedback><question>Bạn đo bằng gì?</question>", "coaching"),
  { feedback: "Câu trả lời thiếu số liệu.", question: "Bạn đo bằng gì?" });
expect("coaching có khoảng trắng và xuống dòng quanh thẻ",
  splitInterviewText("\n  <feedback>Góp ý.</feedback>\n<question>Câu hỏi?</question>  \n", "coaching"),
  { feedback: "Góp ý.", question: "Câu hỏi?" });
expect("nghiêm khắc giữ nguyên văn",
  splitInterviewText("<feedback>Không được phép</feedback><question>Hỏi gì?</question>", "strict"),
  { feedback: null, question: "<feedback>Không được phép</feedback><question>Hỏi gì?</question>" });
for (const [label, text] of [
  ["thiếu thẻ feedback", "<question>Hỏi gì?</question>"],
  ["thiếu thẻ question", "<feedback>Góp ý.</feedback>"],
  ["thứ tự ngược", "<question>Hỏi gì?</question><feedback>Góp ý.</feedback>"],
  ["thẻ rỗng", "<feedback></feedback><question>Hỏi gì?</question>"],
  ["lặp thẻ", "<feedback>a</feedback><feedback>b</feedback><question>Hỏi gì?</question>"],
  ["có phần dư ngoài thẻ", "Câu trả lời của tôi.<feedback>a</feedback><question>b</question>"],
  ["chưa đóng thẻ", "<feedback>a</feedback><question>b"],
] as Array<[string, string]>) {
  expect(`suy giảm: ${label}`, splitInterviewText(text, "coaching"), { feedback: null, question: text });
}
ok("chuỗi rỗng không vỡ", JSON.stringify(splitInterviewText("", "coaching")) === JSON.stringify({ feedback: null, question: "" }));

function throwsTolerant(run: () => unknown): boolean {
  try { run(); } catch { return true; }
  return false;
}

console.log(failures === 0 ? "\nTẤT CẢ ĐÚNG" : `\n${failures} MỤC SAI`);
process.exitCode = failures === 0 ? 0 : 1;