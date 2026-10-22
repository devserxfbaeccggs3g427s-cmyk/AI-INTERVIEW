/*
 * Isolated local browser smoke test; never uses data/interview_sessions.db or a real provider.
 * Run: npx tsx scripts/verify-learning-browser.ts
 * Requires Node >=22.5 and locally installed Google Chrome (override CHROME_BIN).
 * Copies the app to a temporary directory so next dev cannot write the root .next.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const chromeBin = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const timeout = 90_000;
const tmp = mkdtempSync(join(process.env.CLAUDE_JOB_DIR ? join(process.env.CLAUDE_JOB_DIR, "tmp") : root, ".learning-browser-"));
const appDir = join(tmp, "app");
const profile = join(tmp, "chrome");
const dbPath = join(tmp, "fixture.db");
let next: ChildProcess | undefined;
let chrome: ChildProcess | undefined;
let mock: ReturnType<typeof createServer> | undefined;
let cdp: Cdp | undefined;
let providerCalls = 0;
let errors = 0;

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill();
  await Promise.race([exited, sleep(5000)]);
}

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

async function until<T>(fn: () => Promise<T | false> | T | false, label: string, limit = timeout): Promise<T> {
  const deadline = Date.now() + limit;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value !== false) return value;
    } catch (error) { last = error; }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${String(last)}` : ""}`);
}

function lesson(title: string, language: "vi" | "en") {
  const translated = language === "vi";
  return {
    version: 1, title, goal: translated ? "Hiểu cơ chế index" : "Understand indexing",
    objectives: [translated ? "Giải thích trade-off" : "Explain trade-offs"],
    explanation: translated ? "Index giúp truy vấn nhanh hơn." : "Indexes speed up reads.",
    example: "CREATE INDEX idx_user ON users(id);",
    sections: [{ heading: translated ? "Cơ bản" : "Basics", body: translated ? "Ghi dữ liệu tốn thêm chi phí." : "Writes require index maintenance." }],
    questions: [
      { stem: translated ? "Chi phí của index là gì?" : "What does an index cost?", options: [
        { id: "A", text: "Fast reads" }, { id: "B", text: "Slow writes" }, { id: "C", text: "No cost" },
      ], correctOption: "B", explanation: "SECRET_FEEDBACK_ONE: writes update indexes." },
      { stem: translated ? "Khi nào index ít hữu ích?" : "When is an index less useful?", options: [
        { id: "A", text: "Low cardinality" }, { id: "B", text: "Selective key" }, { id: "C", text: "Composite key" },
      ], correctOption: "A", explanation: "SECRET_FEEDBACK_TWO: low selectivity." },
    ],
  };
}

function report() {
  const pillar = { score: 50, headline: "Average", rationale: "Needs practice" };
  return {
    schema_version: "v1", generated_at: "2026-10-22T00:00:00.000Z", overall_score: 50,
    recommendation: "Needs Improvement", pillars: { content: pillar, relevance: pillar, clarity: pillar, depth: pillar },
    strengths: ["Clear answer"],
    improvements: ["Giải thích database indexes"],
    per_turn: [{ turn_number: 1, topic: "Indexes", pillar_scores: { content: 50, relevance: 50, clarity: 50, depth: 50 }, micro_rubric: { strengths: [], improvements: [] } }],
    next_steps: [
      { title: "Study query plans", description: "Inspect query plans", duration: "1 week" },
      { title: "Practice indexes", description: "Compare scan versus index", duration: "1 week" },
      { title: "Review joins", description: "Explain joins", duration: "1 week" },
    ],
  };
}

class Cdp {
  private seq = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const packet = JSON.parse(String(event.data));
      if (packet.method === "Runtime.exceptionThrown") errors++;
      const task = this.pending.get(packet.id);
      if (!task) return;
      this.pending.delete(packet.id);
      if (packet.error) task.reject(new Error(JSON.stringify(packet.error)));
      else task.resolve(packet.result);
    });
  }
  static async open(url: string) {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP websocket failed")), { once: true });
    });
    return new Cdp(socket);
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value as T;
  }
  async navigate(url: string) {
    await this.send("Page.navigate", { url });
    await until(() => this.eval<boolean>("document.readyState === 'complete'"), "document ready");
  }
  async close() { this.socket.close(); }
}

async function main() {
  check(existsSync(chromeBin), `Chrome available at ${chromeBin}`);
  // Copy only source/config; never copy a live DB, .next, .env or another worker's edits.
  cpSync(root, appDir, { recursive: true, filter: (name) => {
    const relative = name.slice(root.length).replace(/^\//, "");
    return !relative || !["node_modules", ".next", ".git", ".idea", ".claude", "data", ".env", "tsconfig.tsbuildinfo"].includes(relative.split("/")[0]) && !relative.startsWith(".learning-browser-");
  } });
  symlinkSync(join(root, "node_modules"), join(appDir, "node_modules"), "dir");
  const mockPort = await freePort();
  const mockUrl = `http://127.0.0.1:${mockPort}/v1`;
  mock = createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") { res.writeHead(404).end(); return; }
    let request = "";
    for await (const chunk of req) request += chunk;
    const prompt = JSON.parse(request).messages?.[0]?.content ?? "";
    const isVi = String(prompt).includes("Vietnamese");
    providerCalls++;
    const data = JSON.stringify(lesson(isVi ? "Bài học tiếng Việt" : "English practice lesson", isVi ? "vi" : "en"));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: data } }] })}\n\n`);
    res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>((done) => mock!.listen(mockPort, "127.0.0.1", done));
  // The database path is explicit, unique and set before any import of lib/db.ts.
  process.env.INTERVIEW_DB_PATH = dbPath;
  const { getDb } = await import("../lib/db");
  const db = getDb();
  const raw = JSON.stringify(report());
  const revision = createHash("sha256").update(raw).digest("hex");
  const fixture = [
    { id: "learning-browser-vi", role: "Backend Engineer", language: "vi", readyKind: "improvement", readyMode: "fundamentals" },
    { id: "learning-browser-en", role: "Data Engineer", language: "en", readyKind: "next_step", readyMode: "answering" },
  ] as const;
  for (const row of fixture) {
    db.prepare(`INSERT INTO sessions (id,role,language,mode,planned_rounds,status,provider,model,base_url) VALUES (?,?,?,'strict',5,'completed','custom','local-model',?)`)
      .run(row.id, row.role, row.language, mockUrl);
    db.prepare(`INSERT INTO evaluations (session_id,report_json,overall_score,recommendation) VALUES (?,?,50,'Needs Improvement')`).run(row.id, raw);
    const label = row.readyKind === "improvement" ? report().improvements[0] : report().next_steps[0].title;
    const context = row.readyKind === "improvement" ? "" : "Inspect query plans\n1 week";
    db.prepare(`INSERT INTO learning_lessons (id,session_id,report_revision,source_kind,source_index,mode,source_label,source_context,status,lesson_json,provider,model,base_url)
      VALUES (?,?,?,?,?,?,?,?,'ready',?,'custom','local-model',?)`).run(
      `${row.id}-ready`, row.id, revision, row.readyKind, 0, row.readyMode, label, context,
      JSON.stringify(lesson(row.language === "vi" ? "Bài học tiếng Việt" : "English practice lesson", row.language)), mockUrl,
    );
  }
  db.close();

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  next = spawn(process.execPath, [join(appDir, "node_modules/next/dist/bin/next"), "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: appDir, env: { ...process.env, INTERVIEW_DB_PATH: dbPath, NEXT_PUBLIC_PROVIDER_ENABLE: "custom", ALLOW_PRIVATE_BASE_URL: "1", PUBLIC_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let nextLog = "";
  for (const stream of [next.stdout!, next.stderr!]) stream.on("data", (chunk) => { nextLog += chunk; if (nextLog.length > 16000) nextLog = nextLog.slice(-16000); });
  await until(async () => {
    if (next?.exitCode !== null) throw new Error(`Next exited: ${nextLog}`);
    const response = await fetch(`${origin}/new`).catch(() => null);
    return response?.ok ? true : false;
  }, `isolated Next server (${nextLog})`);

  chrome = spawn(chromeBin, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-extensions", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const debuggingPort = await until(() => {
    const filename = join(profile, "DevToolsActivePort");
    return existsSync(filename) ? Number(readFileSync(filename, "utf8").split("\n")[0]) : false;
  }, "Chrome debugging port", 15_000);
  const target = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/new?about:blank`, { method: "PUT" })).json() as { webSocketDebuggerUrl: string };
  cdp = await Cdp.open(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const prefs = { version: 2, sessionOnly: true, provider: "custom", apiKey: "",
    prefsByProvider: { custom: { model: "local-model", baseUrl: mockUrl, temperature: 0.4, maxTokens: 4096, topP: 0.95 } },
    manualModelEdit: false, manualEditSeq: 0 };
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `if (location.origin === ${JSON.stringify(origin)}) sessionStorage.setItem('byok.config', ${JSON.stringify(JSON.stringify(prefs))});` });
  const evaluate = <T>(expression: string) => cdp!.eval<T>(expression);
  const click = async (selector: string) => {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Missing ' + ${JSON.stringify(selector)}); el.click(); })()`);
  };
  const awaitText = (text: string) => until(() => evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(text)})`), text);
  const layout = async (width: number) => {
    const info = await evaluate<{ innerWidth: number; scrollWidth: number; focusable: number }>(`({ innerWidth, scrollWidth: document.documentElement.scrollWidth,
      focusable: [...document.querySelectorAll('main button, main a, main input')].filter(e => !e.disabled && e.getClientRects().length).length })`);
    check(info.innerWidth === width, `actual innerWidth ${width} (received ${info.innerWidth}, not device scale)`);
    if (info.scrollWidth > width) {
      const offenders = await evaluate<{ tag: string; className: string; right: number; scrollWidth: number }[]>(`[...document.querySelectorAll('body *')]
        .filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0)
        .slice(0, 12).map(e => ({ tag: e.tagName, className: String(e.className).slice(0, 100), right: Math.round(e.getBoundingClientRect().right), scrollWidth: e.scrollWidth }))`);
      console.error("Horizontal overflow offenders:", offenders);
    }
    check(info.scrollWidth <= width, `no horizontal document overflow at ${width}px: ${info.scrollWidth}`);
    check(info.focusable >= 4, `controls remain focusable at ${width}px`);
  };
  const widths = [1280, 375];
  for (const width of widths) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 850, deviceScaleFactor: 1, mobile: false });
    for (const row of fixture) {
      for (const kind of ["improvement", "next_step"] as const) {
        const path = `/learn/${row.id}?kind=${kind}&index=0`;
        const callsBefore = providerCalls;
        await cdp.navigate(`${origin}${path}`);
        await awaitText(kind === "improvement" ? "Giải thích database indexes" : "Study query plans");
        await until(() => evaluate<boolean>("document.querySelectorAll('[role=group][aria-label=\"Cách học\"] button').length === 2"), "two independent modes");
        const info = await evaluate<string[]>(`[...document.querySelectorAll('[role=group][aria-label="Cách học"] button')].map(e => e.innerText)`);
        check(info.length === 2 && info.some((x) => x.includes("Chưa biết")) && info.some((x) => x.includes("Luyện diễn đạt")), `${width}px ${row.language}/${kind} both modes visible`);
        await layout(width);
        check(providerCalls === callsBefore, "navigation did not call provider");
        const readyMode = row.readyKind === kind ? row.readyMode : undefined;
        if (readyMode === "answering") await click('[role=group][aria-label="Cách học"] button:nth-child(2)');
        if (readyMode) {
          await awaitText(row.language === "vi" ? "Bài học tiếng Việt" : "English practice lesson");
          await awaitText("Bắt đầu tự kiểm tra");
          const secretBefore = await evaluate<boolean>("document.body.innerText.includes('SECRET_FEEDBACK') || document.documentElement.outerHTML.includes('SECRET_FEEDBACK')");
          check(!secretBefore, "answer key and explanations absent before quiz submission (DOM)");
          const detail = await (await fetch(`${origin}/api/learning/${row.id}-ready`)).text();
          check(!detail.includes("correctOption") && !detail.includes("SECRET_FEEDBACK"), "lesson GET excludes private answers and explanations");
          if (width === 1280 && kind === "improvement") {
            await click('button[aria-pressed="false"]');
            await awaitText("Bài học chưa được khởi tạo");
            await click('button[aria-pressed="false"]');
            await awaitText(row.language === "vi" ? "Bài học tiếng Việt" : "English practice lesson");
            check(providerCalls === callsBefore, "mode switching and reading saved lessons do not call provider");
          }
          if (width === 375 && kind === row.readyKind) {
            await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Bắt đầu tự kiểm tra'))).click()`);
            const submitDisabled = await evaluate<boolean>(`[...document.querySelectorAll('button')].find(e => e.textContent?.includes('Nộp ')).disabled`);
            check(submitDisabled, "quiz submit disabled until every question answered");
            await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
            await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
            const focused = await evaluate<string>("document.activeElement?.tagName ?? ''");
            check(["A", "BUTTON", "INPUT"].includes(focused), "keyboard Tab reaches interactive control");
            await evaluate(`document.querySelectorAll('fieldset')[0].querySelector('input[value="B"]').click()`);
            await evaluate(`document.querySelectorAll('fieldset')[1].querySelector('input[value="A"]').click()`);
            check(await evaluate<boolean>(`![...document.querySelectorAll('button')].find(e => e.textContent?.includes('Nộp ')).disabled`), "quiz accepts keyboard-accessible radio answers");
            check(!await evaluate<boolean>("document.body.innerText.includes('SECRET_FEEDBACK')"), "no explanation before submit after choosing answers");
            await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Nộp '))).click()`);
            await awaitText("SECRET_FEEDBACK_ONE");
            await awaitText("Đúng 2/2");
            check(providerCalls === callsBefore, "quiz submission does not call provider");
            await cdp.navigate(`${origin}${path}`);
            if (readyMode === "answering") await click('[role=group][aria-label="Cách học"] button:nth-child(2)');
            await awaitText("Đúng 2/2");
            check(await evaluate<boolean>("document.body.innerText.includes('Lịch sử tự kiểm tra')"), "quiz results persist on reload");
          }
        } else {
          await awaitText("Bài học chưa được khởi tạo");
          check(providerCalls === callsBefore, "uncreated topic does not generate automatically");
        }
        const href = await evaluate<string>(`[...document.querySelectorAll('a')].find(e => e.textContent?.includes('Luyện lại chủ đề này'))?.getAttribute('href') ?? ''`);
        const prefill = new URL(href, origin);
        check(prefill.pathname === "/new" && prefill.searchParams.get("role") === row.role && prefill.searchParams.get("language") === row.language &&
          prefill.searchParams.getAll("focus").length === 1 && !href.includes("description"), `${row.language}/${kind} /new prefill contains only role, language and source focus`);
        if (width === 375 && kind === row.readyKind) {
          await cdp.navigate(`${origin}${href}`);
          await until(() => evaluate<boolean>(`document.querySelector('input[placeholder^="Nhập tên vị trí"]')?.value === ${JSON.stringify(row.role)}`), "/new role prefilled");
          check(await evaluate<boolean>(`document.querySelector('input[placeholder^="Nhập tên vị trí"]')?.value === ${JSON.stringify(row.role)}`), "/new role prefilled as editable input");
          await until(() => evaluate<boolean>(`document.querySelector('input[aria-label="Chủ đề luyện tập 1"]')?.value === ${JSON.stringify(prefill.searchParams.get("focus"))}`), "/new focus prefilled");
          check((await evaluate<string>("document.querySelector('input[aria-label=\"Chủ đề luyện tập 1\"]')?.value ?? ''")) === prefill.searchParams.get("focus"), "/new focus prefilled as editable input");
          check(await evaluate<boolean>(`[...document.querySelectorAll('button')].find(e => e.textContent?.includes(${JSON.stringify(row.language === "vi" ? "Tiếng Việt" : "English")}))?.style.boxShadow.includes('2px') ?? false`), "/new language prefilled");
        }
      }
    }
  }
  // Explicit generation is the sole place a provider call is permitted. The
  // custom endpoint is this in-process SSE stub, never a remote paid provider.
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 850, deviceScaleFactor: 1, mobile: false });
  await cdp.navigate(`${origin}/learn/learning-browser-vi?kind=next_step&index=0`);
  await awaitText("Bài học chưa được khởi tạo");
  check(Number(providerCalls) === 0, "all prior browser reads stayed provider-free");
  await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Tạo bài học: Chưa biết'))).click()`);
  await awaitText("Bài học tiếng Việt");
  check(providerCalls === 1, "explicit create calls only the local mock provider once");
  await cdp.navigate(`${origin}/learn/learning-browser-vi?kind=next_step&index=0`);
  await awaitText("Bài học tiếng Việt");
  check(providerCalls === 1, "reopening generated lesson never regenerates or charges");
  await layout(375);
  check(errors === 0, `no uncaught browser runtime exceptions (${errors})`);
  console.log(`Browser verification complete: 2 widths, 2 languages, 2 source kinds, 2 independent modes; ${providerCalls} local mock call.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await cdp?.close();
  await Promise.all([stop(chrome), stop(next)]);
  if (mock) await new Promise<void>((done) => mock!.close(() => done()));
  rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
});
