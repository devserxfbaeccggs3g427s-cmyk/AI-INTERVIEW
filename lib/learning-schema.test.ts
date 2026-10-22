import assert from "node:assert/strict";
import { test } from "node:test";
import { AttemptInputSchema, LESSON_MAX_BYTES, LearningModeSchema, LessonSchema, parseLesson, publicLesson, SourceKindSchema, type Lesson } from "./learning-schema";
import { gradeAnswers } from "./learning-check";

function fixture(): Lesson {
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

test("strict lesson accepts two/three questions, no-code subjects, and vi/en text", () => {
  const lesson = fixture();
  assert.deepEqual(parseLesson(JSON.stringify(lesson)), lesson);
  assert.deepEqual(parseLesson(lesson), lesson);
  lesson.sections[0].body = "Explain safe retries and trade-offs in English.";
  lesson.questions.push({ stem: "What next?", options: [{ id: "A", text: "One" }, { id: "B", text: "Two" }, { id: "C", text: "Three" }], correctOption: "C", explanation: "Choose C." });
  assert.deepEqual(parseLesson(lesson), lesson);
  assert.equal(LessonSchema.safeParse(lesson).success, true);
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
  assert.ok(Buffer.byteLength(JSON.stringify(lesson), "utf8") > LESSON_MAX_BYTES);
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
