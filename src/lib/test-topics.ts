/**
 * Hằng chủ đề bài kiểm tra ngôn ngữ — **thuần**, không phụ thuộc Node API.
 *
 * ⚠️ Vì sao tách riêng: `src/lib/test.ts` dùng `node:crypto` (hash form
 * parallel) ⇒ không import được từ Client Component. Hằng constant nằm ở
 * đây để UI client dùng mà không kéo theo `node:crypto` vào browser bundle
 * (webpack lỗi `UnhandledSchemeError`).
 */

export type Lang = "zh" | "en";

/** Danh sách chủ đề theo ngôn ngữ. */
export const TEST_TOPIC_GROUPS: Record<Lang, readonly string[]> = {
  zh: ["greet", "people", "food", "place", "time", "verb", "pronoun", "number", "family", "day"],
  en: ["greet", "people", "food", "place", "time", "verb", "pronoun", "number", "family", "day"],
};

/** Nhãn tiếng Việt cho từng chủ đề. */
export const TEST_TOPIC_GROUP_LABELS: Record<string, string> = {
  greet: "Chào hỏi",
  people: "Người & thân xã",
  food: "Đồ ăn",
  place: "Địa điểm",
  time: "Thời gian",
  verb: "Động từ & phó từ",
  pronoun: "Đại từ & cơ bản",
  number: "Số đếm",
  family: "Gia đình",
  day: "Ngày trong tuần",
};
