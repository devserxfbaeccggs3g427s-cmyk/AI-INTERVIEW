/**
 * So khớp chuỗi "mờ" (fuzzy matching) — dùng cho chế độ `produce` của SRS.
 *
 * Vì sao cần (task 10.12 · FR-LG-06):
 *   Người học gõ/nói câu tiếng Trung/Anh — sai dấu thanh, sai khoảng trắng,
 *   viết tắt, gõ nhầm là chuyện thường. Chấm đúng tuyệt đối sẽ khiến họ
 *   phải học thuộc "đúng chính tả của app" chứ không phải "dùng được".
 *
 * ⚠️ Cố ý **KHÔNG** phụ thuộc thư viện ngoài — thuật toán Levenshtein +
 *   chuẩn hoá chuỗi là đủ cho 1 câu ngắn, và giữ bundle client nhẹ.
 *
 * Xem tasks.md 10.12 · design.md §4.10.
 */

/** Ngưỡng mặc định — độ tương đồng tối thiểu để coi là đúng. */
export const DEFAULT_THRESHOLD = 0.8;

/**
 * Chuẩn hoá chuỗi trước khi so khớp:
 *   - lowercase
 *   - bỏ khoảng trắng thừa ở hai đầu, gộp khoảng trắng trong ra 1
 *   - bỏ dấu câu phổ biến (`. , ! ? ; : " ' ( ) [ ] { }`)
 *   - bỏ toàn bộ khoảng trắng (tiếng Trung không phân biệt từ bằng space)
 *
 * @param value chuỗi gốc
 * @param keepSpaces giữ khoảng trắng (dùng cho tiếng Anh/Anh — tách từ có nghĩa)
 */
export function normalize(value: string, keepSpaces = false): string {
  let out = value.trim().toLowerCase();
  out = out.replace(/[.,!?;:"'()[\]{}]/g, "");
  if (keepSpaces) {
    out = out.replace(/\s+/g, " ");
  } else {
    out = out.replace(/\s+/g, "");
  }
  return out;
}

/**
 * Khoảng cách Levenshtein (edit distance) — số phép sửa tối thiểu để biến
 * chuỗi `a` thành chuỗi `b`.
 *
 * Triển khai rolling 2 hàng → O(min(m, n)) bộ nhớ.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Luôn cuộn trên chuỗi ngắn hơn để tiết kiệm bộ nhớ.
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);

  for (let j = 0; j <= a.length; j += 1) prev[j] = j;

  for (let i = 1; i <= b.length; i += 1) {
    curr[0] = i;
    const bChar = b.charCodeAt(i - 1);
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a.charCodeAt(j - 1) === bChar ? 0 : 1;
      const deletion = (prev[j] ?? 0) + 1;
      const insertion = (curr[j - 1] ?? 0) + 1;
      const substitution = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(deletion, insertion, substitution);
    }
    // Hoán vị 2 hàng.
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  return prev[a.length] ?? 0;
}

/**
 * Độ tương đồng 0..1 giữa 2 chuỗi — 1 là giống hệt.
 *
 * `similarity = 1 - distance / max(len)`.
 */
export function similarity(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0 && lenB === 0) return 1;
  if (lenA === 0 || lenB === 0) return 0;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(lenA, lenB));
}

/** Kết quả so khớp 1 đáp án. */
export type FuzzyMatch = {
  /** Đúng tuyệt đối (chuỗi đã chuẩn hoá khớp tuyệt đối). */
  exact: boolean;
  /** Độ tương đồng 0..1. */
  score: number;
  /** Có đạt ngưỡng không. */
  correct: boolean;
  /** Khoảng cách edit (số ký tự phải sửa). */
  distance: number;
};

/**
 * So khớp 1 đáp án của người dùng với đáp án đúng.
 *
 * @param input      chuỗi người dùng nhập/ghi âm
 * @param expected   đáp án đúng
 * @param threshold  ngưỡng coi là đúng (mặc định 0.8)
 * @param keepSpaces giữ khoảng trắng khi chuẩn hoá (tiếng Anh/Anh)
 */
export function matchAnswer(
  input: string,
  expected: string,
  threshold: number = DEFAULT_THRESHOLD,
  keepSpaces = false,
): FuzzyMatch {
  const a = normalize(input, keepSpaces);
  const b = normalize(expected, keepSpaces);

  if (a.length === 0) {
    return { exact: false, score: 0, correct: false, distance: b.length };
  }

  const exact = a === b;
  const distance = levenshtein(a, b);
  const score = exact ? 1 : similarity(a, b);

  return {
    exact,
    score: Math.round(score * 1000) / 1000,
    correct: exact || score >= threshold,
    distance,
  };
}

/**
 * So khớp nhiều đáp án — dùng cho item trắc nghiệm (so sánh với từng option).
 *
 * @param inputs   danh sách đáp án người dùng chọn
 * @param expected danh sách đáp án đúng
 */
export function matchAnswers(
  inputs: string[],
  expected: string[],
  threshold: number = DEFAULT_THRESHOLD,
  keepSpaces = false,
): FuzzyMatch {
  const normalizedExpected = expected.map((e) => normalize(e, keepSpaces));
  const normalizedInputs = inputs.map((i) => normalize(i, keepSpaces));

  // So khớp tập — cùng số phần tử và mỗi phần tử khớp 1-1.
  if (normalizedInputs.length === normalizedExpected.length) {
    const exact = normalizedInputs.every((v, i) => v === normalizedExpected[i]);
    if (exact) return { exact: true, score: 1, correct: true, distance: 0 };

    let total = 0;
    let totalDistance = 0;
    for (let i = 0; i < normalizedInputs.length; i += 1) {
      const input = normalizedInputs[i] ?? "";
      const exp = normalizedExpected[i] ?? "";
      total += similarity(input, exp);
      totalDistance += levenshtein(input, exp);
    }
    const score = total / Math.max(1, normalizedInputs.length);
    return {
      exact: false,
      score: Math.round(score * 1000) / 1000,
      correct: score >= threshold,
      distance: totalDistance,
    };
  }

  // Khác số phần tử → so theo thứ tự, điểm trung bình có thể chấp nhận.
  let total = 0;
  let totalDistance = 0;
  const pairs = Math.max(normalizedInputs.length, normalizedExpected.length);
  for (let i = 0; i < pairs; i += 1) {
    const input = normalizedInputs[i] ?? "";
    const exp = normalizedExpected[i] ?? "";
    total += similarity(input, exp);
    totalDistance += levenshtein(input, exp);
  }
  const score = total / Math.max(1, pairs);
  return {
    exact: false,
    score: Math.round(score * 1000) / 1000,
    correct: false,
    distance: totalDistance,
  };
}

/**
 * Kiểm tra có chứa đáp án không — dùng cho item "điền từ" (cloze) khi người
 * dùng viết một câu dài chứa đáp án.
 */
export function containsAnswer(
  input: string,
  expected: string,
  keepSpaces = false,
): boolean {
  const a = normalize(input, keepSpaces);
  const b = normalize(expected, keepSpaces);
  if (b.length === 0) return false;
  return a.includes(b);
}
