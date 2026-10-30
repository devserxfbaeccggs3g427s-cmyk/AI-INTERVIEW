# Cài đặt & Quản lý chi phí AI (S15)

> **Màn hình:** S15 · **Route:** `/settings` · **Phase:** 0
> **Nguồn:** `system-design/SPEC.md` §3.2 (S15), §2.5 (FR-PS-07), §2.7 (FR-AI-06/07/08), §4, §5.1–5.7, §6 (NFR-04/08/09), §10 (Q1–Q8) · prototype `system-design/s15_c_i_t_qu_n_l_chi_ph_ai/`
> **Phụ thuộc:** schema Prisma dùng chung (SPEC.md §4) + wrapper `src/lib/anthropic.ts` ghi log `AiCall` (SPEC.md §5.7)

## 1. Tổng quan

S15 là màn hình **quản trị toàn bộ hệ thống** của Daily Loop OS: hồ sơ người dùng, khóa API Anthropic, bảng theo dõi chi phí AI và quản trị dữ liệu cục bộ. Nó không phải nơi "dùng" app mà là nơi **kiểm soát** app — người dùng ở đây quyết định AI có được phép chạy hay không, AI đang tốn bao nhiêu tiền, và dữ liệu của họ đã đi đâu.

Feature này thuộc các nguyên tắc:

- **P6 (Local-first)** — trung tâm: mọi dữ liệu nằm trong SQLite trên máy; key nằm trong `.env.local`; S15 là nơi *chứng minh* điều đó cho người dùng (log "dữ liệu nào đã gửi lên API").
- **P2 / P5** — không thêm domain thứ 5, không thêm màn hình con mới; mọi thứ gộp trong 1 route `/settings` với 4 tab.
- **FR-AI-06** — thiếu API key không được làm app sập; S15 phải hiển thị **rõ** chế độ offline để người dùng hiểu vì sao AI im lặng.
- **FR-AI-07 + FR-AI-08** — bảng `AiCall` không phải log kỹ thuật ẩn, mà là **bảng điều khiển chi phí** mà người dùng nhìn mỗi tháng để quyết định có dùng Opus hay Haiku.

Người dùng mục tiêu là chủ sở hữu duy nhất, đang làm việc, không muốn phụ thuộc dịch vụ trả phí vô hạn. S15 cho họ 3 câu trả lời: **AI có chạy không? · Tốn bao nhiêu? · Dữ liệu của tôi đã đi đâu?**

## 2. Bối cảnh & vấn đề

- **Chi phí API không kiểm soát được → R4 (SPEC §9).** Không có bảng `AiCall` hiển thị, người dùng chỉ biết tiền biến mất trên console.anthropic.com. SPEC §5.7 đã có bảng ước tính 4–22 USD/tháng nhưng ghi rõ "đây là ước tính — cần đo thật sau 1 tuần". S15 là nơi biến ước tính thành **số đo thật** và thành **ngân sách cảnh báo**.
- **Prompt caching là ưu thuật lớn nhất nhưng không kiểm chứng được.** FR-AI-08 yêu cầu hiển thị `cache_read_input_tokens` ở S15. Nếu cache hỏng, chi phí tăng 3–5× mà không ai biết vì sao.
- **Key API nằm rải rác trong file → FR-AI-06 khó bật/tắt.** Người dùng không biết app đang offline hay đang hỏng key. SPEC §3.2 yêu cầu "trạng thái kết nối (test 1 call)" — phải có 1 nút ping và 1 trạng thái rõ ràng.
- **R7 / FR-PS-07: "dữ liệu nào đã gửi lên" là yêu cầu P0 nhưng chưa có màn hình nào hiện nó.** Đặt ở S15 vì đây là nơi người dùng đi kiểm tra quyền riêng tư.
- **NFR-08: người dùng không được bị "khoá" trong hệ thống.** Cần xuất toàn bộ dữ liệu ra JSON và có đường thoát an toàn (xoá trắng) nếu họ muốn rời đi.

## 3. Yêu cầu chức năng

### 3.1 Hồ sơ & mục tiêu

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SC-01 | Sửa **tên** người dùng (tối đa 80 ký tự) → `UserProfile.name`. Rỗng = ẩn tên ở màn khác. | P0 | S15 §3.2 · Q1 |
| FR-SC-02 | Viết **mục tiêu dài hạn** (textarea, tối đa 2000 ký tự) → `UserProfile.goals`. Nội dung này được đưa vào prompt AI khi sinh kế hoạch tuần. | P0 | S15 §3.2 · Q4 |
| FR-SC-03 | Chọn **giọng văn AI**: `direct` / `coach` / `gentle` → `UserProfile.aiTone`. Giá trị này là tham số bắt buộc của mọi prompt AI trong app. | P0 | S15 §3.2 |
| FR-SC-04 | Bật/tắt **ngôn ngữ đang học** `en` / `zh` / `vi` → `UserProfile.learningLangs`. Ràng buộc: **phải còn ≥ 1 ngôn ngữ bật**; `en` **không được tắt** (ngôn ngữ mục tiêu chính). | P0 | S15 §3.2 · Q2 |
| FR-SC-05 | Xem và sửa **mức hiện tại** của từng ngôn ngữ → `UserProfile.zhLevel` / `enLevel` / `viLevel` trên **thang CEFR đầy đủ** `zero · A1 · A2 · B1 · B2 · C1 · C2` (tiếng Trung hiển thị kèm **HSK** tương ứng). | P1 | S15 §3.2 · Q7 |
| FR-SC-06 | Chọn **ngôn ngữ phỏng vấn** mặc định `en` / `vi` → `UserProfile.interviewLang` (mặc định áp dụng cho hồ sơ mock interview tạo mới). | P1 | FR-MI-01 · Q2 |
| FR-SC-07 | Lưu hồ sơ có phản hồi rõ ràng (nút **Lưu thay đổi** + toast `aria-live="polite"`). Không mất dữ liệu đang gõ khi chuyển tab. | P0 | NFR-06 |

### 3.2 Khóa API Anthropic & kết nối

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SC-08 | Nhập `ANTHROPIC_API_KEY` → lưu vào **`.env.local`** (tạo nếu chưa có, `chmod 600`, không đụng các biến khác, file nằm trong `.gitignore`). | P0 | S15 §3.2 · NFR-09 |
| FR-SC-09 | Hiển thị **trạng thái kết nối** dạng chip: chưa có key · hợp lệ · sai (401) · bị giới hạn tần suất (429) · không gọi được (mạng) · đang kiểm tra. | P0 | S15 §3.2 · FR-AI-05 |
| FR-SC-10 | Nút **"Chạy kiểm tra Ping Anthropic Endpoint"** gọi **1 request tối thiểu** (`max_tokens: 1`, model `claude-haiku-4-5`), đo độ trễ, ghi 1 dòng `AiCall` với `feature = "key_test"` để đối soát. | P0 | S15 §3.2 |
| FR-SC-11 | Key **chỉ hiển thị dạng che** `sk-ant-…abcd` (4 ký tự cuối). Nút mắt (`visibility_off` / `visibility`) chỉ bật/tắt hiển thị 4 ký tự cuối — **không bao giờ** tải key đầy đủ xuống client. | P0 | NFR-09 |
| FR-SC-12 | Sau khi lưu key mới: hiển thị cảnh báo rõ **"cần khởi động lại dev server để có hiệu lực"** kèm 1 bước kiểm tra tự động (xem §6.4). | P0 | Edge case |
| FR-SC-13 | **Xoá khóa API** khỏi `.env.local` → app quay về chế độ offline ngay ở request kế tiếp. | P1 | NFR-09 |
| FR-SC-14 | **Chế độ khẩn cấp tiết kiệm** (toggle): khi bật, mọi call AI đều ép về `claude-haiku-4-5`; khi offline, dùng bộ sinh rule cục bộ. | P1 | R4 · FR-AI-03 |

### 3.3 Chi phí AI & Prompt Caching

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SC-15 | **Tổng chi phí theo ngày**: biểu đồ cột + bảng ngày (ngày, số call, input, output, cache read, cache write, USD). Khoảng mặc định: 30 ngày gần nhất; đổi được. | P0 | S15 §3.2 · FR-AI-07 |
| FR-SC-16 | **Chi phí theo tính năng**: thanh phân bổ (stacked bar) + danh sách từng feature với model, số lượt, USD, % tổng phí. | P0 | S15 §3.2 · FR-AI-07 |
| FR-SC-17 | **Tổng token**: input / output / cache read / cache write (hiển thị dạng số có dấu phân cách nghìn, font tabular). | P0 | S15 §3.2 |
| FR-SC-18 | **Ước tính USD** theo bảng giá từng model, dùng đúng công thức §6.5. Mọi nơi hiển thị tiền đều là **ước tính**, phải gắn nhãn "ước tính". | P0 | S15 §3.2 · SPEC §5.7 |
| FR-SC-19 | **Chứng minh caching hoạt động** (FR-AI-08): hiển thị `cache_read_input_tokens` ở **từng dòng** nhật ký lẫn ở tổng, kèm **cache hit rate** = `cacheRead / (input + cacheRead + cacheWrite)`. Khi hit rate = 0 ở call thứ 2 trở đi → hiển thị cảnh báo "cache có thể đang hỏng". | P0 | FR-AI-08 |
| FR-SC-20 | **Nhật ký gọi API gần nhất** (bảng `AiCall`): Thời gian · Tính năng · Mô hình · Input Token · Cache Read · Output Token · Chi phí (USD) · Trạng thái. Phân trang 25 dòng/trang. | P0 | FR-AI-07 |
| FR-SC-21 | **Xuất AiCall CSV** cho khoảng lọc hiện tại (tải về file `.csv`, UTF-8, cột tiếng Việt). | P1 | NFR-08 |
| FR-SC-22 | **Ngân sách tháng** (USD) + cảnh báo khi vượt **80%** và khi vượt 100% (màu `tertiary` → `error`). R4 yêu cầu "ngân sách cảnh báo trong S15". | P1 | R4 |
| FR-SC-23 | Bộ lọc thời gian dùng chung cho mọi biểu đồ và bảng trong tab Chi phí. | P1 | FR-AI-07 |

### 3.4 Dữ liệu & minh bạch

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SC-24 | **Xuất toàn bộ cơ sở dữ liệu (JSON)**: 1 file `.json` chứa tất cả bảng + hồ sơ + metadata (`schemaVersion`, `exportedAt`). Tải về trực tiếp, không qua máy chủ trung gian. | P0 | S15 §3.2 · NFR-08 |
| FR-SC-25 | **Xoá trắng dữ liệu có xác nhận 2 bước**: bước 1 mở hộp thoại cảnh báo; bước 2 phải **gõ đúng `XOA`** để mở khoá nút xoá. Xoá trong **1 transaction**; không xoá dở dang. | P0 | S15 §3.2 · NFR-08 |
| FR-SC-26 | Hiển thị **dung lượng DB** (đọc kích thước file SQLite) + số bản ghi theo từng bảng. | P0 | S15 §3.2 |
| FR-SC-27 | **Nhật ký "dữ liệu nào đã gửi lên API"** (FR-PS-07): mỗi lần gọi AI lưu *loại dữ liệu* đã gửi (`journal_text`, `reflection_prompt`, `activity_title`, `skill_name`, `profile_goals`…) + 1 đoạn **xem trước rút gọn** (≤ 280 ký tự, cắt giữa câu). Danh sách sắp xếp mới nhất trước, lọc theo tính năng. | P0 | FR-PS-07 · NFR-04 |
| FR-SC-28 | **Trạng thái offline hiển thị rõ** (FR-AI-06): khi thiếu key, hiện banner toàn trang + giải thích AI nào dừng hoạt động (AI-01 vẫn chạy bằng rule cục bộ) và link nhảy tới tab Khóa API. | P0 | FR-AI-06 |
| FR-SC-29 | **Nhập lại JSON** (restore) — **không thuộc Phase 0**. SPEC §7 đưa "xuất dữ liệu" sang Phase 3; Phase 0 chỉ cung cấp chiều **xuất** + hướng dẫn khôi phục bằng `npm run db:seed`. | P2 | NFR-08 · SPEC §7 |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-SC-01 | Mobile-first | Mọi khối dùng được ở 390px; bảng `AiCall` cuộn ngang trong `overflow-x-auto`, không phá layout. |
| NFR-SC-02 | An toàn key (NFR-09) | Key đầy đủ **không bao giờ** xuất hiện trong payload HTTP, trong HTML render, trong log server, trong JSON export. |
| NFR-SC-03 | Không log bí mật | Không `console.log` giá trị key; chỉ log dạng mask (`sk-ant-…abcd`) nếu cần. |
| NFR-SC-04 | Tốc độ (NFR-02) | `/settings` render server-side < 500ms với ≤ 10.000 dòng `AiCall`; các bảng tổng hợp dùng truy vấn gom nhóm, không kéo toàn bộ bảng về JS. |
| NFR-SC-05 | A11y (NFR-06) | Icon-only có `aria-label`; trạng thái dùng `aria-live="polite"`; focus ring `focus-visible:ring-2 focus-visible:ring-primary`; tương phản ≥ AA. |
| NFR-SC-06 | Offline (NFR-03) | Không mạng và không có key: `/settings` vẫn render đầy đủ, bảng chi phí vẫn đọc được từ SQLite. |
| NFR-SC-07 | Minh bạch dữ liệu (NFR-04) | Người dùng luôn xem được: dữ liệu nào đã lên API, lúc nào, gửi đi bao nhiêu token. |
| NFR-SC-08 | Không khoá người dùng (NFR-08) | Xuất JSON luôn khả dụng; file export mở được bằng trình soạn text thuần. |
| NFR-SC-09 | Bền vững dữ liệu | Xoá dữ liệu là 1 transaction: hoặc xoá hết, hoặc không xoá gì. |

## 5. Mô hình dữ liệu

### 3.9 Mục tiêu sắp tới (Q8)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SC-23 | Quản lý **mục tiêu sắp tới** (`UpcomingGoal`): kỳ thi (`exam`) · chứng chỉ (`cert`) · vị trí (`role`) · kỹ năng (`skill`). Mỗi mục có tiêu đề, ngôn ngữ, chuẩn, mức đích, ngày thi (có thể null = chưa chốt), trạng thái, độ ưu tiên. | P1 | Q8 · M11 |
| FR-SC-24 | Nút **"AI đề xuất mục tiêu"** — khi chưa có mục tiêu nào, AI gợi ý mục tiêu hợp lý dựa trên `focusSkillIds` + trình độ hiện tại (VD: "HSK 3 trong ~6 tháng ở nhịp hiện tại"). | P1 | Q8 |
| FR-SC-25 | Chọn **chuẩn hiển thị ưu tiên** → `UserProfile.languageStandard`: `cefr` \| `hsk` \| `both`. Mặc định `cefr`. | P1 | Q7 · C32 |
| FR-SC-26 | Hiển thị **mức hiện tại của tiếng Việt** (`UserProfile.viLevel`, mặc định `B2`) — bản ngữ, để AI biết không cần dạy ngữ pháp vi. | P1 | Q3 · C29 |

### 5.1 Bảng dùng lại (không đổi)

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `UserProfile` | `id` | `String @id` | Có đúng 1 dòng (single-user). |
| | `name` | `String?` | FR-SC-01. |
| | `goals` | `String?` | FR-SC-02 — mục tiêu dài hạn. |
| | `aiTone` | `String` (`direct`\|`coach`\|`gentle`) | FR-SC-03 — tham số prompt toàn app. |
| | `learningLangs` | `String` (`"zh,en"`) | FR-SC-04 — chuỗi CSV, phải có ≥ 1 phần tử. |
| | `zhLevel` | `String` (`"zero"`) | FR-SC-05. |
| | `enLevel` | `String` (`"zero"`) | FR-SC-05. |
| `AiCall` | `id` | `String @id` | Log từng lời gọi AI. |
| | `feature` | `String` | `daily_plan\|log_autofill\|grading\|journal_feedback\|classify\|weekly_review\|roleplay\|mock_interview\|language_test\|key_test` |
| | `model` | `String` | `claude-opus-5` \| `claude-haiku-4-5`. |
| | `inputTokens` / `outputTokens` | `Int` | Token **không** tính vào cache. |
| | `cacheRead` / `cacheWrite` | `Int` | FR-AI-08 — `cacheRead` = `cache_read_input_tokens`. |
| | `estimatedCost` | `Float` | USD — xem công thức §6.5. |
| | `ok` / `error` | `Boolean` / `String?` | Lỗi API vẫn ghi log (SPEC §5.5). |
| | `createdAt` | `DateTime` | `@@index([createdAt])` — dùng cho lọc theo ngày. |

> **Registry:** `.kiro/steering/data-model-registry.md` §1 — `AiCall.dataKinds` = **`C6`** ·
> `AiCall.dataPreview` = **`C7`** · `UserProfile.interviewLang` = **`C8`** ·
> `UserProfile.monthlyBudgetUsd` = **`C9`** · `UserProfile.saverMode` = **`C10`**.
> Cả 5 đều nullable/có mặc định ⇒ **không phá model cũ**.

### 5.2 Mở rộng cần thiết (deviation có chủ đích so với SPEC.md §4)

SPEC.md §4 đóng băng 19 model cho Phase 0. S15 cần **4 field mới** để đáp ứng FR-PS-07, FR-SC-06, FR-SC-22, FR-SC-14 — tất cả đều là field **nullable/có mặc định**, không phá model cũ:

| Model | Field mới | Kiểu | Mặc định | Lý do |
|---|---|---|---|---|
| `AiCall` | `dataKinds` | `String` | `"[]"` | FR-PS-07 — JSON array các *loại* dữ liệu đã gửi lên API. |
| `AiCall` | `dataPreview` | `String?` | `null` | FR-PS-07 — trích 280 ký tự đầu nội dung đã gửi, cắt giữa câu. |
| `UserProfile` | `interviewLang` | `String` | `"en"` | FR-SC-06 — ngôn ngữ phỏng vấn mặc định. |
| `UserProfile` | `monthlyBudgetUsd` | `Float` | `15` | FR-SC-22 — ngân sách tháng (mặc định theo kịch bản "nặng" SPEC §5.7). |
| `UserProfile` | `saverMode` | `Boolean` | `false` | FR-SC-14 — chế độ khẩn cấp tiết kiệm. |

> **Ghi chú:** không thêm bảng mới ở Phase 0. `AiCall` đã là bảng nhật ký AI duy nhất — mọi thứ liên quan chi phí/privacy đều dẫn xuất từ đó (giữ đúng tinh thần "bảng trung tâm" của SPEC §4).

### 5.3 Quan hệ & ràng buộc

- `UserProfile` là singleton — API `PUT /api/settings/profile` dùng `upsert` theo `id` cố định (`"default"`), không tạo dòng thứ hai.
- `learningLangs` phải parse được thành mảng `["zh","en"]` và **không rỗng** — validate bằng Zod trước khi ghi.
- `AiCall.createdAt` giữ nguyên `DateTime` UTC của Prisma; **ngày hiển thị** chuẩn hoá theo `src/lib/dates.ts` (00:00 local, so sánh bằng chuỗi `yyyy-MM-dd`).
- `AiCall` **không** bị xoá khi người dùng xoá một activity/phiên; nó là log vận hành, chỉ bị xoá khi "Xoá trắng dữ liệu".
- Xoá trắng dữ liệu xoá **mọi** bảng nghiệp vụ **kể cả** 120 thẻ seed; hộp thoại cảnh báo phải nói rõ điều này và đưa lệnh `npm run db:seed` để nạp lại.

## 6. Giao diện & hành vi

### 6.1 Bố cục

**Cấu trúc trang (1 route, 4 tab, khung 12 cột):**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [DAILY LOOP OS · HỆ THỐNG & CẤU HÌNH CỤC BỘ] ● NODE_ENV: local-first              │
│ Cài Đặt Hệ Thống & Quản Lý Chi Phí AI                          │ [● Cache: ACTIVE]  │
│ 🗄 SQLite v3.45 Connected · 1.429 bản ghi · Không đồng bộ đám mây │ [🛡 Local Vault]   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [👤 Hồ sơ & Mục tiêu] [🔑 Khóa API Anthropic] [📊 Chi Phí AI & Prompt Caching ✦TỐI ƯU] │
│ [🗄 Quản trị dữ liệu]                                        ← tab, cuộn ngang 390px  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ BANNER CHẾ ĐỘ OFFLINE (chỉ hiện khi thiếu key):                                │
│   "Chưa có ANTHROPIC_API_KEY — AI đang tạm dừng. Kế hoạch ngày vẫn chạy bằng rule  │
│    cục bộ. [Thêm khóa API →]                                                      │
├──────────────────────────────────────┬───────────────────────────────────────────────┤
│ CỘT CHÍNH (xl:col-span-8)            │ CỘT PHỤ (xl:col-span-4)                      │
│  ┌────────────────────────────────┐  │  ┌─────────────────────────────────────────┐  │
│  │ BENTO 3 ô: Ngân sách | Cache  │  │  │ PANEL: Cấu Hình Khóa API                │  │
│  │ hit rate | Tổng lượt gọi      │  │  │  • input ANTHROPIC_API_KEY (masked)     │  │
│  ├────────────────────────────────┤  │  │  • trạng thái + nút Ping + đổi khóa     │  │
│  │ PANEL: Phân Bổ Chi Phí Theo    │  │  │  • notice P6 strict (.env.local)        │  │
│  │ Tính Năng (stacked bar + list) │  │  │  • toggle Chế độ khẩn cấp tiết kiệm   │  │
│  ├────────────────────────────────┤  │  ├─────────────────────────────────────────┤  │
│  │ PANEL: Nhật Ký Gọi API Gần Nhất│  │  │  │ PANEL: Backup & Sao Lưu Hệ Thống      │  │
│  │  bảng AiCall + phân trang      │  │  │  • [Xuất toàn bộ CSDL (JSON)]           │  │
│  │  + [Xuất AiCall CSV]           │  │  │  • VÙNG NGUY HIỂM: [Xóa trắng (2 bước)]│  │
│  └────────────────────────────────┘  │  └─────────────────────────────────────────┘  │
└──────────────────────────────────────┴───────────────────────────────────────────────┘
```

**Tab 1 — Hồ sơ & Mục tiêu:**

```
┌──────────────────────────────────────────────────────────┐
│ HỒ SƠ & MỤC TIÊU                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ TÊN HIỂN THỊ          [______________________]      │ │
│ │ MỤC TIÊU DÀI HẠN (textarea, 2000 ký tự)            │ │
│ │ [ Mục tiêu 6 tháng của tôi là…                    ] │ │
│ │ GIỌNG VĂN AI    (●) Trực tiếp  ( ) Huấn luyện      │ │
│ │                 ( ) Nhẹ nhàng                          │ │
│ │ NGÔN NGỮ ĐANG HỌC  [✓] Tiếng Trung  [✓] Tiếng Anh   │ │
│ │ MỨC HIỆN TẠI     Tiếng Trung [zero ▾]                │ │
│ │                  Tiếng Anh  [zero ▾]                  │ │
│ │ NGÔN NGỮ PHỎNG VẤN  (●) English  ( ) Tiếng Việt     │ │
│ │                              [ Lưu thay đổi ]          │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Tab 2 — Khóa API Anthropic & Kết nối:**

```
┌──────────────────────────────────────────────────────────┐
│ ANTHROPIC CLOUD BRIDGE                          [ENV 1.1] │
│ Cấu Hình Khóa API                                        │
│ ANTHROPIC_API_KEY                                        │
│ [ sk-ant-•••••••••••••••••••••••••••••abcd ]        [👁]  │
│ ● Đã kiểm tra: OK (42ms)                    Đổi khóa API│
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🛡 NGUYÊN TẮC BẢO MẬT P6 STRICT                     │ │
│ │ Key chỉ lưu trong .env.local, không gửi qua server  │ │
│ └──────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🍃 Chế độ khẩn cấp tiết kiệm               [ switch ]│ │
│ └──────────────────────────────────────────────────────┘ │
│ [ 🔄 Chạy kiểm tra Ping Anthropic Endpoint ]            │
└──────────────────────────────────────────────────────────┘
```

**Tab 3 — Chi phí AI & Prompt Caching:** (khung chính, xem §6.1 khung trang)

```
┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
│ NGÂN SÁCH THÁNG 10/2026  │ CACHE HIT RATE (PREFIX)   │ TỔNG SỐ LƯỢT GỌI (AiCall)│
│ $4.82 / $15.00 limit      │ 91.4%   [OPTIMAL]         │ 142  lượt chạy           │
│ ▓▓▓░░░░░░░░░░░ 32.1%      │ sparkline 12 cột           │ 139 OK · 3 fallback      │
└───────────────────────────┴───────────────────────────┴───────────────────────────┘
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Phân Bổ Chi Phí Theo Tính Năng                     [filter_alt Tháng 10/2026]    │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ● Mock Interview 38%  ● Daily Plan 23%  ● Communication 20%  ● Language Test 15%│
│ ┌───────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🎙 Mock Interview   claude-opus-5 · 48 lượt              $1.85   38% tổng phí │ │
│ │ 📅 Daily Plan Gen.  claude-opus-5 · 31 lượt              $1.10   23% tổng phí │ │
│ │ ✎ Communication     claude-opus-5 · 26 lượt              $0.95   20% tổng phí │ │
│ │ 🎓 Language Test    claude-opus-5 · 18 lượt              $0.72   15% tổng phí │ │
│ │ ⚡ Quick autofill   claude-haiku-4-5 · 19 lượt            $0.20    4% tổng phí │ │
│ └───────────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Nhật Ký Gọi API Gần Nhất            [Schema: AiCall]   [📄 Xuất AiCall CSV]     │
│ ┌───────────────────────────────────────────────────────────────────────────────┐ │
│ │ Thời gian │ Tính năng │ Mô hình │ Input │ Cache Read │ Output │ Chi phí │ TT  │ │
│ │ 14:22    │ mock_...  │ opus-5  │ 3.420 │ 3.100(Hit) │   420  │ $0.029  │ OK │ │
│ │ 12:10    │ language… │ opus-5  │ 2.850 │ 2.500(Hit) │   380  │ $0.024  │ OK │ │
│ │ 07:30    │ daily_... │ opus-5  │ 4.100 │ 3.800(Hit) │   650  │ $0.031  │ OK │ │
│ │ 07:05    │ log_...   │ haiku   │   450 │         0 │    65  │ $0.001  │ OK │ │
│ └───────────────────────────────────────────────────────────────────────────────┘ │
│ Hiển thị 4 trong 142 bản ghi        [Trang trước] [Trang 1/6] [Trang kế]      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Tab 4 — Quản trị dữ liệu (Backup / Export JSON) + Minh bạch dữ liệu:**

```
┌───────────────────────────────┬──────────────────────────────────────────────┐
│ QUẢN TRỊ DỮ LIỆU CỤC BỘ     │ MINH BẠCH DỮ LIỆU ĐÃ GỬI LÊN API            │
│ Backup & Sao Lưu Hệ Thống     │ (FR-PS-07)                                   │
│ [⬇ Xuất toàn bộ CSDL (JSON)]  │ ┌──────────────────────────────────────────┐ │
│ Dung lượng DB: 12.4 MB       │ │ 14:22 mock_interview  journal_text       │ │
│ Skills 24 · Activities 312   │ │ "Hôm nay mệt, cảm giác không tiến được…" │ │
│ Cards 120 · AiCall 142       │ │ 12:10 language_test   activity_title     │ │
│ ┌───────────────────────────┐ │ │ "Review bài về tối ưu truy vấn"         │ │
│ │ ⚠ VÙNG NGUY HIỂM         │ │ └──────────────────────────────────────────┘ │
│ │ [🗑 Xóa trắng (2 bước)]  │ │ Lọc theo tính năng · Xem trước nội dung    │
│ └───────────────────────────┘ │                                              │
└───────────────────────────────┴──────────────────────────────────────────────┘
```

### 6.2 Bảng thành phần

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header | Eyebrow chip | `font-label-sm text-label-sm uppercase tracking-wider px-2 py-0.5 rounded bg-surface-container-highest text-primary font-semibold` | Tĩnh. |
| Header | Tiêu đề trang | `font-headline-lg text-headline-lg text-on-surface tracking-tight` | Tĩnh; mobile → `headline-lg-mobile`. |
| Header | Dòng trạng thái DB | `font-body-md text-body-md text-on-surface-variant` + icon `text-primary` | Server-rendered: số bản ghi thật + dung lượng DB. |
| Header | Chip trạng thái (Cache ACTIVE / Local Vault) | `bg-surface-container font-label-md text-label-md` · icon `text-secondary` | "Cache ACTIVE" chỉ hiện khi `cacheRead > 0`. |
| Tabs | Tab không active | `px-4 py-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-label-md` | Click đổi tab (Client Component). |
| Tabs | Tab active | `px-4 py-2 rounded bg-primary/10 text-primary font-semibold shadow-inner` | 1 tab active; tab "Chi phí" có badge `bg-primary text-on-primary font-label-sm text-[10px] px-1.5 py-0.2 rounded` "TỐI ƯU". |
| Banner offline | Cảnh báo thiếu key | `bg-tertiary/10 border border-tertiary/30 text-tertiary rounded-xl p-gutter` + `text-on-surface-variant` | `role="status"`, có nút "Thêm khóa API →" chuyển sang tab 2. |
| Panel | Vỏ panel | `rounded-xl bg-surface-container-low p-gutter-lg shadow-sm` | — |
| Bento | Ô metric | `rounded-xl bg-surface-container-low p-gutter shadow-sm` + blur `bg-primary/5 rounded-full blur-2xl` | 3 ô: Ngân sách · Cache hit rate · Tổng lượt gọi. |
| Bento | Nhãn metric | `font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider` | — |
| Bento | Giá trị metric | `font-headline-lg text-headline-lg text-on-surface font-semibold` (AI → `text-secondary`) | Tiền dùng `font-code-md` phụ. |
| Bento | Thanh ngân sách | track `w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden` · fill `h-full bg-primary rounded-full` | ≥80% → fill `bg-tertiary`; ≥100% → `bg-error`. |
| Bento | Sparkline cache | 12 cột `w-1/12 h-[X%] rounded-xs bg-secondary/30…90` | Ẩn nếu < 2 ngày có dữ liệu. |
| Biểu đồ | Thanh phân bổ | `w-full h-3 rounded-full overflow-hidden flex bg-surface-container-highest` · segment `bg-primary` / `bg-secondary` / `bg-tertiary` / `bg-secondary-fixed-dim` / `bg-primary-fixed` | `title` tooltip: "feature: $x (y%)". |
| Biểu đồ | Chú giải | `font-label-sm text-label-sm text-on-surface-variant` + swatch `w-2.5 h-2.5 rounded-xs` | Tối đa 5 mục + "Khác". |
| Danh sách feature | Hàng | `p-space-md rounded-lg bg-surface-container flex items-center justify-between` | Hover `hover:bg-surface-container-high`. |
| Danh sách feature | Icon hộp | `w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0` | Icon theo domain/tính năng. |
| Bảng | Vỏ bảng | `overflow-x-auto rounded-lg bg-surface-container-lowest` | Cuộn ngang ở 390px. |
| Bảng | Header | `bg-surface-container text-outline font-label-sm text-label-sm uppercase tracking-wider` | Cột số căn phải (`text-right`). |
| Bảng | Body | `divide-y divide-outline-variant/10 text-on-surface font-code-md text-code-md` + `tabular-nums` | Row hover `hover:bg-surface-container/60`. |
| Bảng | Chip tính năng | `px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm` (AI) · `bg-secondary/15 text-secondary` (test) · `bg-tertiary/15 text-tertiary` (plan) | Tô màu theo nhóm tính năng. |
| Bảng | Cache read | `text-primary font-semibold` + suffix `(Hit)` | FR-AI-08 — **cột bắt buộc**. |
| Bảng | Chip trạng thái | OK: `bg-primary/10 text-primary` + dot `bg-primary` · Lỗi: `bg-error-container/20 text-error` | `ok=false` → hiện tooltip `error`. |
| Bảng | Phân trang | `px-2.5 py-1 rounded bg-surface-container text-outline hover:text-on-surface` · trang hiện tại `bg-surface-container-high text-on-surface` | Disabled khi không có trang trước/sau. |
| Bảng | Nút CSV | `px-3 py-1.5 rounded bg-surface-container text-on-surface font-label-md hover:bg-surface-container-high` + icon `file_download` | Tải file `.csv`. |
| API key | Input bí mật | `w-full bg-surface-container-lowest text-on-surface font-code-md px-3.5 py-2.5 rounded-lg focus:outline-none pr-10 shadow-inner` | `type="password"`, `readOnly` khi đã lưu; nút "Đổi khóa API" mới cho phép gõ. |
| API key | Nút mắt | `absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface` | Icon `visibility_off` / `visibility`, `aria-label` bằng tiếng Việt. |
| API key | Chip trạng thái | `font-code-md text-code-md` + icon `check_circle` (ok) / `error` (sai) / `sync` (đang ping) | `aria-live="polite"`. |
| API key | Nút ping | `w-full py-2.5 px-4 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-semibold` + icon `sync` | Khi đang chạy: icon `progress_activity animate-spin` + text "Đang kiểm tra kết nối…", nút disabled. |
| API key | Notice P6 | `p-gutter rounded-lg bg-surface-container` + tiêu đề `text-tertiary font-label-sm uppercase` + code `font-code-md bg-surface-container-highest text-primary px-1 py-0.5 rounded` | Tĩnh. |
| API key | Toggle saver | `w-11 h-6 bg-surface-container-high peer-checked:bg-primary rounded-full` + knob `after:bg-on-primary-container after:rounded-full after:h-5 after:w-5` | Nhãn + mô tả bên trái. |
| Dữ liệu | Nút export JSON | `w-full py-3 px-4 rounded-lg bg-primary-container text-on-primary font-label-md font-semibold hover:brightness-105 active:scale-[0.98]` + icon `download` | Tải file `daily-loop-export-YYYY-MM-DD.json`. |
| Dữ liệu | Vùng nguy hiểm | `p-gutter rounded-lg bg-error-container/20` + tiêu đề `text-error font-label-sm uppercase` | Luôn hiện, không ẩn. |
| Dữ liệu | Nút xoá | `w-full py-2.5 px-4 rounded-lg bg-error-container text-on-error-container font-label-md font-semibold` + icon `delete_forever` | Mở hộp thoại bước 1. |
| Hộp thoại | Overlay | `bg-surface-container backdrop-blur-md` + `1px solid rgba(148,163,184,0.16)` | Focus trap, `Esc` đóng. |
| Hộp thoại | Ô nhập xác nhận | `font-code-md bg-surface-container-lowest rounded-lg px-3 py-2.5` | Chỉ enable nút khi gõ đúng `XOA`. |
| Privacy | Hàng log | `p-space-md rounded-lg bg-surface-container` + `font-code-md text-on-surface-variant` | Mỗi hàng: thời gian · feature · chip loại dữ liệu · xem trước. |
| Form | Label | `font-label-sm text-label-sm text-on-surface-variant uppercase` | Luôn có `htmlFor`. |
| Form | Input / textarea | `w-full bg-surface-container-lowest text-on-surface font-body-md px-3.5 py-2.5 rounded-lg focus:outline-none` | Focus: `focus-visible:ring-2 focus-visible:ring-primary`. |
| Form | Segmented control (giọng văn) | `bg-surface-container-highest rounded-lg p-0.5` · item active `bg-primary-container text-on-primary` | 3 lựa chọn. |
| Form | Switch (ngôn ngữ) | `peer` + `peer-checked:bg-primary` | Ẩn nhãn bằng `sr-only` + `aria-label`. |
| Form | Select mức | `bg-surface-container-lowest rounded-lg` + `font-code-md` | 5 mức, có ghi chú CEFR. |
| Toast | Thông báo lưu | `bg-surface-container-high text-on-surface rounded-lg shadow-md` | `aria-live="polite"`, tự tắt 3s. |

### 6.3 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| **Chưa có key** | `process.env.ANTHROPIC_API_KEY` rỗng và `.env.local` không có | Banner offline toàn trang + chip "Chưa cấu hình" (`text-outline`); input rỗng với placeholder `sk-ant-…`; nút Ping disabled kèm tooltip "Cần nhập khóa trước"; tab Chi phí vẫn đọc được dữ liệu cũ. |
| **Đang ping** | Đang gọi `POST /api/settings/key/test` | Nút Ping disabled + icon `progress_activity animate-spin` + text "Đang kiểm tra kết nối…"; chip trạng thái "Đang kiểm tra" (`text-outline`). |
| **Key hợp lệ** | Test trả 200 | Chip `check_circle` màu `primary`: "Đã kiểm tra: OK (42ms)"; hiện thời điểm kiểm tra; ô khóa ở trạng thái readonly dạng che. |
| **Key sai (401)** | API trả `401 authentication_error` | Chip `error` màu `error`: "Khóa không hợp lệ (401)"; nút "Đổi khóa API" nhấp nháy/nhấn mạnh; hướng dẫn lấy key mới ở console.anthropic.com. |
| **Bị giới hạn tần suất (429)** | API trả `429 rate_limit_error` | Chip `error`: "Bị giới hạn tần suất (429) — thử lại sau N giây"; nút "Thử lại" hiện sau 30s. Không ghi vào bảng chi phí (không có token). |
| **Không gọi được (mạng/timeout)** | `APIConnectionError` | Chip `error`: "Không kết nối được tới Anthropic — kiểm tra mạng"; phân biệt rõ với 401 (nguyên nhân khác nhau). |
| **Offline mode (thiếu key)** | FR-AI-06 | Banner `bg-tertiary/10`: "Đang chạy chế độ offline"; ghi rõ AI-01 vẫn chạy bằng rule cục bộ, các tính năng AI khác tạm dừng; nút dẫn tới tab Khóa API. |
| **Cần restart server** | Vừa lưu key mới vào `.env.local` | Hộp nhắc `bg-tertiary/10` trong tab Khóa API: "Đã ghi .env.local — khởi động lại `npm run dev` để có hiệu lực" + nút "Tôi đã khởi động lại — kiểm tra lại". |
| **Chưa có dữ liệu chi phí** | `AiCall` rỗng | Bento tổng = `0` / `$0.00`; bảng trống có CTA "Kế hoạch ngày sẽ ghi lần gọi đầu tiên" + link tới S01; bar phân bổ hiện track rỗng kèm nhãn "Chưa có lượt gọi nào". |
| **Có lỗi API** | `AiCall.ok = false` | Dòng log hiện chip lỗi + tooltip `error`; tổng "lượt thất bại" đếm riêng, không tính vào tỷ lệ thành công. |
| **Xoá dữ liệu — bước 1** | Bấm "Xóa trắng dữ liệu" | Hộp thoại `bg-surface-container backdrop-blur-md`, liệt kê đúng các bảng sẽ bị xoá + nhắc 120 thẻ seed + lệnh `npm run db:seed`. |
| **Xoá dữ liệu — bước 2** | Trong hộp thoại, gõ `XOA` | Nút "Xóa vĩnh viễn" (`bg-error-container text-on-error-container`) chỉ enable khi khớp `XOA`; gõ sai → viền `border-error` + hint "Phải gõ đúng: XOA". |
| **Cảnh báo ngân sách** | ≥ 80% ngân sách tháng | Fill thanh đổi `bg-tertiary`, chip cảnh báo "Đã dùng 82% ngân sách tháng". ≥ 100% → fill `bg-error` + "Vượt ngân sách". |
| **Cache nghi vấn hỏng** | `cacheRead = 0` ở mọi call của ≥ 2 feature khác nhau trong 24h | Chip cảnh báo `text-tertiary`: "Cache hit rate 0% — kiểm tra lại system prompt cố định (FR-AI-01)". |

### 6.4 Edge case

| Case | Xử lý |
|---|---|
| **Ghi `.env.local` từ UI trong runtime Next.js** | `process.env` của tiến trình Node **đã được nạp lúc boot** → viết file không tự làm key có hiệu lực. Xử lý 2 tầng: (1) `writeEnvLocal()` ghi file `chmod 600` + `process.env.ANTHROPIC_API_KEY = key` để **request kế tiếp trong cùng tiến trình** dùng key mới; (2) hiện cảnh báo "khởi động lại dev server" vì lần khởi động sau mới nạp từ file; nếu chạy trên hệ thống chỉ-đọc (Vercel/serverless) → trả lỗi `ENV_WRITE_FAILED` và hướng dẫn đặt biến môi trường ở hosting. |
| **`.env.local` không tồn tại** | Tạo mới, chỉ ghi `ANTHROPIC_API_KEY=…`, không ghi `DATABASE_URL` (đã có ở `.env`), giữ nguyên file `.env`. |
| **`.env.local` đã có biến khác** | Đọc → thay đúng dòng `ANTHROPIC_API_KEY=…` → ghi lại; **không** xoá biến khác, không reorder hết file. Ghi atomically: ghi file tạm → `rename` → `chmod 600`. |
| **Tiến trình không có quyền ghi file** | Bắt `EACCES`/`EROFS` → trả `ENV_WRITE_FAILED`, UI hiển thị hướng dẫn chạy `chmod u+w .env.local` hoặc copy lệnh export. Không crash trang. |
| **Quên mật khẩu file `.env`** | Key **không mã hoá** trong `.env.local` (chuẩn Next.js). Nếu mất key: vào tab Khóa API → "Đổi khóa API" → dán key mới lấy ở console.anthropic.com. UI nói rõ: "Key không được mã hoá; hãy lưu ở nơi an toàn. App không thể khôi phục key đã mất." — không giả lập khôi phục. |
| **Xoá dữ liệu 2 bước** | Bước 1 mở hộp thoại (chưa xoá gì). Bước 2 yêu cầu gõ `XOA`. API `DELETE /api/data` **từ chối** nếu body không có `{ "confirm": "XOA" }` → `CONFIRMATION_REQUIRED`. Xoá trong 1 `prisma.$transaction` gồm `deleteMany` cho từng bảng; bất kỳ lỗi nào → rollback toàn bộ, báo "Không xoá được gì cả, dữ liệu nguyên vẹn". |
| **Export JSON bao nhiêu MB** | Dung lượng dự kiến Phase 0: DB ~5–15 MB → JSON ~3–12 MB (thẻ + lịch sử ôn là phần lớn). Hiển thị kích thước dự kiến **trước** khi tải (tính từ số bản ghi) và cảnh báo nếu > 50 MB ("cân nhắc xuất theo bảng"). Export dùng stream → không gom hết vào RAM. |
| **Export trong lúc app đang ghi** | Đọc bằng 1 transaction `REPEATABLE READ` để snapshot nhất quán; file export có `exportedAt` để đối chiếu. |
| **`AiCall` rất nhiều (> 100k dòng)** | Truy vấn tổng hợp gom nhóm theo `feature` và theo ngày ở DB (không kéo hết về JS); bảng log phân trang 25 dòng; bộ lọc ngày mặc định 30 ngày. |
| **Mức ngôn ngữ không hợp lệ** | `zhLevel`/`enLevel` chỉ nhận 5 giá trị trong enum; giá trị lạ từ DB → API map về `zero` + log cảnh báo (không crash). |
| **`learningLangs` rỗng do dữ liệu cũ** | API `PUT` chặn rỗng (Zod `min(1)`); `GET` nếu gặp rỗng → trả `["zh","en"]` mặc định để UI không mất trạng thái. |
| **Mất mạng khi bấm Ping** | Timeout 10s → trả `API_UNREACHABLE`, chip "Không kết nối được tới Anthropic"; không ghi `AiCall` (không có token tiêu thụ). |
| **Bấm Ping liên tục** | Nút disabled trong lúc chạy; tối đa 1 test/ngày được khuyến nghị trong tooltip để tránh tạo rác `AiCall`. |
| **Mất focus khi mở hộp thoại** | Focus trap trong hộp thoại, focus trả về nút mở khi đóng, `Esc` huỷ bước 1. |
| **Người dùng muốn xoá hồ sơ nhưng giữ dữ liệu** | Không hỗ trợ trong Phase 0 (nút xoá là "xóa trắng"); ghi rõ trong hộp thoại. |
| **Thẻ seed bị xoá** | Hộp thoại xoá liệt kê rõ "120 thẻ mẫu cũng bị xoá" + lệnh `npm run db:seed` để nạp lại. |

### 6.5 Công thức & bảng giá ước tính chi phí

**Công thức** (áp dụng cho **từng** dòng `AiCall`; `estimatedCost` được ghi lúc gọi API, không tính lại ở UI):

```
estimatedCost (USD)
  = inputTokens   × IN[model]   / 1_000_000
  + outputTokens  × OUT[model]  / 1_000_000
  + cacheRead     × CR[model]   / 1_000_000
  + cacheWrite    × CW[model]   / 1_000_000
```

**Bảng giá (giả định — phải đối chiếu với giá niêm yết của Anthropic trước khi code):**

| Model | IN ($/1M token) | OUT ($/1M token) | CR — cache read ($/1M) | CW — cache write ($/1M) |
|---|---|---|---|---|
| `claude-opus-5` | 5.00 | 25.00 | 0.50 | 6.25 |
| `claude-haiku-4-5` | 1.00 | 5.00 | 0.10 | 1.25 |
| *model lạ* | 5.00 | 25.00 | 0.50 | 6.25 |

> *Model lạ* dùng bảng Opus 5 — fallback theo model **đắt nhất** để không bao giờ ước tính thấp hơn thực tế.

**Giả định được nêu rõ (bắt buộc hiển thị trong UI tooltip "Cách tính"):**

1. `IN`/`OUT` lấy theo SPEC.md §5.7: Opus 5 = $5/$25 mỗi 1M token; Haiku 4.5 = $1/$5.
2. **Cache read rẻ hơn nhiều**: giả định `CR = 0.1 × IN` (đọc cache rẻ hơn input thường ~10×). `CW = 1.25 × IN` (ghi cache đắt hơn input thường ~25%).
3. `inputTokens` = token **không** tính vào cache (Anthropic báo riêng `cache_read_input_tokens` và `cache_creation_input_tokens`) → **không** cộng trùng.
4. Model lạ → fallback bảng Opus 5.
5. Kết quả là **ước tính**, làm tròn 4 chữ số ở bảng ($0.0292) và 2 chữ số ở tổng ($4.82).
6. `cacheHitRate = cacheRead / (inputTokens + cacheRead + cacheWrite)`; nếu mẫu số = 0 → `0`.

**Ví dụ tính (để kiểm chứng implementation):**

| feature | model | input | cacheRead | cacheWrite | output | Tính | Kết quả |
|---|---|---|---|---|---|---|---|
| `mock_interview` | `claude-opus-5` | 3.420 | 3.100 | 0 | 420 | `3420×5/1e6 + 3100×0.5/1e6 + 0 + 420×25/1e6` | **$0.02915** → hiển thị `$0.0292` |
| `log_autofill` | `claude-haiku-4-5` | 450 | 0 | 0 | 65 | `450×1/1e6 + 0 + 65×5/1e6` | **$0.000775** → hiển thị `$0.0008` |

> Các con số trong prototype (`$0.024`, `$1.85`, `91.4%`…) là **số minh hoạ** — thay bằng giá trị tính từ `AiCall` thật.

## 7. Hợp đồng API

> Quy ước chung (steering/tech.md §5): trả `{ ok: true, data }` hoặc `{ ok: false, error: { code, message } }`; validate input bằng Zod.

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| `GET` | `/api/settings/profile` | — | `{ profile: { name, goals, aiTone, learningLangs[], zhLevel, enLevel, interviewLang, monthlyBudgetUsd, saverMode } }` | `500` |
| `PUT` | `/api/settings/profile` | `{ name?, goals?, aiTone?, learningLangs[], zhLevel?, enLevel?, interviewLang?, monthlyBudgetUsd?, saverMode? }` | `{ profile: <sau khi lưu> }` | `INVALID_INPUT` (Zod: `aiTone` sai enum, `learningLangs` rỗng, `goals` > 2000 ký tự), `500` |
| `GET` | `/api/settings/key` | — | `{ configured, masked, source: ".env.local" / "process.env" / null, lastCheckedAt?, lastLatencyMs?, requiresRestart }` — **không** chứa key đầy đủ | `500` |
| `PUT` | `/api/settings/key` | `{ apiKey: string }` (bắt buộc khớp `^sk-ant-[A-Za-z0-9_\-]{10,}$`) | `{ ok, masked, requiresRestart: true, writtenTo: ".env.local" }` | `INVALID_KEY_FORMAT`, `ENV_WRITE_FAILED` (không ghi được file / FS chỉ đọc), `500` |
| `DELETE` | `/api/settings/key` | — | `{ ok: true }` | `ENV_WRITE_FAILED`, `500` |
| `POST` | `/api/settings/key/test` | — | `{ status: "ok", latencyMs, model, checkedAt }` | `KEY_NOT_CONFIGURED` (chưa có key), `KEY_INVALID` (401), `RATE_LIMITED` (429 + `retryAfterSec`), `API_UNREACHABLE` (mạng/timeout), `500` |
| `GET` | `/api/ai/costs` | query: `from` (ISO date, mặc định 30 ngày trước), `to` (ISO date, mặc định hôm nay), `bucket` = `day` / `feature` | `{ range, totals: { calls, errors, inputTokens, outputTokens, cacheRead, cacheWrite, cost, cacheHitRate }, byDay: [...], byFeature: [...], budget: { limitUsd, usedUsd, ratio, level: "ok"\|"warn"\|"over" } }` | `INVALID_QUERY`, `500` |
| `GET` | `/api/ai/calls` | query: `page` (≥1, mặc định 1), `pageSize` (≤ 100, mặc định 25), `feature?`, `format` = `json` / `csv` | `json`: `{ rows: AiCall[], total, page, pageSize, totalPages }` · `csv`: file `text/csv` có header tiếng Việt + `Content-Disposition: attachment` | `INVALID_QUERY`, `500` |
| `GET` | `/api/data/export` | — | `application/json` + `Content-Disposition: attachment; filename="daily-loop-export-<yyyy-MM-dd>.json"`, body `{ schemaVersion, exportedAt, app, profile, tables: { skills, activities, evidences, reflections, planItems, cards, reviews, dailyStates, aiCalls, interviewProfiles, interviewSessions, interviewTurns, testSessions, testItems } }` | `EXPORT_FAILED`, `500` |
| `DELETE` | `/api/data` | body bắt buộc: `{ confirm: "XOA" }` | `{ ok: true, deleted: { skills, activities, cards, aiCalls, … }, dbSizeBytesBefore, dbSizeBytesAfter }` | `CONFIRMATION_REQUIRED` (thiếu/sai `confirm`), `DELETE_FAILED` (rollback), `500` |
| `GET` | `/api/data/privacy-log` | query: `page`, `pageSize`, `feature?` | `{ rows: [{ id, createdAt, feature, model, dataKinds[], dataPreview, inputTokens }], total, page, pageSize, totalPages }` | `INVALID_QUERY`, `500` |
| `GET` | `/api/data/stats` | — | `{ dbSizeBytes, dbPath, recordCounts: { skills, activities, evidences, reflections, planItems, cards, reviews, dailyStates, aiCalls, interviewProfiles, interviewSessions, interviewTurns, testSessions, testItems } }` | `500` |

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-SC-01 — Lưu hồ sơ**
- *Given* đang ở tab "Hồ sơ & Mục tiêu", *When* nhập tên "Minh", mục tiêu "Lên level mid trong 6 tháng", chọn giọng văn "coach", tắt Tiếng Trung và bấm "Lưu thay đổi", *Then* `UserProfile` được cập nhật, toast "Đã lưu hồ sơ" hiện, và tải lại trang các giá trị vẫn giữ nguyên.
- *Given* đã tắt hết cả zh và en, *When* bấm "Lưu thay đổi", *Then* API trả `INVALID_INPUT`, UI hiện lỗi cạnh nhóm toggle và **không** ghi DB.

**AC-SC-02 — Mức ngôn ngữ và ngôn ngữ phỏng vấn**
- *Given* tab Hồ sơ, *When* đổi mức Tiếng Anh từ `zero` → `basic` và chọn ngôn ngữ phỏng vấn "Tiếng Việt", *Then* sau khi lưu, `GET /api/settings/profile` trả `enLevel: "basic"` và `interviewLang: "vi"`.

**AC-SC-03 — Lưu khóa API**
- *Given* chưa có key, *When* dán `sk-ant-...` hợp lệ và bấm "Lưu khóa", *Then* file `.env.local` được tạo/cập nhật với `chmod 600`, file xuất hiện trong `.gitignore`, API trả `{ ok: true, masked: "sk-ant-…abcd", requiresRestart: true }`, và UI hiện cảnh báo "khởi động lại dev server".
- *Given* key đã lưu, *When* tải lại trang, *Then* ô khóa hiện `sk-ant-••••…abcd` (4 ký tự cuối), **không** có payload nào chứa key đầy đủ, và server log không chứa chuỗi key.

**AC-SC-04 — Ping thành công**
- *Given* key hợp lệ, *When* bấm "Chạy kiểm tra Ping Anthropic Endpoint", *Then* trong ≤ 10s chip trạng thái chuyển sang "Đã kiểm tra: OK (N ms)" và có đúng 1 dòng mới trong `AiCall` với `feature = "key_test"`.

**AC-SC-05 — Key sai**
- *Given* key sai, *When* bấm Ping, *Then* chip hiện "Khóa không hợp lệ (401)" màu lỗi, nút "Đổi khóa API" được làm nổi bật, **không** có dòng `AiCall` mới (không tiêu thụ token), và trang không crash.

**AC-SC-06 — Rate limit**
- *Given* API trả 429, *When* bấm Ping, *Then* chip hiện "Bị giới hạn tần suất (429) — thử lại sau N giây", kèm nút "Thử lại" và countdown.

**AC-SC-07 — Chế độ offline (FR-AI-06)**
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở `/settings`, *Then* hiện banner "Đang chạy chế độ offline" nói rõ kế hoạch ngày vẫn chạy bằng rule cục bộ và các tính năng AI khác tạm dừng; bảng chi phí và thống kê DB vẫn hiển thị bình thường; nút Ping bị disable.

**AC-SC-08 — Minh bạch dữ liệu (FR-PS-07)**
- *Given* đã dùng AI vài lần, *When* mở tab "Quản trị dữ liệu" → "Dữ liệu đã gửi lên API", *Then* mỗi lần gọi hiện thời gian, tính năng, danh sách loại dữ liệu đã gửi và 1 đoạn xem trước ≤ 280 ký tự; không có dòng nào trong danh sách ngoài các lần gọi AI thật.

**AC-SC-09 — Chi phí theo ngày và theo tính năng**
- *Given* `AiCall` có dữ liệu, *When* mở tab Chi phí, *Then* tổng USD trong bento bằng **tổng** các dòng bảng và bằng tổng các phân khúc trong thanh phân bổ (sai lệch cho phép do làm tròn ≤ $0.01); mỗi feature hiện model, số lượt, USD và % tổng.

**AC-SC-10 — Chứng minh caching (FR-AI-08)**
- *Given* 2 call liên tiếp cùng system prompt, *When* xem nhật ký, *Then* cột "Cache Read" của call thứ 2 > 0 và chip cache hit rate > 0%; nếu mọi call đều có `cacheRead = 0` thì hiện cảnh báo "cache có thể đang hỏng".

**AC-SC-11 — Công thức chi phí**
- *Given* một dòng `AiCall` có `input=3420, cacheRead=3100, cacheWrite=0, output=420, model=claude-opus-5`, *When* đối chiếu cột "Chi phí (USD)", *Then* giá trị hiển thị là `$0.0292` (= 3420×5/1e6 + 3100×0.5/1e6 + 420×25/1e6).

**AC-SC-12 — Phân trang & CSV**
- *Given* 142 dòng `AiCall`, *When* mở tab Chi phí, *Then* bảng hiện 25 dòng, footer hiện "Hiển thị 25 trong tổng số 142 bản ghi" và điều hướng "Trang 1/6"; bấm "Xuất AiCall CSV" tải file `.csv` có 142 dòng dữ liệu + 1 dòng header.

**AC-SC-13 — Xuất toàn bộ JSON**
- *Given* DB có dữ liệu, *When* bấm "Xuất toàn bộ cơ sở dữ liệu (JSON)", *Then* tải file `daily-loop-export-<ngày>.json` hợp lệ, chứa `schemaVersion`, `exportedAt` và mảng `tables` cho **tất cả** bảng; số phần tử mỗi bảng khớp với số bản ghi hiển thị trong "Dung lượng DB".

**AC-SC-14 — Xoá trắng dữ liệu 2 bước**
- *Given* bấm "Xóa trắng dữ liệu", *Then* mở hộp thoại và **chưa** xoá gì; nút "Xóa vĩnh viễn" bị disable cho tới khi gõ đúng `XOA`.
- *Given* đã gõ đúng `XOA` và bấm "Xóa vĩnh viễn", *Then* toàn bộ bảng bị xoá trong 1 transaction, tab Chi phí hiện tổng `$0.00` và bảng log rỗng, thẻ seed cũng mất, và hộp thoại đóng kèm thông báo kèm lệnh `npm run db:seed`.
- *Given* gửi `DELETE /api/data` với body `{}` , *Then* API trả `CONFIRMATION_REQUIRED` và **không** xoá dòng nào.

**AC-SC-15 — Dung lượng DB**
- *Given* mở tab "Quản trị dữ liệu", *Then* hiện dung lượng file SQLite (KB/MB) và số bản ghi từng bảng; con số khớp với truy vấn trực tiếp.

**AC-SC-16 — Ngân sách tháng**
- *Given* đặt ngân sách `5 USD` và tổng chi phí tháng hiện tại là `4.20`, *When* tải lại tab Chi phí, *Then* thanh ngân sách hiện 84% với màu cảnh báo và chip "Đã dùng 84% ngân sách tháng".

**AC-SC-17 — Responsive & a11y**
- *Given* viewport 390px, *When* mở từng tab, *Then* không có tràn ngang ngoài vùng bảng (bảng cuộn ngang bên trong), mọi nút icon-only có `aria-label`, và tab focus được bằng bàn phím.

## 9. Rủi ro riêng của feature

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| 1 | **Ghi `.env.local` không có hiệu lực** → người dùng tưởng đã cấu hình nhưng AI vẫn offline | Ghi `process.env` trong tiến trình để có hiệu lực ngay + banner bắt buộc "khởi động lại server" + nút "Tôi đã khởi động lại — kiểm tra lại". |
| 2 | **Lộ key qua API/HTML/log** | Key chỉ lưu server-side; API `GET /api/settings/key` chỉ trả mask; cấm `console.log` key; kiểm thử tự động grep payload/HTML không chứa `sk-ant-` (trừ mask). |
| 3 | **Ước tính chi phí lệch so với hoá đơn thật** | Nêu rõ giả định §6.5 + nhãn "ước tính" ở mọi nơi + tooltips liệt kê công thức; giá lưu trong hằng số 1 chỗ để cập nhật khi Anthropic đổi giá. |
| 4 | **Nhật ký AI phình to, làm chậm S15** | Truy vấn gom nhóm ở DB, phân trang 25 dòng, mặc định lọc 30 ngày; index `@@index([createdAt])` đã có. |
| 5 | **Xoá nhầm dữ liệu** | 2 bước, gõ `XOA`, 1 transaction, hộp thoại liệt kê đúng bảng bị xoá, hỗ trợ khôi phục bằng seed. |
| 6 | **Số liệu "đã gửi lên API" lệch thực tế** | `dataKinds`/`dataPreview` được ghi **cùng lúc** gọi API trong wrapper `src/lib/anthropic.ts` — không ghi lại sau, nên không thể "quên" ghi. |
| 7 | **Bảng AiCall có dữ liệu từ trước khi có `dataKinds`** | Các dòng cũ có `dataKinds = "[]"` → UI hiển thị "chưa ghi nhận" thay vì bịa dữ liệu. |
| 8 | **Xoá `.env.local` nhầm làm mất `DATABASE_URL`** | `writeEnvLocal()` chỉ thay dòng `ANTHROPIC_API_KEY`, giữ nguyên mọi dòng khác; ghi atomically (file tạm → rename). |
| 9 | **Trang S15 nặng, chậm trên máy yếu** | Server Component + truy vấn gom nhóm; tab không active không render bảng chi phí (lazy theo tab). |
| 10 | **Thông tin nhạy cảm trong log "đã gửi lên"** | Xem trước cắt 280 ký tự, không hiện field `Reflection.answer` đầy đủ; người dùng có thể xoá toàn bộ dữ liệu ngay khi muốn. |
