# Tasks — Ôn Ngoại Ngữ SRS / FSRS (S09, S10)

> Phase: **1** (xem `spec.md` §0 — SPEC §3.1 ghi Phase 0, SPEC §7 đặt SRS ở Phase 1; chọn Phase 1 theo lộ trình + ưu tiên cứng 7 ngày)
> Phụ thuộc: `daily-loop-core` (schema `Skill`/`Activity`/`Evidence`/`UserProfile`), `skill-tree-evidence`, `ai-foundation` (`src/lib/db.ts`, `src/lib/config.ts`, `src/lib/dates.ts`)
> Lưu ý: tuân thủ `.kiro/steering/tech.md` + `design-system.md`. Feature **không dùng AI** — không thêm `AiCall`, không prompt.

---

## 0. Hạ tầng & chuẩn bị

- [ ] 1. Cài dependency `ts-fsrs` **đã khoá phiên bản**
  - [ ] 1.1 Chạy `npm install ts-fsrs@5.4.2 --save-exact` (không dấu `^` — xem design.md T1)
  - [ ] 1.2 Xác nhận `package.json` có `"ts-fsrs": "5.4.2"`
  - [ ] 1.3 Xác nhận `tsconfig.json` giữ `"strict": true` và không có `any` trong `src/lib`
  - [ ] 1.4 Ghi `ts-fsrs` vào mục dependency ghi chú trong `docs/dependencies.md` (nếu có) hoặc comment trong `package.json`

- [ ] 2. Thêm hằng số cấu hình vào `src/lib/config.ts`
  - [ ] 2.1 Thêm `export const SRS_SESSION_MAX_CARDS = 20;` (FR-LG-04, khớp `project.md` §5)
  - [ ] 2.2 Thêm `export const SRS_MASTERY_STABILITY_DAYS = 21;` (ngưỡng "đã thuộc")
  - [ ] 2.3 Thêm `export const SRS_HINT_WINDOW_DAYS = 14;` (cửa sổ phiên âm Việt 2 tuần)
  - [ ] 2.4 Thêm `export const SRS_MAX_PAGE_SIZE = 100;` (trần `pageSize` của API bảng thẻ)
  - [ ] 2.5 Unit test: mỗi hằng có giá trị đúng như trên

- [ ] 3. Thêm helper ngày vào `src/lib/dates.ts`
  - [ ] 3.1 Thêm `export function toLocalDateKey(d: Date): string` → trả `yyyy-MM-dd` theo giờ local
  - [ ] 3.2 Thêm `export function startOfLocalDay(d: Date): Date` → 00:00:00.000 local
  - [ ] 3.3 Unit test: vùng giờ UTC+7, ngày 23:59 và 00:00 vẫn cho key đúng

---

## 1. Schema dữ liệu

- [ ] 4. Cập nhật `prisma/schema.prisma`
  - [ ] 4.1 Giữ nguyên model `Card` và `Review` (đã đúng SPEC §4), **chỉ sửa comment** để ghi rõ `hint` mang 2 nghĩa theo `lang` (zh = gợi ý ngữ cảnh, en = phiên âm kiểu Việt)
  - [ ] 4.2 Thêm `@@unique([lang, front, group])` cho `Card` — chống trùng thẻ (API trả 409)
  - [ ] 4.3 Thêm model `SrsSession` với field: `id`, `lang`, `cardIds Json`, `plannedCount Int`, `reviewedCount Int @default(0)`, `status String @default("active")`, `startedAt DateTime @default(now())`, `endedAt DateTime?`
  - [ ] 4.4 Thêm `@@index([lang, status])` cho `SrsSession`
  - [ ] 4.5 Thêm model `LanguagePattern` với field: `id`, `lang`, `patternId Int`, `text`, `translit String?`, `meaning String`, `@@unique([lang, patternId])` (lưu 20 mẫu câu cho S11/S19–S21 dùng lại)
  - [ ] 4.6 Chạy `npx prisma migrate dev --name add_srs_session_and_language_pattern`
  - [ ] 4.7 Xác nhận `npx prisma generate` chạy thành công
  - [ ] 4.8 Ghi chú bổ sung 2 model mới vào `system-design/SPEC.md` §4 **ở lần cập nhật tiếp theo** (không sửa file này trong feature này) — đưa vào PR description

---

## 2. Wrapper thuật toán FSRS

- [ ] 5. Tạo `src/lib/fsrs.ts`
  - [ ] 5.1 Khai báo `export type Lang = 'zh' | 'en';`
  - [ ] 5.2 Khai báo `export type GradeRating = 1 | 2 | 3 | 4;`
  - [ ] 5.3 Khai báo `export interface CardState` đúng 11 field: `version`, `due`, `stability`, `difficulty`, `scheduledDays`, `learningSteps`, `reps`, `lapses`, `state`, `lastReview` (design.md §3.1)
  - [ ] 5.4 Khai báo `export interface RatingPreview` với `rating`, `intervalMinutes`, `label`, `due`, `card`
  - [ ] 5.5 Khai báo `export const FSRS_CONFIG = generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: false, enable_short_term: true, learning_steps: ['1m','10m'], relearning_steps: ['10m'] })`
  - [ ] 5.6 Khai báo `export const scheduler = fsrs(FSRS_CONFIG)`
  - [ ] 5.7 Implement `createNewCardState(now)` → `toCardState(createEmptyCard(now))`
  - [ ] 5.8 Implement `toCardState(card)` → map `due`/`stability`/`difficulty`/`scheduled_days`/`learning_steps`/`reps`/`lapses`/`state`/`last_review` sang camelCase + `version: 1`
  - [ ] 5.9 Implement `fromCardState(state)` → map ngược về `Card` của `ts-fsrs` (`state` cast sang `State`)
  - [ ] 5.10 Implement `toTsfsrsGrade(rating)` → map `1→Rating.Again`, `2→Rating.Hard`, `3→Rating.Good`, `4→Rating.Easy`
  - [ ] 5.11 Implement `previewIntervals(state, now)` → gọi `scheduler.next` cho cả 4 mức, tính `intervalMinutes = round((due - now)/60000)`, `label` từ `formatInterval`
  - [ ] 5.12 Implement `applyRating(state, rating, now)` → `{ card: toCardState(...), log: snapshot }`
  - [ ] 5.13 Implement `formatInterval(minutes, rating?)` — biên: `<1` → "Ngay bây giờ", `<60` → "… phút", `<1440` → "… giờ", còn lại → "… ngày"; tiền tố "Lặp lại trong" khi `rating === 1` (Again), "Ôn sau" với các mức khác
  - [ ] 5.14 Implement `retrievability(state, now)` → dùng `scheduler.get_retrievability`
  - [ ] 5.15 **Không** import Prisma / Anthropic SDK trong file này (giữ thuần, test được không cần DB)
  - [ ] 5.16 Thêm `export class FsrsStateVersionError` và `export class FsrsStateCorruptError`
  - [ ] 5.17 Thêm `export function migrateCardState(raw: unknown): CardState` — ném `FsrsStateVersionError` nếu `version !== 1`

- [ ] 6. Unit test `src/lib/fsrs.ts` (Vitest) — `src/lib/__tests__/fsrs.test.ts`
  - [ ] 6.1 `applyRating` với mọi mức 1–4 × 4 trạng thái (New/Learning/Review/Relearning) **khớp tuyệt đối** `scheduler.next(state, now, grade).card` (AC-4)
  - [ ] 6.2 `previewIntervals` trả đủ 4 key `1,2,3,4`, `intervalMinutes ≥ 0`, `due` hợp lệ
  - [ ] 6.3 `formatInterval` đúng ở các biên 0, 1, 59, 60, 1439, 1440, 10080; `rating = 1` dùng tiền tố "Lặp lại trong", các mức khác dùng "Ôn sau"
  - [ ] 6.4 `toCardState` → `fromCardState` → `toCardState` round-trip giữ nguyên mọi field
  - [ ] 6.5 `createNewCardState` có `state = 0`, `reps = 0`, `lapses = 0`, `stability = 0`
  - [ ] 6.6 `migrateCardState` ném `FsrsStateVersionError` khi `version = 0` hoặc `2`
  - [ ] 6.7 `migrateCardState` ném `FsrsStateCorruptError` khi JSON không hợp lệ

---

## 3. Lớp nghiệp vụ SRS

- [ ] 7. Tạo `src/lib/srs.ts`
  - [ ] 7.1 Khai báo type `SessionCard`, `SessionPayload`, `LanguageStats`, `GroupStats`
  - [ ] 7.2 Implement `listDueCards(lang, now, limit)` — `where: { lang, due: { lte: now } }`, `orderBy: [{ due: 'asc' }, { createdAt: 'asc' }]`
  - [ ] 7.3 Implement `pickNewCards(lang, limit)` — chỉ lấy `reps = 0` **thuộc nhóm chưa học**; ưu tiên nhóm có ít thẻ đã học nhất (thiết kế §4.2)
  - [ ] 7.4 Implement `buildSession(lang, { maxCards, forceNew })` — resume nếu có `SrsSession` `status = 'active'` cùng `lang`; ngược lại ghép `due` + `new`, cap `SRS_SESSION_MAX_CARDS`
  - [ ] 7.5 Implement `getNextCard(sessionId, index)` → `{ sessionId, card, index, total, startedAt, preview }`; `preview` gọi `previewIntervals`
  - [ ] 7.6 Implement `gradeCard({ cardId, rating, sessionId })` — 1 `prisma.$transaction`: update `Card` + insert `Review` + update `SrsSession`
  - [ ] 7.7 Trong `gradeCard`: chống double-write — tìm `Review` cùng `cardId` trong 3 giây gần nhất → ném lỗi `409 DUPLICATE_GRADE`
  - [ ] 7.8 Trong `gradeCard`: update `Card` ghi **cả** `cardState` JSON **và** các cột denormalized (`due`, `stability`, `difficulty`, `reps`, `lapses`) trong cùng transaction
  - [ ] 7.9 Implement `getLanguageStats(lang?)` → `{ languages, totals }`, phân loại `unseen`/`learning`/`mastered`/`due` theo `SRS_MASTERY_STABILITY_DAYS`
  - [ ] 7.10 Implement `getReviewStreak(lang, now)` — chuỗi ngày **local** có ≥1 `Review`; hôm nay chưa ôn thì bắt đầu từ hôm qua
  - [ ] 7.11 Implement `getGroupStats(lang)` — `masteredPct`, `avgStability`, `due`, `lapses` mỗi nhóm
  - [ ] 7.12 Implement `exportDeck()` → `{ version, exportedAt, fsrsConfig, cards[], reviews[] }` (self-contained, NFR-08)
  - [ ] 7.13 Implement `importDeck(json)` — validate bằng Zod, từ chối sai định dạng, không ghi đè dữ liệu hợp lệ
  - [ ] 7.14 Thêm `export class SrsError extends Error` với `code` + `httpStatus` (map sang response API)

- [ ] 8. Unit test `src/lib/srs.ts` — `src/lib/__tests__/srs.test.ts` (SQLite test DB)
  - [ ] 8.1 `listDueCards` sắp `due` tăng dần, loại thẻ `due > now`
  - [ ] 8.2 `pickNewCards` chỉ trả thẻ `reps = 0` thuộc **nhóm chưa học**
  - [ ] 8.3 `pickNewCards` ưu tiên nhóm có ít thẻ đã học nhất
  - [ ] 8.4 `buildSession` không bao giờ vượt 20 thẻ (case 25 đến hạn → 20)
  - [ ] 8.5 `buildSession` ghép `due` trước `new` (12 đến hạn + 30 mới → 12 + 8)
  - [ ] 8.6 `buildSession` resume phiên `active` cùng `lang` → `resumed: true`, `cardIds` không đổi
  - [ ] 8.7 `buildSession` với `lang` khác → tạo phiên mới, không lẫn id thẻ
  - [ ] 8.8 `gradeCard` tăng `reps`, `lapses` tăng khi rating 1, `due` về hôm nay
  - [ ] 8.9 `gradeCard` ghi đúng 1 `Review` với `state` = state sau lượt ôn
  - [ ] 8.10 Sau `gradeCard`: `card.due.toISOString() === card.cardState.due` (kiểm tra đồng bộ, R14)
  - [ ] 8.11 `gradeCard` lần 2 trong 3 giây → lỗi `409`
  - [ ] 8.12 `getReviewStreak` đúng cho các case: ôn 3 ngày liên tiếp / hôm nay chưa ôn / 1 ngày / không có review
  - [ ] 8.13 `getLanguageStats` số đếm khớp `COUNT(*)` theo `lang`
  - [ ] 8.14 `exportDeck` chứa đủ card + `cardState` + `reviews`; `importDeck` vào DB trống cho lại cùng `due`/`stability`

---

## 4. Seed 140 thẻ + 20 mẫu câu (FR-LG-10, R6)

- [ ] 9. Tạo `prisma/seed-data/groups.ts`
  - [ ] 9.1 Khai báo `LANG_GROUPS.zh` gồm 6 nhóm: `greeting`, `people`, `food`, `place`, `time`, `verb` (kèm `label` tiếng Việt theo prototype)
  - [ ] 9.2 Khai báo `LANG_GROUPS.en` gồm 6 nhóm: `pronoun`, `numbers`, `food`, `place`, `time`, `verb`
  - [ ] 9.3 Khai báo `LANG_GROUP_LABELS` map `lang` → nhãn hiển thị (`"Tiếng Trung (zh-CN)"`, `"Tiếng Anh (en-US)"`)

- [ ] 10. Tạo `prisma/seed-data/zh.ts` — **biên tập tay**
  - [ ] 10.1 Copy nguyên văn 60 thẻ từ `spec.md` §7.1 + 10 mẫu câu (6 nhóm × 10 từ: hanzi, pinyin, nghĩa, gợi ý)
  - [ ] 10.2 Bổ sung cho mỗi thẻ: `note` (ghi chú ngữ cảnh tiếng Việt), `hint` (gợi ý ngữ cảnh ngắn + thanh điệu)
  - [ ] 10.3 Bổ sung `example` + `examplePinyin` cho mỗi thẻ, theo 1 trong 10 mẫu câu
  - [ ] 10.4 Gán `patternId` (1–10) cho mỗi thẻ
  - [ ] 10.5 Viết `ZH_SENTENCE_PATTERNS` — đúng 10 mẫu câu theo `spec.md` §7.3
  - [ ] 10.6 **Không** dùng AI sinh nội dung này (R6) — nếu cần tra cứu, dùng nguồn từ điển có thẩm quyền và ghi nguồn vào comment

- [ ] 11. Tạo `prisma/seed-data/en.ts` — **biên tập tay**
  - [ ] 11.1 Copy nguyên văn 60 thẻ từ `spec.md` §7.2 + 10 mẫu câu (6 nhóm × 10 từ: từ, nghĩa, phiên âm kiểu Việt)
  - [ ] 11.2 Bổ sung `note` tiếng Việt + `hint` = phiên âm kiểu Việt cho mỗi thẻ
  - [ ] 11.3 Bổ sung `example` cho mỗi thẻ theo 1 trong 10 mẫu câu, gán `patternId`
  - [ ] 11.4 Viết `EN_SENTENCE_PATTERNS` — đúng 10 mẫu câu theo `spec.md` §7.4
  - [ ] 11.5 **Không** dùng AI sinh nội dung này (R6)

- [ ] 12. Tạo `prisma/seed.ts`
  - [ ] 12.1 Implement `assertSeedShape()` — fail-fast nếu zh ≠ 60, en ≠ 60, mẫu câu ≠ 10/ngôn ngữ, mỗi nhóm ≠ 10 thẻ, `group` không thuộc nhóm của `lang`
  - [ ] 12.2 Xoá `review`, `srsSession`, `card`, `languagePattern` cũ (giữ `Skill`/`Activity`/`UserProfile`)
  - [ ] 12.3 Nạp 140 thẻ với `cardState = createNewCardState(now)`, `mode = 'recognize'`, `due = now`
  - [ ] 12.4 Ghi đồng bộ cả `cardState` JSON và các cột denormalized khi tạo
  - [ ] 12.5 Nạp 20 `LanguagePattern` (10 zh + 10 en) bằng `createMany`
  - [ ] 12.6 Tạo cây `Skill` trung tính nếu chưa có (theo `project.md` §7)
  - [ ] 12.7 Tạo `UserProfile` với `learningLangs = 'zh,en'`, `zhLevel = 'zero'`, `enLevel = 'zero'` nếu chưa có
  - [ ] 12.8 In tổng kết: `✔ 140 thẻ (70 zh + 70 en) · 20 mẫu câu`
  - [ ] 12.9 **Xác nhận file seed không import `@anthropic-ai/sdk` và không có fetch/network call** (grep + test tự động)
  - [ ] 12.10 Ghi chú trên đầu file: cần người biết tiếng Trung & tiếng Anh ký duyệt các sai lệch D1–D3 trong `spec.md` §7.5

- [ ] 13. Test seed
  - [ ] 13.1 Chạy `npx prisma db seed` trên DB sạch → không lỗi, in đúng tổng kết
  - [ ] 13.2 Query xác nhận: `SELECT lang, COUNT(*) FROM Card GROUP BY lang` → `zh=60`, `en=60`
  - [ ] 13.3 Query xác nhận mỗi `(lang, group)` có đúng 10 thẻ
  - [ ] 13.4 Query xác nhận `LanguagePattern` có 20 bản ghi (10/ngôn ngữ)
  - [ ] 13.5 Query xác nhận mọi thẻ có `mode='recognize'`, `cardState.state=0`, `reps=0`, `lapses=0`
  - [ ] 13.6 Query xác nhận mọi thẻ `zh` có `frontAlt` khác rỗng, mọi thẻ `en` có `hint` (phiên âm) khác rỗng

---

## 5. API routes

- [ ] 14. Tạo `src/app/api/language/route.ts` — `GET /api/language`
  - [ ] 14.1 Validate query `lang` (tuỳ chọn, ∈ {zh, en, all}) bằng Zod
  - [ ] 14.2 Gọi `getLanguageStats()` → `{ ok: true, data: { languages, totals } }`
  - [ ] 14.3 Shape `LanguageStats`: `lang`, `label`, `level`, `unseen`, `learning`, `mastered`, `due`, `newAvailable`, `streak`, `groups[]`
  - [ ] 14.4 Shape `GroupStats`: `id`, `label`, `total`, `mastered`, `masteredPct`, `avgStability`, `due`, `lapses`
  - [ ] 14.5 Lỗi → `{ ok: false, error: { code: 'DB_ERROR', message: '...' } }` với HTTP 500, không stack trace ra client
  - [ ] 14.6 Integration test: số trả về khớp `COUNT(*)` theo `lang`

- [ ] 15. Tạo `src/app/api/language/cards/route.ts`
  - [ ] 15.1 `GET` — query `lang`, `group`, `status` (all|due|learning|mastered|lapse), `q`, `page` (≥1), `pageSize` (≤`SRS_MAX_PAGE_SIZE`, mặc định 20)
  - [ ] 15.2 `GET` trả `{ ok, data: { cards, total, page, pageSize, pages } }`; mỗi card gồm cả field hiển thị (`front`, `frontAlt`, `back`, `group`, `mode`, `stability`, `difficulty`, `reps`, `lapses`, `due`, `state`, `lastReviewAt`)
  - [ ] 15.3 `GET` với `format=json` → trả file JSON tải xuống tên `srs-deck-{yyyy-MM-dd}.json` (NFR-08)
  - [ ] 15.4 `POST` — validate body bằng Zod: `lang`, `front`, `back` bắt buộc; `frontAlt`/`note`/`example`/`examplePinyin`/`hint` tuỳ chọn; `group` phải thuộc `LANG_GROUPS[lang]`; `mode` ∈ {recognize, recall, produce}
  - [ ] 15.5 `POST` tạo thẻ với `cardState = createNewCardState()` + cột denormalized đồng bộ
  - [ ] 15.6 `POST` trùng `(lang, front, group)` → HTTP 409 `{ code: 'DUPLICATE_CARD' }`
  - [ ] 15.7 `POST` lỗi validate → HTTP 400 kèm **danh sách nhóm hợp lệ** trong message
  - [ ] 15.8 Integration test cho cả 3 nhánh: hợp lệ, sai `group`, trùng

- [ ] 16. Tạo `src/app/api/srs/session/route.ts` — `POST /api/srs/session`
  - [ ] 16.1 Validate body: `lang` bắt buộc ∈ {zh, en}; `maxCards` tuỳ chọn, mặc định `SRS_SESSION_MAX_CARDS`, từ chối `> 20` với HTTP 400
  - [ ] 16.2 Gọi `buildSession()` → `{ ok, data: { sessionId, lang, cardIds, total, dueCount, newCount, startedAt, resumed } }`
  - [ ] 16.3 Không có thẻ nào để học → HTTP 404 `{ code: 'NO_CARD' }`
  - [ ] 16.4 Integration test: `cardIds.length ≤ 20`; `dueCount` thẻ đến hạn nằm trước `newCount` thẻ mới trong mảng

- [ ] 17. Tạo `src/app/api/srs/next/route.ts` — `GET /api/srs/next`
  - [ ] 17.1 Query `lang` bắt buộc, `sessionId` tuỳ chọn
  - [ ] 17.2 Nếu có `sessionId` → đọc `SrsSession`, lấy `cardIds[index]`; nếu không có → `buildSession()` rồi lấy `cardIds[0]`
  - [ ] 17.3 Trả `{ ok, data: { sessionId, card, index, total, startedAt, preview } }` với `preview` đủ 4 mức `1..4`
  - [ ] 17.4 Tính `showHanzi` (zh: toggle người dùng hoặc fallback TTS) và `showHint` (en: `now - createdAt < 14 ngày` hoặc `reps === 0`; zh: luôn `true`)
  - [ ] 17.5 Không còn thẻ → HTTP 404 `{ code: 'NO_CARD' }` (UI hiện "Đã ôn xong hôm nay")
  - [ ] 17.6 Integration test: `preview` có đủ 4 key; `label` khớp `formatInterval(intervalMinutes)`

- [ ] 18. Tạo `src/app/api/srs/grade/route.ts` — `POST /api/srs/grade`
  - [ ] 18.1 Validate body: `cardId` bắt buộc, `rating` bắt buộc ∈ {1,2,3,4}, `sessionId` tuỳ chọn, `elapsedMs` tuỳ chọn
  - [ ] 18.2 Gọi `gradeCard()` trong 1 transaction
  - [ ] 18.3 Trả `{ ok, data: { card, index, total, nextPreview, sessionCompleted } }`
  - [ ] 18.4 Thẻ không tồn tại → HTTP 404 `{ code: 'CARD_NOT_FOUND' }`
  - [ ] 18.5 Chấm trùng trong 3s → HTTP 409 `{ code: 'DUPLICATE_GRADE' }`
  - [ ] 18.6 `rating` ngoài 1–4 → HTTP 400
  - [ ] 18.7 Integration test: sau khi chấm `Good` trên thẻ mới → `cardState` khớp `scheduler.next`; `Review` có 1 bản ghi; `SrsSession.reviewedCount` tăng 1

- [ ] 19. Tạo middleware xử lý lỗi chung cho route SRS
  - [ ] 19.1 Map `SrsError.code` → HTTP status (404, 409, 400)
  - [ ] 19.2 Trả `{ ok: false, error: { code, message } }` với message **tiếng Việt**
  - [ ] 19.3 Không log stack trace ra response; log server-side bằng `console.error` kèm route

---

## 6. Web Speech API (TTS)

- [ ] 20. Tạo `src/components/language/use-speech.ts`
  - [ ] 20.1 Khai báo `SpeechLang = 'zh-CN' | 'en-US'`, `SpeechStatus = 'checking' | 'ready' | 'fallback'`
  - [ ] 20.2 Kiểm tra `('speechSynthesis' in window)` → nếu không có thì `status = 'fallback'`
  - [ ] 20.3 Gọi `getVoices()` ngay + lắng nghe event `voiceschanged` + timeout 1500ms (design.md T7)
  - [ ] 20.4 Khớp voice theo thứ tự: exact `zh-CN` → prefix `zh` → coi như không có
  - [ ] 20.5 `speak(text, lang, { rate })` — `rate = 0.8` cho `zh-CN`, `1.0` cho `en-US`; `cancel()` trước khi nói
  - [ ] 20.6 Gán `utterance.voice` = voice khớp nếu có
  - [ ] 20.7 `utterance.onerror` → set `lastError` (phân biệt `not-allowed` = bị trình duyệt chặn)
  - [ ] 20.8 `shouldForceHanzi = lang === 'zh-CN' && status === 'fallback'` (R5)
  - [ ] 20.9 Cleanup: `removeEventListener` + `clearTimeout` trong `useEffect` return

- [ ] 21. Unit test `use-speech.ts` (Vitest + jsdom, mock `window.speechSynthesis`)
  - [ ] 21.1 Không có voice `zh-CN` → `status = 'fallback'`, `shouldForceHanzi = true`
  - [ ] 21.2 Có voice `zh-CN` → `status = 'ready'`, `shouldForceHanzi = false`
  - [ ] 21.3 `speak()` gọi `speechSynthesis.speak` với `lang` đúng và `rate` đúng
  - [ ] 21.4 `onerror` → `lastError` khác null

---

## 7. UI — S09 Trung tâm Ôn tập (`/language`)

- [ ] 22. Tạo `src/app/language/page.tsx` (Server Component)
  - [ ] 22.1 Wrapper `p-margin-lg space-y-gutter-lg max-w-[1600px] mx-auto w-full`
  - [ ] 22.2 Gọi `getLanguageStats()` và truyền xuống component
  - [ ] 22.3 Render thứ tự: header → 2 deck card + session CTA → group grid → bảng thẻ (8 cols) + panel chỉ số (4 cols)
  - [ ] 22.4 Không có dữ liệu → render empty state "Chưa có thẻ nào — chạy seed 140 thẻ" + lệnh `npx prisma db seed`
  - [ ] 22.5 Bọc phần cần `useSearchParams` vào `<Suspense>` để không lỗi build static

- [ ] 23. Tạo `src/components/language/language-hub-header.tsx`
  - [ ] 23.1 Chip `FR-LG-01` (`bg-primary/10 text-primary`) + chip "Mô-đun Trí nhớ Dài hạn" (`text-outline uppercase tracking-wider`) + chấm ping `bg-primary animate-ping`
  - [ ] 23.2 Chip thuật toán lấy **version thật** từ `scheduler.definition.model.name` — **không** hardcode "v4.5"
  - [ ] 23.3 Chip "SQLite Cục bộ (Offline)"
  - [ ] 23.4 Tiêu đề `font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight` → "Trung Tâm Ôn Tập Ngoại Ngữ SRS"
  - [ ] 23.5 Mô tả `font-body-sm text-body-sm text-on-surface-variant`
  - [ ] 23.6 Nút "Xuất Deck JSON" (icon `file_download` 18px `text-primary`) → `GET /api/language/cards?format=json`
  - [ ] 23.7 Nút "Thêm thẻ thủ công" (icon `add_box` 18px `text-tertiary`) → mở `AddCardDialog`

- [ ] 24. Tạo `src/components/language/deck-card.tsx`
  - [ ] 24.1 Card `rounded-xl bg-surface-container p-space-lg shadow-md` (deck active) / `bg-surface-container-low opacity-90` (deck inactive)
  - [ ] 24.2 Badge ngôn ngữ `w-8 h-8 rounded-lg bg-primary/10 text-primary` (zh) / `bg-secondary/10 text-secondary` (en)
  - [ ] 24.3 Tên `font-headline-sm text-headline-sm font-semibold text-on-surface`, mô tả `font-label-sm text-on-surface-variant`
  - [ ] 24.4 Chip streak `px-2 py-0.5 rounded bg-tertiary/10 text-tertiary font-bold` + icon `local_fire_department` 14px → số ngày
  - [ ] 24.5 Grid 3 metric `grid-cols-3 gap-2 p-space-sm rounded-lg bg-surface-container-lowest/80`: Đang học / Đã thuộc (`text-primary`) / Đến hạn (`text-error` + đơn vị `text-error/80`)
  - [ ] 24.6 Hàng trạng thái + tỷ lệ nạp (`text-primary` / `text-secondary` `font-semibold`)
  - [ ] 24.7 Chữ watermark `中` / `EN` (`text-surface-container-highest/20 text-[96px]`) tuyệt đối `pointer-events-none`
  - [ ] 24.8 Click deck → set filter `lang` ở bảng thẻ; click "Bắt đầu" → `/language/session?lang=<lang>`

- [ ] 25. Tạo `src/components/language/session-cta.tsx`
  - [ ] 25.1 Nền `bg-gradient-to-br from-surface-container to-surface-container-high p-space-lg rounded-xl`
  - [ ] 25.2 Nhãn "HÔM NAY CẦN XỬ LÝ" `bg-primary/20 text-primary uppercase font-bold tracking-wider`
  - [ ] 25.3 Ước tính thời gian "Ước tính ~6 phút" (ước tính = `total × 20s`)
  - [ ] 25.4 Số thẻ đến hạn tổng **cả 2 ngôn ngữ**
  - [ ] 25.5 Nút lớn `w-full py-3.5 px-4 rounded-lg bg-primary hover:brightness-105 active:scale-[0.98] text-on-primary font-headline-sm font-bold` + icon `play_arrow` 24px
  - [ ] 25.6 Không có thẻ đến hạn → nhãn "Hôm nay không có thẻ đến hạn" + nút phụ "Ôn sớm 5 thẻ"

- [ ] 26. Tạo `src/components/language/group-grid.tsx`
  - [ ] 26.1 Header: icon `dataset text-primary` 20px + "6 Nhóm Từ Vựng Cốt Lõi Level 0" `font-headline-md` + chip "Phụ lục B · HSK1 / CEFR A1 Pre"
  - [ ] 26.2 Grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter`
  - [ ] 26.3 Card nhóm `p-space-md rounded-xl bg-surface-container shadow-sm`; nhóm có lapse → `bg-surface-container-high`
  - [ ] 26.4 Chip "CỤM 0N" theo trạng thái: `bg-primary/10 text-primary` / `bg-tertiary/10 text-tertiary` / `bg-surface-container-highest text-on-surface-variant` / `bg-secondary-container/40 text-secondary`
  - [ ] 26.5 Badge % thuộc: `text-primary` (≥90) / `text-tertiary` (60–89) / `text-on-surface-variant` (<60)
  - [ ] 26.6 Tên nhóm `font-headline-sm font-bold text-on-surface`; từ khóa `font-body-sm text-on-surface-variant`
  - [ ] 26.7 Dòng dưới: số thẻ + `S = …d` (`font-mono text-primary` / `text-outline`)
  - [ ] 26.8 Thanh tiến độ `w-full h-1.5 bg-surface-container-lowest rounded-full` + fill (`bg-primary` / `bg-tertiary` / `bg-primary-fixed-dim` / `bg-secondary`)
  - [ ] 26.9 Nhóm có lapse → dòng cảnh báo `text-error` + chấm `bg-error`
  - [ ] 26.10 Click nhóm → lọc bảng thẻ theo `group`

- [ ] 27. Tạo `src/components/language/card-table.tsx` (Client Component)
  - [ ] 27.1 Tiêu đề "Kho Thẻ Từ Vựng & Chỉ Số FSRS" + chip tổng số thẻ `bg-surface-container px-2.5 py-1 rounded text-outline`
  - [ ] 27.2 Ô tìm kiếm `bg-surface-container-lowest ... pl-10 pr-4 py-2 rounded-lg` + icon `search` `text-outline`; debounce 250ms
  - [ ] 27.3 5 filter chip: active `bg-primary text-on-primary font-bold`; inactive `bg-surface-container text-on-surface-variant`; chip Lapse `text-error hover:bg-error-container/30`
  - [ ] 27.4 Bảng 7 cột: Mặt Trước (Target) · Mặt Sau (Nghĩa) · Stability (S) · Diff (D) · Reps · Lapses · Hạn ôn kế tiếp
  - [ ] 27.5 Header `bg-surface-container-high/60 text-outline font-label-sm uppercase tracking-wider`
  - [ ] 27.6 Dòng `hover:bg-surface-container/60`; chấm trạng thái `w-2 h-2 rounded-full` (`bg-error` / `bg-tertiary` / `bg-primary` / `bg-secondary`)
  - [ ] 27.7 Cột S/D/Reps/Lapses dùng `font-mono` + `tabular-nums`; Lapses > 0 → `text-error font-bold`
  - [ ] 27.8 Badge hạn ôn: đến hạn `bg-error-container/40 text-error`; tương lai `font-label-sm text-outline` → "18 ngày nữa"
  - [ ] 27.9 Phân trang: "Hiển thị 6 / 55 thẻ…", nút `‹ Trước` / `Sau ›` (`px-2 py-1 rounded bg-surface-container`), số trang `text-on-surface font-bold`
  - [ ] 27.10 Bọc bảng trong `overflow-x-auto rounded-lg bg-surface-container-lowest`
  - [ ] 27.11 Lọc không kết quả → "Không có thẻ nào khớp bộ lọc" + nút "Xoá bộ lọc"

- [ ] 28. Tạo `src/components/language/fsrs-telemetry-panel.tsx`
  - [ ] 28.1 Header icon `insights text-primary` + "Chỉ Số Ghi Nhớ FSRS" + chip "Mục tiêu 90%"
  - [ ] 28.2 Ô retention: nhãn `font-label-sm text-outline` + số `font-display text-[40px] leading-none font-bold text-primary` + delta `▲ +…%` `text-primary`
  - [ ] 28.3 Biểu đồ SVG đường cong R(t) — Ebbinghaus `text-outline/40` đường nét đứt, 4 nhịp FSRS `text-primary` 2px, nhịp review `text-tertiary` nét đứt, chấm hiện tại `fill-primary animate-pulse`
  - [ ] 28.4 Nhãn trục: "Lần 1" · "Lần 2 (+3d)" · "Lần 3 (+8d)" · "Hiện tại (S=18d)"
  - [ ] 28.5 Grid tham số 2 cột `p-2 rounded bg-surface-container-lowest`: Request Retention · Maximum Interval · W-Vector (số tham số) · Decay — đọc từ `FSRS_CONFIG` **runtime**
  - [ ] 28.6 Khối khuyến nghị (rule-based, **không AI**): icon `lightbulb text-tertiary`, nêu nhóm có nhiều thẻ trượt + link tới bài luyện liên quan
  - [ ] 28.7 Link "Mở bài luyện ngữ cảnh liên quan" `text-primary hover:underline` → `/speak/write` (S07)

- [ ] 29. Tạo `src/components/language/add-card-dialog.tsx`
  - [ ] 29.1 Overlay `bg-surface-container` + `backdrop-blur-md` + viền `rgba(148,163,184,0.16)`
  - [ ] 29.2 Form: `lang` (select zh/en), `group` (select động theo `LANG_GROUPS[lang]`), `mode` (select recognize/recall/produce), `front`, `frontAlt`, `back`, `note`, `example`, `examplePinyin`, `hint`
  - [ ] 29.3 Input `bg-surface-container-lowest text-on-surface font-body-md px-3 py-2 rounded-lg` + focus `focus-visible:ring-2 focus-visible:ring-primary`
  - [ ] 29.4 Nút lưu `bg-primary-container text-on-primary font-label-md` → `POST /api/language/cards`
  - [ ] 29.5 Hiển thị lỗi Zod server trả về (tiếng Việt) ngay dưới field liên quan
  - [ ] 29.6 Đóng modal bằng `Escape` + click ngoài; focus trap; `aria-modal="true"`
  - [ ] 29.7 Thành công → đóng modal, refresh danh sách thẻ, toast "Đã thêm thẻ"

- [ ] 30. Test UI S09
  - [ ] 30.1 Render test: 2 deck card hiện đúng 3 số + streak; 6 card nhóm; bảng 7 cột
  - [ ] 30.2 Filter chip đổi danh sách mà không reload trang
  - [ ] 30.3 Search debounce gọi API đúng 1 lần sau 250ms
  - [ ] 30.4 390px: bảng cuộn ngang, không phá layout; deck card xếp 1 cột

---

## 8. UI — S10 Phiên ôn (`/language/session`)

- [ ] 31. Tạo `src/app/language/session/page.tsx` (Client Component)
  - [ ] 31.1 Wrapper `p-gutter-lg max-w-7xl mx-auto w-full space-y-gutter-lg`
  - [ ] 31.2 Đọc `lang` từ `useSearchParams` (mặc định `zh`); `useSearchParams` bọc trong `Suspense`
  - [ ] 31.3 State: `view`, `flipped`, `submitting`, `showHanzi`, `showHint`, `paused`, `elapsedSeconds`
  - [ ] 31.4 Gọi `POST /api/srs/session` khi mở (nếu chưa có `sessionId`), sau đó `GET /api/srs/next`
  - [ ] 31.5 Xử lý `404 NO_CARD` → render màn hình "Đã ôn xong hôm nay" + CTA về `/language`
  - [ ] 31.6 Grid `grid-cols-1 lg:grid-cols-12 gap-gutter-lg`; cột trái `lg:col-span-8`, sidebar `lg:col-span-4`

- [ ] 32. Tạo `src/components/language/flashcard-review.tsx`
  - [ ] 32.1 Nền `bg-surface-container-low rounded-xl p-space-xl shadow-md min-h-[460px]` + glow `absolute -top-24 -right-24 w-60 h-60 bg-secondary/5 rounded-full blur-3xl pointer-events-none`
  - [ ] 32.2 Header: nhãn "Kích hoạt gợi nhớ (Active Recall)" `font-label-sm text-on-surface-variant uppercase tracking-wider` + icon `memory text-outline`
  - [ ] 32.3 Nút toggle hanzi `px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high` + icon `visibility` 14px → nhãn đổi "Hiện chữ Hán Hanzi" ↔ "Ẩn chữ Hán Hanzi"
  - [ ] 32.4 Mặt trước: pinyin `font-headline-lg text-headline-lg text-primary tracking-wide` + nút nghe `w-10 h-10 rounded-full bg-primary-container/20 text-primary hover:bg-primary-container hover:text-on-primary` icon `volume_up` 22px
  - [ ] 32.5 Hanzi (tuỳ chọn) `text-4xl text-on-surface font-semibold tracking-wider px-4 py-1.5 rounded-lg bg-surface-container`
  - [ ] 32.6 Phiên âm Việt (en) `font-code-md text-code-md text-tertiary`
  - [ ] 32.7 Câu hỏi gợi nhớ `font-body-lg text-body-lg text-on-surface-variant max-w-md`
  - [ ] 32.8 Box gợi ý `w-full max-w-lg p-space-md rounded-lg bg-surface-container` + icon `lightbulb text-tertiary` + nội dung `font-body-sm text-on-surface-variant`
  - [ ] 32.9 Mặt sau `bg-surface-container-high/60 -mx-space-xl -mb-space-xl p-space-xl rounded-b-xl` + class `animate-fadeIn`
  - [ ] 32.10 Mặt sau: hanzi `text-3xl font-bold text-on-surface` + nghĩa `font-headline-sm text-headline-sm text-primary font-medium`
  - [ ] 32.11 Badge S `px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm` → "Tính ổn định FSRS: S=4.2d"
  - [ ] 32.12 Ví dụ câu `p-space-md rounded-lg bg-surface-container` + nhãn "Mẫu câu thực tế" `text-outline uppercase tracking-wider` + nút "Nghe câu" (icon `volume_up` 16px)
  - [ ] 32.13 Pinyin ví dụ `font-code-md text-code-md text-on-surface-variant`; bản dịch `font-body-sm text-body-sm text-on-surface`
  - [ ] 32.14 Ghi chú: icon `info text-tertiary` + `font-body-sm text-on-surface-variant`
  - [ ] 32.15 Hàng nút (chưa lật): "Xem gợi ý ngữ cảnh" (ghost, icon `lightbulb text-tertiary`) + "Lật thẻ xem đáp án" (`bg-primary-container text-on-primary font-headline-sm font-semibold`, icon `flip`) + chip `Space` `px-1.5 py-0.5 rounded bg-on-primary/20 font-code-md`
  - [ ] 32.16 Khi lật → ẩn hàng nút, hiện `FsrsGradeBar`
  - [ ] 32.17 Khi `submitting` → thẻ `opacity-40 scale-[0.99]`, disable nút
  - [ ] 32.18 `aria-live="polite"` cho thông báo trạng thái (đang lưu / đã lưu / lỗi)

- [ ] 33. Tạo `src/components/language/fsrs-grade-bar.tsx`
  - [ ] 33.1 Header "Đánh giá khả năng hồi tưởng (FSRS Schedule)" `font-label-sm text-outline uppercase tracking-wider` + "Phím tắt: [1] [2] [3] [4]" `text-secondary`
  - [ ] 33.2 Grid `grid-cols-2 sm:grid-cols-4 gap-space-sm` (2×2 ở mobile — NFR-LG-01)
  - [ ] 33.3 Nút: `p-space-md rounded-lg bg-surface-container active:scale-[0.98]` + hover đổi nền theo mức (`hover:bg-error-container/30` / `hover:bg-tertiary-container/30` / `hover:bg-primary-container/20` / `hover:bg-secondary-container/40`)
  - [ ] 33.4 Nhãn mức `font-headline-sm text-headline-sm font-semibold` + màu (`text-error` / `text-tertiary` / `text-primary` / `text-secondary`)
  - [ ] 33.5 Chip phím `text-xs px-1 rounded bg-<màu>/15 font-code-md` → `1` `2` `3` `4`
  - [ ] 33.6 Nhãn khoảng cách `font-label-sm text-label-sm text-on-surface-variant group-hover:text-<màu>` — lấy **nguyên văn** `preview[rating].label`
  - [ ] 33.7 `visible = false` khi chưa lật thẻ → không render thanh chấm

- [ ] 34. Tạo `src/components/language/session-stats-sidebar.tsx`
  - [ ] 34.1 Card "Thống kê phiên" `bg-surface-container-low rounded-xl p-space-lg shadow-sm` + icon `analytics text-outline`
  - [ ] 34.2 Grid 3 ô `grid-cols-3 gap-space-sm text-center`, ô `p-space-sm rounded-lg bg-surface-container`, số `font-headline-md font-bold` (`text-primary` / `text-tertiary` / `text-error`), nhãn `font-label-sm text-on-surface-variant`
  - [ ] 34.3 Vùng retention `p-space-md rounded-lg bg-surface-container` + nhãn + số `text-primary font-semibold` + sparkline SVG `text-primary` + fill `text-primary/10`
  - [ ] 34.4 Panel "Phím tắt thao tác nhanh" `bg-surface-container-low rounded-xl p-space-lg` + icon `keyboard text-secondary`
  - [ ] 34.5 4 dòng phím: `Space` · `R` · `1 / 2 / 3 / 4` · `H` — kbd `px-2 py-0.5 rounded bg-surface-container text-on-surface font-code-md text-label-sm`
  - [ ] 34.6 Badge Web Speech API `bg-surface-container-low rounded-xl p-space-md` + icon tròn `w-8 h-8 rounded-full bg-primary/10 text-primary` (`graphic_eq`) + nhãn `font-label-md font-semibold` + chấm trạng thái (`bg-primary` ready / `bg-tertiary` fallback / `bg-error` lỗi)
  - [ ] 34.7 Khi `status = 'fallback'` → nhãn "Web Speech: fallback pinyin + hanzi" + text giải thích

- [ ] 35. Tạo `src/components/language/use-keyboard-shortcuts.ts`
  - [ ] 35.1 Lắng nghe `keydown` trên `window`
  - [ ] 35.2 Bỏ qua khi focus ở `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`
  - [ ] 35.3 `Space` → `onFlip` (chặn `preventDefault`)
  - [ ] 35.4 `KeyR` → `onSpeak` · `KeyH` → `onHint`
  - [ ] 35.5 `Digit1..4` / `Numpad1..4` → `onGrade(rating)` — **chỉ** khi `enabled` (đã lật thẻ)
  - [ ] 35.6 Cleanup `removeEventListener` trong `useEffect` return
  - [ ] 35.7 Không kích hoạt khi `submitting` hoặc phiên tạm dừng

- [ ] 36. Tạo header + timer của S10
  - [ ] 36.1 Badge ngôn ngữ `px-2.5 py-1 rounded bg-secondary-container/40 text-secondary font-label-sm uppercase tracking-wider` + icon `translate` 14px
  - [ ] 36.2 Badge nhóm `px-2.5 py-1 rounded bg-surface-container text-on-surface-variant font-label-sm`
  - [ ] 36.3 Badge FSRS `px-2.5 py-1 rounded bg-primary/10 text-primary` + chấm `w-1.5 h-1.5 rounded-full bg-primary animate-pulse`
  - [ ] 36.4 Chấm tròn tiến trình: đã ôn `text-primary`, chưa `text-surface-variant`; text `{index}/{total} thẻ` `font-label-md text-on-surface-variant`
  - [ ] 36.5 Timer `px-3 py-1.5 rounded-lg bg-surface-container font-label-sm` + icon `timer text-tertiary` → "Thời lượng: 04:18" (tính từ `startedAt`, không đếm tick)
  - [ ] 36.6 Nút tạm dừng `p-2 rounded-lg bg-surface-container text-on-surface-variant` icon `pause` 18px + `aria-label="Tạm dừng phiên"`
  - [ ] 36.7 Overlay tạm dừng `bg-surface-container/95` → "Phiên đã tạm dừng" + nút "Tiếp tục" + "Kết thúc phiên"

- [ ] 37. Tích hợp luồng chấm trong S10
  - [ ] 37.1 Bấm nút chấm hoặc phím → `POST /api/srs/grade` với `cardId`, `rating`, `sessionId`
  - [ ] 37.2 Hiện trạng thái "Đang lưu…" (disable nút) rồi chuyển thẻ kế tiếp
  - [ ] 37.3 Lỗi 409 → giữ nguyên thẻ hiện tại, hiện toast "Thẻ này vừa được chấm"
  - [ ] 37.4 Lỗi khác → hiện toast + nút "Thử lại"
  - [ ] 37.5 `sessionCompleted` → render màn hình "Đã ôn xong hôm nay" + số liệu phiên + CTA "Về trung tâm ôn tập" + gợi ý "Ôn sớm hơn 1 ngày sẽ giữ nhịp"
  - [ ] 37.6 Reset trạng thái thẻ khi chuyển thẻ: `flipped = false`, `showHanzi = false`, `showHint = true`

- [ ] 38. Xử lý TTS fallback R5 trong S10
  - [ ] 38.1 `speech.status === 'fallback'` và `lang === 'zh'` → `showHanzi` bật cưỡng chế (không cho tắt)
  - [ ] 38.2 Ẩn nút nghe khi fallback
  - [ ] 38.3 Badge sidebar chuyển sang trạng thái fallback
  - [ ] 38.4 Nút nghe ở mặt sau cũng ẩn
  - [ ] 38.5 Với `lang === 'en'` và fallback → giữ phiên âm Việt hiển thị làm kênh đọc thay thế

---

## 9. Kiểm thử & nghiệm thu

- [ ] 39. Unit test hoàn chỉnh
  - [ ] 39.1 `src/lib/__tests__/fsrs.test.ts` — chạy xanh
  - [ ] 39.2 `src/lib/__tests__/srs.test.ts` — chạy xanh
  - [ ] 39.3 `src/lib/__tests__/dates.test.ts` — chạy xanh
  - [ ] 39.4 `src/components/language/__tests__/use-speech.test.tsx` — chạy xanh
  - [ ] 39.5 Tổng coverage `src/lib/fsrs.ts` + `src/lib/srs.ts` ≥ 90%

- [ ] 40. Integration test API
  - [ ] 40.1 `GET /api/language` — số khớp DB
  - [ ] 40.2 `GET /api/language/cards` — filter `status` × `group` × `q` × phân trang
  - [ ] 40.3 `GET /api/language/cards?format=json` — file JSON hợp lệ, đủ 140 thẻ
  - [ ] 40.4 `POST /api/language/cards` — hợp lệ / sai `group` / trùng
  - [ ] 40.5 `POST /api/srs/session` — ≤ 20 thẻ; `due` trước `new`; resume
  - [ ] 40.6 `GET /api/srs/next` — `preview` đủ 4 mức; `showHanzi`/`showHint` đúng
  - [ ] 40.7 `POST /api/srs/grade` — 4 mức rating; `Review` ghi đúng; đồng bộ `cardState` ↔ cột; 409 khi trùng
  - [ ] 40.8 Đổi `lang` giữa phiên → phiên cũ `abandoned`, phiên mới không chứa id thẻ cũ

- [ ] 41. E2E theo AC (Playwright) — `e2e/srs-language.spec.ts`
  - [ ] 41.1 **AC-LG-1** — thẻ mới chấm Good → `cardState` khớp `scheduler.next`; chấm Again → `lapses` +1, `due` hôm nay; nhãn 4 nút khớp `preview` API
  - [ ] 41.2 **AC-LG-2** — 12 đến hạn + 30 mới → 12 thẻ đầu là thẻ đến hạn
  - [ ] 41.3 **AC-LG-3** — 40 đến hạn → `total = 20`, hiện "1/20 thẻ"
  - [ ] 41.4 **AC-LG-4** — hết thẻ đến hạn → lấy thẻ mới nhóm chưa học; hết cả hai → "Đã ôn xong hôm nay"
  - [ ] 41.5 **AC-LG-5** — thẻ zh: pinyin + nút nghe; hanzi chỉ hiện khi bật toggle; lật thẻ → hanzi + nghĩa + ví dụ + nút nghe
  - [ ] 41.6 **AC-LG-6** — deck zh hiện 24/18/12, deck en hiện 31/22/9; streak zh = 3, en = 1
  - [ ] 41.7 **AC-LG-7** — `prisma db seed` → 70 + 70 thẻ, 6 nhóm × 10 từ + 10 mẫu câu mỗi ngôn ngữ; grep xác nhận seed không import Anthropic SDK
  - [ ] 41.8 **AC-LG-8** — mock `speechSynthesis` không có voice `zh-CN` → badge fallback, hanzi bật cưỡng chế, 4 nút vẫn chấm được
  - [ ] 41.9 **AC-LG-9** — ôn 3 lượt → reload → cùng `sessionId`, `index = 3`
  - [ ] 41.10 **AC-LG-10** — đổi `lang` → phiên mới không chứa id thẻ cũ; dữ liệu đã ôn còn nguyên
  - [ ] 41.11 **AC-LG-11** — thêm thẻ thủ công thành công; `group` sai → thông báo tiếng Việt, DB không đổi
  - [ ] 41.12 **AC-LG-12** — export JSON có 140 thẻ + `cardState` + reviews; import vào DB trống → cùng `due`/`stability`
  - [ ] 41.13 **AC-LG-13** — `setOffline(true)` → mở S09, ôn 5 thẻ, thêm thẻ → tất cả thành công, không request ra ngoài
  - [ ] 41.14 **AC-LG-14** — 390px: 4 nút 2×2; icon có `aria-label`; `aria-keyshortcuts` đúng; focus ở ô tìm kiếm thì phím tắt không kích hoạt
  - [ ] 41.15 Phím tắt: `Space` lật thẻ, `R` phát âm (mock), `H` gợi ý, `1`–`4` chấm

- [ ] 42. A11y & responsive
  - [ ] 42.1 Chạy axe trên `/language` và `/language/session` — 0 lỗi nghiêm trọng
  - [ ] 42.2 Kiểm tra tương phản WCAG AA cho `outline` trên `surface-container` và `on-surface-variant` trên `surface-container-low`
  - [ ] 42.3 Kiểm tra focus ring `focus-visible:ring-2 focus-visible:ring-primary` trên mọi input/button
  - [ ] 42.4 Kiểm tra thứ tự tab hợp lý trên S10 (nút nghe → toggle → gợi ý → lật → 4 nút chấm)
  - [ ] 42.5 Kiểm tra ở 390px / 768px / 1280px không có tràn ngang ngoài ý muốn

- [ ] 43. Kiểm tra offline & không phụ thuộc ngoài
  - [ ] 43.1 Xác nhận không có request ra ngoài domain trong toàn bộ luồng S09/S10
  - [ ] 43.2 Xác nhận không có CDN audio/TTS bên ngoài — chỉ `speechSynthesis`
  - [ ] 43.3 Xác nhận thiếu `ANTHROPIC_API_KEY` không ảnh hưởng feature này
  - [ ] 43.4 Xác nhận không có bản ghi `AiCall` nào được tạo khi dùng S09/S10

---

## 10. Nghiệm thu & tài liệu

- [ ] 44. Checklist nghiệm thu feature
  - [ ] 44.1 Chạy lại toàn bộ AC-LG-1 → AC-LG-14 trên DB seed sạch, lưu kết quả
  - [ ] 44.2 Đối chiếu mọi FR-LG-01..05, FR-LG-09, FR-LG-10 trong `spec.md` §3 với implementation — lập bảng trace
  - [ ] 44.3 Đối chiếu NFR-01..08 của SPEC §6 (đặc biệt NFR-05 ngôn ngữ, NFR-07 không phụ thuộc ngoài)
  - [ ] 44.4 Xác nhận không sửa file ngoài phạm vi feature (chỉ 3 file `.kiro/specs/srs-language-review/` + code được phép theo task)
  - [ ] 44.5 Ghi nhận **mâu thuẫn Phase** trong PR description: SPEC §3.1 = Phase 0 vs SPEC §7 = Phase 1; feature chọn Phase 1 (xem `spec.md` §0)
  - [ ] 44.6 Ghi nhận 2 model mới (`SrsSession`, `LanguagePattern`) cần đồng bộ vào `system-design/SPEC.md` §4 ở lần cập nhật tiếp theo
  - [ ] 44.7 Ghi nhận các sai lệch seed D1–D3 (`spec.md` §7.5) cần người biết ngôn ngữ ký duyệt
  - [ ] 44.8 Xác nhận seed là **file tĩnh**, không gọi AI (R6) — dẫn chứng: grep + test 39/41.7

## 45. Trình độ thật & 3 ngôn ngữ (Q2·Q3)

- [ ] 45.1 Tạo `src/lib/levels.ts` (dùng chung với `settings-cost`): `LEVELS`, `LEVEL_LABELS`, `LEVEL_ORDER` = `zero·A1·A2·B1·B2·C1·C2`
- [ ] 45.2 Seed 60 thẻ **tiếng Anh A1** — rút gọn về 'vài từ cơ bản': pronouns, numbers 1–10, days, greetings, `I am / My name is / I like / I want`
- [ ] 45.3 Seed 60 thẻ **tiếng Anh A2** (dùng cho `placement` khi ước lượng ≥ A2)
- [ ] 45.4 Seed 60 thẻ **tiếng Trung zero** (như Phụ lục B) + 60 thẻ **tiếng Trung A1**
- [ ] 45.5 Ghi `Card.group` = `"zero" | "A1" | "A2"` để lọc band khi sinh bài kiểm tra (FR-LT-01)
- [ ] 45.6 S09 chỉ hiển thị 2 deck SRS (`en` · `zh`) — `vi` **không** có deck, không xuất hiện
- [ ] 45.7 Hiện mức hiện tại theo CEFR ở S09: EN seed A1, ZH seed zero
- [ ] 45.8 Test: seed xong → 240 thẻ (4 deck × 60), `Card.group` đúng band
- [ ] 45.9 Test: `/api/srs/next?lang=vi` → trả danh sách rỗng + thông báo 'Tiếng Việt không có deck SRS'
