/**
 * 4 rubric hằng số — nguồn sự thật duy nhất cho tiêu chí chấm điểm (P4).
 *
 * FR-CM-02 (rubric 5 tiêu chí) · FR-LT-04 (rubric 4 nhóm lỗi) · FR-AI-04
 * (structured output theo rubric cố định).
 *
 * Vì sao tách khỏi `prompts.ts`:
 *   - Rubric là *hợp đồng dữ liệu* — UI đọc tên tiêu chí để render `RubricGrid`.
 *     Hardcode tên trong component sẽ lệch với prompt → lệch cả điểm chấm.
 *   - Prompt là *văn bản* — phải tĩnh tuyệt đối để prompt cache hit (design.md §6.5).
 *
 * Xem tasks.md 2.1 · SPEC.md §5.5 · design.md §6.6.
 */

/** Một tiêu chí có thể chấm điểm (0–5) — dùng cho 3 rubric chấm điểm. */
export type RubricCriterion = {
  /**
   * Khoá máy — dùng làm giá trị `z.enum` trong schema chấm điểm.
   *
   * Giữ **chữ thường** vì SPEC.md §5.5 và design.md §6.6 (`z.enum(["clarity",
   * "structure", …])`) đã chốt giá trị này — schema và dữ liệu phải khớp.
   */
  key: string;
  /**
   * Định danh hằng số `SCREAMING_SNAKE_CASE` của tiêu chí.
   *
   * Tách khỏi `key` vì `key` phải khớp enum trong schema, còn định danh này
   * dùng làm tên export/nhánh switch trong UI (tasks.md 2.1: "export
   * SCREAMING_SNAKE_CASE"). Cả hai đều không khoảng trắng, không dấu.
   */
  constant: string;
  /** Tên hiển thị tiếng Việt cho UI. */
  name: string;
  /** Mô tả tiêu chí — nhét thẳng vào system prompt để AI chấm đúng ý. */
  desc: string;
};

/** Một nhóm lỗi ngôn ngữ — rubric 4 nhóm không chấm điểm, chỉ liệt kê lỗi. */
export type LanguageErrorGroup = {
  /** Khoá máy — khớp enum trong schema chấm lỗi ngôn ngữ. */
  key: string;
  /** Định danh hằng số `SCREAMING_SNAKE_CASE`. */
  constant: string;
  /** Tên hiển thị tiếng Việt cho UI. */
  name: string;
};

/** Rubric chấm giao tiếp (viết + nói) — 5 tiêu chí, mỗi tiêu chí 0–5. */
export const RUBRIC_COMMUNICATION: readonly RubricCriterion[] = [
  {
    key: "clarity",
    constant: "CLARITY",
    name: "Rõ ràng",
    desc: "Người đọc hiểu ngay điều cần biết trong 1 câu đầu",
  },
  {
    key: "structure",
    constant: "STRUCTURE",
    name: "Cấu trúc",
    desc: "Có mở–thân–kết rõ ràng, điều quan trọng nhất đứng đầu",
  },
  {
    key: "tone",
    constant: "TONE",
    name: "Giọng văn",
    desc: "Phù hợp với vai trò và mối quan hệ với người nhận",
  },
  {
    key: "natural",
    constant: "NATURAL",
    name: "Tự nhiên",
    desc: "Cách diễn đạt tự nhiên, không dịch từng chữ",
  },
  {
    key: "grammar",
    constant: "GRAMMAR",
    name: "Ngữ pháp",
    desc: "Cấu trúc câu và dấu câu đúng",
  },
];

/** Rubric chấm câu trả lời mock interview (kỹ thuật) — 5 tiêu chí, mỗi tiêu chí 0–5. */
export const RUBRIC_TECHNICAL: readonly RubricCriterion[] = [
  {
    key: "accuracy",
    constant: "ACCURACY",
    name: "Chính xác",
    desc: "Nội dung kỹ thuật đúng, không sai lệch kiến thức nền",
  },
  {
    key: "depth",
    constant: "DEPTH",
    name: "Chiều sâu",
    desc: "Đi sâu vào bản chất vấn đề, không dừng ở mặt ngoài",
  },
  {
    key: "reasoning",
    constant: "REASONING",
    name: "Lập luận",
    desc: "Có chuỗi suy luận rõ ràng từ giả định đến kết luận",
  },
  {
    key: "communication",
    constant: "COMMUNICATION",
    name: "Giao tiếp",
    desc: "Diễn đạt rõ ràng, có cấu trúc, người nghe theo kịp",
  },
  {
    key: "tradeoff",
    constant: "TRADEOFF",
    name: "Nhận biết đánh đổi",
    desc: "Nói được cái giá của lựa chọn và khi nào không dùng",
  },
];

/** Rubric chấm câu trả lời hành vi (STAR) — 4 tiêu chí, mỗi tiêu chí 0–5. */
export const RUBRIC_BEHAVIORAL: readonly RubricCriterion[] = [
  {
    key: "specific",
    constant: "SPECIFIC",
    name: "Cụ thể",
    desc: "Có ví dụ cụ thể từ trải nghiệm thật, không nói chung chung",
  },
  {
    key: "star",
    constant: "STAR",
    name: "Đầy đủ STAR",
    desc: "Rõ tình huống → nhiệm vụ → hành động → kết quả",
  },
  {
    key: "selfaware",
    constant: "SELFAWARE",
    name: "Tự nhận thức",
    desc: "Nhận ra điều mình làm chưa tốt và vì sao",
  },
  {
    key: "outcome",
    constant: "OUTCOME",
    name: "Kết quả",
    desc: "Kết quả có thể đo được, không chỉ là cảm nhận",
  },
];

/** Rubric 4 nhóm lỗi khi sửa bài ngoại ngữ — không chấm điểm, chỉ liệt kê nhóm lỗi. */
export const RUBRIC_LANGUAGE_ERRORS: readonly LanguageErrorGroup[] = [
  { key: "grammar", constant: "GRAMMAR", name: "Ngữ pháp" },
  { key: "vocab", constant: "VOCAB", name: "Từ vựng" },
  { key: "expression", constant: "EXPRESSION", name: "Cách diễn đạt" },
  { key: "context", constant: "CONTEXT", name: "Ngữ cảnh" },
];

/** Khoá tiêu chí hợp lệ của từng rubric — dùng để validate `z.enum` trong schema. */
export const RUBRIC_COMMUNICATION_KEYS = RUBRIC_COMMUNICATION.map((c) => c.key);
export const RUBRIC_TECHNICAL_KEYS = RUBRIC_TECHNICAL.map((c) => c.key);
export const RUBRIC_BEHAVIORAL_KEYS = RUBRIC_BEHAVIORAL.map((c) => c.key);
export const RUBRIC_LANGUAGE_ERROR_KEYS = RUBRIC_LANGUAGE_ERRORS.map((g) => g.key);

/** Định danh `SCREAMING_SNAKE_CASE` của từng tiêu chí — dùng cho UI/switch. */
export const RUBRIC_COMMUNICATION_CONSTANTS = RUBRIC_COMMUNICATION.map((c) => c.constant);
export const RUBRIC_TECHNICAL_CONSTANTS = RUBRIC_TECHNICAL.map((c) => c.constant);
export const RUBRIC_BEHAVIORAL_CONSTANTS = RUBRIC_BEHAVIORAL.map((c) => c.constant);
export const RUBRIC_LANGUAGE_ERROR_CONSTANTS = RUBRIC_LANGUAGE_ERRORS.map((g) => g.constant);
