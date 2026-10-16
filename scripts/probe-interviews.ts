/**
 * Probe giai đoạn 2 — chạy: npm run probe:interviews
 *
 * Không phải bản mở rộng của `probe-interview.ts` (gia đoạn 1, prompt + schema):
 * đây là probe cho **API hội thoại** — khung SSE, biên lỗi, token CV đã ký, PDF,
 * và `streamTurn()` chạy trên một adapter giả.
 *
 * KHÔNG gọi API, không cần key. Phần không kiểm được ở đây ghi thẳng ở cuối file
 * (xem docs/03-TASKS.md, giai đoạn 2). Ba thứ cố ý kiểm **offline**:
 *
 *   1. **Mọi luồng còn mở đều có đúng một frame kết thúc** (T-2.1). Đây là quy tắc
 *      của §3.7. `turnStream()` phát frame kết thúc **ngay cả khi `produce` ném** —
 *      probe kiểm đúng điều đó, cộng thêm "không bao giờ có hai frame kết thúc" và
 *      "`error` không bao giờ mang nội dung của provider".
 *   2. **Key chỉ đi qua header** (T-2.3/NFR-2) và **token CV không sửa được**
 *      (T-2.4): sửa một ký tự, đổi payload, ký bằng khoá khác — cả ba phải thất bại.
 *   3. **Điều kiện dừng kiểm trước nội dung** (T-2.10): lượt bị từ chối/cắt cụt
 *      không được ghi vào transcript — kiểm bằng adapter giả trả `stopReason` xấu.
 */
import { AppError, fieldIssues, httpStatus, messageFor, readJson, redact } from "../src/lib/errors.ts";
import { encodeFrame, SSE_HEADERS, turnStream } from "../src/lib/sse.ts";
import type { DoneFrame, ErrorFrame, MetaFrame } from "../src/lib/sse.ts";
import { streamTurn } from "../src/lib/stream-turn.ts";
import type { TurnContext } from "../src/lib/stream-turn.ts";
import { tokenSigner } from "../src/lib/token.ts";
import { PROVIDER_KEY_HEADER, authFromRequest, keyFingerprint } from "../src/lib/interviews/auth.ts";
import { MAX_CV_CHARS, MAX_PDF_BYTES, MAX_PDF_PAGES, isPdf, safeFilename } from "../src/lib/pdf.ts";
import { turnRequestSchema } from "../src/lib/schemas.ts";
import type {
  AiConfig, Capability, ProviderAdapter, ProviderAuth,
  StopReason, TextDelta, TurnResult, TurnStream, Usage,
} from "../src/lib/providers/types.ts";

let failures = 0;
function expect(label: string, actual: unknown, wanted: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "LOI "} ${label} → ${JSON.stringify(actual)} (cần ${JSON.stringify(wanted)})`);
}
function ok(label: string, condition: boolean) {
  expect(label, condition, true);
}
/** Bắt lỗi rồi trả về mã của nó, để kỳ vọng đọc được: `thrownCode(fn)` → `"invalid_key"`. */
function thrownCode(run: () => unknown): string {
  try { run(); } catch (error) {
    return error instanceof AppError ? error.code : `KHÔNG-PHẢI-AppError:${(error as Error)?.message ?? error}`;
  }
  return "KHÔNG-NÉM";
}

/* ------------------------------------------------------------------ *
 * Adapter giả — không mở socket, không cần key.
 *
 * Nó dựng đúng hình dạng `TurnStream`: một async iterable delta và một promise
 * `final` riêng. Đó là điều kiện để `streamTurn()` chạy được trên bốn adapter thật
 * mà không cần bất kỳ hãng nào (T-2.6 một phần offline).
 * ------------------------------------------------------------------ */

type FakePlan = {
  text?: string;
  deltas?: string[];
  stopReason?: StopReason;
  usage?: Partial<{ input: number; output: number; cacheRead: number | null; cacheWrite: number | null }>;
  /** Ném ra khỏi `final` — mô phỏng lỗi mạng/lỗi SDK. */
  throws?: unknown;
};

function fakeAdapter(plan: FakePlan, id: AiConfig["provider"] = "anthropic"): ProviderAdapter {
  const capabilities: Capability = {
    streaming: true, structuredOutput: true, readsPdf: true, reasoning: true,
    midConversationSystem: true, cacheableSessionConfig: true, explicitCache: true,
    reportsCacheUsage: true, modelListCarriesCapabilities: false, supportsDirect: true,
    reasoningLevels: ["off", "low", "medium", "high"],
  };
  return {
    id,
    capabilities,
    stream(_auth: ProviderAuth, _req): TurnStream {
      const pieces = plan.deltas ?? [plan.text ?? "Câu hỏi?"];
      const result: TurnResult = {
        blocks: [{ type: "text", text: plan.text ?? "Câu hỏi?" }],
        text: plan.text ?? "Câu hỏi?",
        stopReason: plan.stopReason ?? "end_turn",
        usage: { input: 10, output: 5, cacheRead: null, cacheWrite: null, ...plan.usage },
      };
      // `final` chỉ resolve **sau khi** luồng đã hết, đúng như SDK thật. Resolve
      // từ trong vòng lặp sẽ khiến `streamTurn()` đọc kết quả khi luồng còn đang
      // chạy — và nhánh lỗi sẽ không bao giờ xảy ra.
      let settle!: () => void;
      const drained = new Promise<void>((resolve) => { settle = resolve; });
      const iterator = (async function* (): AsyncGenerator<TextDelta> {
        try {
          for (const text of pieces) yield { text };
        } finally {
          settle();
        }
      })();
      const final = drained.then(() => {
        if (plan.throws !== undefined) throw plan.throws;
        return result;
      });
      // `TurnStream` là async iterable **có thêm** `final`, nên phải gắn thuộc tính
      // vào chính iterator. Qua `unknown` vì `AsyncGenerator` không khai báo `final`.
      const stream = iterator as unknown as TurnStream;
      Object.defineProperty(stream, "final", { value: final, enumerable: false });
      return stream;
    },
    structured: () => { throw new Error("probe không cần structured"); },
  };
}

const AI: AiConfig = {
  provider: "anthropic", model: "claude-opus-5",
  reasoning: "medium", callMode: "proxy", persistKey: false,
};
const CONFIG = { role: "Kỹ sư phần mềm", language: "vi" as const, mode: "strict" as const, length: "short" as const };
const AUTH: ProviderAuth = { apiKey: "sk-probe-gia" };

/**
 * Chạy một lượt và gom lại những gì `streamTurn()` **phát ra**.
 *
 * `streamTurn()` nhận `sink` và phát delta trong lúc chạy, nên "delta giữ nguyên thứ
 * tự" là thứ phải quan sát ở `sink`, không phải ở giá trị trả về.
 */
async function turn(adapter: ProviderAdapter, over: Partial<TurnContext> = {}) {
  const emitted: string[] = [];
  const context: TurnContext = {
    auth: AUTH, adapter, ai: AI, config: CONFIG, cv: { kind: "none" },
    history: [], newTurn: "Bắt đầu phỏng vấn.", requestId: "req-probe", ...over,
  };
  const result = await streamTurn(context, (frame) => {
    if (frame.type === "delta") emitted.push(frame.text);
  });
  return { ...result, emitted };
}

/* ------------------------------------------------------------------ *
 * T-2.1 — khung SSE: mọi luồng còn mở kết thúc bằng đúng một frame.
 * ------------------------------------------------------------------ */

console.log("--- T-2.1: khung SSE chỉ dùng `data:`, không có `event:` ---");
expect("meta", encodeFrame({ type: "meta", sessionId: "s1", questionNumber: 1, questionsTotal: 5, mode: "strict", language: "vi" }),
  'data: {"type":"meta","sessionId":"s1","questionNumber":1,"questionsTotal":5,"mode":"strict","language":"vi"}\n\n');
expect("delta", encodeFrame({ type: "delta", text: "a" }), 'data: {"type":"delta","text":"a"}\n\n');
ok("không sinh khung `event:`", !/^event:/m.test(encodeFrame({ type: "delta", text: "x" })));
ok("mọi khung kết thúc bằng hai ký tự xuống dòng", encodeFrame({ type: "delta", text: "x" }).endsWith("\n\n"));
expect("Content-Type", SSE_HEADERS["Content-Type"], "text/event-stream; charset=utf-8");
expect("X-Accel-Buffering (không có nó thì nginx gom cả khối)", SSE_HEADERS["X-Accel-Buffering"], "no");
expect("Cache-Control", SSE_HEADERS["Cache-Control"], "no-store");

console.log("\n--- T-2.1: đọc lại một luồng thật, frame cuối luôn là kết thúc ---");
async function readFrames(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text.split("\n\n").filter(Boolean).map((line) => JSON.parse(line.replace(/^data: /, "")) as Record<string, unknown>);
}
function terminalCount(frames: Array<Record<string, unknown>>): number {
  return frames.filter((f) => f.type === "done" || f.type === "error").length;
}

const META: MetaFrame = { type: "meta", sessionId: "s1", questionNumber: 1, questionsTotal: 5, mode: "strict", language: "en" };
const USAGE: Usage = { input: 1, output: 2, cacheRead: null, cacheWrite: null };

const doneRun = await readFrames(turnStream(async (sink) => {
  sink(META);
  sink({ type: "delta", text: "Bạn " });
  sink({ type: "delta", text: "từng làm gì?" });
  const done: DoneFrame = { type: "done", stopReason: "end_turn", assistantBlocks: [], sessionComplete: false, usage: USAGE };
  sink(done);
  return done;
}));
expect("thứ tự khung", doneRun.map((f) => f.type), ["meta", "delta", "delta", "done"]);
expect("delta ghép lại đúng câu hỏi", doneRun.slice(1, 3).map((f) => f.text).join(""), "Bạn từng làm gì?");
expect("đúng MỘT frame kết thúc", terminalCount(doneRun), 1);

console.log("\n--- T-2.1: `produce` ném vẫn phải có frame kết thúc (bảo đảm của §3.7) ---");
// Đây là lỗi âm thầm đắt nhất của dòng SSE: producer vỡ giữa chừng, client đứng
// đợi mãi, và UI không báo gì hết. `turnStream()` tự phát `error` khi thiếu.
const thrownRun = await readFrames(turnStream(async () => {
  throw new Error("provider vỡ giữa chừng");
}));
expect("producer ném → vẫn có frame kết thúc", thrownRun[thrownRun.length - 1].type, "error");
expect("đúng MỘT frame kết thúc", terminalCount(thrownRun), 1);
expect("client disconnect là ngoại lệ ĐÃ BIẾT (không có chỗ để gửi)",
  (thrownRun[thrownRun.length - 1] as { code: string }).code, "internal");

// Khung kết thúc phát hai lần: khung thứ hai bị bỏ qua, không phải gửi cho client.
const doubleRun = await readFrames(turnStream(async (sink) => {
  const done: DoneFrame = { type: "done", stopReason: "end_turn", assistantBlocks: [], sessionComplete: true, usage: USAGE };
  sink(done);
  const error: ErrorFrame = { type: "error", code: "internal", message: "x", requestId: "r1" };
  sink(error);
  return done;
}));
expect("phát hai frame kết thúc → chỉ giữ khung đầu", doubleRun.map((f) => f.type), ["done"]);
expect("đúng MỘT frame kết thúc", terminalCount(doubleRun), 1);

console.log("\n--- T-2.1: client huỷ SSE ⇒ không phát frame sau huỷ ---");
let resumeCancelled!: () => void;
const cancelledBarrier = new Promise<void>((resolve) => { resumeCancelled = resolve; });
let producerDisconnected = false;
const cancelledResponse = turnStream(async (sink) => {
  sink(META);
  await cancelledBarrier;
  try {
    sink({ type: "delta", text: "không ai nhận" });
  } catch (error) {
    producerDisconnected = true;
    throw error;
  }
  return { type: "done", stopReason: "end_turn", assistantBlocks: [], sessionComplete: false, usage: USAGE };
});
const cancelledReader = cancelledResponse.body!.getReader();
await cancelledReader.read();
await cancelledReader.cancel();
resumeCancelled();
await new Promise<void>((resolve) => setTimeout(resolve, 0));
ok("huỷ reader khiến sink ném và producer dừng", producerDisconnected);

/* ------------------------------------------------------------------ *
 * T-2.10 — điều kiện dừng kiểm TRƯỚC nội dung (không lượt nào đổi
 * transcript khi model đã từ chối hoặc bị cắt cụt).
 * ------------------------------------------------------------------ */

console.log("\n--- T-2.10: từ chối / cắt cụt → lỗi, KHÔNG trả nửa câu hỏi ---");
const refusal = await turn(fakeAdapter({ text: "Tôi không thể trả lời câu này.", stopReason: "refusal" }));
expect("từ chối → error code", refusal.kind === "error" ? refusal.code : refusal.kind, "refusal");
ok("từ chối không trả về text",
  refusal.kind === "error" || refusal.text.trim() === "");

const truncated = await turn(fakeAdapter({ text: "Câu hỏi bị cắt", stopReason: "max_tokens" }));
expect("cắt cụt → error code", truncated.kind === "error" ? truncated.code : truncated.kind, "truncated");

// `other` không nói được là lỗi hay không — coi là nội bộ, KHÔNG ghi transcript.
const other = await turn(fakeAdapter({ text: "nửa câu", stopReason: "other" }));
expect("stopReason lạ → internal", other.kind === "error" ? other.code : other.kind, "internal");

const blank = await turn(fakeAdapter({ text: "   ", deltas: ["   "], stopReason: "end_turn" }));
expect("câu rỗng → internal", blank.kind === "error" ? blank.code : blank.kind, "internal");
ok("câu rỗng không đi tiếp làm câu hỏi của lượt sau", blank.kind === "error");

console.log("\n--- T-2.10: lỗi SDK được phân loại, không lộ message gốc ---");
for (const [name, thrown, wanted] of [
  ["401", { status: 401, code: "authentication_error" }, "invalid_key"],
  ["402", { status: 402, code: "billing_error" }, "billing"],
  ["404", { status: 404, code: "not_found_error" }, "model_not_found"],
  ["429", { status: 429, code: "rate_limit_error" }, "rate_limit"],
  ["lỗi mạng", { name: "APIConnectionError" }, "network"],
] as Array<[string, unknown, string]>) {
  const outcome = await turn(fakeAdapter({ throws: thrown }));
  expect(`${name} → mã lỗi`, outcome.kind === "error" ? outcome.code : "done", wanted);
  ok(`${name} không lộ message thô của SDK`,
    outcome.kind === "error" && !/authentication_error|billing_error|rate_limit_error|APIConnectionError/.test(outcome.message));
}
const streamThrow = await turn(fakeAdapter({ throws: { status: 401, code: "authentication_error" } }));
ok("lỗi ném ra giữa luồng vẫn thành frame kết thúc", streamThrow.kind === "error");

/* ------------------------------------------------------------------ *
 * T-2.6 (offline) — `streamTurn()` chạy được và trả đúng kết quả cuối.
 * ------------------------------------------------------------------ */

console.log("\n--- T-2.6: lượt bình thường trả delta + blocks + usage đã chuẩn hoá ---");
const okTurn = await turn(fakeAdapter({
  deltas: ["Tôi ", "làm backend 3 năm."],
  usage: { input: 1200, output: 80, cacheRead: 1024 },
}));
ok("thành công", okTurn.kind === "done");
if (okTurn.kind === "done") {
  expect("delta giữ nguyên thứ tự (phát qua sink)", okTurn.emitted, ["Tôi ", "làm backend 3 năm."]);
  expect("cacheRead giữ số", okTurn.usage.cacheRead, 1024);
  expect("cacheWrite chưa công bố → null, KHÔNG phải 0", okTurn.usage.cacheWrite, null);
  ok("blocks phát lại được", Array.isArray(okTurn.blocks) && okTurn.blocks.length > 0);
}

/* ------------------------------------------------------------------ *
 * T-2.3 — key chỉ đi qua header, thiếu key là 401 chứ không phải 500.
 * ------------------------------------------------------------------ */

console.log("\n--- T-2.3: key đọc từ header, thiếu là 401 ---");
expect("tên header", PROVIDER_KEY_HEADER, "x-provider-key");
const fromHeader = authFromRequest(new Request("http://x/api", { headers: { [PROVIDER_KEY_HEADER]: "  sk-cua-toi  " } }));
expect("cắt khoảng trắng thừa", fromHeader.apiKey, "sk-cua-toi");
expect("thiếu header", thrownCode(() => authFromRequest(new Request("http://x/api"))), "invalid_key");
expect("header rỗng", thrownCode(() => authFromRequest(new Request("http://x/api", { headers: { [PROVIDER_KEY_HEADER]: "   " } }))), "invalid_key");
expect("401 tương ứng", httpStatus("invalid_key"), 401);
ok("dấu vân tay không phải key", keyFingerprint("sk-probe").length === 16 && keyFingerprint("sk-probe") !== "sk-probe");
expect("cùng key → cùng vân tay", keyFingerprint("sk-a"), keyFingerprint("sk-a"));
expect("key khác → vân tay khác", keyFingerprint("sk-a") === keyFingerprint("sk-b"), false);

/* ------------------------------------------------------------------ *
 * T-2.4 — token CV: sửa một ký tự là hỏng (FR-2).
 * ------------------------------------------------------------------ */

console.log("\n--- T-2.4: token CV đã ký ---");
const signer = tokenSigner(Buffer.from("khoa-thu-nghiem"));
const token = signer.sign("upload-123", Math.floor(Date.now() / 1000) + 3600);
expect("token hợp lệ", signer.verify(token), { uploadId: "upload-123", exp: Math.floor(Date.now() / 1000) + 3600 });
expect("sửa MỘT ký tự trong chữ ký → thất bại", signer.verify(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")), null);
const [payloadPart] = token.split(".");
const tamperedPayload = Buffer.from(JSON.stringify({ v: 1, uploadId: "upload-KHAC", exp: 9_999_999_999 }), "utf8").toString("base64url");
expect("đổi payload (đổi uploadId) → thất bại", signer.verify(`${tamperedPayload}.${token.split(".")[1]}`), null);
expect("ký bằng khoá khác → thất bại", tokenSigner(Buffer.from("khoa-khac")).verify(token), null);
expect("token hết hạn → thất bại", signer.verify(signer.sign("upload-123", Math.floor(Date.now() / 1000) - 1)), null);
expect("token rác → thất bại", signer.verify("khong-pha-token"), null);
expect("token không mang nội dung CV (chỉ v, uploadId, exp)",
  Object.keys(JSON.parse(Buffer.from(payloadPart!, "base64url").toString("utf8"))).sort(), ["exp", "uploadId", "v"]);
ok("token ngắn hơn trần 512 ký tự của cvSchema", token.length < 512);

/* ------------------------------------------------------------------ *
 * T-2.5 — PDF: magic bytes, trần, tên tệp an toàn.
 * ------------------------------------------------------------------ */

console.log("\n--- T-2.5: PDF kiểm bằng magic bytes, KHÔNG tin Content-Type ---");
ok("PDF thật", isPdf(new TextEncoder().encode("%PDF-1.7\n...")));
ok(".exe đổi tên .pdf vẫn bị chặn (magic bytes cũ)", !isPdf(new TextEncoder().encode("MZ  executable")));
ok("PNG đổi tên .pdf bị chặn", !isPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])));
ok("chuỗi rỗng bị chặn", !isPdf(new Uint8Array(0)));
expect("trần dung lượng", MAX_PDF_BYTES, 15 * 1024 * 1024);
expect("trần số trang", MAX_PDF_PAGES, 30);
expect("trần ký tự CV khớp cvSchema", MAX_CV_CHARS, 20_000);
expect("tên tệp mặc định khi thiếu", safeFilename(null), "cv.pdf");
expect("bỏ dấu gạch chéo (đường đi ra giao diện)", safeFilename("../../etc/passwd"), "....etcpasswd");
ok("bỏ ký tự điều khiển", !/[ -]/.test(safeFilename("cv .pdf")));
ok("giới hạn 120 ký tự", safeFilename("x".repeat(400)).length <= 120);

/* ------------------------------------------------------------------ *
 * T-2.2 — log không bao giờ mang nội dung người dùng.
 * ------------------------------------------------------------------ */

console.log("\n--- T-2.2: thông báo lỗi an toàn để hiển thị ---");
ok("redact() không phản chiếu lỗi", redact(new Error("sk-secret-abc /Users/nguoi/ten")) === messageFor("internal"));
ok("thông báo không chứa tên tệp của server", !messageFor("internal").includes("/Users/"));
ok("mọi mã lỗi đều có thông báo", ["invalid_key", "rate_limit", "truncated", "internal", "session_conflict"]
  .every((code) => messageFor(code as Parameters<typeof messageFor>[0]).length > 0));
ok("thông báo không lộ tên model/hãng của SDK",
  !/claude|gpt-|gemini|anthropic|openai/i.test([messageFor("model_not_found"), messageFor("internal")].join(" ")));

console.log("\n--- T-2.1: lỗi Zod trả 400 KÈM đường dẫn trường (UI cần biết sửa đâu) ---");
const bad = turnRequestSchema.safeParse({ ai: { ...AI, model: "" }, sessionId: "không-phải-uuid", answer: "x" });
ok("body sai bị từ chối", !bad.success);
if (!bad.success) {
  const issues = fieldIssues(bad.error);
  ok("mỗi lỗi có đường dẫn trường", issues.every((i) => typeof i.path === "string"));
  ok("nêu đích danh trường `model` (lồng trong `ai`)", issues.some((i) => i.path === "ai.model"));
  ok("nêu đích danh trường `sessionId`", issues.some((i) => i.path === "sessionId"));
}
ok("server đếm lượt trong DB, không nhận `turnCount` từ client",
  !turnRequestSchema.safeParse({ ai: AI, sessionId: "3f6b1c2e-9a4d-4c8b-8e2a-1d5f7b9c0d1e", answer: "ok", turnCount: 3 }).success);
ok("client không gửi transcript", !turnRequestSchema.safeParse({ ai: AI, sessionId: "3f6b1c2e-9a4d-4c8b-8e2a-1d5f7b9c0d1e", answer: "ok", transcript: [] }).success);

console.log("\n--- readJson: body chunked có giới hạn trước khi ghép ---");
expect("JSON không có Content-Length vẫn đọc được",
  await readJson(new Request("http://x/api", { method: "POST", body: '{"ok":true}' })), { ok: true });
let cancelled = false;
const oversized = new Request("http://x/api", {
  method: "POST", duplex: "half",
  body: new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(60_000)); },
    cancel() { cancelled = true; },
  }),
} as RequestInit & { duplex: "half" });
let oversizeRejected = false;
try { await readJson(oversized); } catch (error) { oversizeRejected = error instanceof SyntaxError; }
ok("body chunked vượt 100 KB bị từ chối", oversizeRejected);
ok("body chunked vượt trần được huỷ", cancelled);

/* ------------------------------------------------------------------ *
 * Không kiểm được offline — ghi ra để không ai tưởng là đã kiểm.
 * ------------------------------------------------------------------ */
console.log("\n--- Ghi chú phần KHÔNG kiểm được ở probe này ---");
for (const line of [
  "T-2.7/T-2.8: endpoint start/turn đã có; hội thoại `curl -N` thành công cần key thật.",
  "T-2.9: schema và DB đã kiểm offline; giới hạn lượt qua HTTP thật vẫn cần kiểm.",
  "T-2.11: health đã có; ánh xạ lỗi của từng hãng cần key thật.",
  "T-2.5 phần tải lên thật: cần PDF thật + Files API của hãng.",
  "T-2.6 phần log cache: cần gọi API thật để biết cache có được đọc lại không (T-5.2).",
]) console.log(`     ${line}`);

console.log(`\n${failures === 0 ? "TẤT CẢ ĐÚNG" : `${failures} MỤC SAI`}`);
process.exitCode = failures === 0 ? 0 : 1;