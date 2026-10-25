/*
 * Isolated local browser smoke test; never uses data/interview_sessions.db or a real provider.
 * Run: npx tsx scripts/verify-learning-browser.ts
 * Requires Node >=22.5 and locally installed Google Chrome (override CHROME_BIN).
 * Copies the app to a temporary directory so next dev cannot write the root .next.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseLesson } from "../lib/learning-schema";

const root = resolve(import.meta.dirname, "..");
const chromeBin = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const timeout = 90_000;
// The scratch copy must live outside the checkout: node cannot copy a directory
// into a subdirectory of itself, and next dev must never write the root .next.
const tmpBase = process.env.CLAUDE_JOB_DIR ? join(process.env.CLAUDE_JOB_DIR, "tmp") : tmpdir();
mkdirSync(tmpBase, { recursive: true });
const tmp = mkdtempSync(join(tmpBase, "itv-learning-browser-"));
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
  await Promise.race([new Promise<void>((closed) => server.close(() => closed())), sleep(5000)]);
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

type LessonMode = "fundamentals" | "answering";
type LessonLanguage = "vi" | "en";

/**
 * Plain text that must survive as text. If any renderer ever pipes lesson prose
 * through innerHTML, these characters turn into real elements.
 */
const ESCAPE_PROBE = "ESCAPE_PROBE <b>bold</b> A < B & C > D";

/** v3 lets the lesson choose its own ordered blocks, so each mode gets a different outline. */
const V3_HEADINGS: Record<LessonMode, Record<LessonLanguage, string[]>> = {
  fundamentals: {
    vi: ["Vì sao index làm truy vấn nhanh hơn", "Đi từ câu lệnh đến dòng dữ liệu", "Chọn chỉ mục hay quét bảng"],
    en: ["Why an index makes queries faster", "From query to matching rows", "Index or table scan"],
  },
  answering: {
    vi: ["Cách trả lời khi được hỏi về index", "Hiểu lầm thường gặp về index", "Cơ chế đứng sau câu trả lời đó"],
    en: ["How to answer a question about indexes", "A common misconception about indexes", "The mechanism behind that answer"],
  },
};

/** The hook opens a v3 lesson; it must never be mistaken for a block heading. */
const V3_HOOK: Record<LessonLanguage, string> = {
  vi: "Truy vấn của bạn chậm và bạn chưa biết bắt đầu từ đâu.",
  en: "Your query is slow and you do not know where to start.",
};

/**
 * Text that only one mode's blocks carry, so the browser can prove the two
 * modes really use different blocks (walkthrough/compare versus
 * answer/misconception) and not one shared outline.
 */
const V3_ONLY: Record<LessonMode, string[]> = {
  fundamentals: ["Dùng index", "Bảng đơn hàng có vài triệu dòng"],
  answering: ["Index luôn làm mọi truy vấn nhanh hơn nên cứ thêm vào mọi cột.", "Nếu truy vấn không dùng index thì sao?"],
};

/** One shared quiz so every lesson version is graded the same way in the browser. */
function quiz(translated: boolean) {
  return [
    {
      stem: translated ? "Chi phí của index là gì?" : "What does an index cost?",
      options: [
        { id: "A", text: "Fast reads" },
        { id: "B", text: "Slow writes" },
        { id: "C", text: "No cost" },
      ],
      correctOption: "B",
      explanation: "SECRET_FEEDBACK_ONE: writes update indexes.",
    },
    {
      stem: translated ? "Khi nào index ít hữu ích?" : "When is an index less useful?",
      options: [
        { id: "A", text: "Low cardinality" },
        { id: "B", text: "Selective key" },
        { id: "C", text: "Composite key" },
      ],
      correctOption: "A",
      explanation: "SECRET_FEEDBACK_TWO: low selectivity.",
    },
  ];
}

/** v1 keeps the original single-outline contract that older stored lessons still use. */
function legacyLesson(title: string, language: LessonLanguage) {
  const translated = language === "vi";
  return {
    version: 1, title,
    goal: translated ? "Hiểu cơ chế index và giới hạn sử dụng." : "Understand indexing and its limitations.",
    objectives: [translated ? "Giải thích đánh đổi giữa đọc và ghi dữ liệu." : "Explain the trade-off between reading and writing data."],
    explanation: translated ? "Index giúp truy vấn nhanh hơn." : "Indexes speed up reads.",
    example: "CREATE INDEX idx_user ON users(id);",
    sections: [{ heading: translated ? "Cơ bản" : "Basics", body: translated ? "Ghi dữ liệu tốn thêm chi phí." : "Writes require index maintenance." }],
    questions: quiz(translated),
  };
}

/** v2 keeps the fixed per-mode outline that shipped before flexible lessons. */
function v2Lesson(title: string, language: LessonLanguage, mode: LessonMode) {
  const translated = language === "vi";
  const common = {
    title,
    goal: translated ? "Hiểu cơ chế index và giới hạn sử dụng." : "Understand indexing and its limitations.",
    objectives: [translated ? "Giải thích đánh đổi giữa đọc và ghi dữ liệu." : "Explain the trade-off between reading and writing data."],
    questions: quiz(translated),
  };
  if (mode === "fundamentals") return {
    ...common, version: 2, mode,
    concepts: [
      { term: translated ? "Chỉ mục" : "Index", meaning: translated ? "Cấu trúc ánh xạ khóa tìm kiếm đến những dòng có giá trị tương ứng." : "An index maps a key to the rows containing the matching value." },
      { term: translated ? "Quét bảng" : "Table scan", meaning: translated ? "Đọc lần lượt các dòng để tìm dữ liệu khớp với điều kiện truy vấn." : "A scan reads each row to find those matching the search condition." },
    ],
    mechanism: translated ? "Chỉ mục thu hẹp số dòng cần đọc cho truy vấn chọn lọc; bộ lập kế hoạch vẫn có thể chọn quét bảng nếu chỉ mục không giúp ích." : "An index narrows the candidate rows for selective queries; the query planner can still choose a scan when an index would not help.",
    walkthrough: {
      situation: translated ? "Tìm đơn hàng của một khách hàng trong bảng lớn." : "Find orders placed by one customer in a large orders table.",
      input: translated ? "Bảng đơn hàng có cột customer_id và truy vấn lọc theo một khách hàng." : "An orders table has customer_id and the query filters on one customer_id.",
      steps: translated ? [
        { action: "Tra customer_id trong chỉ mục.", reason: "Chỉ mục chỉ ra dòng có thể khớp mà không cần đọc mọi đơn hàng." },
        { action: "Đọc các dòng đơn hàng ứng viên.", reason: "Thông tin đầy đủ của đơn hàng nằm trong các dòng của bảng." },
      ] : [
        { action: "Look up the customer_id in the index.", reason: "The index identifies candidate rows without inspecting every order." },
        { action: "Read those candidate order rows.", reason: "The complete order details are stored with the table rows." },
      ],
      result: translated ? "Với customer_id đủ chọn lọc, truy vấn có thể đọc ít dòng hơn quét toàn bảng." : "For a selective customer_id, the query can read fewer rows than a full scan.",
      why: translated ? "Chỉ mục thu hẹp phạm vi tìm kiếm, nhưng hiệu năng thực tế còn tùy dữ liệu và kế hoạch truy vấn." : "The index narrows the search, but actual performance depends on the data and plan.",
    },
  };
  return {
    ...common, version: 2, mode,
    interviewQuestion: translated ? "Khi nào bạn thêm chỉ mục cho orders.customer_id?" : "When would you add an index on orders.customer_id?",
    modelAnswer: translated ? "Tôi sẽ kiểm tra truy vấn chậm và kế hoạch thực thi trước. Nếu truy vấn lọc chọn lọc theo customer_id, tôi sẽ thử chỉ mục rồi đo thời gian trước và sau. Tôi cũng cân nhắc dung lượng và chi phí cập nhật chỉ mục khi ghi dữ liệu." : "I would inspect a slow query and its execution plan first. If it filters selectively by customer_id, I would test an index and measure latency before and after. I would also consider index storage and write overhead, because every order update can require index maintenance.",
    annotations: translated ? [
      { point: "Bắt đầu bằng kế hoạch truy vấn thực tế.", reason: "Chỉ mục chỉ hữu ích khi xử lý đúng nút thắt quan sát được." },
      { point: "Đo trước và sau khi thêm chỉ mục.", reason: "Phân bố dữ liệu và dạng truy vấn quyết định hiệu quả thực tế." },
    ] : [
      { point: "Start with the real query plan.", reason: "The index only helps when it addresses the observed bottleneck." },
      { point: "Measure before and after.", reason: "Data distribution and query shape determine the actual result." },
    ],
    tradeOff: translated ? { benefit: "Truy vấn chọn lọc có thể cần đọc ít dòng hơn.", cost: "Mỗi lần ghi phải duy trì chỉ mục và tốn thêm dung lượng.", when: "Dùng khi phép đo cho thấy lợi ích đọc vượt chi phí ghi." } : { benefit: "Selective reads can inspect fewer rows.", cost: "Writes maintain the index and consume storage.", when: "Use it when measured read benefits outweigh those costs." },
    followUps: translated ? [{ question: "Nếu truy vấn không dùng chỉ mục thì sao?", answer: "Tôi xem lại kế hoạch, độ chọn lọc và dạng truy vấn trước khi sửa chỉ mục." }] : [{ question: "What if the index is not used?", answer: "Check the plan, selectivity and query shape before considering another index." }],
  };
}

type V3Block =
  | { kind: "explain"; heading: string; body: string; why?: string }
  | { kind: "walkthrough"; heading: string; situation: string; input?: string; steps: { action: string; reason: string }[]; outcome: string; why: string }
  | { kind: "compare"; heading: string; options: { label: string; when: string; why: string }[]; takeaway: string }
  | { kind: "misconception"; heading: string; belief: string; correction: string; evidence?: string }
  | { kind: "answer"; heading: string; question: string; answer: string; notes: { point: string; reason: string }[]; followUps?: { question: string; answer: string }[] };

type V3Lesson = {
  version: 3; mode: LessonMode; title: string; goal: string; objectives: string[];
  hook: string; blocks: V3Block[]; questions: ReturnType<typeof quiz>;
};

/**
 * v3 is the shape newly generated lessons use: the model picks 1-5 ordered
 * blocks, the two modes deliberately end up with different outlines, and the
 * quiz stays a separate, always-last part of the lesson.
 */
function v3Lesson(title: string, language: LessonLanguage, mode: LessonMode): V3Lesson {
  const translated = language === "vi";
  const headings = V3_HEADINGS[mode][language];
  const shared = {
    version: 3 as const, mode, title,
    goal: translated ? "Biết khi nào index giúp truy vấn nhanh và khi nào nó làm chậm việc ghi dữ liệu." : "Know when an index speeds up a query and when it slows writes down.",
    objectives: [translated ? "Chọn giữa index và quét bảng dựa trên dữ liệu thật." : "Choose between an index and a table scan using real data."],
    hook: V3_HOOK[language],
    questions: quiz(translated),
  };
  if (mode === "fundamentals") {
    const blocks: V3Block[] = [
      {
        kind: "explain",
        heading: headings[0],
        body: translated
          ? `Index là một cấu trúc phụ lưu giá trị của cột cần lọc cùng vị trí của dòng chứa giá trị đó. Khi truy vấn có điều kiện trên một cột đã có index, cơ sở dữ liệu tìm trong cấu trúc này thay vì đọc lần lượt toàn bộ bảng, nên số dòng phải đọc giảm hẳn. ${ESCAPE_PROBE}`
          : `An index is a side structure that stores the values of the filtered column together with the rows that hold them. A query that filters on an indexed column looks there instead of reading every row, so far fewer rows are touched. ${ESCAPE_PROBE}`,
        why: translated
          ? "Giá trị trong index được sắp xếp nên tìm một khoảng giá trị chỉ mất vài lần so sánh thay vì đọc hết bảng."
          : "The stored values are sorted, so locating a range of keys costs a few comparisons instead of a full scan.",
      },
      {
        kind: "walkthrough",
        heading: headings[1],
        situation: translated
          ? "Bảng đơn hàng có vài triệu dòng và câu truy vấn cần lấy đơn của một khách hàng cụ thể."
          : "An orders table holds a few million rows and the query needs the orders of one customer.",
        input: translated
          ? "Cột customer_id đã có index và truy vấn lọc đúng một giá trị khách hàng."
          : "The customer_id column is indexed and the query filters on exactly one customer.",
        steps: translated ? [
          { action: "Tra customer_id trong index.", reason: "Index trỏ thẳng tới các dòng có khóa khớp nên không phải đọc mọi đơn hàng." },
          { action: "Đọc những dòng đơn hàng được trỏ tới.", reason: "Dữ liệu đầy đủ của đơn hàng nằm ở dòng của bảng, không nằm trong index." },
        ] : [
          { action: "Look up customer_id in the index.", reason: "The index points straight at the matching rows, so no order is read needlessly." },
          { action: "Read the order rows it points to.", reason: "The full order data lives in the table rows, not inside the index." },
        ],
        outcome: translated
          ? "Truy vấn chỉ đọc rất ít dòng thay vì quét toàn bộ bảng đơn hàng."
          : "The query reads a handful of rows instead of scanning the whole orders table.",
        why: translated
          ? "Với một khóa đủ chọn lọc, phạm vi ứng viên nhỏ nên chi phí đọc giảm rõ rệt."
          : "A selective key leaves very few candidate rows, so the read cost drops sharply.",
      },
      {
        kind: "compare",
        heading: headings[2],
        options: translated ? [
          { label: "Dùng index", when: "Truy vấn lọc theo cột đã có index và dữ liệu chọn lọc tốt.", why: "Chỉ vài dòng ứng viên được đọc nên truy vấn nhanh hơn hẳn." },
          { label: "Quét bảng", when: "Truy vấn cần phần lớn bảng hoặc cột lọc có giá trị lặp lại nhiều.", why: "Index không loại được dòng nào nên chỉ tốn thêm chi phí cập nhật." },
        ] : [
          { label: "Use the index", when: "The query filters on an indexed column and the data is selective.", why: "Only a few candidate rows are read, so the query gets much faster." },
          { label: "Scan the table", when: "The query needs most of the table or the filtered column repeats a lot.", why: "The index removes nothing and only adds write and storage cost." },
        ],
        takeaway: translated
          ? "Giữ index khi phép đo cho thấy đọc ít dòng hơn; nếu không, quét bảng vẫn rẻ và đơn giản hơn."
          : "Keep the index when the measurement shows fewer rows read; otherwise a plain scan is cheaper and simpler.",
      },
    ];
    return { ...shared, blocks };
  }
  const blocks: V3Block[] = [
    {
      kind: "answer",
      heading: headings[0],
      question: translated
        ? "Khi nào bạn thêm index cho một bảng lớn, và bạn đo điều gì?"
        : "When would you add an index to a large table, and what would you measure?",
      answer: translated
        ? "Tôi bắt đầu từ truy vấn chậm và kế hoạch thực thi của nó, rồi kiểm tra độ chọn lọc của cột đang lọc. Nếu truy vấn chỉ cần một phần nhỏ của bảng, tôi sẽ thử index trên cột đó rồi so sánh thời gian trước và sau bằng chính dữ liệu đó. Tôi cũng cân nhắc chi phí ghi, vì mọi lần thêm, sửa hay xóa một dòng đều phải cập nhật index và tốn thêm dung lượng. Tôi chỉ giữ lại index khi phép đo cho thấy lợi ích đọc lớn hơn chi phí ghi."
        : "I start from the slow query and its execution plan, then check how selective the filtered column is. If the query only needs a small part of the table, I try an index on that column and compare latency before and after on the same data. I also weigh the write cost, because every insert, update or delete has to maintain the index and takes extra storage. I keep the index only when the measurement shows the read win outweighs the write cost.",
      notes: translated ? [
        { point: "Bắt đầu từ kế hoạch truy vấn thật.", reason: "Chỉ khi nút thắt nằm ở nơi ta nhìn thấy thì việc thêm index mới đáng làm." },
        { point: "Đo trước và sau trên cùng dữ liệu.", reason: "Phân bố dữ liệu và dạng truy vấn quyết định kết quả, không phải giả định." },
      ] : [
        { point: "Start from the real query plan.", reason: "An index is only worth it when it addresses a bottleneck you can actually observe." },
        { point: "Measure before and after on the same data.", reason: "Data distribution and query shape decide the outcome, not assumption." },
      ],
      followUps: translated ? [{
        question: "Nếu truy vấn không dùng index thì sao?",
        answer: "Tôi xem lại kế hoạch, độ chọn lọc và dạng truy vấn trước khi đổi chiến lược, vì index thừa thường tốn chi phí ghi mà không đem lại lợi ích.",
      }] : [{
        question: "What if the query never picks up the index?",
        answer: "I revisit the plan, the selectivity and the query shape before changing strategy, because a redundant index costs write throughput and buys nothing.",
      }],
    },
    {
      kind: "misconception",
      heading: headings[1],
      belief: translated
        ? "Index luôn làm mọi truy vấn nhanh hơn nên cứ thêm vào mọi cột."
        : "An index always makes every query faster, so adding one to every column is free.",
      correction: translated
        ? `Index chỉ giúp khi truy vấn lọc theo đúng cột đó và dữ liệu đủ chọn lọc. Cột có giá trị lặp lại nhiều gần như không loại được dòng nào, và mọi lần ghi vẫn phải trả giá cập nhật. ${ESCAPE_PROBE}`
        : `An index only pays off when the query filters on that column and the data is selective enough. A column with many repeated values removes almost no rows, yet every write still pays for index maintenance. ${ESCAPE_PROBE}`,
      evidence: translated
        ? "Đo trên bảng thật cho thấy thời gian đọc giảm khi thêm index trên cột chọn lọc tốt, còn thời gian ghi tăng lên ở mọi cột có index."
        : "Measurements on a real table show read time dropping for a selective column, while write time rises for every indexed column.",
    },
    {
      kind: "explain",
      heading: headings[2],
      body: translated
        ? "Bộ lập kế hoạch chọn giữa index và quét bảng bằng cách ước lượng số dòng phải đọc và chi phí cập nhật khi ghi. Vì vậy câu trả lời tốt phải bắt đầu từ dữ liệu thật và phép đo thật, chứ không phải từ quy tắc sẵn có."
        : "The planner chooses between an index and a scan by estimating how many rows it must read and what writes will cost later. That is why a good answer starts from the real data and real measurements instead of a fixed rule.",
      why: translated
        ? "Kế hoạch truy vấn thay đổi theo dữ liệu, theo phiên bản và theo thời điểm, nên kết luận phải gắn với phép đo cụ thể."
        : "Plans change with the data, the version and the moment, so the conclusion must be tied to a specific measurement.",
    },
  ];
  return { ...shared, blocks };
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
  // The fixtures are the contract: a mock answer the server would reject would
  // only ever show "tạo lỗi" in the browser, so validate them up front.
  for (const mode of ["fundamentals", "answering"] as const) {
    for (const language of ["vi", "en"] as const) {
      check(parseLesson(JSON.stringify(v3Lesson(`Bài học ${mode}`, language, mode)), mode) !== null,
        `v3 ${mode}/${language} fixture matches the stored lesson contract`);
      check(parseLesson(JSON.stringify(v2Lesson(`Bài học ${mode}`, language, mode)), mode) !== null,
        `v2 ${mode}/${language} fixture still matches the stored lesson contract`);
    }
  }
  check(parseLesson(JSON.stringify(legacyLesson("Bài học cũ", "vi"))) !== null, "v1 fixture still matches the stored lesson contract");
  // Copy only source/config; never copy a live DB, .next, .env or build output.
  cpSync(root, appDir, { recursive: true, filter: (name) => {
    const relative = name.slice(root.length).replace(/^\//, "");
    const topLevel = relative.split("/")[0];
    return !relative || (!["node_modules", ".next", ".git", ".idea", ".claude", "data", "tsconfig.tsbuildinfo"].includes(topLevel) &&
      !topLevel.startsWith(".env") && !relative.startsWith(".learning-browser-"));
  } });
  symlinkSync(join(root, "node_modules"), join(appDir, "node_modules"), "dir");
  const mockPort = await freePort();
  const mockUrl = `http://127.0.0.1:${mockPort}/v1`;
  mock = createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") { res.writeHead(404).end(); return; }
    let request = "";
    for await (const chunk of req) request += chunk;
    const messages = JSON.parse(request).messages as { content?: string }[] | undefined;
    const prompt = (messages ?? []).map((message) => String(message?.content ?? "")).join("\n");
    const isVi = prompt.includes("Vietnamese");
    const mode: LessonMode = prompt.includes('"mode":"answering"') || prompt.includes("Mode: answering.") ? "answering" : "fundamentals";
    providerCalls++;
    // Newly generated lessons are flexible v3 blocks; the two modes answer with
    // different outlines so the browser can prove the order is honoured.
    const data = JSON.stringify(v3Lesson(isVi ? "Bài học tiếng Việt" : "English practice lesson", isVi ? "vi" : "en", mode));
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
  // Saved lessons are addressed by an opaque id, so the fixture uses real UUIDs.
  const lessonIds: Record<string, string> = {};
  for (const row of fixture) {
    lessonIds[row.id] = randomUUID();
    db.prepare(`INSERT INTO sessions (id,role,language,mode,planned_rounds,status,provider,model,base_url) VALUES (?,?,?,'strict',5,'completed','custom','local-model',?)`)
      .run(row.id, row.role, row.language, mockUrl);
    db.prepare(`INSERT INTO evaluations (session_id,report_json,overall_score,recommendation) VALUES (?,?,50,'Needs Improvement')`).run(row.id, raw);
    const label = row.readyKind === "improvement" ? report().improvements[0] : report().next_steps[0].title;
    const context = row.readyKind === "improvement" ? "" : "Inspect query plans\n1 week";
    db.prepare(`INSERT INTO learning_lessons (id,session_id,report_revision,source_kind,source_index,mode,source_label,source_context,status,lesson_json,provider,model,base_url)
      VALUES (?,?,?,?,?,?,?,?,'ready',?,'custom','local-model',?)`).run(
      lessonIds[row.id], row.id, revision, row.readyKind, 0, row.readyMode, label, context,
      // Old stored lessons keep their old version so the browser proves v2 still renders.
      JSON.stringify(v2Lesson(row.language === "vi" ? "Bài học tiếng Việt" : "English practice lesson", row.language, row.readyMode)), mockUrl,
    );
  }
  const legacyLessonId = randomUUID();
  db.prepare(`INSERT INTO learning_lessons (id,session_id,report_revision,source_kind,source_index,mode,source_label,status,lesson_json,provider,model,base_url)
    VALUES (?,'learning-browser-vi',?,'improvement',0,'fundamentals','Giải thích database indexes','ready',?,'custom','local-model',?)`)
    .run(legacyLessonId, createHash("sha256").update("historical-report-snapshot").digest("hex"),
      JSON.stringify(legacyLesson("Bài học cũ", "vi")), mockUrl);
  // A slot that failed keeps its reason code, so the page can explain itself
  // instead of showing a bare "tạo lỗi".
  db.prepare(`INSERT INTO learning_lessons (id,session_id,report_revision,source_kind,source_index,mode,source_label,source_context,status,lesson_json,failure_reason,provider,model,base_url)
    VALUES (?,?,?,?,?,?,?,?,'failed',NULL,?,'custom','local-model',?)`)
    .run(randomUUID(), "learning-browser-en", revision, "improvement", 0, "answering",
      report().improvements[0], "", "provider_error", mockUrl);
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
  /** Text positions reveal document order without depending on the renderer's markup. */
  const textPositions = (needles: string[]) => evaluate<number[]>(
    `(() => { const text = document.body.innerText; return ${JSON.stringify(needles)}.map((needle) => text.indexOf(needle)); })()`);
  /** True when the page shows at least one of these texts. */
  const showsAny = (texts: string[]) => evaluate<boolean>(
    `(() => { const text = document.body.innerText; return ${JSON.stringify(texts)}.some((needle) => text.includes(needle)); })()`);
  /** The blocks of a lesson must appear in the order the lesson itself declares. */
  const checkBlockOrder = async (headings: string[], label: string) => {
    const positions = await textPositions(headings);
    const ordered = positions.every((position) => position >= 0) &&
      positions.every((position, index) => index === 0 || position > positions[index - 1]);
    if (!ordered) console.error("Block positions:", positions, headings);
    check(ordered, `${label}: the ${headings.length} blocks render in the lesson's own order`);
  };
  /** The self-check quiz is the last thing in the lesson, whatever blocks precede it. */
  const checkQuizLast = async (headings: string[], label: string) => {
    const quizMarkers = ["Tự kiểm tra ngắn", "Bắt đầu tự kiểm tra", "Làm lại để ôn tập",
      "Chi phí của index là gì?", "What does an index cost?"];
    const blockPositions = await textPositions(headings);
    const quizPositions = await textPositions(quizMarkers);
    const found = quizPositions.filter((position) => position >= 0);
    const lastBlock = Math.max(...blockPositions);
    const ok = blockPositions.every((position) => position >= 0) && found.length > 0 && Math.min(...found) > lastBlock;
    if (!ok) console.error("Quiz positions:", blockPositions, quizPositions);
    check(ok, `${label}: the self-check quiz stays after the last content block`);
  };
  /** The outline offers a jump link to the self-check quiz, and it lands there. */
  const checkQuizJump = async (label: string) => {
    const link = await evaluate<{ href: string | null; target: boolean }>(
      `(() => { const el = document.querySelector('nav[aria-labelledby="lesson-outline-heading"] a[href="#quiz-heading"]');
        return { href: el?.getAttribute('href') ?? null, target: Boolean(document.getElementById('quiz-heading')) }; })()`);
    if (link.href !== "#quiz-heading" || !link.target) console.error("Quiz jump:", link);
    check(link.href === "#quiz-heading" && link.target, `${label}: the outline links to the self-check quiz`);
    await evaluate(`document.querySelector('nav[aria-labelledby="lesson-outline-heading"] a[href="#quiz-heading"]').click()`);
    const inView = await evaluate<boolean>(
      `(() => { const rect = document.getElementById('quiz-heading').getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight; })()`);
    check(inView, `${label}: the quiz jump link brings the self-check into view`);
  };
  /** AI prose is rendered as text: no element may be created from it. */
  const checkEscaped = async (label: string) => {
    const probe = await evaluate<{ marker: boolean; symbols: boolean; escaped: boolean; bold: number }>(
      `({ marker: document.body.innerText.includes('ESCAPE_PROBE'),
          symbols: document.body.innerText.includes('A < B & C > D'),
          escaped: document.body.innerHTML.includes('&lt;b&gt;bold&lt;/b&gt;'),
          bold: document.querySelectorAll('b').length })`);
    check(probe.marker && probe.symbols && probe.escaped && probe.bold === 0,
      `${label}: AI prose is escaped text, not parsed markup`);
  };
  /** Grades the two shared questions exactly like a learner would. */
  const answerQuiz = async () => {
    await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Bắt đầu tự kiểm tra'))).click()`);
    const submitDisabled = await evaluate<boolean>(`[...document.querySelectorAll('button')].find(e => e.textContent?.includes('Nộp ')).disabled`);
    check(submitDisabled, "quiz submit disabled until every question answered");
    await cdp!.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await cdp!.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const focused = await evaluate<string>("document.activeElement?.tagName ?? ''");
    check(["A", "BUTTON", "INPUT"].includes(focused), "keyboard Tab reaches interactive control");
    await evaluate(`document.querySelectorAll('fieldset')[0].querySelector('input[value="B"]').click()`);
    await evaluate(`document.querySelectorAll('fieldset')[1].querySelector('input[value="A"]').click()`);
    check(await evaluate<boolean>(`![...document.querySelectorAll('button')].find(e => e.textContent?.includes('Nộp ')).disabled`), "quiz accepts keyboard-accessible radio answers");
    check(!await evaluate<boolean>("document.body.innerText.includes('SECRET_FEEDBACK')"), "no explanation before submit after choosing answers");
    await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Nộp '))).click()`);
    await awaitText("SECRET_FEEDBACK_ONE");
    await awaitText("Đúng 2/2");
  };
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
        check(Number(providerCalls) === callsBefore, "navigation did not call provider");
        const readyMode = row.readyKind === kind ? row.readyMode : undefined;
        if (readyMode === "answering") await click('[role=group][aria-label="Cách học"] button:nth-child(2)');
        if (readyMode) {
          await awaitText(row.language === "vi" ? "Bài học tiếng Việt" : "English practice lesson");
          await awaitText(readyMode === "fundamentals" ? "Demo từng bước" : "Câu trả lời mẫu");
          await awaitText(readyMode === "fundamentals" ? "Vì sao có kết quả này" : "Câu hỏi đào sâu");
          await awaitText("Bắt đầu tự kiểm tra");
          check(!await evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(V3_HOOK[row.language])})`),
            `${row.language}/${kind} stored v2 lesson keeps its own outline instead of flexible blocks`);
          check(!await evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(V3_HEADINGS[readyMode][row.language][0])})`),
            `${row.language}/${kind} stored v2 lesson does not render v3 block headings`);
          const secretBefore = await evaluate<boolean>("document.body.innerText.includes('SECRET_FEEDBACK') || document.documentElement.outerHTML.includes('SECRET_FEEDBACK')");
          check(!secretBefore, "answer key and explanations absent before quiz submission (DOM)");
          const detail = await (await fetch(`${origin}/api/learning/${lessonIds[row.id]}`)).text();
          check(!detail.includes("correctOption") && !detail.includes("SECRET_FEEDBACK"), "lesson GET excludes private answers and explanations");
          if (width === 1280 && kind === "improvement") {
            await click('button[aria-pressed="false"]');
            await awaitText("Bài học chưa được khởi tạo");
            await click('button[aria-pressed="false"]');
            await awaitText(row.language === "vi" ? "Bài học tiếng Việt" : "English practice lesson");
            check(Number(providerCalls) === callsBefore, "mode switching and reading saved lessons do not call provider");
          }
          if (width === 375 && kind === row.readyKind) {
            await answerQuiz();
            check(Number(providerCalls) === callsBefore, "quiz submission does not call provider");
            await cdp.navigate(`${origin}${path}`);
            if (readyMode === "answering") await click('[role=group][aria-label="Cách học"] button:nth-child(2)');
            await awaitText("Đúng 2/2");
            check(await evaluate<boolean>("document.body.innerText.includes('Lịch sử tự kiểm tra')"), "quiz results persist on reload");
          }
        } else {
          await awaitText("Bài học chưa được khởi tạo");
          check(Number(providerCalls) === callsBefore, "uncreated topic does not generate automatically");
        }
        // The practice link carries only an opaque lesson id: no role, no topic
        // and no report prose may ever reach the URL.
        const href = await evaluate<string>(`[...document.querySelectorAll('a')].find(e => e.textContent?.includes('Luyện lại chủ đề này'))?.getAttribute('href') ?? ''`);
        const prefill = new URL(href, origin);
        const topic = row.readyKind === "improvement" ? report().improvements[0] : report().next_steps[0].title;
        if (readyMode) {
          check(prefill.pathname === "/new" && prefill.searchParams.getAll("lesson").length === 1 &&
            [...prefill.searchParams.keys()].every((key) => key === "lesson") &&
            !href.includes("role") && !href.includes("focus") && !href.includes("description"),
            `${row.language}/${kind} /new prefill carries only the opaque lesson id, never report prose`);
          if (width === 375 && kind === row.readyKind) {
            await cdp.navigate(`${origin}${href}`);
            await until(() => evaluate<boolean>(`document.querySelector('input[placeholder^="Nhập tên vị trí"]')?.value === ${JSON.stringify(row.role)}`), "/new role prefilled");
            check(await evaluate<boolean>(`document.querySelector('input[placeholder^="Nhập tên vị trí"]')?.value === ${JSON.stringify(row.role)}`), "/new role prefilled as editable input");
            const slot = `document.querySelector('input[aria-label="Chủ đề từ bài học"]')`;
            await until(() => evaluate<boolean>(`${slot}?.value === ${JSON.stringify(topic)}`), "/new topic from the saved lesson");
            check(await evaluate<boolean>(`${slot}?.value === ${JSON.stringify(topic)}`), "/new shows the saved lesson topic in an editable focus slot");
            check(await evaluate<boolean>(`!!${slot} && !${slot}.readOnly && !${slot}.disabled`), "/new lesson focus is editable, not read-only");
            check(await evaluate<boolean>(`document.body.innerText.includes("1 / 3 chủ đề")`), "/new counts the lesson topic as one of three slots");
            // Editing the topic is a real edit: the page state must follow.
            const edited = "Redis connection pool";
            await evaluate(`(() => {
              const input = document.querySelector('input[aria-label="Chủ đề từ bài học"]');
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              setter.call(input, ${JSON.stringify(edited)});
              input.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            })()`);
            await until(() => evaluate<boolean>(`[...document.querySelectorAll('button')].some(e => e.textContent?.includes('Khôi phục'))`), "/new marks the edited lesson topic as changed");
            check(await evaluate<boolean>(`${slot}?.value === ${JSON.stringify(edited)}`), "/new keeps the edited lesson topic");
            // "Khôi phục" puts the saved topic back.
            await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Khôi phục'))).click()`);
            await until(() => evaluate<boolean>(`${slot}?.value === ${JSON.stringify(topic)}`), "/new lesson topic restored");
            check(!(await evaluate<boolean>(`[...document.querySelectorAll('button')].some(e => e.textContent?.includes('Khôi phục'))`)),
              "/new hides the restore button once the saved topic is back");
            // Unpinning the lesson topic frees its slot for three extra topics.
            await click('button[aria-label="Bỏ chủ đề từ bài học"]');
            await until(() => evaluate<boolean>(`${slot}?.value === ""`), "/new lesson topic unpinned");
            check(await evaluate<boolean>(`document.body.innerText.includes("0 / 3 chủ đề")`),
              "/new frees the slot after the lesson topic is dropped");
            check(await evaluate<boolean>(`document.body.innerText.includes("tối đa 3 chủ đề khác")`),
              "/new allows three extra topics once the lesson topic is dropped");
            await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Khôi phục'))).click()`);
            await until(() => evaluate<boolean>(`${slot}?.value === ${JSON.stringify(topic)}`), "/new lesson topic restored after unpinning");
            check(await evaluate<boolean>(`document.body.innerText.includes("1 / 3 chủ đề")`),
              "/new counts the restored lesson topic again");
            check(await evaluate<boolean>(`[...document.querySelectorAll('button')].find(e => e.textContent?.includes(${JSON.stringify(row.language === "vi" ? "Tiếng Việt" : "English")}))?.style.boxShadow.includes('2px') ?? false`), "/new language prefilled");
          }
        } else {
          check(href === "", `${row.language}/${kind} offers no practice link before a lesson exists`);
        }
      }
    }
  }
  // Explicit generation is the sole place a provider call is permitted. The
  // custom endpoint is this in-process SSE stub, never a remote paid provider.
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 850, deviceScaleFactor: 1, mobile: false });
  // A failed slot must explain itself: the reader sees why it failed, not just
  // that it failed, and reading it costs nothing.
  await cdp.navigate(`${origin}/learn/learning-browser-en?kind=improvement&index=0`);
  await awaitText("Bài học chưa được khởi tạo");
  await click('[role=group][aria-label="Cách học"] button:nth-child(2)');
  await awaitText("Tạo bài chưa thành công");
  await awaitText("Lý do: provider báo lỗi khi sinh bài");
  check(await evaluate<boolean>(`[...document.querySelectorAll('button')].some(e => e.textContent?.includes('Thử lại'))`),
    "a failed lesson offers an explicit retry");
  check(Number(providerCalls) === 0, "reading a failed slot does not call the provider");
  await cdp.navigate(`${origin}/learn/learning-browser-vi?kind=next_step&index=0`);
  await awaitText("Bài học chưa được khởi tạo");
  check(Number(providerCalls) === 0, "all prior browser reads stayed provider-free");
  await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Tạo bài học: Chưa biết'))).click()`);
  await awaitText("Bài học tiếng Việt");
  await awaitText(V3_HEADINGS.fundamentals.vi[0]);
  check(Number(providerCalls) === 1, "explicit create calls only the local mock provider once");
  await checkBlockOrder(V3_HEADINGS.fundamentals.vi, "generated fundamentals lesson");
  await checkQuizLast(V3_HEADINGS.fundamentals.vi, "generated fundamentals lesson");
  await checkQuizJump("generated fundamentals lesson");
  await checkEscaped("generated fundamentals lesson");
  check(!await showsAny(V3_ONLY.answering), "the fundamentals lesson carries none of the answering blocks");
  await answerQuiz();
  check(Number(providerCalls) === 1, "grading a flexible lesson quiz does not call the provider");
  await cdp.navigate(`${origin}/learn/learning-browser-vi?kind=next_step&index=0`);
  await awaitText("Bài học tiếng Việt");
  await awaitText(V3_HEADINGS.fundamentals.vi[0]);
  check(Number(providerCalls) === 1, "reopening generated lesson never regenerates or charges");
  await click('[role=group][aria-label="Cách học"] button:nth-child(2)');
  await awaitText("Bài học chưa được khởi tạo");
  check(Number(providerCalls) === 1, "switching to the other mode does not call the provider");
  await evaluate(`([...document.querySelectorAll('button')].find(e => e.textContent?.includes('Tạo bài học: Luyện diễn đạt'))).click()`);
  await awaitText(V3_HEADINGS.answering.vi[0]);
  check(Number(providerCalls) === 2, "explicit answering create calls only the local mock provider once");
  await checkBlockOrder(V3_HEADINGS.answering.vi, "generated answering lesson");
  await checkQuizLast(V3_HEADINGS.answering.vi, "generated answering lesson");
  await checkQuizJump("generated answering lesson");
  await checkEscaped("generated answering lesson");
  check(!await showsAny(V3_HEADINGS.fundamentals.vi),
    "switching modes swaps the block outline instead of merging both lessons");
  check(!await showsAny(V3_ONLY.fundamentals), "the answering lesson carries none of the fundamentals blocks");
  await cdp.navigate(`${origin}/learn/learning-browser-vi?kind=next_step&index=0`);
  await awaitText("Bài học tiếng Việt");
  await until(() => evaluate<boolean>("document.querySelectorAll('[role=group][aria-label=\"Cách học\"] button').length === 2"), "mode picker after reopening both lessons");
  await click('[role=group][aria-label="Cách học"] button:nth-child(2)');
  await awaitText(V3_HEADINGS.answering.vi[0]);
  await checkBlockOrder(V3_HEADINGS.answering.vi, "reopened answering lesson");
  check(Number(providerCalls) === 2, "reopening both generated modes remains provider-free");
  const legacyId = legacyLessonId;
  await cdp.navigate(`${origin}/learn/learning-browser-vi?kind=improvement&index=0&lesson=${legacyId}`);
  await awaitText("Bài học cũ");
  await awaitText("CREATE INDEX idx_user");
  check(Number(providerCalls) === 2, "opening a stored v1 lesson remains provider-free");
  check(!await evaluate<boolean>(`[...document.querySelectorAll('button')].some(e => e.textContent?.includes('Nộp '))`),
    "a stored v1 lesson stays read-only and cannot submit a new quiz");
  await layout(375);
  check(errors === 0, `no uncaught browser runtime exceptions (${errors})`);
  console.log(`Browser verification complete: 2 widths, 2 languages, 2 source kinds, 2 independent modes; flexible v3 blocks with v1/v2 compatibility; ${providerCalls} local mock calls.`);
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
