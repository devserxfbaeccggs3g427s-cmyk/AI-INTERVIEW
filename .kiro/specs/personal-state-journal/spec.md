# Nhật ký & Đánh giá chính (Personal State Journal)

> **Màn hình:** S06 (`/journal`) · S12 (`/state`) · **Phase:** 0
> **Nguồn:** `system-design/SPEC.md` §0.3 (P6), §2.5 (FR-PS-01…FR-PS-07), §3.2 (S06, S12), §4 (model `DailyState`, `Reflection`, `Activity`), §5.1 (AI-05, AI-06), §5.6, §6 (NFR-04) · prototype `system-design/s06_nh_t_k_ai_ph_n_h_i/`, `system-design/s12_nh_gi_sinh_tr_c_nh_p/`
> **Phụ thuộc:** `app-foundation`, `ai-foundation` (phải xong trước)

## 1. Tổng quan

Feature này gom hai màn hình của mảng **"cá nhân"** vào một cặp trục: **S06 — Nhật ký & phản hồi AI** (`/journal`) và **S12 — Đánh giá chính** (`/state`).

S06 là nơi người dùng viết nhật ký tự do và (chủ động) nhờ AI phản hồi bằng đúng **một câu tóm tắt + một câu hỏi sắc**. S12 là nơi người dùng đánh giá 4 chỉ số chính (mood / energy / sleep / focus) trong ≤15 giây, xem nhịp độ 7 ngày và đối chiếu với hiệu suất học.

Nguyên tắc chi phối toàn bộ feature là **P6 — Local-first**: mọi nội dung nhật ký và mọi chỉ số cá nhân nằm trong SQLite trên máy. **Không một byte nào rời máy nếu người dùng không chủ động bấm nút AI.** Vì vậy phân loại domain/kỹ năng (FR-PS-04) chạy bằng **rule cục bộ** theo mặc định; lời gọi `claude-haiku-4-5` (AI-06) chỉ chạy khi người dùng đã bấm "Gửi AI phản hồi" — tức là đã chủ động nhờ AI nhìn vào đoạn văn bản đó. Mọi lần gửi đều được ghi log cục bộ và hiển thị ở panel **"Dữ liệu đã gửi lên"** (FR-PS-07, NFR-04).

Feature này là **vòng lặp Ghi → Đo** của Daily Loop OS: nhật ký tạo ra `Activity` + `Reflection`, đánh giá chính tạo ra `DailyState`, hai nguồn dữ liệu này cùng nằm trong bảng `Activity`/`DailyState` nên tương quan chỉ số ↔ hiệu suất học (FR-PS-05) là **một truy vấn SQL duy nhất** — đây chính là lý do SPEC.md yêu cầu giữ `Activity` làm bảng trung tâm không tách theo domain.

**Ngoài phạm vi feature:** Weekly Review tổng hợp (S13/AI-07), báo cáo tiến bộ (S14), trang Cài đặt đầy đủ (S15 — chỉ dùng chung bảng `AiCall` làm nguồn log), mô hình ngủ REM/Deep/Light chi tiết (chỉ lưu tổng giờ ngủ theo SPEC §4).

## 2. Bối cảnh & vấn đề

- **SPEC §0.1 — "Notion/Obsidian chỉ là kho lưu":** ghi nhật mà không chấm, không đo, không ép hành vi. Nhật ký hiện tại là nơi user nói thêm, không phải nơi app học được điều gì từ user.
- **SPEC §0.1 — "ChatGPT không biết bạn đã làm gì":** AI phản hồi ở S06 phải dựa trên **dữ liệu hành vi thật** (6 slot hôm nay, kỹ năng đang học), không phải hội thoại chung chung.
- **R2 — Friction ghi nhập → bỏ app tuần 2:** S12 phải ghi trong ≤15 giây và **prefill từ hôm qua**; S06 phải lưu được nháp khi offline, không mất trắng khi mạng chết.
- **R7 — Dữ liệu cá nhân rò rỉ:** nhật ký chứa suy nghĩ, mối bận tâm, thông tin sức khoẻ tinh thần — loại dữ liệu nhạy cảm nhất trong app. Ràng buộc P6 là bắt buộc, không phải tuỳ chọn.
- **SPEC §3.2 S12 — "Lịch sử 7 ngày gần nhất dạng chấm nhỏ, bấm để sửa":** chưa có nơi nào trong app cho phép nhìn lại và **sửa** chỉ số ngày đã qua — cần đường sửa nhanh, không chỉ sửa được hôm nay.

## 3. Yêu cầu chức năng

### 3.1 Nhật ký & phản hồi AI (S06)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-PS-02 | Nhật ký tự do, có gợi ý 3 câu hỏi mở theo ngữ cảnh (sau buổi học / cuối ngày / cuối tuần). | P0 | SPEC §2.5 |
| FR-PS-03 | AI phản hồi nhật ký: tóm tắt 1 câu + **1 câu hỏi sắc** (không phải lời khuyên dài). | P0 | SPEC §2.5 |
| FR-PS-04 | AI tự gán domain/kỹ năng cho nội dung nhật ký (classification → `claude-haiku-4-5`). Phân loại nhật ký tiếng Việt được gán `domain=communication` (bản ngữ, không học thuộc); tiếng Anh/Trung có thể gán `domain=language` khi nội dung là bài luyện. | P1 | SPEC §2.5 · Q2 |
| FR-PS-07 | Dữ liệu cá nhân **không rời máy**: chỉ gửi lên API những đoạn người dùng chủ động nhờ AI phản hồi/phân tích. Có màn hình hiển thị "dữ liệu nào đã gửi lên". | P0 | SPEC §2.5 |

### 3.2 Đánh giá chính (S12)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-PS-01 | Đánh giá chính 4 chỉ số: **mood** (1–5), **energy** (1–5), **giấc ngủ** (giờ), **tập trung** (1–5). Ghi trong ≤15 giây. | P0 | SPEC §2.5 |
| FR-PS-05 | Phân tích tương quan: tìm quan hệ giữa chỉ số chính ↔ hiệu suất học. Ví dụ "khi ngủ < 6h, điểm tập trung hôm sau giảm 30%". | P2 | SPEC §2.5 |
| FR-PS-06 | Biểu đồ: mood/energy/sleep theo tuần, overlay với số hành động hoàn thành. | P1 | SPEC §2.5 |
| FR-PS-07 | *(áp dụng chung với S12)* chỉ số `DailyState` **không bao giờ** được gửi lên API. Phân tích tương quan FR-PS-05 chạy **100% cục bộ** (SQLite + hàm tương quan thuần JS), không gọi AI. | P0 | SPEC §2.5 + P6 |

### 3.3 Yêu cầu chi tiết hoá theo màn hình

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-PSJ-01 | Bản nháp nhật ký được lưu **cục bộ, không cần mạng** (SQLite), tự động lưu sau 800ms ngừng gõ, và vẫn khôi phục được sau khi tải lại trang. | P0 | FR-PS-02 · NFR-03 |
| FR-PSJ-02 | Gợi ý câu hỏi hiển thị theo ngữ cảnh thời điểm: 8:00–13:00 → *sau buổi học*; 19:00–23:00 → *cuối ngày*; Thứ 7–Chủ nhật → *cuối tuần*. Bấm chip → chèn nguyên văn câu hỏi vào cuối textarea. | P0 | FR-PS-02 |
| FR-PSJ-03 | Nút **"Gửi AI phản hồi"** là hành động duy nhất được phép đưa nội dung nhật ký ra khỏi máy. Mọi lần bấm đều ghi 1 dòng vào log `AiCall` kèm preview nội dung đã gửi. | P0 | FR-PS-07 · NFR-04 |
| FR-PSJ-04 | Panel **"Dữ liệu đã gửi lên"** liệt kê: thời điểm, tính năng, model, `dataPreview` nội dung đã gửi, số token, ước tính chi phí. Cho phép xoá log (không xoá dữ liệu gốc). | P0 | FR-PS-07 |
| FR-PSJ-05 | Khi **không có `ANTHROPIC_API_KEY`**: ẩn nút AI, hiện hướng dẫn thêm key; **tuyệt đối không giả lập phản hồi AI**; phân loại domain/kỹ năng vẫn chạy bằng rule cục bộ. | P0 | SPEC §3.2 S06 · §5.6 |
| FR-PSJ-06 | Khi chỉnh sửa nhật ký cũ đã có phản hồi AI: phản hồi cũ bị đánh dấu "lỗi thời", hệ thống **không tự gửi lại AI** — người dùng phải bấm lại nút AI mới có phản hồi mới. | P0 | FR-PS-07 |
| FR-PSJ-07 | S12 **prefill** 4 chỉ số từ bản ghi `DailyState` gần nhất trước hôm nay; nếu chưa có dữ liệu thì mặc định 3/3/3 và 0 giờ ngủ. | P0 | FR-PS-01 |
| FR-PSJ-08 | S12 lưu bằng cơ chế **upsert theo ngày** (`DailyState.date` unique) — ghi nhiều lần trong ngày chỉ giữ bản ghi mới nhất, kèm `updatedAt`. | P0 | FR-PS-01 |
| FR-PSJ-09 | Biểu đồ S12 có toggle **7 ngày / 30 ngày**; chấm điểm từng ngày bấm được để mở form sửa nhanh cho ngày đó. | P1 | FR-PS-06 · SPEC §3.2 S12 |
| FR-PSJ-10 | Câu hỏi sắc của AI có nút **"Ghi câu trả lời"** → mở ô trả lời ngay dưới, lưu vào `Reflection` (không tạo `Activity` mới). | P1 | FR-PS-03 |
| FR-PSJ-11 | Gợi ý phân loại (domain + kỹ năng) có nút **"Chấp nhận"** → tạo `Evidence` (rating 3) cho kỹ năng tương ứng, tuân thủ P3 (tiến độ = bằng chứng). | P1 | FR-PS-04 |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-PS-01 | Ghi chỉ số chính trong ≤15 giây | Từ lúc mở `/state` đến khi `DailyState` của hôm nay được ghi: ≤15 giây ở mạng chậm; không chờ AI. |
| NFR-PS-02 | Offline | Mất mạng: `/journal` vẫn ghi được nhật ký + lưu nháp; `/state` vẫn ghi được chỉ số. |
| NFR-PS-03 | Privacy (NFR-04) | Không có request HTTP ra ngoài ứng dụng khi người dùng không bấm nút AI — kiểm chứng bằng network log. Mọi lần gửi đều có dòng log. |
| NFR-PS-04 | Prompt caching | `usage.cache_read_input_tokens > 0` từ call thứ 2 trở đi với cùng hệ thống prompt AI-05/AI-06. |
| NFR-PS-05 | Structured output | AI-05 trả đúng `{summary, sharpQuestion}`; AI-06 trả đúng `{domain, skillId, skillName, confidence}` — không parse text tự do. |
| NFR-PS-06 | A11y | Phản hồi AI và kết quả tương quan nằm trong vùng `aria-live="polite"`; mọi nút icon-only có `aria-label`; slider có `<label>` liên kết. |
| NFR-PS-07 | Mobile-first | `/journal` và `/state` dùng được ở 390px, thao tác chính trong vùng ngón cái. |
| NFR-PS-08 | Chi phí | 1 lần gửi AI-05 ≤ 3.500 input token (cache đọc tính vào) và ≤ 400 output token. |

## 5. Mô hình dữ liệu

> **Registry:** `.kiro/steering/data-model-registry.md` — `Reflection.activityId` (nullable) = **`C4`** ·
> `Reflection.status` = **`C5`**. Hai thay đổi này **bắt buộc** (DEC-01) và là nguồn chân lý duy nhất;
> `design.md` §4.3 mô tả chi tiết.

### 5.1 Model dùng lại (SPEC §4)

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `Reflection` | `id` | `String` | cuid. |
| | `activityId` | `String` | **unique**, liên kết 1–1 với `Activity`. |
| | `prompt` | `String` | Câu hỏi gợi ý đã chèn (rỗng nếu viết tự do). |
| | `answer` | `String` | Nội dung nhật ký. |
| | `aiFeedback` | `String?` | JSON đã serialize: `{"summary":"…","sharpQuestion":"…"}`. `null` = chưa nhờ AI. |
| | `createdAt` | `DateTime` | |
| `Activity` | `type` | `String` | `journal` cho mục nhật ký đã commit. |
| | `domain` | `String` | `professional \| communication \| language \| personal` — do AI-06 hoặc rule cục bộ gán. |
| | `skillId` | `String?` | Kỹ năng được gán. |
| | `content` | `String?` | Nội dung nhật ký (trùng `Reflection.answer`). |
| | `minutes` | `Int` | Mặc định `0` — nhật ký không tính phút học. |
| `DailyState` | `date` | `DateTime` | **unique**, chuẩn hoá 00:00 local. |
| | `mood` / `energy` / `focus` | `Int?` | 1–5. |
| | `sleep` | `Float?` | Số giờ ngủ (0.5–14). |
| | `note` | `String?` | Ghi chú 1 dòng. |
| | `updatedAt` | `DateTime` | `@updatedAt`. |
| `AiCall` | `feature` | `String` | `journal_feedback` (AI-05) hoặc `journal_classify` (AI-06). |
| | `model` | `String` | `claude-opus-5` / `claude-haiku-4-5`. |
| | `inputTokens`/`outputTokens`/`cacheRead`/`cacheWrite`/`estimatedCost` | `Int`/`Float` | Ghi tự động bởi wrapper `src/lib/anthropic.ts`. |
| | `ok` / `error` | `Boolean` / `String?` | |

### 5.2 Delta so với SPEC §4 (cần migrate)

| Model | Field | Kiểu | Lý do |
|---|---|---|---|
| `Reflection` | `activityId` | `String?` (đổi từ bắt buộc) | Cho phép **bản nháp chưa commit** tồn tại mà chưa tạo `Activity` (P3: nhật ký chỉ thành hoạt động khi commit). |
| `Reflection` | `status` | `String @default("published")` | `draft \| published`. Bản nháp không được tính vào thống kê hoạt động. |
| `Reflection` | `classifiedDomain` | `String?` | Domain do AI-06 / rule cục bộ gán. |
| `Reflection` | `classifiedSkillId` | `String?` | Skill được gán (đã kiểm chứng tồn tại trong DB). |
| `Reflection` | `classificationConfidence` | `Float?` | 0–1. |
| `Reflection` | `draftUpdatedAt` | `DateTime?` | Mốc so sánh bản nháp mới/cũ. |
| `Reflection` | `updatedAt` | `DateTime @updatedAt` | Nhận biết phản hồi AI đã lỗi thời sau khi sửa. |
| `AiCall` | `dataPreview` | `String?` | Trích 160 ký tự nội dung **đã gửi lên** → nguồn dữ liệu cho panel "Dữ liệu đã gửi lên" (FR-PS-07). |
| `AiCall` | `sourceId` | `String?` | `reflectionId` — truy ngược về mục nhật ký. |

> `Activity.type` **không** nhận giá trị mới: bản nháp nằm ở `Reflection` với `activityId = null`, nên không làm nhiễu bảng `Activity` và không ảnh hưởng truy vấn tương quan FR-PS-05.

### 5.3 Quan hệ & ràng buộc

```
UserProfile (1) ─┐
Skill (1) ────────┼──< Activity >──< Evidence >── Skill
                  │        │ 1
PlanItem (1) ────┘        │
                           ▼
                     Reflection (0..1 activityId, activityId unique)
DailyState (date unique)      AiCall (dataPreview, sourceId → Reflection)
```

| Ràng buộc | Quy tắc |
|---|---|
| RB-1 | `Reflection.activityId` unique → 1 mục nhật ký = 1 `Activity` = 1 `Reflection` (SPEC §3.2 S06). |
| RB-2 | `DailyState.date` unique + chuẩn hoá 00:00 local → 1 ngày = 1 bản ghi chỉ số. |
| RB-3 | `Reflection.answer` không được rỗng khi `status = "published"`. |
| RB-4 | `Activity.domain` ∈ 4 domain đóng băng (P5). `classifiedSkillId` phải tồn tại trong `Skill` — giá trị AI sinh ra không có trong DB bị loại bỏ. |
| RB-5 | `AiCall.sourceId` chỉ trỏ tới `Reflection` của feature này; `dataPreview` tối đa 160 ký tự, không ghi full nội dung nhật ký vào log. |

## 6. Giao diện & hành vi

### 6.1 Bố cục

#### 6.1.1 S06 — Nhật ký & phản hồi AI (`/journal`)

Bố cục lưới 12 cột (`lg:grid-cols-12 gap-gutter-lg`), cột trái 7 / cột phải 5. Trên `<1024px` (mobile/tablet) gộp về 1 cột dọc theo thứ tự: banner → gợi ý → textarea → nút → phản hồi AI → lịch sử.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡 CHẾ ĐỘ LOCAL-FIRST (P6 SECURITY STANDARD)              [ ENCRYPTED ]                                       │
│ Toàn bộ nhật ký lưu độc quyền trên SQLite cục bộ. Chỉ đoạn văn bản                                            │
│ người dùng chủ động gửi mới chuyển đến Claude Opus 5.                                                         │
│                            ● SQLite: Encrypted DB Connected   [ Cache 94% ]                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┬────────────────────────────────────────────────────┐
│ REFLECTION LOG · S06                                     │ 🧠 Phản hồi Sắc bén AI             ⚡ Opus 5        │
│ Nhật ký & Suy ngẫm cuối ngày                ⏱ 14m 20s    │╭─ TÓM TẮT CỐT LÕI ────────────────────────────╮    │
│ Thứ Năm, 29/10/2026 — Chu trình tự đánh giá nhận thức    ││ "Bạn đã đưa ra quyết định kỹ thuật dựa trên  │    │
│                                                          ││ đánh đổi thực tế thay vì cảm                 │    │
│ GỢI Ý CÂU HỎI ĐÀO SÂU (Bấm để chèn vào nhật ký)          ││ tính, nhưng đang để năng lượng buổi chiều bị │    │
│ [💡 Sau buổi học: "Điều gì khiến bạn bất ngờ nhất?"]     ││ rò rỉ."                                      │    │
│ [🎯 Cuối ngày: "Lý do chưa dứt điểm hết 6 hành động?"]   │╰──────────────────────────────────────────────╯    │
│ [⚖️ Cuối tuần: "Đã nói 'Không' với điều gì?"]             │                                                    │
│                                                          │╭─ 🎯 CÂU HỎI SẮC BÉN (Tự chất vấn) ───────────╮    │
│ ✎ Markdown hỗ trợ · 362 ký tự        ✓ Đã lưu SQLite     ││ "Nếu tuần tới bạn chỉ được phép chọn 1 nguồn │    │
│╭────────────────────────────────────────────────────╮    ││ kích hoạt để cắt đứt hoàn                    │    │
││ ▓ textarea 9 dòng — nền recessed                   │    ││ toàn việc phân tâm 40 phút buổi chiều, bạn   │    │
││ ▓ "Hôm nay mình dành 2 slot tập trung cao vào      │    ││ sẽ chặn kênh nào trước 14:00?"               │    │
││ ▓ System Design (CQRS & Event Sourcing)…"          │    ││                                              │    │
│╰────────────────────────────────────────────────────╯    ││ → Ghi câu trả lời                            │    │
│                                                          ││ Được thiết kế để phá vỡ vòng lặp trì hoãn    │    │
│ [Ctrl][Enter] để gửi AI                                  │╰──────────────────────────────────────────────╯    │
│ [💾 Lưu bản nháp cục bộ (Offline)]                       │                                                    │
│ [✨ Gửi AI phản hồi (Claude Opus 5)]                      │ PHÂN LOẠI TỰ ĐỘNG (Claude Haiku 4.5)  Conf. 98%    │
│                                                          │ ● Chuyên môn: System Design                        │
│ XU HƯỚNG SUY NGẪM 7 NGÀY                                 │ ● Cá nhân: Quản lý xao nhãng                       │
│ 85% Tính nhất quán   [+12% vs tuần trước]                │ ✓ +1 Bằng chứng tư duy đánh đổi kiến trúc          │
│ ▁▂▃▅▆▇  (sparkline 144×40)                               │                            [ Chấp nhận ]           │
│                                                          │                                                    │
│                                                          │ 📚 Đối chiếu Nhật ký gần đây  Xem tất cả (48)      │
│                                                          │╭──────────────────────────────────────────────╮    │
│                                                          ││ T2 28/10 · SRS Ngoại ngữ                     │    │
│                                                          ││ Hoàn thành 45 thẻ FSRS tiếng Trung với độ    │    │
│                                                          ││ trễ ghi nhớ 91%…                             │    │
│                                                          ││ 💡 AI: "Tăng khoảng cách lặp lại cho thẻ ổn  │    │
│                                                          ││ định > 21 ngày."                             │    │
│                                                          │╰──────────────────────────────────────────────╯    │
│                                                          │╭──────────────────────────────────────────────╮    │
│                                                          ││ T1 27/10 · Mock Interview                    │    │
│                                                          ││ Mô phỏng phỏng vấn System Design:            │    │
│                                                          ││ Distributed Tracing…                         │    │
│                                                          │╰──────────────────────────────────────────────╯    │
│                                                          │                                                    │
│                                                          │ 🔐 Dữ liệu đã gửi lên (3)                          │
│                                                          │ 14:02 · AI-05 · Opus 5 · 1.204 tok · ~$0.006       │
│                                                          │ "Hôm nay mình dành 2 slot tập trung cao vào…"      │
└──────────────────────────────────────────────────────────┴────────────────────────────────────────────────────┘```

#### 6.1.2 S12 — Đánh giá chính (`/state`)

Bố cục lưới 12 cột (`xl:grid-cols-12 gap-gutter-lg`), cột trái 7 / cột phải 5. Strip trạng thái trên cùng full-width; form ghi nhận chiếm cột trái, bên dưới là cam kết P6; cột phải chứa panel tương quan + biểu đồ.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ● FR-PS-01 · STATE LOGGER ENGINE · SQLite Encrypted Local Node (P6 Standard)                                  │
│              [🔒 E2EE Device Storage]   [⏱ Ghi nhận mục tiêu: ≤15s]                                           │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┬────────────────────────────────────────────────┐
│ Phân hệ Cá nhân / Đánh giá chính (/state)                    │ Điểm phục hồi  92%                             │
│ Theo Dõi Trạng Thái & Chỉ Số Sinh Học Cá Nhân                │ Ngủ TB 7.4h · Ổn định Cao                      │
│ Đồng bộ cục bộ SQLite • Mã hóa E2EE • Chu kỳ 7 ngày          │                                                │
├──────────────────────────────────────────────────────────────┼────────────────────────────────────────────────┤
│ 🏃 Ghi nhận siêu tốc hôm nay            [Chế độ ≤15s]        │ 🧠 TƯƠNG QUAN SINH HỌC AI                      │
│    Prefill tự động từ hôm qua • Bấm một chạm lưu ngay        │    Engine suy diễn cục bộ (Local Engine)       │
│                                                              │    [Độ tin cậy 94%]                            │
│ ┌ 😊 Tâm trạng (Mood)              4/5  Tích cực, phấn chấn  │                                                │
│ │ ▬▬▬▬▬▬▬▭  1 Kiệt sức · 2 Chùng chình · 3 Ổn định           │ ┌ ✓ Quy luật ngủ • Hiệu suất sáng              │
│ │              4 Tích cực · 5 Thăng hoa                      │ │ Khi ngủ ≥ 7.0 giờ, bạn hoàn thành            │
│ │ ▬▬▬▬▬▬▬▭  1 Uể oải · 2 Hơi mỏi · 3 Vừa đủ                  │ │ 100% các slot sáng trước 12:00 mà            │
│ │              4 Tràn đầy · 5 Cực đỉnh                       │ │ không gặp hiện tượng trì hoãn.               │
│ │ ▬▬▬▬▬▬▬▭  1 Phân tán · 2 Gián đoạn · 3 Kiểm soát           │ │                              +42% Slots      │
│ │              4 Rất sâu · 5 Flow State                      │ └──────────────────────────────────────        │
│ │ 🌙 Giấc ngủ đêm qua      7.5 giờ  [Đạt chuẩn hồi phục]     │ ┌ ⚠ Bẫy năng lượng chiều                       │
│ │ ▓▓▓▓▓▓▓▓░░░░░░░░  (thanh 0–10h)                            │ │ Mức tập trung buổi chiều giảm 35%            │
│ │ ✎ Ghi chú nhịp sinh học (1 dòng tùy chọn)  [text]          │ │ vào những ngày năng lượng sáng ghi nhận      │
│ └──────────────────────────────────────────────────────      │ │ dưới 3 điểm.                                 │
│                                                              │ │                              -35% Focus      │
│ ↺ Prefill hôm qua: 100% khớp                                 │ └──────────────────────────────────────        │
│ [Mặc định]                    [⚡ Lưu trạng thái (≤15s)]      │                                                │
│                                                              │ 📈 BIỂU ĐỒ NHỊP ĐỘ 7 NGÀY                      │
│ 🛡 Cam kết bảo mật dữ liệu sinh trắc P6  [STRICT_LOCAL]      │    Đối chiếu Mood/Energy với Slot hoàn thành   │
│ Toàn bộ nhật ký tâm trạng, chỉ số sinh học, thời lượng       │    [ 7 Ngày | 30 Ngày ]           r=0.88       │
│ giấc ngủ được lưu trữ độc quyền trên SQLite thiết bị cá      │    ● Energy/Mood (1-5)  ▬ Sleep (0-10h)        │
│ nhân. Hệ thống không tải dữ liệu lên bất kỳ máy chủ đám mây  │    ▬ Slots hoàn thành (0-6)                    │
│ nào. Phân tích do engine máy học cục bộ xử lý.               │    T5(23) T6(24) T7(25) CN(26) T2(27) T3(28) N…│
│                                                              │                                                │
│                                                              │ MA TRẬN ĐIỂM 7 NGÀY (Bấm để sửa nhanh)         │
│                                                              │ ┌T5 3/5┬T6 2.5┬T7 4/5┬CN 4/5┬T2 4.5┬T3 4.5┬Nay┐│
│                                                              │ └──────┴──────┴──────┴──────┴──────┴──────┴───…│
│                                                              │                                                │
│                                                              │ ⏰ Khung giờ sinh học lý tưởng                  │
│                                                              │    Đỉnh cao tư duy phân tích: 08:30 — 11:30    │
│                                                              │    [Active Slot]                               │
└──────────────────────────────────────────────────────────────┴────────────────────────────────────────────────┘```

#### 6.1.3 Bảng 3 gợi ý câu hỏi theo ngữ cảnh (FR-PS-02)

Ba chip luôn hiển thị đủ (không ẩn chip nào), nhưng **chip theo ngữ cảnh hiện tại được đánh dấu là "đang áp dụng"**. Nguyên văn câu hỏi được chèn vào textarea là **câu hỏi đầy đủ** (không phải nhãn rút gọn).

| # | Ngữ cảnh | Điều kiện chọn | Icon | Nhãn chip (rút gọn) | Câu hỏi chèn nguyên văn | Màu icon |
|---|---|---|---|---|---|---|
| 1 | **Sau buổi học** | 08:00–13:00, T2–T6 | `lightbulb` | `Sau buổi học` | `Sau buổi học: Điều gì học được hôm nay khiến bạn bất ngờ nhất?` | `text-tertiary` |
| 2 | **Cuối ngày** | 19:00–23:00 (mặc định khi ngoài khung giờ) | `track_changes` | `Cuối ngày` | `Cuối ngày: Hôm nay có lý do gì khiến bạn chưa dứt điểm hết 6 hành động?` | `text-primary` |
| 3 | **Cuối tuần** | Thứ 7 hoặc Chủ nhật (ưu tiên cao nhất) | `balance` | `Cuối tuần` | `Cuối tuần: Tuần này bạn đã nói 'Không' với điều gì để giữ tập trung?` | `text-secondary` |

| Hành vi | Quy tắc |
|---|---|
| Chèn | Bấm chip → nội dung mới = `textarea.value.trim()` + `\n\n` + `<câu hỏi nguyên văn>` + `\n`; focus lại textarea; cập nhật bộ đếm ký tự. |
| Đánh dấu chip đang áp dụng | Viền `border-primary/40` + nền `bg-surface-container-high` + nhãn `text-on-surface`; chip còn lại giữ `bg-surface-container` + `text-on-surface-variant`. |
| Hành vi hover | `hover:bg-surface-container-high`; icon `group-hover:scale-110 transition-transform`. |
| Thứ tự ưu tiên ngữ cảnh | `weekend` (T7/CN) > `after_study` (08–13) > `end_of_day` (19–23) > fallback `end_of_day`. |
| Nguồn hằng số | `JOURNAL_PROMPTS` trong `src/lib/config.ts` — không hardcode trong component (chống lệch nội dung giữa server/client). |

> SPEC §3.2 S06 ghi: *"Sau buổi học → 'Điều gì học được hôm nay khiến bạn bất ngờ nhất?' · Cuối ngày → 'Hôm nay có lý do gì để không làm hết kế hoạch?' · Cuối tuần → 'Tuần này bạn đã nói "không" với điều gì?'"*. Bảng trên dùng **nguyên văn prototype** (`code.html` — `insertPrompt(...)`), vốn khớp SPEC; prototype viết tắt nhãn chip cho gọn ("Điều gì khiến bạn bất ngờ nhất?" / "Lý do chưa dứt điểm hết 6 hành động?" / "Đã nói 'Không' với điều gì?") — nhãn rút gọn là nhãn hiển thị, **câu hỏi chèn vào nhật ký là bản đầy đủ**.

### 6.2 Bảng thành phần

#### 6.2.1 S06

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Banner P6 | Icon `shield_lock` + tiêu đề "Chế độ Local-First (P6 Security Standard)" + chip `Encrypted` | nền `bg-surface-container-low`, `rounded-xl p-space-md shadow-sm`; icon box `bg-primary/10 text-primary`; tiêu đề `font-headline-sm text-headline-sm text-on-surface font-semibold`; chip `bg-primary/15 text-primary font-label-sm uppercase` | Tĩnh, không tương tác. Nhấn mạnh "chỉ đoạn người dùng chủ động gửi mới rời máy". |
| Header card | Eyebrow "Reflection Log · S06", H1 "Nhật ký & Suy ngẫm cuối ngày", ngày, đồng hồ đang viết | `bg-surface-container-low rounded-xl p-space-lg shadow-sm`; eyebrow `font-label-sm text-label-sm text-primary tracking-wider uppercase`; H1 `font-headline-md text-headline-md text-on-surface`; đồng hồ `bg-surface-container px-3 py-1.5 rounded-lg font-label-sm text-label-sm text-outline` | Đồng hồ đếm từ lần mở trang, dừng khi rời focus khỏi textarea. |
| Chip gợi ý (×3) | Icon + nhãn câu hỏi theo ngữ cảnh | `px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high`; icon `text-tertiary` (lightbulb) / `text-primary` (track_changes) / `text-secondary` (balance); chữ `font-body-sm text-body-sm text-on-surface-variant` | Click → chèn nguyên văn câu hỏi + `\n\n` vào cuối textarea, focus lại textarea, cập nhật bộ đếm ký tự. |
| Textarea | Nhật ký tự do, 9 dòng, placeholder "Ghi lại tiến trình, điểm nghẽn nhận thức, hoặc phân vân kỹ thuật trong ngày…" | `w-full bg-surface-container-lowest rounded-xl p-space-md font-body-md text-body-md text-on-surface focus:outline-none resize-y leading-relaxed shadow-inner placeholder:text-outline` | Gõ → autosave nháp sau 800ms. `Ctrl/Cmd+Enter` → tương đương bấm nút Gửi AI. |
| Bộ đếm / trạng thái lưu | "362 ký tự" · "Đã lưu vào SQLite Local" (icon `check_circle`) | `font-label-sm text-label-sm text-outline`; trạng thái `text-primary` | "Đang lưu…" khi đang ghi nháp; "Đã lưu" khi xong. |
| Nút nháp (Ghost) | `save` · "Lưu bản nháp cục bộ (Offline)" | `px-4 py-2.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-md` | Lưu ngay `Reflection` status=draft. Không gọi mạng. Đổi nhãn 1.5s thành "Đã lưu Local!". |
| Nút AI | `auto_awesome` · "Gửi AI phản hồi (Claude Opus 5)" | **AI Action**: `px-4 py-2.5 rounded-lg bg-surface-container-high text-secondary border border-secondary/40 font-label-md` + icon `auto_awesome` (theo design-system §7.1) | Đây là **hành động duy nhất** được phép gửi nội dung ra ngoài. Trong lúc gọi: icon `refresh animate-spin`, nhãn "Đang phân tích…", nút disabled. |
| Sparkline xu hướng | "Xu hướng suy ngẫm 7 ngày" · "85% Tính nhất quán" · chip "+12% vs tuần trước" | svg `w-36 h-10 text-primary` stroke-width 2.5, fill-opacity 0.1; chip `bg-primary/10 text-primary font-label-sm` | Tính cục bộ từ `Reflection` 7 ngày gần nhất (không gọi AI). |
| Panel phản hồi AI | Header "Phản hồi Sắc bén AI" + chip "Claude Opus 5" | `bg-surface-container-low rounded-xl p-space-lg shadow-md`; icon box `bg-secondary-container/40 text-secondary`; chip `bg-secondary-container/30 text-secondary font-label-sm` | Khung bên phải; `aria-live="polite"`. |
| Khối tóm tắt | Nhãn "Tóm tắt cốt lõi" (icon `data_loss_prevention`) + 1 câu | `bg-surface-container rounded-lg p-space-md`; nhãn `font-label-sm text-label-sm text-outline uppercase tracking-wider` + icon `text-primary`; câu `font-body-md text-body-md text-on-surface font-medium leading-relaxed` | Nhận dạng theo trạng thái: đang stream hiện chữ dần. |
| Khối câu hỏi sắc | Nhãn "Câu hỏi sắc bén (Tự chất vấn)" (icon `crisis_alert`) + 1 câu hỏi + nút "Ghi câu trả lời" | `bg-surface-container-high rounded-lg p-space-md`; nhãn `text-tertiary uppercase tracking-wider font-semibold`; câu `font-body-md text-body-md text-on-surface font-semibold`; nút `text-primary hover:underline` + icon `arrow_forward` | Bấm "Ghi câu trả lời" → mở textarea trả lời ngay dưới, lưu vào `Reflection` (không tạo Activity mới). |
| Khối phân loại | "Phân loại tự động (Claude Haiku 4.5)" + "Confidence: 98%" + chip domain/skill | chip `inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container font-label-sm text-label-sm`; chấm `w-1.5 h-1.5 rounded-full bg-primary \| bg-tertiary` | Nguồn hiển thị: `AI (Haiku 4.5)` hoặc `Rule cục bộ` — không được ghi "AI" khi chạy rule offline. |
| Dải bằng chứng | "+1 Bằng chứng tư duy đánh đổi kiến trúc" + nút "Chấp nhận" | `mt-space-sm p-space-sm rounded-lg bg-primary/10`; nút `bg-primary text-on-primary font-label-sm px-2.5 py-1 rounded font-semibold` | Bấm → tạo `Evidence` rating 3 cho skill, cập nhật level kỹ năng (P3). |
| Lịch sử nhật ký | "Đối chiếu Nhật ký gần đây" + link "Xem tất cả (N)" + 3 item gần nhất | item `p-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high`; ngày `font-label-sm text-label-sm text-on-surface font-semibold`; tag `px-1.5 py-0.2 rounded bg-surface-container-highest text-on-surface-variant`; trích `font-body-sm text-body-sm text-on-surface-variant line-clamp-2`; dòng AI `font-label-sm text-label-sm text-secondary` | Click item → sửa tại chỗ (mục 6.4). Link "Xem tất cả" → `/journal?all=1` (Phase 1). |
| Panel "Dữ liệu đã gửi lên" | Danh sách lần gửi: thời điểm, tính năng, model, `dataPreview`, token, chi phí | `bg-surface-container-low rounded-xl p-space-lg shadow-sm`; dòng `font-label-sm text-label-sm`; preview `font-body-sm text-body-sm text-on-surface-variant line-clamp-2` | Chỉ hiện dòng có `preview != null`. Nút "Xoá log" chỉ xoá log, giữ nguyên nhật ký. |

#### 6.2.2 S12

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Strip trạng thái | "FR-PS-01 · State Logger Engine" + "SQLite Encrypted Local Node (P6 Standard)" + chip `E2EE Device Storage` + chip "Ghi nhận mục tiêu: ≤15s" | chấm `h-2 w-2 rounded-full bg-primary animate-ping`; nhãn `font-label-sm text-label-sm uppercase tracking-wider text-primary`; chip `px-space-sm py-0.5 rounded bg-surface-container-high font-label-sm text-label-sm` | Tĩnh. |
| Header + số liệu tổng | Breadcrumb "Phân hệ Cá nhân / Đánh giá chính (/state)", H1, 3 ô tổng quan (Điểm phục hồi / Ngủ TB / Độ ổn định) | H1 `font-headline-lg text-headline-lg text-on-surface tracking-tight`; strip `p-1.5 rounded-xl bg-surface-container-low shadow-sm`; ô `px-3 py-1.5 rounded-lg bg-surface-container-high`; số `font-headline-sm text-headline-sm font-bold` (`text-primary` / `text-on-surface` / `text-tertiary`) | Tính cục bộ từ `DailyState` 7 ngày. |
| Card "Ghi nhận siêu tốc hôm nay" | Header + badge "Chế độ ≤15s" + 3 slider + ô giờ ngủ + ghi chú + hàng nút | `rounded-xl bg-surface-container-low p-space-lg shadow-md relative overflow-hidden`; thanh trên `absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary-container to-secondary`; badge `px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm` | Form duy nhất; submit → `PUT /api/state`. |
| Slider mood | Icon `sentiment_very_satisfied` "Tâm trạng (Mood)" + nhãn mô tả + điểm `4/5` | icon `text-tertiary`; block `p-space-md rounded-lg bg-surface-container transition-all hover:bg-surface-container-high`; điểm `font-headline-sm text-headline-sm text-primary font-bold`; nhãn `font-label-md text-label-md text-primary font-semibold`; input `w-full h-2 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none` | 5 mức 1–5, `step=1`. Mô tả: 1 Kiệt sức · 2 Chùng chình · 3 Ổn định · 4 Tích cực · 5 Thăng hoa. |
| Slider energy | Icon `bolt` "Năng lượng sinh lý (Energy)" | icon `text-primary`; điểm `text-primary`; input `accent-primary` | 1 Uể oải · 2 Hơi mỏi · 3 Vừa đủ · 4 Tràn đầy · 5 Cực đỉnh. |
| Slider focus | Icon `center_focus_strong` "Mức độ tập trung (Focus)" | icon `text-secondary`; điểm `text-secondary`; input `accent-secondary` | 1 Phân tán · 2 Gián đoạn · 3 Kiểm soát · 4 Rất sâu · 5 Flow State. |
| Ô giờ ngủ | Icon `bedtime` "Giấc ngủ đêm qua" + badge "Đạt chuẩn hồi phục" + tổng `7.5 giờ` | `p-space-md rounded-lg bg-surface-container`; badge `px-2 py-0.5 rounded bg-primary/20 text-primary font-label-sm`; tổng `font-headline-sm text-headline-sm text-on-surface font-bold` | Input số 0.5–14, bước 0.5. Thanh 0–10h: fill `bg-primary`, track `bg-surface-variant`. **Không** mô phỏng REM/Deep/Light (không có trong data model — xem §8 rủi ro). |
| Ô ghi chú | "Ghi chú nhịp sinh học (1 dòng tùy chọn)" | `bg-surface-container-lowest px-3 py-2 rounded-lg`; icon `edit_note text-outline`; input `font-body-md text-body-md text-on-surface focus:outline-none` | Tối đa 160 ký tự. Nút `close` xoá nội dung ô. |
| Hàng prefill + nút | "Prefill hôm qua: 100% khớp" (icon `history`) · nút "Mặc định" · nút "Lưu trạng thái (≤15s)" | nút reset `px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-bright font-code-md`; nút lưu `px-6 py-2.5 rounded-lg bg-primary-container text-on-primary font-code-md font-semibold hover:brightness-110 active:scale-[0.98] shadow-[0_0_16px_rgba(16,185,129,0.25)]` + icon `bolt` | "Mặc định" reset về 3/3/3, ngủ 0, ghi chú rỗng. Nút lưu: "Đang mã hóa & lưu…" → "Đã lưu (≤15s)" + toast. |
| Cam kết P6 | Icon `verified_user` "Cam kết bảo mật dữ liệu sinh trắc P6" + tag `STRICT_LOCAL` | `rounded-xl bg-surface-container-low p-space-md shadow-sm`; icon box `bg-primary/10 text-primary`; tag `px-2 py-0.2 rounded bg-surface-container-high text-primary font-mono` | Tĩnh. |
| Panel tương quan AI | "Tương quan sinh học AI" + "Engine suy diễn cục bộ" + chip "Độ tin cậy 94%" + 2–3 phát hiện | `rounded-xl bg-surface-container-low p-space-lg shadow-md`; icon box `bg-secondary-container/30 text-secondary`; chip `bg-secondary/10 text-secondary font-label-sm`; phát hiện `p-space-md rounded-lg bg-surface-container`; icon box `bg-primary/20 text-primary` (task_alt) hoặc `bg-tertiary/20 text-tertiary` (warning); tiêu đề `font-label-sm text-label-sm uppercase tracking-wide`; delta `font-label-sm text-label-sm text-outline font-mono` | **Tính hoàn toàn cục bộ** (SQLite + Pearson r). Nhãn "Engine suy diễn cục bộ" phải đúng — không được ghi "AI" vì không gọi API. |
| Biểu đồ nhịp độ | Header + toggle 7/30 ngày + legend + svg + trục ngày | `rounded-xl bg-surface-container-low p-space-lg shadow-md`; toggle `flex rounded-lg bg-surface-container p-0.5 font-label-sm text-label-sm`, active `px-2.5 py-1 rounded bg-surface-container-high text-primary font-semibold shadow-xs`; ô chart `rounded-lg bg-surface-container p-space-md`; svg `w-full h-40 overflow-visible` viewBox `0 0 380 140`; lưới `stroke="#31353f" stroke-dasharray="2,3"` | 4 series: Mood (`bg-primary`), Energy (`bg-primary` dạng nhạt/marker), Sleep (`bg-tertiary`, quy đổi 0–10h → 0–5), overlay Slots hoàn thành (`bg-secondary`, trục phụ 0–6). Hiện `r=` hệ số tương quan. |
| Ma trận điểm 7 ngày | 7 ô (T5…Nay) chấm màu + điểm trung bình | `grid grid-cols-7 gap-1.5`; ô `p-2 rounded bg-surface-container-high/60 hover:bg-surface-container-high flex flex-col items-center gap-1 transition-transform hover:scale-105`; chấm `w-3 h-3 rounded-full bg-error \| bg-tertiary \| bg-primary`; ô hôm nay `bg-primary/20 ring-1 ring-primary` | Bấm 1 ô → mở form sửa nhanh cho ngày đó (prefill lại 4 chỉ số). |
| Khung giờ sinh học | "Khung giờ sinh học lý tưởng" + "Đỉnh cao tư duy phân tích: 08:30 — 11:30" + chip "Active Slot" | `rounded-xl bg-surface-container-low p-space-md shadow-sm`; chip `font-code-md text-code-md text-primary px-2 py-1 rounded bg-surface-container-high font-semibold` | Tĩnh ở Phase 0 (placeholder theo lịch 6 slot cố định). |

### 6.3 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| **S06 — Nhật ký rỗng** | Chưa có `Reflection` nào và textarea rỗng | Textarea placeholder "Ghi lại tiến trình, điểm nghẽn nhận thức, hoặc phân vân kỹ thuật trong ngày…"; 3 chip gợi ý hiện rõ; panel phản hồi AI hiện khung rỗng với dòng "Chưa có phản hồi. Viết vài dòng rồi bấm *Gửi AI phản hồi*."; lịch sử hiện "Chưa có nhật ký nào" + CTA gợi ý dùng chip đầu tiên. Nút AI **enabled** (nếu có key) nhưng bấm với nội dung rỗng → toast "Viết ít nhất một dòng trước khi gửi AI." |
| **S06 — Đang lưu nháp offline** | Đang ghi `Reflection` status=draft (mất mạng hoặc đang ghi) | Badge trạng thái đổi sang "Đang lưu nháp…" (icon `sync`, `animate-pulse`); nút "Lưu bản nháp cục bộ" disabled; **không** hiện lỗi mạng — dữ liệu vẫn nằm trong bộ nhớ textarea và được ghi lại khi có mạng. |
| **S06 — Đang gọi AI** | Đang stream AI-05 | Nút AI: icon `refresh animate-spin`, nhãn "Đang phân tích…", disabled; khối tóm tắt hiện chữ đang nhận dần (cursor nhấp nháy); khối câu hỏi hiện skeleton `bg-surface-container-high animate-pulse`; badge "Đã lưu vào SQLite Local" vẫn hiện. |
| **S06 — Có phản hồi** | `Reflection.aiFeedback` khác null | Khối tóm tắt + khối câu hỏi sắc hiện nội dung; khối phân loại hiện chip domain/skill + confidence; dòng AI trong lịch sử hiện trích câu hỏi sắc; dòng mới trong panel "Dữ liệu đã gửi lên". |
| **S06 — Không có API key** | `ANTHROPIC_API_KEY` rỗng | **Ẩn** nút "Gửi AI phản hồi"; hiện dải hướng dẫn `bg-surface-container-low rounded-xl p-space-md` với icon `key` + text "Bật phản hồi AI bằng cách thêm API key trong Cài đặt" + link `/settings`. Nút "Lưu bản nháp cục bộ" và toàn bộ chức năng ghi vẫn hoạt động. **Không** giả lập phản hồi. |
| **S06 — Phản hồi lỗi thời** | Người dùng sửa `answer` sau khi đã có AI feedback | Khối phản hồi bị làm mờ `opacity-60` + badge "Phản hồi đã cũ — nội dung đã thay đổi"; nút "Gửi lại AI" hiện, nhưng **không tự động gọi**. |
| **S06 — Gửi AI nhiều lần** | Người dùng bấm nút AI lần thứ N | Nút disabled trong lúc đang gọi (chống double-submit); mỗi lần ghi **1 dòng `AiCall` riêng**; `Reflection.aiFeedback` bị ghi đè bằng phản hồi mới nhất; lịch sử log hiển thị đủ N lần theo thời gian. |
| **S12 — Đánh giá chính đã có dữ liệu hôm nay** | `DailyState` của hôm nay đã tồn tại | 3 slider + ô ngủ + ghi chú **prefill bằng giá trị đã lưu**; badge "Đã lưu hôm nay lúc HH:MM" (`bg-primary/10 text-primary`); nút lưu đổi nhãn thành "Cập nhật trạng thái (≤15s)"; chấm trong ma trận 7 ngày của hôm nay đã tô `bg-primary`. |
| **S12 — Chưa có dữ liệu hôm nay** | Không có `DailyState` hôm nay | Prefill từ hôm qua (hoặc 3/3/3 nếu chưa có); nhãn nút "Lưu trạng thái (≤15s)"; dòng "Prefill hôm qua: 100% khớp" chỉ hiện khi thực sự có bản ghi hôm qua. |
| **S12 — Chưa có dữ liệu lịch sử** | Chưa có `DailyState` nào | Ma trận 7 ngày hiện 7 ô rỗng (chấm `bg-surface-container-highest`); biểu đồ hiện đường lưới trống + dòng "Chưa có dữ liệu. Ghi chỉ số hôm nay để bắt đầu."; panel tương quan hiện "Cần ít nhất 7 ngày dữ liệu để tìm tương quan." |
| **S12 — Chưa đủ dữ liệu tương quan** | < 7 ngày có `DailyState` | Panel tương quan hiện số ngày đã có `n/7` và yêu cầu bổ sung — **không** bịa số liệu (AC-11 của SPEC). |

### 6.4 Edge case

| Case | Xử lý |
|---|---|
| **Gửi AI nhiều lần** trên cùng một mục nhật ký | Nút AI disable trong lúc đang gọi → không có request trùng. Mỗi lượt ghi 1 dòng `AiCall` (feature `journal_feedback`), `Reflection.aiFeedback` bị ghi đè, `Reflection.updatedAt` cập nhật. Panel "Dữ liệu đã gửi lên" liệt kê đủ các lượt theo thời gian. |
| **Không có API key** | Ẩn nút AI, hiện hướng dẫn thêm key (FR-PSJ-05). API route trả `503 {ok:false, error:"missing_api_key"}` nếu bị gọi trực tiếp. Phân loại vẫn chạy bằng rule cục bộ (`classifyLocally`). Không giả lập phản hồi AI (SPEC §5.6). |
| **Dữ liệu cá nhân nhạy cảm — không gửi nếu không nhờ** | `POST /api/journal/feedback` là route **duy nhất** được phép đọc `Reflection.answer` để đưa ra ngoài. `POST /api/journal/classify` chỉ được gọi từ server-side sau khi người dùng đã bấm nút AI (cờ `consent: true` trong body). Không có background job, cron hay telemetry nào đọc nội dung nhật ký. `DailyState` **không bao giờ** được gửi. Mọi lần gửi đều có 1 dòng log có `preview` để người dùng kiểm chứng. |
| **Chỉnh sửa nhật ký cũ** | Sửa tại chỗ trong lịch sử: `PATCH /api/journal/:id` cập nhật `Reflection.answer` + `Activity.content` + `Activity.title`. Nếu mục đó đã có `aiFeedback` → đánh dấu phản hồi lỗi thời, yêu cầu người dùng bấm lại nút AI (FR-PSJ-06). Phân loại cũng bị đánh dấu lỗi thời và có thể phân loại lại bằng rule cục bộ (không gọi AI). |
| Nhật ký rỗng khi bấm "Gửi AI" | Chặn ở client (`trim().length === 0`) → toast "Viết ít nhất một dòng trước khi gửi AI." Không gọi API. |
| Người dùng bấm "Gửi AI" khi đang offline | API trả lỗi mạng → toast "Không có kết nối. Nhật ký đã được lưu cục bộ, thử lại khi có mạng." Nhật ký **không mất**. |
| AI trả `stop_reason: "refusal"` | Kiểm tra `refusal` **trước** khi đọc `content` → `AiCall{ok:false, error:"refusal"}` + thông báo "AI không phản hồi được nội dung này. Bạn có thể thử lại với cách diễn đạt khác." Không crash (AC-8). |
| AI-06 trả `skillId` không tồn tại trong DB | Loại bỏ `skillId`, giữ `domain`; `classificationConfidence` giữ nguyên; ghi chú "không khớp kỹ năng" trong panel phân loại. Không tạo `Skill` mới (P5). |
| Người dùng sửa `DailyState` của ngày cũ qua ma trận 7 ngày | `PUT /api/state` với `date` cụ thể → upsert đúng ngày đó; ô trong ma trận đổi màu theo điểm mới ngay. |
| Ghi `DailyState` nhiều lần trong một ngày | Upsert theo `date` unique → chỉ 1 bản ghi, `updatedAt` mới nhất. |
| Ngủ > 14h hoặc < 0h | Zod chặn `sleep ∈ [0, 14]`, bước 0.5 → trả `400 {ok:false, error:"invalid_range"}` kèm field lỗi. |
| Chart 30 ngày có ngày trống (user không ghi) | Ngày trống = **khoảng trống trên đường line** (không nội suy, không coi là 0). Overlay slots vẫn vẽ nếu ngày đó có `PlanItem.done`. |
| Xoá nhật ký | Xoá `Reflection` → cascade xoá `Activity` theo quan hệ 1–1 (không đụng `Evidence` đã tạo vì `Evidence.activityId` cascade theo `Activity`). |

## 7. Hợp đồng API

> Quy ước chung: `src/app/api/<domain>/<action>/route.ts`, validate bằng Zod, trả `{ ok, data }` hoặc `{ ok: false, error }` (tech.md §5).

### 7.1 Nhật ký

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| `GET` | `/api/journal` | Query: `limit` (mặc định 20, max 100), `cursor`, `status` (`draft\|published`, mặc định `published`) | `{ ok:true, data:{ items: JournalItem[], nextCursor } }` | `400` khi `limit`/`cursor` sai định dạng |
| `POST` | `/api/journal` | `{ answer: string, prompt?: string, classify?: boolean }` | `{ ok:true, data:{ reflection: JournalItem } }` — tạo `Reflection` (status=`published`) + `Activity` (type=`journal`) + `Evidence` nếu có skill hợp lệ | `400` khi `answer` rỗng; `422` khi `prompt` quá 500 ký tự |
| `GET` | `/api/journal/draft` | — | `{ ok:true, data:{ draft: JournalItem \| null } }` | — |
| `PUT` | `/api/journal/draft` | `{ answer: string, prompt?: string }` | `{ ok:true, data:{ draft: JournalItem } }` — upsert bản nháp (status=`draft`, `activityId=null`) | `400` khi `answer` rỗng |
| `DELETE` | `/api/journal/draft` | — | `{ ok:true, data:{ deleted: true } }` | — |
| `PATCH` | `/api/journal/:id` | `{ answer: string, prompt?: string }` | `{ ok:true, data:{ reflection: JournalItemDto } }` — sửa tại chỗ; nếu có `aiFeedback` → đánh dấu lỗi thời | `404` khi không tìm thấy; `400` khi `answer` rỗng |
| `DELETE` | `/api/journal/:id` | — | `{ ok:true, data:{ deleted: true } }` — xoá `Reflection` + `Activity` liên kết (cascade) | `404` khi không tìm thấy |
| `POST` | `/api/journal/accept-evidence` | `{ reflectionId: string }` | `{ ok:true, data:{ evidenceId: string, skillLevel: number } }` — tạo `Evidence` rating 3 cho kỹ năng đã gán | `404` khi reflection/skill không tồn tại; `409` khi đã tạo evidence cho cùng `activityId` |
| `POST` | `/api/journal/feedback` | `{ reflectionId: string, consent: true }` | **SSE `text/event-stream`**: `event: start` `{requestId, reflectionId}` → `event: delta` `{text}` → `event: question` `{sharpQuestion}` → `event: done` `{summary, sharpQuestion, aiCallId}` | `401` khi `consent !== true`; `404` reflection không tồn tại; `503` `missing_api_key`; `429` `rate_limited`; `500` `ai_error` — đều phát `event: error` `{code, message}` |
| `POST` | `/api/journal/classify` | `{ reflectionId: string, consent: true, text: string }` | `{ ok:true, data:{ domain, skillId, skillName, confidence, source: "ai"\|"local" } }` | `401` khi `consent !== true`; `404`; `503` `missing_api_key` (client tự fallback sang `source:"local"`) |
| `GET` | `/api/journal/disclosures` | Query: `limit` (mặc định 50) | `{ ok:true, data:{ items: [{id, feature, model, dataPreview, inputTokens, outputTokens, cacheRead, estimatedCost, createdAt}] } }` | — |

### 7.2 Đánh giá chính

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| `GET` | `/api/state` | Query: `window` = `7` \| `30` (mặc định 7) | `{ ok:true, data:{ today: DailyStateDto \| null, prefill: DailyStateDto \| null, history: DailyStateDto[], series: SeriesPoint[] } }` — `series` gồm `{day, mood, energy, sleep, focus, doneSlots}` | `400` khi `window` không phải 7/30 |
| `PUT` | `/api/state` | `{ date?: string (yyyy-MM-dd, mặc định hôm nay), mood?: 1..5, energy?: 1..5, focus?: 1..5, sleep?: 0..14, note?: string ≤160 }` | `{ ok:true, data:{ state: DailyStateDto } }` — upsert theo `date` | `400` `invalid_range` khi giá trị ngoài khoảng; `400` `invalid_date` khi sai định dạng ngày |
| `GET` | `/api/state/correlations` | Query: `window` = `7` \| `30` \| `90` (mặc định 30) | `{ ok:true, data:{ n: number, sufficiency: "insufficient"\|"ok", findings: [{ id, title, metric, threshold, deltaPct, n, confidence }], pearson: { sleepVsFocus: number\|null, energyVsDoneSlots: number\|null, moodVsQuality: number\|null } } }` | `400` khi `window` không hợp lệ |

> `GET /api/state/correlations` **không** bao giờ gọi ra ngoài. Nó đọc `DailyState` + `Activity` + `PlanItem` trong SQLite và tính hệ số tương quan bằng JS thuần (xem `design.md` §4.3).

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-PS-1 — Ghi chỉ số chính ≤15 giây (FR-PS-01)**
- *Given* người dùng mở `/state` và chưa có `DailyState` hôm nay, *When* họ kéo 3 slider, nhập giờ ngủ và bấm "Lưu trạng thái", *Then* một bản ghi `DailyState` cho hôm nay được tạo với 4 giá trị đúng, và thời gian từ lúc mở trang đến khi toast hiện **≤15 giây** (đo bằng `performance.now()` trong E2E).
- *Given* đã có `DailyState` hôm nay, *When* mở `/state`, *Then* 3 slider và ô giờ ngủ **prefill đúng giá trị đã lưu** và nhãn nút là "Cập nhật trạng thái (≤15s)".

**AC-PS-2 — Prefill từ hôm qua (FR-PS-01)**
- *Given* `DailyState` của hôm qua có mood=3, energy=4, focus=5, sleep=7.5 và hôm nay chưa ghi, *When* mở `/state`, *Then* các giá trị hiển thị mặc định là 3/4/5/7.5 và dòng "Prefill hôm qua: 100% khớp" hiển thị.

**AC-PS-3 — Nhật ký tự do + gợi ý theo ngữ cảnh (FR-PS-02)**
- *Given* người dùng mở `/journal` lúc 20:00, *When* nhìn phần gợi ý, *Then* 3 chip hiển thị đúng 3 câu hỏi "Sau buổi học / Cuối ngày / Cuối tuần" và chip "Cuối ngày" được đánh dấu là chip đang áp dụng.
- *Given* textarea đang có nội dung, *When* bấm một chip gợi ý, *Then* câu hỏi được chèn nguyên văn vào **cuối** textarea, textarea nhận focus và bộ đếm ký tự cập nhật.

**AC-PS-4 — Phản hồi AI đúng cấu trúc, không lời khuyên dài (FR-PS-03)**
- *Given* một mục nhật ký đã commit và có API key, *When* bấm "Gửi AI phản hồi", *Then* khối "Tóm tắt cốt lõi" chứa **đúng 1 câu** và khối "Câu hỏi sắc bén" chứa **đúng 1 câu hỏi**; không có bullet, không có danh sách lời khuyên, không có mục "lời khuyên".
- *Given* AI trả về hợp lệ, *When* lưu xong, *Then* `Reflection.aiFeedback` chứa JSON `{summary, sharpQuestion}` và `AiCall` có `feature="journal_feedback"`, `model="claude-opus-5"`, `ok=true`.

**AC-PS-5 — Phân loại domain/kỹ năng (FR-PS-04)**
- *Given* một mục nhật ký nói về System Design, *When* chạy phân loại, *Then* trả `domain="professional"` và `skillId` trỏ tới một `Skill` **đang tồn tại trong DB**; nếu AI trả `skillId` không tồn tại thì `skillId=null` và `domain` vẫn được giữ.
- *Given* không có API key, *When* chạy phân loại, *Then* kết quả có `source="local"` (rule cục bộ) và **không có** request nào ra ngoài.

**AC-PS-6 — Chỉ gửi lên khi chủ động nhờ (FR-PS-07, NFR-04)**
- *Given* người dùng viết nhật ký và **không** bấm nút AI, *When* theo dõi network log trong 5 phút, *Then* **không có** request nào tới `api.anthropic.com`; nội dung nhật ký chỉ nằm trong SQLite local.
- *Given* người dùng bấm "Gửi AI phản hồi" 1 lần, *When* mở panel "Dữ liệu đã gửi lên", *Then* hiển thị đúng 1 dòng log có thời điểm, model, preview nội dung đã gửi (≤160 ký tự), số token và chi phí ước tính.

**AC-PS-7 — Dữ liệu cá nhân không rời máy (FR-PS-07)**
- *Given* người dùng ghi `DailyState` 30 ngày và mở `/state`, *When* chạy phân tích tương quan, *Then* toàn bộ phép tính diễn ra trong tiến trình Next.js, **không có** request ra ngoài, và kết quả trả về từ SQLite.
- *Given* người dùng ghi `DailyState` hôm nay, *When* kiểm tra bảng `AiCall`, *Then* **không có** dòng nào chứa dữ liệu `DailyState`.

**AC-PS-8 — Biểu đồ chỉ số ↔ hành động hoàn thành (FR-PS-06)**
- *Given* có dữ liệu ≥7 ngày gồm `DailyState` và `PlanItem.done`, *When* mở `/state`, *Then* biểu đồ hiển thị 3 series mood/energy/sleep **và** overlay số slot hoàn thành trong ngày; toggle "30 Ngày" đổi khoảng hiển thị mà không phải tải lại trang.

**AC-PS-9 — Tương quan chỉ số ↔ hiệu suất học (FR-PS-05)**
- *Given* ≥7 ngày dữ liệu, *When* gọi `GET /api/state/correlations?window=30`, *Then* trả về `sufficiency="ok"`, `n` = số ngày có dữ liệu, và danh sách phát hiện có **ít nhất 1 phát hiện** dạng "khi <chỉ số> <ngưỡng> thì <chỉ số khác> thay đổi <±%>" kèm `n` và `confidence`.
- *Given* <7 ngày dữ liệu, *When* gọi cùng route, *Then* trả `sufficiency="insufficient"` và `findings=[]` — **không** bịa phát hiện.

**AC-PS-10 — Sửa nhật ký cũ không tự gọi AI (FR-PSJ-06)**
- *Given* một mục nhật ký đã có phản hồi AI, *When* người dùng sửa nội dung và lưu, *Then* phản hồi cũ được đánh dấu lỗi thời, **không có** `AiCall` mới được tạo, và mục nhật ký vẫn có thể gửi lại AI bằng thao tác thủ công.

**AC-PS-11 — Lỗi không làm sập trang**
- *Given* API trả `stop_reason:"refusal"`, *When* gọi AI-05, *Then* hiện thông báo thân thiện có nút "Thử lại", ghi `AiCall{ok:false, error:"refusal"}`, và trang `/journal` không crash.
- *Given* mất mạng, *When* bấm "Gửi AI phản hồi", *Then* hiện toast "Không có kết nối…", nhật ký đã ghi vẫn còn nguyên trong SQLite.

## 9. Rủi ro riêng của feature

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| PS-R1 | **AI "lời khuyên dài"** — vi phạm FR-PS-03 và làm mất ý nghĩa "1 câu hỏi sắc". | System prompt của AI-05 có 3 ràng buộc cứng ("đúng 1 câu", "≤160/≤240 ký tự", "cấm bullet/lời khuyên") + Zod schema `summary`/`sharpQuestion` có `max()`. Kiểm chứng bằng unit test đếm số câu. |
| PS-R2 | **Rò rỉ dữ liệu cá nhân** (nhật ký là dữ liệu nhạy cảm nhất). | P6 bắt buộc: 1 route duy nhất được đọc nội dung nhật ký để gửi; cờ `consent` bắt buộc; mọi lần gửi có log + preview; `DailyState` không bao giờ ra khỏi máy. Test tự động chặn network egress khi không có thao tác người dùng. |
| PS-R3 | **Gửi AI nhiều lần làm đốt chi phí** (mỗi lượt gọi Opus 5). | Nút disable trong lúc gọi + hạn mức 3 lượt/phút/IP; `AiCall` ghi lại từng lượt để S15 hiển thị chi phí; cache prefix system prompt giữ chi phí thấp. |
| PS-R4 | **Bản nháp trùng lặp với mục đã commit** (mất dữ liệu hoặc đếm trùng). | `Reflection.status` phân biệt `draft`/`published`; truy vấn thống kê chỉ tính `published`; autosave chỉ ghi đè bản nháp, không bao giờ ghi đè bản đã commit. |
| PS-R5 | **Tương quan trên mẫu nhỏ cho ra kết luận sai** (7 ngày mà kết luận "ngủ ảnh hưởng 42%"). | Bắt buộc `n ≥ 7` và `sufficiency="insufficient"` khi thiếu dữ liệu; hiển thị `n` và `confidence` cạnh mỗi phát hiện; nêu rõ là tương quan quan sát, không phải quan hệ nhân quả. |
| PS-R6 | **Lệch giữa prototype (giấc ngủ REM/Deep/Light) và data model** (`DailyState.sleep` chỉ lưu tổng giờ). | Chốt theo SPEC §4: chỉ lưu tổng giờ; UI hiển thị 1 thanh tổng 0–10h. Ghi rõ trong §6.2.2. Không mô phỏng dữ liệu ngủ giả. |
| PS-R7 | **Lệch giữa prototype (nút AI màu emerald) và design-system (AI = indigo)**. | Theo design-system §7.1, thao tác AI dùng `bg-surface-container-high text-secondary` + viền `secondary/40`; emerald giữ cho "tiến độ/bằng chứng". Ghi nhận trong `design.md` §2.3 (DEC-06). |
| PS-R8 | **Ngày chuẩn hoá sai (UTC lệch 1 ngày)** làm lệch toàn bộ biểu đồ và tương quan. | Mọi ngày dùng chuỗi `yyyy-MM-dd` theo local (tech.md §5); SQL dùng `strftime(..., 'utc')` cho cột ngày đã chuẩn hoá và `'localtime'` cho `createdAt`; unit test khẳng định khóa mapping ở 2 mốc 23:30 và 00:30. |
