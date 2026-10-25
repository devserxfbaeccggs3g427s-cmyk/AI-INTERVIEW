import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_QUESTION_CHARS, parseInterviewQuestion } from "./interview-question";

test("accepts a greeting and a single Vietnamese interviewer question", () => {
  assert.deepEqual(parseInterviewQuestion("Chào bạn. Bạn sẽ thiết kế endpoint chống tạo đơn trùng thế nào?"), {
    ok: true, question: "Chào bạn. Bạn sẽ thiết kế endpoint chống tạo đơn trùng thế nào?",
  });
});

test("accepts a practical task without a question mark", () => {
  assert.deepEqual(parseInterviewQuestion("Thiết kế API đặt hàng an toàn khi client retry đồng thời."), {
    ok: true, question: "Thiết kế API đặt hàng an toàn khi client retry đồng thời.",
  });
  assert.deepEqual(parseInterviewQuestion("Design a rate limiter for a high-traffic API."), {
    ok: true, question: "Design a rate limiter for a high-traffic API.",
  });
  assert.deepEqual(parseInterviewQuestion("Hãy thiết kế cache invalidation? Bạn có thể code pseudo hoặc ngôn ngữ bất kỳ."), {
    ok: true, question: "Hãy thiết kế cache invalidation? Bạn có thể code pseudo hoặc ngôn ngữ bất kỳ.",
  });
  assert.equal(parseInterviewQuestion("How would you handle GET /search?q=go when caching results?").ok, true);
  assert.equal(parseInterviewQuestion("Bạn xử lý retry thế nào? Giải thích trade-off.").ok, true);
});

test("strips only clearly labeled coaching feedback before the next question", () => {
  assert.deepEqual(parseInterviewQuestion("✓ Điểm tốt: Bạn nói rõ khi chưa biết.\n! Gợi ý cải thiện: Ôn transaction.\nĐiểm: 5/100\n\nNếu hai giao dịch INSERT cùng key thì điều gì xảy ra?"), {
    ok: true, question: "Nếu hai giao dịch INSERT cùng key thì điều gì xảy ra?",
  });
});

test("rejects blank, greeting-only and feedback-only model output", () => {
  assert.deepEqual(parseInterviewQuestion(" \n "), { ok: false, reason: "empty" });
  assert.deepEqual(parseInterviewQuestion("Chào bạn."), { ok: false, reason: "not_a_question" });
  assert.deepEqual(parseInterviewQuestion("✓ Điểm tốt: Bạn hiểu vấn đề."), { ok: false, reason: "not_a_question" });
});

test("rejects fabricated candidate answers and trailing self-evaluation", () => {
  for (const text of [
    "Bạn sẽ làm gì khi client retry?\nCandidate: Tôi sẽ dùng key.",
    "Bạn sẽ làm gì khi client retry? Candidate: Tôi sẽ dùng key.",
    "Bạn sẽ làm gì khi client retry? Tôi sẽ dùng UNIQUE key.",
    "Bạn sẽ làm gì khi client retry?\nỨng viên: Tôi sẽ dùng key.",
    "Bạn sẽ làm gì khi client retry?\nĐiểm: 5/100",
    "Bạn sẽ làm gì khi client retry?\n[COACHING]\nscore: 5",
    "Answer: Add a unique constraint.",
    "Tôi sẽ thiết kế UNIQUE key và trả về 200.",
    "Tôi sẽ dùng UNIQUE key. Bạn sẽ làm gì?",
  ]) {
    assert.equal(parseInterviewQuestion(text).ok, false, text);
  }
});

test("rejects multiple independent questions and oversized output", () => {
  assert.deepEqual(parseInterviewQuestion("Bạn xử lý retry thế nào? Bạn đặt UNIQUE key ở đâu?"), { ok: false, reason: "multiple_questions" });
  assert.deepEqual(parseInterviewQuestion("Bạn làm gì?\nBạn làm gì tiếp?"), { ok: false, reason: "multiple_questions" });
  assert.deepEqual(parseInterviewQuestion("Hãy " + "a".repeat(MAX_QUESTION_CHARS)), { ok: false, reason: "too_long" });
});
