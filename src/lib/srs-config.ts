/**
 * Hằng số SRS — đóng băng cho toàn bộ feature `srs-language-review`.
 *
 * ⚠️ KHÔNG dùng `src/lib/config.ts` — file đó thuộc daily-loop-core, không được
 * sửa (phạm vi feature này). Registry `.kiro/steering/data-model-registry.md`
 * §3 ghi rõ M1 `SrsSession` chưa được duyệt ⇒ dùng nhánh dự phòng: lưu queue
 * phiên vào `localStorage` + suy ra từ `Card.reps`/`due`. Hằng số SRS khác
 * (ngưỡng, cửa sổ) không cần model mới ⇒ đặt riêng ở đây.
 */

/** Số thẻ tối đa trong 1 phiên ôn (FR-LG-04). */
export const SRS_SESSION_MAX_CARDS = 20;

/** Ngưỡng `stability` coi là "đã thuộc" (chuẩn FSRS mature). */
export const SRS_MASTERY_STABILITY_DAYS = 21;

/** Cửa sổ hiển thị phiên âm kiểu Việt cho `en` (14 ngày kể từ `createdAt`). */
export const SRS_HINT_WINDOW_DAYS = 14;

/** Trần `pageSize` của API bảng thẻ (FR-LG-S09-06). */
export const SRS_MAX_PAGE_SIZE = 100;

/** Default `pageSize` khi client không gửi. */
export const SRS_DEFAULT_PAGE_SIZE = 20;

/** Số tham số w-vector của FSRS-6 (đọc runtime từ `FSRS_CONFIG.w.length`). */
export const SRS_W_VECTOR_LENGTH = 21;

/** Decay FSRS-6 — `w[20]` (âm). */
export const SRS_FSRS6_DECAY = 0.1542;

/** Mục tiêu retention 0.9 (D7 — khớp prototype S09). */
export const SRS_REQUEST_RETENTION = 0.9;

/** Maximum interval (ngày) — D8. */
export const SRS_MAXIMUM_INTERVAL_DAYS = 365;

/** Timeout (ms) chờ `voiceschanged` khi kiểm tra TTS (R5). */
export const SRS_VOICE_TIMEOUT_MS = 1500;

/** Khoảng cách double-write bị coi là trùng (giây). */
export const SRS_GRADE_DEDUP_WINDOW_SECONDS = 3;

/** Prefix storage key cho queue phiên (nhánh dự phòng M1). */
export const SRS_SESSION_STORAGE_KEY = "daily-loop.srs.session.v1";

/** Prefix storage key cho toggle hanzi của người dùng (zh). */
export const SRS_HANZI_STORAGE_KEY = "daily-loop.srs.showHanzi.v1";

/** Prefix storage key cho toggle phiên âm (en). */
export const SRS_HINT_STORAGE_KEY = "daily-loop.srs.showHint.v1";