---
inclusion: always
---

# Steering — Tech (Daily Loop OS)

## 1. Stack

| Lớp | Chọn | Bắt buộc |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Server Component mặc định; Client Component chỉ khi cần tương tác. |
| Ngôn ngữ | **TypeScript** | `strict: true`. Không `any` trong `src/lib` và `src/app/api`. |
| Styling | **Tailwind CSS v4** | Chỉ dùng token trong `.kiro/steering/design-system.md`. Không hardcode hex trong component. |
| ORM | **Prisma + SQLite** | `DATABASE_URL="file:./dev.db"`. Không dùng DB server. |
| AI | **Anthropic SDK (`@anthropic-ai/sdk`)** | Model: `claude-opus-5` (chấm/sinh/role-play) · `claude-haiku-4-5` (phân loại/trích xuất). |
| SRS | **FSRS (`ts-fsrs`)** | State lưu JSON trong `Card.cardState`. |
| Speech | **Web Speech API** | `speechSynthesis` (TTS) + `SpeechRecognition` (STT). Không dịch vụ trả phí. |

## 2. Biến môi trường

```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=sk-ant-...     # tuỳ chọn — thiếu thì app chạy offline mode
```

- API key lưu `.env.local`, **không commit**, không hiển thị đầy đủ trong UI (chỉ `sk-…abcd`).
- Thiếu `ANTHROPIC_API_KEY` → app **không crash**: chế độ offline (xem §5).

## 3. Data model (Prisma) — nguồn chân lý

15 model. Bảng trung tâm là `Activity` — **không tách theo domain** (điều kiện để FR-PS-05 tương quan được bằng 1 truy vấn SQL).

| Nhóm | Model | Ghi chú |
|---|---|---|
| Cây kỹ năng | `Skill` | Tự tham chiếu `parentId`/`children` (relation "SkillTree"). `level` 0–5 **chỉ tăng qua Evidence**. |
| Trung tâm | `Activity` | `domain`, `type`, `minutes`, `quality` 1–5, `aiScore`. |
| Bằng chứng | `Evidence` | `rating` 1–4. `onDelete: Cascade`. `@@index([skillId])`. |
| Nhật ký | `Reflection` | `activityId` unique. `prompt`/`answer`/`aiFeedback`. |
| Kế hoạch | `PlanItem` | `date` chuẩn hoá 00:00 local. `slot` 0–5. `source`: `ai` \| `manual` \| `fallback`. |
| SRS | `Card`, `Review` | `cardState` JSON (FSRS). `due`, `stability`, `difficulty`, `reps`, `lapses`. `@@index([lang, due])`. |
| Cá nhân | `DailyState` | `date` unique. mood/energy/focus 1–5, `sleep` giờ. |
| Hồ sơ | `UserProfile` | `aiTone` = `direct` \| `coach` \| `gentle`. `learningLangs` = `"zh,en"`. |
| Chi phí | `AiCall` | `feature`, `model`, `inputTokens`, `outputTokens`, `cacheRead`, `cacheWrite`, `estimatedCost`, `ok`, `error`. |
| Mock Interview | `InterviewProfile`, `InterviewSession`, `InterviewTurn` | `scores` JSON theo rubric. |
| Bài kiểm tra | `TestSession`, `TestItem` | `itemType`, `cardId` (liên kết SRS), `errorGroups` JSON. |

Schema đầy đủ: `system-design/SPEC.md` §4.

## 4. AI layer

### 4.1 Routing model

| Mã | Tính năng | Model | Streaming | Effort | Output |
|---|---|---|---|---|---|
| AI-01 | Sinh kế hoạch ngày | `claude-opus-5` | Có | medium | Structured 6 slot |
| AI-02 | Quick-log autofill | `claude-haiku-4-5` | Không | low | Structured |
| AI-03/04 | Chấm giao tiếp (viết/nói) | `claude-opus-5` | Có | medium | Structured rubric |
| AI-05 | Phản hồi nhật ký | `claude-opus-5` | Có | low | Structured: tóm tắt + 1 câu hỏi |
| AI-06 | Phân loại nhật ký | `claude-haiku-4-5` | Không | low | Structured |
| AI-07 | Báo cáo tuần | `claude-opus-5` | Có | high | Structured: 3 nhận định + 6 slot |
| AI-08 | Role-play ngoại ngữ | `claude-opus-5` | Có | medium | Text |
| AI-09 | Sửa lỗi bài viết ngoại ngữ | `claude-opus-5` | Có | medium | Structured 4 nhóm lỗi |
| AI-10 | Sinh flashcard từ bài viết | `claude-haiku-4-5` | Không | low | Structured mảng thẻ |
| AI-11 | Sinh câu hỏi mock interview (lượt 1) | `claude-opus-5` | Có | medium | Structured |
| AI-12 | Chấm + sinh câu tiếp (mỗi lượt) | `claude-opus-5` | Có | medium | Structured |
| AI-13 | Báo cáo cuối phiên mock | `claude-opus-5` | Có | high | Structured |
| AI-14 | Sinh blueprint bài kiểm tra | `claude-opus-5` | Có | medium | Structured mảng item |
| AI-15 | Chấm câu tự luận (4 nhóm lỗi) | `claude-opus-5` | Có | medium | Structured |
| AI-16 | Ước lượng level | `claude-opus-5` | Không | low | Structured |

### 4.2 Prompt caching (bắt buộc)

```ts
system: [
  { type: "text", text: STABLE_SYSTEM },                            // luôn giống nhau
  { type: "text", text: RUBRIC_BLOCK, cache_control: { type: "ephemeral" } },
]
```

Quy tắc không được vi phạm:
1. Thứ tự `tools → system → messages` giữ nguyên.
2. **Mọi nội dung biến động** (ngày, dữ liệu hôm nay, lịch sử) nằm **sau** breakpoint cuối cùng, trong `messages`.
3. Không chèn `Date.now()` / UUID vào system prompt — sẽ phá cache mỗi lượt.
4. Kiểm chứng bằng `usage.cache_read_input_tokens`; = 0 ở call thứ 2 ⇒ có silent invalidator.
5. System prompt phải đủ dài (ngưỡng cache 512–4096 token tuỳ model) — nếu không sẽ **im lặng không cache**.

### 4.3 Structured outputs

```ts
const response = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 16000,
  output_config: { format: zodOutputFormat(PlanSchema) },
  ...
});
```

Không parse text tự do. Mọi output có cấu trúc dùng Zod schema khai báo trong `src/lib/prompts.ts`.

### 4.4 Rubric cố định (P4)

Khai báo dưới dạng **hằng số** trong `src/lib/prompts.ts`:

- `RUBRIC_COMMUNICATION` — 5 tiêu chí: clarity · structure · tone · natural · grammar (0–5)
- `RUBRIC_TECHNICAL` — 5 tiêu chí: accuracy · depth · reasoning · communication · tradeoff (0–5)
- `RUBRIC_BEHAVIORAL` — 4 tiêu chí: specific · star · selfaware · outcome (0–5)
- `RUBRIC_LANGUAGE_ERRORS` — 4 nhóm: grammar · vocab · expression · context

**Không bao giờ** để AI tự định nghĩa tiêu chí. Tổng điểm luôn = trung bình các tiêu chí.

### 4.5 Xử lý lỗi (typed exception chain)

`AuthenticationError` → `RateLimitError` → `APIStatusError` → `APIConnectionError`

- Kiểm tra `stop_reason === "refusal"` **trước khi** đọc `content`.
- Mọi lỗi → ghi `AiCall { ok: false, error }` + hiển thị thông báo ngắn có nút thử lại.
- Không bao giờ để lỗi API làm sập trang.

### 4.6 Chế độ offline (FR-AI-06)

- AI-01 dùng **bộ sinh rule cục bộ** (`src/lib/plan.ts`): xoay vòng kỹ năng theo mức độ thấp nhất, gắn slot cố định, tiêu đề lấy từ tên kỹ năng.
- Các tính năng AI khác: ẩn nút, hiện hướng dẫn thêm key.
- **Không** giả lập phản hồi AI.

### 4.7 Ghi log chi phí

Mọi lời gọi AI đi qua wrapper `src/lib/anthropic.ts` → tự ghi `AiCall` (tokens, cache read/write, `estimatedCost`).

## 5. Quy ước code

| Vấn đề | Quy ước |
|---|---|
| Client Prisma | Singleton trong `src/lib/db.ts` (tránh tạo nhiều connection khi hot-reload). |
| Ngày | `src/lib/dates.ts` — mọi ngày chuẩn hoá 00:00 local; so sánh ngày bằng chuỗi `yyyy-MM-dd`. |
| API route | `src/app/api/<domain>/<action>/route.ts`; validate input bằng Zod; trả `{ ok, data }` hoặc `{ ok: false, error }`. |
| Streaming | `text/event-stream` hoặc chunked text; client đọc bằng `ReadableStream`. |
| Component | Client Component chỉ khi: dùng state/handler/onClick/speech/AI streaming. Còn lại Server Component. |
| Chấm điểm | Lưu điểm **từng tiêu chí kèm lý do** để người dùng tự phản biện. |

## 6. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-01 | Mobile-first | Mọi màn hình dùng được ở 390px; thao tác chính trong vùng ngón cái. |
| NFR-02 | Tốc độ | Trang chủ render server-side < 500ms. Quick-log đóng modal ngay, không chờ AI. |
| NFR-03 | Offline | Tính năng không-AI hoạt động khi mất mạng; ghi được vào SQLite. |
| NFR-04 | Privacy | SQLite cục bộ; chỉ gửi nội dung người dùng chủ động nhờ AI; log trong S15. |
| NFR-05 | Ngôn ngữ | Giao diện tiếng Việt; nội dung học zh-Hans + en-US; kiểm tra hợp lệ ngữ cảnh theo `lang`. |
| NFR-06 | A11y | Tương phản WCAG AA; điều hướng bàn phím; nhãn cho icon; `aria-live` cho phản hồi AI. |
| NFR-07 | Không phụ thuộc ngoài | TTS/STT dùng Web Speech API của trình duyệt. |
| NFR-08 | Dữ liệu | Xuất/nhập JSON đầy đủ — không ràng buộc người dùng vào hệ thống. |
| NFR-09 | An toàn key | API key lưu `.env.local`, không commit, không hiển thị đầy đủ trong UI. |

## 7. Ước tính chi phí (cần đo thật sau 1 tuần)

| Kịch bản | Input/tháng | Output/tháng | USD/tháng |
|---|---|---|---|
| Nhẹ (1 kế hoạch + 1 bài chấm/ngày, có cache) | ~1.2M | ~250K | 4 – 7 |
| Vừa (thêm role-play 10 lượt/ngày) | ~2.8M | ~600K | 8 – 14 |
| Nặng (mọi call Opus 5, không cache) | ~4.5M | ~900K | 15 – 22 |
| + Mock Interview (2 phiên 8 câu/tuần) | +~250K | +~90K | +1 – 2.5 |
| + Bài kiểm tra (2 bài 40 câu/tuần) | +~180K | +~50K | +1 – 1.5 |

Giả định: `claude-opus-5` $5/$25 mỗy 1M token; `claude-haiku-4-5` $1/$5; cache đọc rẻ hơn nhiều.
