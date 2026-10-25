export const MAX_QUESTION_CHARS = 4000;

type QuestionResult =
  | { ok: true; question: string }
  | { ok: false; reason: "empty" | "too_long" | "not_a_question" | "multiple_questions" | "roleplay_or_feedback" };

const feedbackLine = /^(?:[✓!]\s*)?(?:điểm tốt|gợi ý cải thiện|cải thiện|điểm|strengths?|improvements?|score)\s*[:：]/i;
const roleplayLine = /(?:^|[.!?]\s+|\n)\s*(?:\*{0,2}(?:ứng viên|candidate|user|assistant|interviewer|người phỏng vấn|trả lời|đáp án|lời giải|answer|evaluation|đánh giá|nhận xét)\*{0,2})\s*[:：-]/i;
const instruction = /^(?:hãy|bạn hãy|vui lòng|trình bày|giải thích|thiết kế|phân tích|so sánh|mô tả|viết|chỉ ra|nêu|đề xuất|implement|design|explain|describe|write|debug|compare|walk me through|tell me about|please)(?=\s|[.,!?]|$)/i;
const greeting = /^(?:chào bạn|xin chào|hello|hi there)[.!]?\s+/i;

/** The interviewer model is untrusted output, not a transcript or an evaluation. */
export function parseInterviewQuestion(raw: string): QuestionResult {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_QUESTION_CHARS) return { ok: false, reason: "too_long" };

  const lines = text.split("\n");
  let start = 0;
  // Older coaching models often prepend clearly labeled feedback. Drop it only
  // when it is an unambiguous prefix; feedback after a question is never safe.
  while (start < lines.length && (!lines[start].trim() || feedbackLine.test(lines[start].trim()))) start++;
  const question = lines.slice(start).join("\n").trim().replace(/^\*{0,2}Interviewer\*{0,2}\s*[:：]\s*/i, "").trim();
  if (!question) return { ok: false, reason: "not_a_question" };
  if (question.split("\n").some((line) => feedbackLine.test(line.trim()) || /^\[\/?COACHING\]/i.test(line.trim())) || roleplayLine.test(question)) {
    return { ok: false, reason: "roleplay_or_feedback" };
  }
  // Scores without a heading are still evaluation, never part of a question.
  if (/(?:^|\n)\s*(?:\*{0,2})?\d{1,3}\s*\/\s*100\b/m.test(question)) {
    return { ok: false, reason: "roleplay_or_feedback" };
  }
  // Only a '?' that ends a clause counts as a question delimiter. '?' in a
  // URL/query string or code snippet is not a second interview question.
  const candidateFacing = question.replace(greeting, "");
  if (/^(?:tôi|mình|i\s+(?:would|will|can)|my answer)\b/i.test(candidateFacing)) {
    return { ok: false, reason: "roleplay_or_feedback" };
  }
  const endings = [...question.matchAll(/\?(?=\s|$)/g)];
  if (endings.length > 1) return { ok: false, reason: "multiple_questions" };
  if (endings.length === 1) {
    const trailing = question.slice(endings[0].index! + 1).trim();
    // A short candidate-facing follow-up instruction is part of the same task.
    // Unlabeled narrative after a question is ambiguous; never accept a
    // model-written candidate answer just because the first sentence has '?'.
    if (trailing && !instruction.test(trailing) &&
        !/^Bạn có thể code pseudo hoặc ngôn ngữ bất kỳ\.\s*$/i.test(trailing)) {
      return { ok: false, reason: "roleplay_or_feedback" };
    }
  }
  if (!endings.length && !instruction.test(candidateFacing)) {
    return { ok: false, reason: "not_a_question" };
  }
  return { ok: true, question };
}
