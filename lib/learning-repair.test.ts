/**
 * The repair layer is what stands between a paid provider call and a saved
 * lesson. These tests pin the sloppy answers it has to survive — fences, a
 * wrong version, `sections` instead of `blocks`, an unknown kind, options as
 * plain strings, a missing hook, an answer cut off by the token limit, a
 * missing quiz, prose with no JSON at all — and the two things it must never
 * do: invent a claim, or lose the answer key.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJson, repairLessonOutput } from "./learning-repair";

interface RepairedBlock {
  kind: string;
  heading: string;
  [key: string]: unknown;
}

interface RepairedLesson {
  version: number;
  mode: string;
  title: string;
  goal: string;
  objectives: string[];
  hook: string;
  blocks: RepairedBlock[];
  questions: {
    stem: string;
    options: { id: string; text: string }[];
    correctOption: string;
    explanation: string;
  }[];
}

function repaired(raw: unknown, mode: "fundamentals" | "answering" = "fundamentals", language: "vi" | "en" = "vi") {
  const outcome = repairLessonOutput(raw, mode, language);
  assert.equal(outcome.ok, true, `expected a repairable lesson, issues: ${outcome.issues.join(", ")}`);
  return { outcome, lesson: outcome.payload as RepairedLesson };
}

/** A complete v3 lesson, as the prompt asks for it. */
function clean(): Record<string, unknown> {
  return {
    version: 3,
    mode: "fundamentals",
    title: "Vì sao có chỉ mục mà truy vấn vẫn chậm",
    goal: "Biết đoán vì sao một truy vấn chậm và kiểm chứng bằng kế hoạch thực thi.",
    objectives: ["Dự đoán được lý do một truy vấn vẫn chậm sau khi đã thêm chỉ mục."],
    hook: "Bạn đã thêm chỉ mục cho cột khách hàng, câu truy vấn vẫn chậm y như trước.",
    blocks: [
      {
        kind: "explain",
        heading: "Chỉ mục chỉ giúp khi truy vấn dùng được nó",
        body: "Một \"chỉ mục\" lưu các giá trị khóa đã sắp xếp cùng vị trí của dòng, nên engine nhảy tới vùng dữ liệu cần đọc thay vì lần lượt xét từng dòng. Khi điều kiện lọc khớp phần lớn các dòng, engine vẫn phải đọc gần hết bảng và chỉ tốn thêm công để bảo trì chỉ mục.",
        why: "Lợi ích đến từ việc bỏ qua các dòng không liên quan, nên nó phụ thuộc vào \"độ chọn lọc\" của điều kiện lọc.",
      },
      {
        kind: "walkthrough",
        heading: "Một truy vấn lọc theo trạng thái đơn hàng",
        situation: "Báo cáo cần đếm đơn hàng theo trạng thái trong bảng có một triệu dòng dữ liệu.",
        input: "Bảng đơn hàng có cột trạng thái với vài giá trị lặp lại rất nhiều lần.",
        steps: [
          { action: "Tra cột trạng thái trong chỉ mục được dựng trên cùng cột đó.", reason: "Chỉ mục sắp xếp khóa theo thứ tự nên engine tìm được vùng chứa các dòng cần đọc." },
          { action: "Đọc những dòng mà chỉ mục trỏ tới.", reason: "Chỉ mục chỉ lưu khóa và vị trí dòng, dữ liệu đơn hàng vẫn nằm trong bảng gốc." },
        ],
        outcome: "Engine đọc gần như toàn bảng vì phần lớn các dòng đều có trạng thái cần đếm.",
        why: "Một chỉ mục chỉ đáng dùng khi \"kế hoạch thực thi\" cho thấy điều kiện lọc loại được phần lớn dữ liệu.",
      },
    ],
    questions: [
      {
        stem: "Chỉ mục giúp gì khi truy vấn lọc theo cột trạng thái?",
        options: [{ id: "A", text: "Đọc ít dòng hơn" }, { id: "B", text: "Ghi nhanh hơn" }, { id: "C", text: "Ít dung lượng hơn" }],
        correctOption: "A",
        explanation: "Chỉ mục giúp bỏ qua các dòng không khớp với điều kiện lọc.",
      },
      {
        stem: "Khi nào một chỉ mục là lãng phí?",
        options: [{ id: "A", text: "Khi bảng ghi nhiều hơn đọc" }, { id: "B", text: "Khi truy vấn lọc chọn lọc" }, { id: "C", text: "Khi có kế hoạch thực thi" }],
        correctOption: "A",
        explanation: "Chi phí ghi thêm không được bù lại khi số lần đọc rất ít.",
      },
    ],
  };
}

test("a complete v3 answer is kept exactly as it is", () => {
  const { outcome, lesson } = repaired(JSON.stringify(clean()));
  assert.deepEqual(outcome.notes, [], "nothing had to be changed");
  assert.equal(lesson.version, 3);
  assert.equal(lesson.mode, "fundamentals");
  assert.deepEqual(lesson.blocks.map((block) => block.kind), ["explain", "walkthrough"]);
  assert.equal(lesson.questions.length, 2);
  assert.equal(lesson.questions[0].correctOption, "A");
});

test("a fenced answer, and prose around the object, are unwrapped", () => {
  const fenced = "Đây là bài học của bạn:\n```json\n" + JSON.stringify(clean()) + "\n```\nChúc bạn học tốt.";
  const { outcome, lesson } = repaired(fenced);
  assert.deepEqual(outcome.notes, []);
  assert.equal(lesson.blocks.length, 2);
});

test("a wrong version, sections instead of blocks and a missing hook are repaired", () => {
  const source = clean();
  const payload = {
    version: "3",
    mode: "fundamentals",
    title: source.title,
    goal: source.goal,
    objectives: source.objectives,
    sections: source.blocks,
  };
  const { outcome, lesson } = repaired(JSON.stringify(payload));
  assert.equal(outcome.ok, true);
  assert.deepEqual(lesson.blocks.map((block) => block.kind), ["explain", "walkthrough"]);
  assert.ok(lesson.hook.length >= 12, "a hook is always there");
  assert.equal(lesson.version, 3, "the stored lesson is always the current contract");
});

test("an unknown block kind becomes an explanation and string options become choices", () => {
  const payload = {
    title: "Chọn khi nào nên dùng chỉ mục",
    goal: "Phân biệt lúc nào một chỉ mục đáng thêm vào bảng.",
    objectives: ["Nêu được điều kiện để thêm chỉ mục."],
    hook: "Bạn đang cân nhắc thêm một chỉ mục vào bảng đơn hàng.",
    blocks: [
      {
        kind: "diagram",
        heading: "Sơ đồ",
        body: "Bảng đơn hàng nối với chỉ mục trên cột khách hàng, mỗi mục chỉ mục trỏ về một vị trí dòng cụ thể trong bảng gốc. Khi truy vấn lọc theo khách hàng, engine đọc mục chỉ mục tương ứng rồi mở đúng những dòng cần thiết, thay vì đọc lần lượt toàn bộ bảng.",
      },
      {
        kind: "compare",
        heading: "Bảng đọc nhiều hay bảng ghi nhiều",
        options: ["Bảng đọc nhiều", "Bảng ghi nhiều", "Bảng vừa đọc vừa ghi"],
        takeaway: "Đếm số lần đọc và số lần ghi trước khi thêm chỉ mục, tỉ lệ đó quyết định việc thêm có đáng hay không. Mỗi lần ghi phải cập nhật chỉ mục, nên một bảng ghi nhiều sẽ trả giá cho mọi lần ghi mà không được lợi ích đọc tương ứng.",
      },
    ],
  };
  const { lesson } = repaired(JSON.stringify(payload));
  assert.deepEqual(lesson.blocks.map((block) => block.kind), ["explain", "compare"]);
  const options = lesson.blocks[1].options as { label: string; when?: string; why?: string }[];
  assert.equal(options.length, 3);
  assert.equal(options[0].label, "Bảng đọc nhiều");
  // The quiz options are always the three letters, in order.
  assert.deepEqual(lesson.questions[0].options.map((option) => option.id), ["A", "B", "C"]);
});

test("an answer that was cut off by the token limit is closed and saved", () => {
  const full = JSON.stringify(clean());
  const cut = full.slice(0, full.indexOf('"questions"'));
  const { outcome, lesson } = repaired(cut);
  assert.ok(outcome.notes.includes("closed-a-cut-off-JSON-object"), `notes: ${outcome.notes.join(", ")}`);
  assert.equal(lesson.blocks.length, 2, "the teaching content that arrived is kept");
  assert.ok(lesson.questions.length >= 2, "the missing self-check is rebuilt");
});

test("a missing quiz is rebuilt from the lesson's own words, with the right key", () => {
  const payload = clean();
  delete payload.questions;
  const { outcome, lesson } = repaired(JSON.stringify(payload));
  assert.ok(outcome.notes.includes("built-the-self-check-from-the-lesson"));
  assert.equal(lesson.questions.length, 2);
  const terms = ["chỉ mục", "độ chọn lọc", "kế hoạch thực thi"];
  for (const question of lesson.questions) {
    assert.match(question.stem, /____/, "the question blanks a word of the lesson");
    const correct = question.options.find((option) => option.id === question.correctOption);
    assert.ok(correct, "every question keeps an answer key");
    assert.ok(terms.includes(correct.text), `the key must be a word of the lesson: ${correct.text}`);
    assert.ok(question.explanation.length > 0);
    assert.deepEqual(question.options.map((option) => option.id), ["A", "B", "C"]);
  }
  // The key rotates so the learner cannot guess one letter every time.
  const keys = lesson.questions.map((question) => question.correctOption);
  assert.notDeepEqual(keys, ["A", "A"]);
});

test("the slot's mode decides what the lesson has to contain", () => {
  const { lesson } = repaired(JSON.stringify(clean()), "answering");
  assert.equal(lesson.mode, "answering", "the slot mode wins over the model's own mode");
  assert.ok(lesson.blocks.some((block) => block.kind === "answer"), "an answering lesson needs a speakable answer");

  const answering = clean();
  answering.mode = "answering";
  const { lesson: asFundamentals } = repaired(JSON.stringify(answering), "fundamentals");
  assert.equal(asFundamentals.mode, "fundamentals");
  assert.ok(asFundamentals.blocks.some((block) => ["walkthrough", "compare", "answer"].includes(block.kind)));
});

test("a first-generation payload is rebuilt as v3 blocks", () => {
  const payload = {
    schema_version: "v1",
    title: "Chỉ mục cơ sở dữ liệu",
    goal: "Hiểu chỉ mục giúp tìm dữ liệu nhanh hơn thế nào.",
    explanation: "Chỉ mục là một cấu trúc dữ liệu phụ lưu các giá trị khóa cùng vị trí của dòng, giúp engine không phải đọc toàn bộ bảng mỗi khi tìm một bản ghi.",
    example: "Khi báo cáo cần đếm đơn hàng của một khách hàng, truy vấn lọc theo customer_id nên chỉ đọc các dòng khớp thay vì quét cả bảng.",
    takeaways: ["Chỉ mục giúp đọc ít dòng hơn khi điều kiện lọc chọn lọc."],
    questions: clean().questions,
  };
  const { outcome, lesson } = repaired(JSON.stringify(payload));
  assert.ok(outcome.notes.includes("rebuilt-from-an-older-lesson-shape"));
  assert.equal(lesson.version, 3);
  assert.ok(lesson.blocks.length >= 1);
  assert.equal(lesson.questions.length, 2);
});

test("teaching prose without any JSON still becomes a lesson", () => {
  const prose = [
    "Một chỉ mục lưu các giá trị khóa đã sắp xếp cùng vị trí của dòng, nên engine nhảy tới vùng dữ liệu cần đọc thay vì lần lượt xét từng dòng.",
    "Khi điều kiện lọc khớp phần lớn các dòng, engine vẫn phải đọc gần hết bảng và chỉ tốn thêm công để bảo trì chỉ mục.",
    "Báo cáo đếm đơn hàng theo trạng thái trên bảng có một triệu dòng sẽ đọc gần hết bảng dù đã có chỉ mục trên cột trạng thái.",
  ].join("\n\n");
  const { outcome, lesson } = repaired(prose);
  assert.ok(outcome.notes.includes("built-the-lesson-from-the-prose-the-model-wrote"));
  assert.ok(lesson.blocks.length >= 1);
  assert.ok(lesson.blocks.some((block) => ["walkthrough", "compare", "answer"].includes(block.kind)));
  assert.equal(lesson.questions.length, 2);
});

test("a lesson wrapped in one more object is unwrapped", () => {
  const wrapped = { lesson: clean() };
  const { outcome, lesson } = repaired(JSON.stringify(wrapped));
  assert.ok(outcome.notes.includes("unwrapped-the-lesson-from-its-envelope"));
  assert.equal(lesson.blocks.length, 2);
  assert.equal(lesson.questions.length, 2);

  const listed = { lessons: [clean()] };
  const { lesson: fromList } = repaired(JSON.stringify(listed));
  assert.equal(fromList.blocks.length, 2);
});

test("teaching text written as a list of paragraphs is kept whole", () => {
  const payload = clean();
  const blocks = payload.blocks as Record<string, unknown>[];
  blocks[0] = {
    kind: "explain",
    heading: "Chỉ mục chỉ giúp khi truy vấn dùng được nó",
    body: [
      "Một chỉ mục lưu các giá trị khóa đã sắp xếp cùng vị trí của dòng, nên engine nhảy tới vùng dữ liệu cần đọc thay vì lần lượt xét từng dòng.",
      "Khi điều kiện lọc khớp phần lớn các dòng, engine vẫn phải đọc gần hết bảng và chỉ tốn thêm công để bảo trì chỉ mục.",
    ],
  };
  const { lesson } = repaired(JSON.stringify(payload));
  const body = String((lesson.blocks[0] as unknown as { body: string }).body);
  assert.ok(body.includes("vị trí của dòng"));
  assert.ok(body.includes("đọc gần hết bảng"), "both paragraphs survive");
});

test("nothing usable fails with a structural reason and keeps the model's words out of it", () => {
  const outcome = repairLessonOutput("Xin lỗi, tôi không thể tạo bài học lúc này.", "fundamentals");
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.issues, ["not-json"]);
  assert.ok(!JSON.stringify(outcome.notes).includes("Xin lỗi"));
  assert.ok(!JSON.stringify(outcome.issues).includes("Xin lỗi"));
});

test("extraction prefers a whole object over a salvaged fragment", () => {
  const whole = JSON.stringify(clean());
  const extracted = extractJson(`Trước khi bắt đầu: ${whole}\nHết bài.`);
  assert.ok(extracted);
  assert.equal(extracted.salvaged, false);
  assert.equal((extracted.value as { version: number }).version, 3);
});
