import assert from "node:assert/strict";
import { test } from "node:test";
import { AttemptInputSchema, LEGACY_LESSON_MAX_BYTES, LESSON_MAX_BYTES, LearningModeSchema, LegacyLessonSchema, parseLesson, publicLesson, SourceKindSchema, type Lesson } from "./learning-schema";
import { gradeAnswers } from "./learning-check";

function fixture(): Extract<Lesson, { version: 1 }> {
  return {
    version: 1,
    title: "Retry / Thử lại",
    goal: "Trình bày cơ chế retry",
    objectives: ["Hiểu idempotency"],
    explanation: "Thử lại khi tạm lỗi; kiểm chứng trước khi áp dụng.",
    example: "Một yêu cầu thanh toán thất bại và được gửi lại.",
    sections: [{ heading: "Cơ chế", body: "Dùng key cho một thao tác." }],
    questions: [
      { stem: "Điều gì tránh ghi đôi?", options: [{ id: "A", text: "Key" }, { id: "B", text: "Delay" }, { id: "C", text: "Timeout" }], correctOption: "A", explanation: "Key định danh thao tác." },
      { stem: "Khi nào retry?", options: [{ id: "A", text: "Luôn" }, { id: "B", text: "Tạm lỗi" }, { id: "C", text: "Không" }], correctOption: "B", explanation: "Phân loại lỗi trước." },
    ],
  };
}
const attemptId = "0f25fc8b-cb26-4d4a-9092-764d364b699f";

function fundamentals(): Extract<Lesson, { mode: "fundamentals" }> {
  return {
    version: 2, mode: "fundamentals", title: "Chỉ mục cơ sở dữ liệu",
    goal: "Hiểu vì sao chỉ mục giúp tìm bản ghi hiệu quả hơn.",
    objectives: ["Giải thích cách chỉ mục thay đổi một phép tìm kiếm."],
    concepts: [
      { term: "Chỉ mục", meaning: "Một cấu trúc lưu giá trị khóa để tra vị trí của các dòng nhanh hơn." },
      { term: "Quét bảng", meaning: "Đọc lần lượt từng dòng trong bảng cho đến khi tìm được dòng cần thiết." },
    ],
    mechanism: "Chỉ mục tổ chức khóa và tham chiếu để truy vấn tìm vùng dữ liệu cần đọc thay vì xét toàn bộ bảng.",
    walkthrough: {
      situation: "Tìm đơn hàng của một khách hàng trong bảng có nhiều dòng.",
      input: "Bảng đơn hàng có cột customer_id và truy vấn tìm một customer_id cụ thể.",
      steps: [
        { action: "Tra giá trị customer_id trong chỉ mục.", reason: "Chỉ mục chứa khóa để thu hẹp vị trí dòng cần tìm." },
        { action: "Đọc các dòng ở vị trí được chỉ mục trỏ tới.", reason: "Dữ liệu thực của đơn hàng nằm trong bảng gốc." },
      ],
      result: "Truy vấn xét ít dòng hơn so với quét toàn bộ bảng trong tình huống chọn lọc.",
      why: "Chỉ mục dẫn truy vấn đến nhóm dòng phù hợp, nhưng còn tùy phân bố dữ liệu và kế hoạch thực thi.",
    },
    questions: fixture().questions,
  };
}

function answering(): Extract<Lesson, { mode: "answering" }> {
  return {
    version: 2, mode: "answering", title: "Trình bày về chỉ mục",
    goal: "Trả lời có lý do thay vì chỉ nói chỉ mục luôn nhanh.",
    objectives: ["Nêu một trường hợp và giải thích đánh đổi khi thêm chỉ mục."],
    interviewQuestion: "Khi nào bạn thêm chỉ mục cho một bảng có nhiều đơn hàng?",
    modelAnswer: "Tôi sẽ bắt đầu từ truy vấn chậm và kế hoạch thực thi. Nếu truy vấn lọc trên customer_id chọn lọc, tôi cân nhắc chỉ mục trên cột đó, đo lại truy vấn trước và sau. Tôi cũng kiểm tra chi phí ghi thêm và dung lượng, vì mỗi lần ghi phải cập nhật chỉ mục.",
    annotations: [
      { point: "Bắt đầu từ kế hoạch thực thi và truy vấn cụ thể.", reason: "Tránh áp dụng một giải pháp khi chưa biết nút thắt nằm ở đâu." },
      { point: "Đo trước và sau khi thêm chỉ mục.", reason: "Hiệu quả phụ thuộc dữ liệu thực và kiểu truy vấn, không thể khẳng định chung." },
    ],
    tradeOff: {
      benefit: "Truy vấn lọc chọn lọc có thể cần đọc ít dòng hơn.",
      cost: "Ghi dữ liệu cần duy trì chỉ mục và chiếm thêm dung lượng.",
      when: "Phù hợp khi truy vấn đọc quan trọng và phép đo cho thấy lợi ích vượt chi phí.",
    },
    followUps: [{ question: "Nếu thêm chỉ mục mà truy vấn vẫn chậm thì sao?", answer: "Tôi kiểm tra kế hoạch thực thi, độ chọn lọc và liệu truy vấn có thực sự dùng chỉ mục hay không trước khi đổi chiến lược." }],
    questions: fixture().questions,
  };
}

test("strict lesson accepts two/three questions, no-code subjects, and vi/en text", () => {
  const lesson = fixture();
  assert.deepEqual(parseLesson(JSON.stringify(lesson)), lesson);
  assert.deepEqual(parseLesson(lesson), lesson);
  lesson.sections[0].body = "Explain safe retries and trade-offs in English.";
  lesson.questions.push({ stem: "What next?", options: [{ id: "A", text: "One" }, { id: "B", text: "Two" }, { id: "C", text: "Three" }], correctOption: "C", explanation: "Choose C." });
  assert.deepEqual(parseLesson(lesson), lesson);
  assert.equal(LegacyLessonSchema.safeParse(lesson).success, true);
  assert.deepEqual(LearningModeSchema.options, ["fundamentals", "answering"]);
  assert.deepEqual(SourceKindSchema.options, ["improvement", "next_step"]);
});

test("rejects empty, incomplete, truncated, oversized, and unknown fields", () => {
  assert.equal(parseLesson(""), null);
  assert.equal(parseLesson("{"), null);
  assert.equal(parseLesson("```json\n" + JSON.stringify(fixture()) + "\n```"), null);
  assert.equal(parseLesson(JSON.stringify(fixture()).slice(0, -4)), null);
  assert.equal(parseLesson({ ...fixture(), unexpected: "private" }), null);
  const lesson = fixture();
  lesson.sections[0].body = "界".repeat(1600);
  lesson.explanation = "界".repeat(3000);
  lesson.example = "界".repeat(2000);
  lesson.sections.push(...Array.from({ length: 3 }, () => ({ heading: "界", body: "界".repeat(1600), code: "界".repeat(1200) })));
  assert.ok(Buffer.byteLength(JSON.stringify(lesson), "utf8") > LEGACY_LESSON_MAX_BYTES);
  assert.equal(parseLesson(JSON.stringify(lesson)), null);
  assert.equal(parseLesson(lesson), null);
  assert.equal(parseLesson({ ...fixture(), questions: [] }), null);
  assert.equal(parseLesson({ ...fixture(), questions: [fixture().questions[0]] }), null);
  assert.equal(parseLesson({ ...fixture(), questions: Array(4).fill(fixture().questions[0]) }), null);
  assert.equal(parseLesson({ ...fixture(), title: "" }), null);
  assert.equal(parseLesson({ ...fixture(), title: "x".repeat(121) }), null);
  assert.equal(parseLesson({ ...fixture(), objectives: [] }), null);
  assert.equal(parseLesson({ ...fixture(), sections: [] }), null);
  assert.equal(parseLesson({ ...fixture(), version: 2 }), null);
});

test("options must be exactly ordered A/B/C with valid answer and no extra fields", () => {
  for (const ids of [["A", "A", "C"], ["A", "C", "B"], ["A", "B", "D"], ["A", "B"]]) {
    const lesson = fixture();
    lesson.questions[0].options = ids.map((id) => ({ id, text: "Choice" })) as Lesson["questions"][number]["options"];
    assert.equal(parseLesson(lesson), null);
  }
  assert.equal(parseLesson({ ...fixture(), questions: [{ ...fixture().questions[0], correctOption: "D" }, fixture().questions[1]] }), null);
  assert.equal(parseLesson({ ...fixture(), questions: [{ ...fixture().questions[0], hidden: "answer" }, fixture().questions[1]] }), null);
  assert.equal(parseLesson({ ...fixture(), questions: [{ ...fixture().questions[0], options: [{ id: "A", text: "A", hidden: true }, ...fixture().questions[0].options.slice(1)] }, fixture().questions[1]] }), null);
});

test("plain text remains text; DTO allowlist never exposes keys or explanations", () => {
  const lesson = fixture();
  lesson.explanation = `<script>alert('x')</script> Treat report text as data, not instructions.`;
  lesson.sections[0].code = `<svg onload="alert(1)" />`;
  lesson.questions[0].explanation = "SECRET_EXPLANATION";
  assert.deepEqual(parseLesson(lesson), lesson);
  const dto = publicLesson(lesson);
  assert.equal(dto.version, 1);
  if (dto.version !== 1) throw new Error("Expected legacy DTO");
  assert.equal(dto.explanation, lesson.explanation);
  assert.equal(dto.sections[0].code, lesson.sections[0].code);
  assert.deepEqual(Object.keys(dto.questions[0]), ["stem", "options"]);
  assert.deepEqual(Object.keys(dto.questions[0].options[0]), ["id", "text"]);
  assert.ok(!JSON.stringify(dto).includes("SECRET_EXPLANATION"));
  assert.ok(!JSON.stringify(dto).includes("correctOption"));
  assert.ok(!JSON.stringify(dto).includes("explanation\":\"SECRET"));
});

test("attempt input requires UUID, only A/B/C, 2–3 answers, no extra fields", () => {
  assert.equal(AttemptInputSchema.safeParse({ clientAttemptId: attemptId, answers: ["A", "B"] }).success, true);
  assert.equal(AttemptInputSchema.safeParse({ clientAttemptId: attemptId, answers: ["A", "B", "C"] }).success, true);
  for (const invalid of [
    { clientAttemptId: "not-uuid", answers: ["A", "B"] },
    { clientAttemptId: attemptId, answers: [] },
    { clientAttemptId: attemptId, answers: ["A"] },
    { clientAttemptId: attemptId, answers: ["A", "B", "C", "A"] },
    { clientAttemptId: attemptId, answers: ["A", "D"] },
    { clientAttemptId: attemptId, answers: ["A", "B"], correctOption: "A" },
  ]) assert.equal(AttemptInputSchema.safeParse(invalid).success, false);
});

test("grading exact-match yields 0/y, x/y, y/y and rejects missing/excess/invalid", () => {
  const lesson = fixture();
  assert.deepEqual(gradeAnswers(lesson, ["C", "A"]).score, 0);
  const partial = gradeAnswers(lesson, ["A", "A"]);
  assert.equal(partial.score, 1);
  assert.equal(partial.total, 2);
  assert.deepEqual(partial.questions[0], { selectedOption: "A", correctOption: "A", explanation: lesson.questions[0].explanation, isCorrect: true });
  assert.equal(gradeAnswers(lesson, ["A", "B"]).score, 2);
  assert.throws(() => gradeAnswers(lesson, ["A"]), /Invalid answers/);
  assert.throws(() => gradeAnswers(lesson, ["A", "B", "C"]), /Invalid answers/);
  assert.throws(() => gradeAnswers(lesson, ["A", "D" as "B"]), /Invalid answers/);
});

function flexibleFundamentals(): Extract<Lesson, { version: 3 }> {
  return {
    version: 3, mode: "fundamentals",
    title: "Vì sao có chỉ mục mà truy vấn vẫn chậm",
    goal: "Biết đoán vì sao một truy vấn chậm và kiểm chứng bằng kế hoạch thực thi.",
    objectives: ["Dự đoán được lý do một truy vấn vẫn chậm sau khi đã thêm chỉ mục."],
    hook: "Bạn đã thêm chỉ mục cho cột khách hàng, câu truy vấn vẫn chậm y như trước.",
    blocks: [
      {
        kind: "misconception",
        heading: "Có chỉ mục là luôn nhanh hơn",
        belief: "Có chỉ mục trên cột được lọc thì câu truy vấn chắc chắn nhanh hơn.",
        correction: "Chỉ mục chỉ giúp khi truy vấn có thể dùng nó và chỉ ra phần nhỏ dữ liệu. Nếu điều kiện lọc khớp phần lớn các dòng, engine vẫn phải đọc gần hết bảng, chỉ tốn thêm công để bảo trì chỉ mục.",
        evidence: "Một truy vấn lọc theo cột trạng thái chỉ có vài giá trị khác nhau sẽ khớp gần như toàn bộ bảng.",
      },
      {
        kind: "compare",
        heading: "Khi nào nên thêm chỉ mục",
        options: [
          { label: "Truy vấn đọc chạy thường xuyên", when: "Cột được lọc chọn lọc và truy vấn chạy nhiều lần.", why: "Chi phí ghi thêm được bù lại nhiều lần bởi lợi ích đọc." },
          { label: "Bảng ghi nhiều hơn đọc", when: "Cột có giá trị lặp lại nhiều như trạng thái hay loại.", why: "Chỉ mục phải được cập nhật mỗi lần ghi mà lợi ích đọc lại rất nhỏ." },
        ],
        takeaway: "Đo trước, thêm sau: quyết định dựa trên kế hoạch thực thi và số lần đọc so với số lần ghi.",
      },
    ],
    questions: fixture().questions,
  };
}

function flexibleAnswering(): Extract<Lesson, { version: 3 }> {
  return {
    version: 3, mode: "answering",
    title: "Trình bày quyết định về chỉ mục",
    goal: "Trả lời câu hỏi về chỉ mục bằng lập luận có thể kiểm chứng.",
    objectives: ["Nói rõ đánh đổi giữa tốc độ đọc và chi phí ghi."],
    hook: "Người phỏng vấn hỏi: bạn sẽ làm gì với câu truy vấn này chậm ba giây?",
    blocks: [
      {
        kind: "answer",
        heading: "Câu trả lời mẫu",
        question: "Bảng đơn hàng đang chậm khi lọc theo khách hàng, bạn xử lý thế nào?",
        answer: "Tôi sẽ xem kế hoạch thực thi để biết câu truy vấn đang quét bảng hay dùng chỉ mục. Nếu nó đang quét toàn bảng và cột khách hàng chọn lọc tốt, tôi sẽ thêm chỉ mục rồi đo lại trên dữ liệu thật, đồng thời cân nhắc chi phí ghi thêm và dung lượng. Nếu đo ra không đáng, tôi giữ nguyên và tìm nguyên nhân khác.",
        notes: [
          { point: "Bắt đầu từ kế hoạch thực thi.", reason: "Nó cho biết nút thắt là quét bảng hay phần khác." },
          { point: "Đo lại sau khi thay đổi.", reason: "Lợi ích phụ thuộc dữ liệu thật nên không thể khẳng định trước." },
        ],
        followUps: [
          { question: "Nếu thêm chỉ mục mà vẫn chậm?", answer: "Tôi kiểm tra lại kế hoạch thực thi, độ chọn lọc của điều kiện và xem chỉ mục có thực sự được dùng không." },
        ],
      },
    ],
    questions: fixture().questions,
  };
}

test("v3 keeps its own mode, quiz format and grading while older versions still parse", () => {
  for (const lesson of [flexibleFundamentals(), flexibleAnswering()]) {
    assert.deepEqual(parseLesson(JSON.stringify(lesson), lesson.mode), lesson);
    assert.deepEqual(parseLesson(lesson, lesson.mode), lesson);
    assert.equal(parseLesson(lesson, lesson.mode === "fundamentals" ? "answering" : "fundamentals"), null);
    assert.equal(gradeAnswers(lesson, ["A", "B"]).score, 2);
    const dto = publicLesson(lesson);
    assert.equal(dto.version, 3);
    assert.deepEqual(Object.keys(dto.questions[0]), ["stem", "options"]);
    assert.ok(!JSON.stringify(dto).includes("correctOption"));
    assert.ok(!JSON.stringify(dto).includes("Key định danh thao tác."));
  }
  assert.equal(parseLesson(fundamentals(), "fundamentals")?.version, 2, "v2 lessons keep working");
  assert.equal(parseLesson(fixture(), "answering")?.version, 1);
});

test("v3 block count, kinds and headings are flexible but bounded", () => {
  const lesson = flexibleFundamentals();
  assert.equal(parseLesson({ ...lesson, blocks: [] }), null);
  assert.equal(parseLesson({ ...lesson, blocks: Array(6).fill(lesson.blocks[0]) }), null);
  assert.equal(parseLesson({
    ...lesson,
    blocks: [lesson.blocks[0], { ...lesson.blocks[1], heading: lesson.blocks[0].heading }],
  }), null, "duplicate headings must be rejected");
  assert.equal(parseLesson({ ...lesson, blocks: [{ ...lesson.blocks[0], kind: "diagram" }] }), null);
  assert.equal(parseLesson({ ...lesson, extra: "secret" }), null);
  assert.equal(parseLesson({ ...lesson, hook: "short" }), null);
  assert.equal(parseLesson({ ...lesson, blocks: [{ kind: "explain", heading: "Tiêu đề", body: "Quá ngắn" }] }), null);
  assert.equal(parseLesson({ ...lesson, blocks: [{ kind: "explain", heading: "Tiêu đề", body: "Nội dung", unknown: 1 }] }), null);
  const one = {
    ...lesson,
    blocks: [{
      kind: "walkthrough", heading: "Cơ chế đọc chỉ mục",
      situation: "Một truy vấn lọc đơn hàng theo khách hàng chạy trên bảng đơn hàng có một triệu dòng dữ liệu cũ.",
      steps: [
        { action: "Tra giá trị khách hàng trong chỉ mục dựng trên cột đó.", reason: "Chỉ mục sắp xếp các khóa theo thứ tự nên engine nhảy tới đúng vùng cần đọc thay vì lần lượt xét từng dòng." },
        { action: "Đọc các dòng được chỉ mục trỏ tới.", reason: "Chỉ mục chỉ lưu khóa và vị trí dòng, phần dữ liệu đơn hàng vẫn nằm trong bảng gốc nên vẫn phải đọc dòng đó." },
      ],
      outcome: "Engine chỉ đọc các dòng khớp cùng một phần nhỏ của chỉ mục, thay vì đọc toàn bộ bảng.",
      why: "Lợi ích đến từ việc bỏ qua các dòng không liên quan, nên nó càng lớn khi khách hàng sở hữu càng ít đơn hàng.",
    }],
  };
  assert.ok(parseLesson(one), "one block is allowed when it carries the teaching");
});

test("v3 requires a concrete application for beginners and a speakable answer for practice", () => {
  const explainOnly = {
    ...flexibleFundamentals(),
    blocks: [{ kind: "explain", heading: "Cơ chế của chỉ mục", body: "x".repeat(700) }],
  };
  assert.equal(parseLesson(explainOnly), null, "a beginner lesson needs something concrete");
  const noAnswer = {
    ...flexibleAnswering(),
    blocks: [{ kind: "compare", heading: "Hai lựa chọn", options: [
      { label: "A", when: "Khi này thì chọn A nhé vì lý do này." },
      { label: "B", when: "Khi này thì chọn B nhé vì lý do này." },
    ], takeaway: "Quy tắc chọn giữa hai lựa chọn trên." }],
  };
  assert.equal(parseLesson(noAnswer), null, "an answering lesson needs a speakable answer");
  const thin = {
    ...flexibleFundamentals(),
    blocks: [{ kind: "walkthrough", heading: "Ví dụ", situation: "Một tình huống ngắn.", steps: [
      { action: "Làm một việc.", reason: "Vì lý do này mà làm." },
    ], outcome: "Kết quả ngắn.", why: "Lý do của kết quả." }],
  };
  assert.equal(parseLesson(thin), null, "a thin lesson is not a lesson");
});

test("v3 rejects oversized UTF-8 and keeps the public DTO free of answer keys", () => {
  const lesson = flexibleFundamentals();
  const inflated = {
    ...lesson,
    blocks: Array.from({ length: 5 }, () => ({
      kind: "answer",
      heading: "Câu trả lời mẫu",
      question: "Câu hỏi phỏng vấn về chỉ mục?",
      answer: "界".repeat(2400),
      notes: [{ point: "Điểm cần nhấn mạnh trong câu trả lời", reason: "Lý do của điểm đó được giải thích ở đây" }],
    })),
  };
  assert.ok(Buffer.byteLength(JSON.stringify(inflated), "utf8") > LESSON_MAX_BYTES);
  assert.equal(parseLesson(inflated), null);
  const dto = publicLesson(lesson);
  if (dto.version !== 3) throw new Error("Expected a v3 DTO");
  assert.ok(!JSON.stringify(dto).includes("explanation"));
  assert.deepEqual(Object.keys(dto.blocks[0]).sort(), ["belief", "correction", "evidence", "heading", "kind"]);
  assert.deepEqual(Object.keys(dto.blocks[1]).sort(), ["heading", "kind", "options", "takeaway"]);
});

test("v3 keeps the block order, count and language the lesson author chose", () => {
  const english: Extract<Lesson, { version: 3 }> = {
    version: 3, mode: "fundamentals",
    title: "Why an index can make a write slower",
    goal: "Reason about the write side of indexing before adding one.",
    objectives: ["Predict which operations an index makes slower."],
    hook: "The customer list got faster and the order form got slower. Same table, same index.",
    blocks: [
      {
        kind: "explain",
        heading: "What every write now has to do",
        body: "An index is a second copy of the key values, so every insert, update or delete has to write the row and the matching index entry. The write path does more work than it did before, which is the cost that a faster read is paying for.",
        why: "The cost is proportional to how many indexes the table carries, not to how useful they look on paper.",
      },
      {
        kind: "walkthrough",
        heading: "One insert, step by step",
        situation: "A checkout writes one new order row into a table that has two indexes.",
        input: "An insert on a table with an index on customer_id and another on created_at.",
        steps: [
          { action: "Write the row into the table.", reason: "The row itself always has to be stored." },
          { action: "Insert the customer_id key into the first index.", reason: "The index must contain the new key so later lookups stay complete." },
          { action: "Insert the created_at key into the second index.", reason: "Each index keeps its own sorted copy of the keys it covers." },
        ],
        outcome: "One insert now touches the table plus two index structures instead of the table alone.",
        why: "The extra work grows with the number of indexes, which is why unused ones are worth removing.",
      },
      {
        kind: "compare",
        heading: "Read-heavy or write-heavy",
        options: [
          { label: "Mostly reads", when: "Lookups dominate the workload and the predicate is selective.", why: "The read gain is paid back many times over." },
          { label: "Mostly writes", when: "Rows change constantly and lookups are rare.", why: "The write cost is paid on every change while the read gain barely appears." },
        ],
        takeaway: "Count the reads and the writes before adding an index; the ratio decides whether the trade is worth it.",
      },
    ],
    questions: fixture().questions,
  };
  const parsed = parseLesson(english, "fundamentals");
  assert.ok(parsed);
  if (parsed.version !== 3) throw new Error("Expected a v3 lesson");
  assert.deepEqual(parsed.blocks.map((block) => block.kind), ["explain", "walkthrough", "compare"]);
  assert.deepEqual(parsed.blocks.map((block) => block.heading), [
    "What every write now has to do", "One insert, step by step", "Read-heavy or write-heavy",
  ]);
  assert.equal(parseLesson(english, "answering"), null, "the mode of the slot still decides");
  const dto = publicLesson(english);
  if (dto.version !== 3) throw new Error("Expected a v3 DTO");
  assert.deepEqual(dto.blocks.map((block) => block.kind), ["explain", "walkthrough", "compare"]);
});

test("a first-generation stored lesson is readable again", () => {
  // The shape the app actually stored before the lesson contract changed.
  const stored = {
    schema_version: "v1",
    title: "Idempotency key và UNIQUE trong PostgreSQL",
    goal: "Hiểu cách xử lý yêu cầu gửi lặp mà không tạo ra tác dụng phụ hai lần.",
    explanation: "Idempotency key là mã do client gửi để nhận diện yêu cầu đó. UNIQUE constraint là quy tắc do PostgreSQL thực thi, không cho hai hàng đã commit có cùng giá trị ở cột được ràng buộc.",
    example: "API tạo đơn hàng nhận user_id=7 và key=abc. Bảng yêu cầu có UNIQUE(user_id, key) nên lần gọi lặp bị từ chối ngay ở lúc ghi.",
    takeaways: [
      "Kiểm tra trước bằng SELECT không đủ an toàn khi hai transaction chạy đồng thời.",
      "Chỉ UNIQUE constraint mới phân xử được lúc ghi.",
    ],
    questions: fixture().questions,
  };
  const lesson = parseLesson(JSON.stringify(stored), "fundamentals");
  assert.ok(lesson, "a lesson the app already stored must stay readable");
  assert.equal(lesson.version, 1);
  if (lesson.version !== 1) throw new Error("Expected a v1 lesson");
  assert.equal(lesson.title, stored.title);
  assert.deepEqual(lesson.objectives, stored.takeaways);
  assert.equal(lesson.sections.length, 2);
  assert.equal(lesson.sections[0].heading, "Điều cần nhớ 1");
  assert.equal(lesson.explanation, stored.explanation);
  const dto = publicLesson(lesson);
  assert.equal(dto.version, 1);
  assert.ok(!JSON.stringify(dto).includes("correctOption"));
  assert.ok(!JSON.stringify(dto).includes("Key định danh thao tác."));
});

test("mode-specific v2 lessons are strict, bounded and grade the existing quiz format", () => {
  for (const lesson of [fundamentals(), answering()]) {
    assert.deepEqual(parseLesson(JSON.stringify(lesson), lesson.mode), lesson);
    assert.equal(parseLesson(lesson, lesson.mode === "fundamentals" ? "answering" : "fundamentals"), null);
    assert.equal(gradeAnswers(lesson, ["A", "B"]).score, 2);
    const dto = publicLesson(lesson);
    assert.equal(dto.version, 2);
    assert.ok(!JSON.stringify(dto).includes("correctOption"));
    assert.ok(!JSON.stringify(dto).includes("Key định danh thao tác."));
    assert.deepEqual(Object.keys(dto.questions[0]), ["stem", "options"]);
  }
  assert.equal(parseLesson(fixture(), "answering")?.version, 1, "v1 has no embedded mode");
  assert.equal(parseLesson(fixture(), "fundamentals")?.version, 1);
});

test("v2 rejects missing teaching stages, shallow fields, unknown properties and oversized UTF-8", () => {
  const basic = fundamentals();
  const advanced = answering();
  assert.equal(parseLesson({ ...basic, concepts: basic.concepts.slice(0, 1) }), null);
  assert.equal(parseLesson({ ...basic, mechanism: "too short" }), null);
  assert.equal(parseLesson({ ...basic, walkthrough: { ...basic.walkthrough, steps: basic.walkthrough.steps.slice(0, 1) } }), null);
  assert.equal(parseLesson({ ...basic, walkthrough: { ...basic.walkthrough, result: "" } }), null);
  assert.equal(parseLesson({ ...basic, extra: "secret" }), null);
  assert.equal(parseLesson({ ...advanced, modelAnswer: "short" }), null);
  assert.equal(parseLesson({ ...advanced, annotations: [] }), null);
  assert.equal(parseLesson({ ...advanced, followUps: [] }), null);
  assert.equal(parseLesson({ ...advanced, tradeOff: { ...advanced.tradeOff, cost: "" } }), null);
  assert.equal(parseLesson({ ...advanced, mode: "fundamentals" }), null);
  const inflated = fundamentals();
  inflated.mechanism = "界".repeat(1800);
  inflated.walkthrough.situation = "界".repeat(500);
  inflated.walkthrough.input = "界".repeat(600);
  inflated.walkthrough.result = "界".repeat(600);
  inflated.walkthrough.why = "界".repeat(700);
  inflated.walkthrough.steps = Array.from({ length: 4 }, () => ({ action: "界".repeat(500), reason: "界".repeat(500) }));
  assert.ok(Buffer.byteLength(JSON.stringify(inflated), "utf8") > LESSON_MAX_BYTES);
  assert.equal(parseLesson(inflated), null);
  assert.equal(parseLesson(JSON.stringify(inflated)), null);
});
