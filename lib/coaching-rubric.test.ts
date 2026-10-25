import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCoachingRubric, MAX_COACHING_CHARS } from "./coaching-rubric";

test("accepts fenced or prose-wrapped local-model JSON", () => {
  const payload = '{"score":72,"strengths":["Nêu được race condition"],"improvements":["Giải thích transaction"]}';
  const expected = { score: 72, strengths: ["Nêu được race condition"], improvements: ["Giải thích transaction"] };
  assert.deepEqual(extractCoachingRubric(`\x60\x60\x60json\n${payload}\n\x60\x60\x60`), expected);
  assert.deepEqual(extractCoachingRubric(`Đây là góp ý {nháp}: ${payload}\nHết.`), expected);
  assert.deepEqual(extractCoachingRubric("Điểm: 72/100\n✓ Điểm tốt: Nêu được race condition\n! Gợi ý cải thiện: Giải thích transaction"), expected);
});

test("rejects malformed, incomplete, empty or oversized feedback", () => {
  for (const value of [
    "Điểm: 72/100. Bạn cần giải thích transaction.",
    '{"score":72,"strengths":["Rõ"],',
    '{"score":101,"strengths":["Rõ"],"improvements":["Thêm ví dụ"]}',
    '{"score":72,"strengths":[],"improvements":["Thêm ví dụ"]}',
    '{"score":72,"strengths":["Rõ"],"improvements":[" "]}',
    '{"score":72,"strengths":["Rõ"],"improvements":["Thêm ví dụ"]}' + " ".repeat(MAX_COACHING_CHARS),
  ]) assert.equal(extractCoachingRubric(value), null, value.slice(0, 100));
});
