# Quick-log — Ghi nhận 10 giây

> **Màn hình:** S05 (`/log` sheet + `/log/history`) · **Phase:** 0
> **Nguồn:** `system-design/SPEC.md` §0.3 (P2, P3), §2.1 (FR-DL-03, FR-DL-04), §2.2 (FR-SK-03), §2.7 (FR-AI-06), §3.2 (S05), §4 (`Activity`, `Evidence`, `Skill`, `PlanItem`), §5.1 (AI-02), §5.6 (chế độ offline), §8 (AC-2) · prototype `system-design/s05_quick_log_sheet_10s/`
> **Phụ thuộc:** `app-foundation`, `skill-tree-evidence` (phải xong trước)

## 1. Tổng quan

Quick-log là **cơ chế ghi nhận duy nhất** của Daily Loop OS: một bottom sheet 2 bước, mở tức thì, ghi được một hoạt động trong ≤10 giây (P2). Nó phục vụ đúng hai tình huống đã nêu ở `product.md`: **U2** (học xong 25′ chuyên môn → ghi nhận, tiến độ kỹ năng tăng ngay) và **U8** (đi bộ 20′, không biết ghi vào đâu → 2 chạm → "chăm sóc bản thân").

Bản chất sản phẩm của feature này là **tốc độ, không phải thông minh**. AI (AI-02, `claude-haiku-4-5`) chỉ làm một việc: điền sẵn 4 trường (domain · kỹ năng · thời lượng · mức độ khó) để người dùng không phải gõ. AI **không bao giờ nằm trên đường ghi**:

- Mở sheet → hiện ngay preset + ô nhập (0 request chờ).
- Gõ mô tả → AI autofill chạy **nền**, debounce 450 ms, kết quả chỉ đổ vào panel Bước 2.
- Bấm "⚡ Ghi nhanh ngay (Enter)" → ghi thẳng vào SQLite, **không chờ AI trả lời**; nếu AI chưa xong thì dùng kết quả rule cục bộ.
- Thiếu `ANTHROPIC_API_KEY` → cùng đường đi, chỉ đổi nguồn điền từ "AI" sang "Rule cục bộ" (không giả lập phản hồi AI).

Feature này đồng thời là **đường ghi dùng chung** cho FR-DL-03: bấm "Xong" trên một `PlanItem` ở S01 sẽ gọi chính endpoint `POST /api/log` (kèm `planItemId`) để tạo `Activity` + `Evidence` + đánh dấu `PlanItem.done` trong **một transaction**. Nhờ vậy "bằng chứng" (P3) luôn sinh ra từ đúng một chỗ, không có hai đường ghi song song dễ lệch dữ liệu.

Lịch sử `/log/history` là mặt còn lại của P3: bằng chứng phải **thấy được, sửa được, xoá được** — nếu người dùng ghi nhầm mà không sửa được, bằng chứng sẽ ô nhiễm cây kỹ năng.

## 2. Bối cảnh & vấn đề

- **R2 — Friction ghi nhập là nguyên nhân bỏ app tuần 2.** Mọi form bắt buộc nhập domain + kỹ năng + thời lượng + mức độ khó khiến ghi nhận mất ≥30 giây → người dùng bỏ ghi → dữ liệu rỗng → app thành app trống.
- **Nếu modal chờ AI thì P2 không thực sự đạt.** Một lượt gọi `claude-haiku-4-5` mất 1–3 giây; nếu sheet chặn ở "đang phân tích…" thì 2 chạm biến thành 5–8 giây và người dùng mất niềm tin vào nút "ghi nhanh".
- **Ghi nhận không sinh bằng chứng thì P3 vỡ.** Một `Activity` không gắn `Evidence` không làm `Skill.level` tăng → cây kỹ năng (S03/S04) là biểu đồ trang trí, không phải số đo.
- **Ghi tay (checkbox) không đo được gì.** `PlanItem.done = true` là trạng thái, không phải bằng chứng — FR-DL-03 yêu cầu sinh `Activity` + `Evidence` kèm theo.
- **Phân loại tay thì lâu và không nhất quán.** Người dùng không nhớ "Hành động này thuộc kỹ năng nào"; AI-02 làm việc này trong 1–3 giây với structured output.
- **Không có API key là trạng thái hợp lệ (P6).** Người dùng dùng app mà không muốn gắn key vẫn phải ghi được; rule cục bộ phải cho ra kết quả *tử tế*, không phải kết quả bịa.

## 3. Yêu cầu chức năng

### 3.1 Quick-log (FR-QL)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-QL-01 | Mở `/log` hiển thị sheet **ngay lập tức** — preset chips + ô nhập render không phụ thuộc bất kỳ request nào (kể cả AI và cả danh sách kỹ năng). | P0 | P2, FR-DL-04, NFR-02 |
| FR-QL-24 | Hoạt động ngoại ngữ ghi kèm **ngôn ngữ** (`en`/`zh`/`vi`) → `Activity.language`; `vi` là bản ngữ (không tạo Evidence SRS). | P1 | Q2 · Q3 |
| FR-QL-02 | 6 preset chip 2-chạm điền sẵn mô tả + domain + type + thời lượng mặc định: `1 ⚡ Học 25'` · `2 🎯 Luyện tập` · `3 ✍️ Viết` · `4 🎙️ Luyện nói` · `5 📓 Nhật ký` · `6 🌱 Chăm sóc bản thân`. Phím tắt `1`–`6` khi focus không nằm trong ô nhập. | P0 | FR-DL-04, prototype S05 |
| FR-QL-03 | Ô nhập tự do, tối thiểu **3 ký tự** mới kích hoạt autofill; có nút xoá (`⌫`) và nút mic (`🎙`, Web Speech API, tuỳ chọn). | P0 | FR-DL-04, NFR-07 |
| FR-QL-04 | **Autofill AI-02** (`claude-haiku-4-5`, không streaming, effort `low`, structured output `{domain, skillId, minutes, difficulty}`) chạy nền sau debounce 450 ms, kết quả điền vào panel Bước 2 (domain + kỹ năng + thời lượng + mức độ khó). | P0 | FR-DL-04, §5.1 (AI-02), FR-AI-04 |
| FR-QL-05 | **Không chờ AI để ghi.** Bấm "⚡ Ghi nhanh ngay (Enter)" ghi thẳng `Activity` (+`Evidence` nếu có kỹ năng) dù AI chưa trả lời; nếu AI đang chạy thì dùng kết quả rule cục bộ làm mặc định. | P0 | P2, AC-2 |
| FR-QL-06 | Bước 2 cho sửa tay: đổi domain, đổi kỹ năng, chọn thời lượng (15′/25′/45′/60′), chọn mức độ khó (1–4 ⭐), ghi chú tuỳ chọn, bật/tắt tạo Evidence. | P0 | SPEC §3.2 S05, prototype S05 |
| FR-QL-07 | "Bỏ qua & Đóng" lưu đúng những gì đang có (domain + mô tả + thời lượng mặc định) — không chờ AI, không mở panel chi tiết. | P0 | SPEC §3.2 S05 |
| FR-QL-08 | Mỗi lần ghi tạo đúng **1 `Activity`** + **0–1 `Evidence`**; `Evidence.rating` = mức độ khó người dùng chọn (1–4). `Skill.level` tăng khi đủ `EVIDENCE_THRESHOLD` bằng chứng `rating ≥ 3` (FR-SK-03). | P0 | FR-SK-03, §4 |
| FR-QL-09 | Chống ghi trùng: bấm Enter nhiều lần hoặc bấm nút nhiều lần trong khi request đang bay → chỉ tạo **1** `Activity` (client khoá nút + server dedupe theo cửa sổ thời gian). | P0 | AC-2 |
| FR-QL-10 | Lịch sử `/log/history`: danh sách **theo ngày** (mặc định hôm nay), lọc theo domain (Tất cả / Chuyên môn / Giao tiếp / Ngoại ngữ / Cá nhân). | P0 | SPEC §3.2 S05 |
| FR-QL-11 | Sửa **1 mục** trong lịch sử: title, domain, type, thời lượng, mức độ khó, kỹ năng, ghi chú — sửa mức độ khó phải cập nhật `Evidence.rating` và tính lại `level`. | P0 | SPEC §3.2 S05 |
| FR-QL-12 | Xoá **1 mục** trong lịch sử: xoá `Activity` + `Evidence` liên quan và tính lại `level` của kỹ năng bị ảnh hưởng. | P0 | SPEC §3.2 S05 |
| FR-QL-13 | **Không có API key** → autofill chạy bằng rule cục bộ (`src/lib/log-classify.ts`), badge nguồn đổi từ "AI" sang "Rule cục bộ"; nút AI bị ẩn, **không giả lập phản hồi AI**. | P0 | FR-AI-06, §5.6 |
| FR-QL-14 | Toast "Đã ghi" kèm kỹ năng vừa gắn và thời gian ghi thực tế; `aria-live="polite"`; tự tắt sau 3.2 giây. | P0 | prototype S05, NFR-06 |
| FR-QL-15 | Nút "AI Tóm tắt & Rút kinh nghiệm" (tạo `Reflection`) **thuộc Phase 1** (`personal-state-journal`) — ở Phase 0 nút này bị ẩn, không để lại nút chết. | P1 | SPEC §3.2 S06 |

### 3.2 Liên quan Daily Loop (FR-DL-03, FR-DL-04)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-QL-16 | **FR-DL-04** — Nút "Hoàn thành nhanh" mở Quick-log: chọn domain + gõ 3–5 ký tự mô tả → AI tự điền kỹ năng, thời lượng, mức độ khó. Quick-log là **cơ chế ghi duy nhất** để thực hiện FR-DL-04. | P0 | FR-DL-04 |
| FR-QL-17 | **FR-DL-03** — Bấm "Xong" trên 1 hành động ở S01 → tạo `Activity` + `Evidence` (nếu gắn kỹ năng) + đánh dấu `PlanItem.done`, tất cả trong 1 transaction. Nút "Xong" **không** gọi API riêng — nó gọi `POST /api/log` kèm `planItemId`. | P0 | FR-DL-03 |
| FR-QL-18 | FR-DL-03 dùng chung bộ quy tắc bằng chứng với quick-log: `Evidence.rating` lấy từ mức độ khó, `Activity.minutes` lấy từ `PlanItem.minutes`, `Activity.title` lấy từ `PlanItem.action`, `Activity.skillId` lấy từ `PlanItem.skillId`. | P0 | FR-DL-03, FR-SK-03 |
| FR-QL-19 | Quick-log ghi một `PlanItem` đã hoàn thành thì không được tạo trùng `Activity` (mỗi `PlanItem` tối đa 1 `Activity`). | P0 | FR-DL-03 |

### 3.3 AI layer (AI-02)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-QL-20 | AI-02 dùng `claude-haiku-4-5`, **không streaming**, effort `low`, structured output đúng 4 trường `{domain, skillId, minutes, difficulty}` qua `output_config.format` (Zod). | P0 | §5.1 (AI-02), FR-AI-04 |
| FR-QL-21 | System prompt của AI-02 là **hằng số** không chứa ngày/UUID/`Date.now()`; nội dung biến động (mô tả người dùng, danh sách kỹ năng) nằm trong `messages` sau breakpoint cache. | P0 | FR-AI-01, §5.2 |
| FR-QL-22 | `domain` do AI trả phải thuộc tập đóng băng 4 domain (P5); `skillId` phải tồn tại trong cây kỹ năng và cùng domain — nếu không → **fallback rule cục bộ**, ghi `AiCall{ok:false, error:"invalid_autofill"}`. | P0 | P5, FR-SK-01 |
| FR-QL-23 | Mọi lời gọi AI-02 ghi log `AiCall{ feature: "quick_log_autofill" }` (tokens, cache read/write, cost, ok, error). | P1 | FR-AI-07 |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-QL-01 | **≤10 giây** từ lúc sheet mở đến lúc toast "Đã ghi" hiện (AC-2). | Đo bằng `performance.now()`; p95 ≤ 10.000 ms trên 20 lượt ghi liên tiếp, DB local. |
| NFR-QL-02 | Thao tác ghi (bấm Enter) → lưu xong **≤ 2 giây** server-side. | `serverMs` trả về trong response `POST /api/log` < 2000. |
| NFR-QL-03 | AI **không nằm trên đường ghi**: sheet render không chờ AI; autofill là request nền có thể bị huỷ. | Bằng chứng: sheet hiển thị preset + input ở frame đầu tiên khi mạng bị chặn hoàn toàn. |
| NFR-QL-04 | Mobile-first: dùng được ở 390 px; nút "Ghi nhanh ngay" nằm trong vùng ngón cái, không cần cuộn. | Playwright viewport 390×844: đủ 2 preset chip + input + CTA trong 1 màn hình. |
| NFR-QL-05 | Offline (không API key, mất mạng): ghi được vào SQLite, autofill dùng rule cục bộ. | AC-QL-3. |
| NFR-QL-06 | A11y: mọi icon-only button có `aria-label`; focus ring `focus-visible:ring-2 focus-visible:ring-primary`; toast dùng `aria-live="polite"`; sheet đóng bằng `Esc` và trả focus về nút mở. | axe không báo lỗi nghiêm trọng; kiểm tra bằng tab + screen reader. |
| NFR-QL-07 | Tiếng Việt toàn bộ giao diện; dữ liệu người dùng không rời máy ngoài lệnh gọi AI-02 tự nguyện. | Kiểm tra payload AI chỉ chứa mô tả người dùng tự gõ + danh sách kỹ năng. |
| NFR-QL-08 | `strict: true`, không `any` trong `src/lib` và `src/app/api`; mọi payload API validate bằng Zod. | `tsc --noEmit` sạch; eslint không cảnh báo `any`. |
| NFR-QL-09 | Deterministic: rule cục bộ cho cùng đầu vào → cùng kết quả (không `Math.random()` trong `src/lib/log-classify.ts`). | Unit test snapshot 20 mẫu mô tả. |
| NFR-QL-10 | Không hardcode hex trong component — chỉ token `primary`/`secondary`/`tertiary`/`surface-*`/`on-surface*`/`outline`. | Grep component không có `#rrggbb`. |

## 5. Mô hình dữ liệu

Feature này **thêm 2 field** vào model `Activity` (`planItemId`, `clientRequestId`) — không thêm model mới.
> **Registry:** `.kiro/steering/data-model-registry.md` §1 — `C1` (`Activity.planItemId`, `@@unique`) ·
> `C2` (`Activity.clientRequestId`, `@@unique`). Đây là nguồn chân lý cho 2 field này —
> nếu feature khác cần chúng, tham chiếu `C1`/`C2` thay vì tự định nghĩa.
> **Mới (Q2):** `Activity.language` = **`C34`** — ngôn ngữ của hoạt động (`en`/`zh`/`vi`). Các model `Activity`, `Evidence`, `Skill`, `PlanItem` lấy từ SPEC §4.

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `Activity` | `id` | String | cuid, khoá chính. |
| `Activity` | `skillId` | String? | Kỹ năng được gắn. `null` ⇒ không tạo Evidence. |
| `Activity` | `domain` | String | `professional` \| `communication` \| `language` \| `personal` (P5 — đóng băng). |
| `Activity` | `type` | String | `study` \| `write` \| `speak` \| `roleplay` \| `srs` \| `journal` \| `health` \| `custom`. Suy ra từ preset hoặc rule cục bộ — **không** do AI quyết định. |
| `Activity` | `minutes` | Int | 1–240. Mặc định theo preset, AI gợi ý có thể đè. |
| `Activity` | `title` | String | Mô tả người dùng gõ/preset, tối đa 200 ký tự. |
| `Activity` | `content` | String? | Ghi chú tuỳ chọn ở Bước 2. |
| `Activity` | `quality` | Int? | **Chính là mức độ khó người dùng chọn (1–4)** — xem quyết định D3. |
| `Activity` | `aiScore` | Float? | Quick-log **không** dùng (không có AI chấm ở Phase 0). |
| `Activity` | `createdAt` | DateTime | Mốc thời gian ghi; dùng để gom nhóm theo ngày (local). |
| `Activity` | `planItemId` | String? | **Thêm mới (Phase 0)** — `PlanItem` đã sinh ra `Activity` này. `@@unique` ⇒ 1 `PlanItem` tối đa 1 `Activity` (B5). `null` cho quick-log tự do. |
| `Activity` | `clientRequestId` | String? | **Thêm mới (Phase 0)** — khoá idempotency tuyệt đối do client sinh. `@@unique` ⇒ cùng `clientRequestId` chỉ ghi 1 lần (B8). `null` nếu client không gửi. |
| `Evidence` | `activityId` | String | Unique 1–1 với Activity trong nghiệp vụ quick-log. |
| `Evidence` | `skillId` | String | Kỹ năng nhận bằng chứng. |
| `Evidence` | `rating` | Int | 1–4 = mức độ khó người dùng chọn. `rating ≥ 3` mới tính vào tăng level. |
| `Evidence` | `createdAt` | DateTime | Mốc bằng chứng. |
| `Skill` | `level` | Int | 0–5. Chỉ tăng qua `Evidence` (FR-SK-03). |
| `PlanItem` | `done` | Boolean | FR-DL-03 đánh dấu `true` trong cùng transaction. |
| `PlanItem` | `id` | String | Khoá chống ghi trùng khi quick-log bám 1 plan item. |

**Quan hệ & ràng buộc**

```
PlanItem ──(1)────┐
                  ├──► Activity ──(0..1)──► Evidence ──► Skill.level
Quick-log ────────┘
```

| Ràng buộc | Quy tắc |
|---|---|
| B1 | Mỗi `Activity` có tối đa **1** `Evidence` (một hoạt động = một bằng chứng cho một kỹ năng). |
| B2 | `Evidence` chỉ tồn tại khi `Activity.skillId ≠ null`. |
| B3 | `Evidence.rating = Activity.quality` (cùng nguồn: mức độ khó người dùng chọn). |
| B4 | `Activity.domain` phải khớp `Skill.domain` của kỹ năng được gắn. |
| B5 | Mỗi `PlanItem` tối đa 1 `Activity` sinh ra từ nó (FR-QL-19). |
| B6 | `Activity.minutes ∈ [1, 240]`; `Activity.title` 1–200 ký tự sau khi trim. |
| B7 | `Skill.level` tăng 1 bước khi số `Evidence` có `rating ≥ 3` của kỹ năng đó đạt `EVIDENCE_THRESHOLD`; không vượt `SKILL_LEVEL_MAX`. |
| B8 | `Activity.clientRequestId` là duy nhất — gửi lại cùng `clientRequestId` không tạo `Activity` mới (chống Enter lặp ở tầng server). |

**Truy vấn chính**

```sql
-- Lịch sử theo ngày (mặc định hôm nay), lọc domain
SELECT a.id, a.title, a.domain, a.type, a.minutes, a.quality, a.content,
       a.skillId, a.createdAt,
       e.id AS evidenceId, e.rating AS evidenceRating,
       s.name AS skillName, s.level AS skillLevel
FROM Activity a
LEFT JOIN Evidence e ON e.activityId = a.id
LEFT JOIN Skill    s ON s.id = a.skillId
WHERE DATE(a.createdAt) = DATE(?)          -- '2026-10-30' (local)
  AND (? IS NULL OR a.domain = ?)          -- filter domain
ORDER BY a.createdAt DESC
LIMIT ? OFFSET ?;

-- Đếm bằng chứng đủ chuẩn để tính lại level (FR-SK-03)
SELECT COUNT(*) AS goodEvidence
FROM Evidence
WHERE skillId = ? AND rating >= 3;        -- EVIDENCE_RATING_MIN = 3
```

> Vì SQLite lưu `DateTime` theo ISO-UTC, phải chuẩn hoá ngày theo **00:00 local** bằng `src/lib/dates.ts` trước khi so sánh — không dùng `toISOString()` để so sánh ngày (xem rủi ro T8 của feature `weekly-progress-report`).

## 6. Giao diện & hành vi

### 6.1 Bố cục — Bước 1 (2 chạm)

```
┌────────────────────────────────────────────────────────┐
│ ⚡ Ghi nhanh hoạt động (Mục tiêu ≤10s)  Ready 00:03s ✕ │
│    2 chạm • Tự động nhận diện ngữ cảnh                 │
├────────────────────────────────────────────────────────┤
│ BƯỚC 1: CHỌN NHANH HOẶC GÕ TỰ DO          Phím [1 - 6]│
│                                                        │
│  [1 ⚡ Học 25'] [2 🎯 Luyện tập] [3 ✍️ Viết]            │
│  [4 🎙️ Luyện nói] [5 📓 Nhật ký] [6 🌱 Chăm sóc bản thân]│
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Vừa học gì? Gõ tự do: "Ôn từ vựng Trung Quốc"… │⌫ │🎙│  │
│  └──────────────────────────────────────────────────┘  │
│  🧠 Haiku 4.5 tự parsing: Domain, Skill node, Evidence│
│                                        [⚡ Ghi nhanh ngay ⏎]│
└────────────────────────────────────────────────────────┘
```

### 6.2 Bố cục — Bước 2 (chi tiết tuỳ chọn)

```
┌────────────────────────────────────────────────────────┐
│ ✦ BƯỚC 2: AI TỰ PHÂN TÍCH & GỢI Ý CÂY KỸ NĂNG  nguồn: AI │
├────────────────────────────────────────────────────────┤
│ ┌ Lĩnh vực (Domain) ──────────┐ ┌ Kỹ năng gắn kèm ───┐│
│ │ ● Ngoại ngữ          [Sửa]   │ │ 🌳 Tiếng Trung      ││
│ └───────────────────────────────┘ │ (HSK4 Foundation)  ││
│                                   │ [+45 XP]           ││
│                                   └────────────────────┘│
│ ┌ Thời lượng thực tế ──────────┐ ┌ Nỗ lực / Độ sâu ──┐│
│ │ 25 phút                       │ │ Mức 3/4           ││
│ │ [15'] [25'] [45'] [60']       │ │ ★ ★ ★ ☆           ││
│ └───────────────────────────────┘ └────────────────────┘│
│ ┌ [x] Tự động tạo 1 Evidence vào Cây kỹ năng ────────┐│
│ │     Đính kèm vào node: HSK4 Vocab Mastery (Level 2) ││
│ └─────────────────────────────────────────────────────┘│
│ Ghi chú (tuỳ chọn)  [ ______________________________ ]│
│                                                        │
│ [Bỏ qua & Đóng]      [🧠 AI Tóm tắt] [Lưu chi tiết & Đóng ⌘⏎]│
└────────────────────────────────────────────────────────┘
```

> Nút `[🧠 AI Tóm tắt]` lấy từ prototype nhưng **bị ẩn ở Phase 0** (FR-QL-15) — nó tạo `Reflection` + AI-05, thuộc feature `personal-state-journal`. Không để lại nút chết.

### 6.3 Bố cục — `/log/history`

```
┌────────────────────────────────────────────────────────┐
│ 🕘 Lịch sử hoạt động hôm nay              /log/history │
│ [Tất cả (7)] [Chuyên môn] [Giao tiếp] [Ngoại ngữ] [Cá nhân]│
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ 14:20  [Ngoại ngữ]  25m          ✓ Evidence        │ │
│ │ Ôn 25 từ vựng HSK 4 tiếng Trung chuyên đề…        │ │
│ │ 🌳 Node: Tiếng Trung HSK4        Độ khó: 3/4 ★     │ │
│ │                                  [Sửa] [Xoá]       │ │
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 11:05  [Chuyên môn]  45m         ✓ Evidence        │ │
│ │ Nghiên cứu kiến trúc Distributed Consensus…        │ │
│ └────────────────────────────────────────────────────┘ │
│ …                                                      │
├────────────────────────────────────────────────────────┤
│ SQLite: 1.429 logs cached      [Xem toàn bộ dòng thời gian →]│
└────────────────────────────────────────────────────────┘
```

### 6.4 Bảng thành phần

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Sheet header | Icon ⚡ trong ô bo tròn, tiêu đề + mô tả, badge đồng hồ, nút đóng | ô `bg-primary-container text-on-primary rounded-lg`; tiêu đề `font-headline-sm text-headline-sm text-on-surface`; badge `bg-primary/10 text-primary rounded-full font-code-md` | Badge đổi `bg-tertiary/10 text-tertiary` khi vượt 10 s |
| Bước 1 — panel | Nền recessed chứa preset + input | `bg-surface-container-lowest rounded-xl` | — |
| Preset chip | Số thứ tự + emoji + nhãn | `bg-surface-container-high text-on-surface rounded-lg font-label-md text-label-md`; số `text-primary`/`text-tertiary`/`text-secondary`/`text-outline` | Click → điền mô tả + focus input; phím `1`–`6` |
| Input | Ô nhập mô tả tự do | `bg-surface-container text-on-surface rounded-lg font-body-md text-body-md placeholder:text-outline`; focus `focus:bg-surface-container-high` | Tối thiểu 3 ký tự mới kích hoạt autofill |
| Nút ⌫ / 🎙 | Xoá nội dung / nhập bằng giọng nói | ghost `text-outline` (⌫), `bg-surface-container-highest` (🎙, icon `text-tertiary`) | 🎙 dùng `SpeechRecognition`, không hỗ trợ → ẩn |
| Nhãn AI | "Haiku 4.5 tự parsing: Domain, Skill node, Evidence" | `font-label-sm text-label-sm text-on-surface-variant`, icon `text-secondary` | Ở offline đổi thành "Rule cục bộ tự phân loại" |
| Nút "Ghi nhanh ngay" | CTA chính | `bg-primary-container text-on-primary rounded-lg font-code-md text-label-md font-semibold shadow-md` + `hover:brightness-105 active:scale-[0.98]` | `Enter` (không `Shift`) kích hoạt; disable khi đang ghi |
| Bước 2 — panel | Khối AI | `bg-surface-container rounded-xl`, viền `border border-secondary/30` | Ẩn khi chưa có kết quả autofill |
| Badge nguồn | "AI" hoặc "Rule cục bộ" | `bg-secondary-container/40 text-secondary rounded font-code-md text-label-sm` | **Không** hiển thị % tin cậy bịa (chỉ hiện nguồn thật) |
| Ô domain | Tên domain + nút "Sửa" | chấm màu domain: `professional`→`bg-secondary`, `communication`→`bg-tertiary`, `language`→`bg-primary`, `personal`→`bg-on-surface-variant`; tên `font-headline-sm text-on-surface font-semibold` | "Sửa" → mở chọn 4 domain |
| Ô kỹ năng | Tên node + XP | icon `account_tree text-primary`; tên `text-primary font-semibold`; chip `bg-primary/10 text-primary` | Không có kỹ năng → "Chưa gắn kỹ năng" + nút chọn |
| Chip thời lượng | 15′ / 25′ / 45′ / 60′ | mặc định `bg-surface-container-high text-on-surface`; đang chọn `bg-tertiary text-on-tertiary font-semibold` | Giá trị hiển thị `font-code-md text-tertiary font-bold` |
| Sao mức độ khó | 4 ngôi sao | đã chọn `text-tertiary` + `FILL 1`; chưa chọn `text-outline-variant` | 1–4 ⭐ |
| Toggle Evidence | Checkbox tạo bằng chứng | `accent-primary bg-surface-container-high`; nhãn `text-on-surface font-semibold`; chip `bg-primary/10 text-primary` + icon `verified` | Mặc định bật; tắt ⇒ không tạo `Evidence` |
| Ghi chú | Textarea 1 dòng | `bg-surface-container-lowest text-on-surface rounded-lg` | Tuỳ chọn, ≤ 500 ký tự |
| Footer Bước 2 | "Bỏ qua & Đóng" + "AI Tóm tắt" + "Lưu chi tiết & Đóng (⌘⏎)" | Bỏ qua: ghost `text-outline hover:bg-surface-container-high`; AI: `bg-secondary-container/40 text-secondary` + icon `psychology_alt` (Phase 0: ẩn); Lưu: `bg-primary-container text-on-primary` | `⌘/Ctrl+Enter` = Lưu |
| Toast | Kết quả ghi | `bg-surface-container-highest border border-primary/30 rounded-xl`; icon tròn `bg-primary/20 text-primary`; tiêu đề `font-headline-sm text-on-surface`; dòng phụ `text-primary font-code-md` | `aria-live="polite"`, tự tắt 3.2 s |
| History — chip lọc | Tất cả (n) + 4 domain | active `bg-surface-container-high text-on-surface font-semibold`; inactive `text-outline hover:text-on-surface` | Client-side lọc, không reload |
| History — item | Giờ, chip domain, phút, badge Evidence, tiêu đề, node, độ khó | `bg-surface-container rounded-lg hover:bg-surface-container-high`; giờ `font-code-md text-label-sm` (màu theo domain); chip domain `bg-<domain>/10 text-<domain>`; badge Evidence `bg-primary/10 text-primary` + icon `verified` | Click "Sửa" → mở modal sửa; "Xoá" → hỏi xác nhận |
| History — rỗng | Chưa có hoạt động | CTA `bg-primary-container text-on-primary` | CTA quay lại `/` |

### 6.5 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Sheet đóng | `state = closed` | Không có overlay; focus trả về nút mở ở S01 |
| Sheet đang mở | `state = open.step1` | Panel Bước 1; badge đồng hồ đếm từ lúc mở; input tự focus |
| Đang autofill AI | `state = open.step1` + `autofill = pending` | Panel Bước 2 hiện skeleton mờ (`bg-surface-container-low` + shimmer); **không** khoá nút "Ghi nhanh ngay" |
| Autofill thành công | `autofill = done`, `source = "ai"` | Panel Bước 2 điền 4 trường; badge nguồn "AI" |
| Autofill lỗi → fallback | `autofill = error` hoặc AI trả domain/skill không hợp lệ | Dùng kết quả rule cục bộ; badge nguồn "Rule cục bộ"; hiện dòng nhỏ "AI không phân loại được — đã dùng rule cục bộ" (`text-outline`) |
| Offline (không API key) | `!isAiAvailable()` | Badge nguồn "Rule cục bộ"; nhãn AI đổi thành "Rule cục bộ tự phân loại"; **không** hiện nút AI |
| Mô tả quá ngắn | `description.length < 3` | Không gọi autofill; nút "Ghi nhanh ngay" hiện nhưng bấm → hiện lỗi nhẹ dưới input `text-error` "Viết ít nhất 3 ký tự" + `aria-invalid` |
| Đang ghi | `state = saving` | Nút chính `disabled` + spinner; ô nhập `readOnly`; chống Enter lặp |
| Đã lưu | `state = saved` | Toast "Đã ghi thành công vào Local DB!" + dòng phụ "Tiếng Trung HSK4 · Ghi nhận trong 3.2s"; sheet đóng; lịch sử refresh |
| Lỗi ghi | API trả lỗi | Giữ nguyên nội dung form; toast lỗi `bg-error-container` + nút "Thử lại"; không đóng sheet |
| Lịch sử rỗng | 0 `Activity` trong ngày | "Chưa có hoạt động nào hôm nay" + CTA "Ghi nhanh ngay" |
| Lọc domain không có dữ liệu | domain được chọn không có mục nào | "Chưa có hoạt động cho domain này" |

### 6.6 Edge case

| Case | Xử lý |
|---|---|
| Gõ mô tả **< 3 ký tự** | Không gọi autofill; nút ghi bị khoá, hiện lỗi nhẹ "Viết ít nhất 3 ký tự". Vẫn dùng được nếu đã bấm preset (preset điền sẵn ≥ 3 ký tự). |
| Chỉ gõ khoảng trắng | Trim → rỗng → coi như chưa nhập, khoá nút ghi. |
| AI trả `domain` không hợp lệ (ví dụ "health", "finance") | Bỏ qua kết quả AI → chạy rule cục bộ; ghi `AiCall{ok:false, error:"invalid_autofill"}`; badge "Rule cục bộ". Không lưu domain ngoài 4 domain (P5). |
| AI trả `skillId` không tồn tại hoặc khác domain | Bỏ `skillId` (giữ domain/độ dài/độ khó); hiện "Chưa gắn kỹ năng"; không tạo Evidence. |
| AI trả `minutes` ngoài khoảng | Clamp về `[1, 240]`; `minutes ≤ 0` → fallback theo preset. |
| **Offline** (không `ANTHROPIC_API_KEY` hoặc mất mạng) | `POST /api/log/autofill` tự trả kết quả rule cục bộ kèm `source:"rule"`; ghi vẫn thành công. Không giả lập phản hồi AI. |
| **Bấm Enter nhiều lần / bấm nút liên tiếp** | Client khoá nút khi `state = saving` + huỷ request cũ bằng `AbortController`; server dedupe: cùng `title`+`domain`+`minutes` trong 30 s ⇒ trả `Activity` cũ kèm `deduped:true`, **không** tạo bản ghi mới. |
| Bấm "Xong" trên `PlanItem` đã có `Activity` | Trả `Activity` cũ (`deduped:true`), không tạo bằng chứng trùng. |
| Kỹ năng bị xoá giữa lúc autofill và lúc lưu | Server bỏ `skillId`, tạo `Activity` không kèm Evidence, trả cảnh báo "Kỹ năng không còn tồn tại — đã lưu không kèm bằng chứng". |
| Sửa mục lịch sử → đổi kỹ năng | Xoá `Evidence` cũ, tạo `Evidence` mới, tính lại `level` của cả kỹ năng cũ và mới. |
| Sửa mục lịch sử → đổi mức độ khó | Cập nhật `Evidence.rating` + `Activity.quality` đồng thời, tính lại `level`. |
| Xoá mục lịch sử | Xoá `Activity` (cascade xoá `Evidence`), tính lại `level` của kỹ năng bị ảnh hưởng; có bước xác nhận. |
| Xoá `PlanItem` đã sinh `Activity` | `Activity` giữ nguyên (lịch sử độc lập với kế hoạch). |
| Ngày chạm ranh giới nửa đêm khi ghi | `createdAt` dùng thời gian thật; nhóm ngày theo local time qua `src/lib/dates.ts`. |
| Đồng hồ badge vượt 10 s | Đổi màu badge sang `bg-tertiary/10 text-tertiary` + nhãn `+{n}s` (không chặn ghi). |
| Người dùng bấm `Esc` khi đang ghi | Bỏ qua `Esc` trong lúc `state = saving` để tránh mất phần đang ghi. |
| Người dùng bấm `Esc` / nút ✕ khi đang autofill | Đóng sheet ngay; request autofill bị huỷ (`AbortController`), không ghi gì. |
| Mất mạng giữa chừng khi đang ghi | `fetch` lỗi → toast "Không gửi được lên máy chủ. Kiểm tra kết nối rồi thử lại." + giữ nguyên form. |

## 7. Hợp đồng API

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| POST | `/api/log` | `{ title, domain, type?, minutes?, difficulty?, skillId?, note?, planItemId?, clientRequestId? }` | `{ ok:true, data:{ activityId, evidenceId, levelUp: {skillId, from, to} \| null, deduped, serverMs } }` | `400` validation · `404` `skill_not_found` (client thử lại không kèm skillId) · `409` `plan_item_conflict` · `500` |
| POST | `/api/log/autofill` | `{ text, domain?, preset? }` | `{ ok:true, data:{ domain, skillId\|null, skillName\|null, minutes, difficulty, type, source:"ai"\|"rule" } }` | `400` text quá ngắn · `500` (đã fallback rule trước khi trả lỗi) |
| GET | `/api/log/history` | `?date=2026-10-30&domain=all&limit=50&offset=0` | `{ ok:true, data:{ days:[{ date, totalMinutes, items:[…] }], count } }` | `400` `date` sai định dạng |
| PATCH | `/api/log/[id]` | `{ title?, domain?, type?, minutes?, difficulty?, skillId?, note? }` | `{ ok:true, data:{ activityId, evidenceId, levelUp, skillChanged } }` | `400` validation · `404` không tồn tại · `409` domain/skill không khớp |
| DELETE | `/api/log/[id]` | — | `{ ok:true, data:{ deleted:true, skillId, levelBefore, levelAfter } }` | `404` không tồn tại |

**Ghi chú hợp đồng**

- Mọi response theo chuẩn `tech.md` §5: `{ ok, data }` hoặc `{ ok:false, error }`.
- `POST /api/log` là **idempotent 3 tầng**: `clientRequestId` (`@@unique`) → `planItemId` (`@@unique`) → bộ khóa mềm `(title, domain, minutes)` trong cửa sổ 30 giây. Hàng rào đầu là khoá nút ở client.
- `POST /api/log/autofill` **luôn trả 200** khi đã có kết quả (AI hoặc rule). Chỉ 400 khi `text` thiếu/≤2 ký tự.
- `POST /api/log` với `planItemId` thực hiện trong 1 `prisma.$transaction`: tạo Activity → tạo Evidence → `planItem.update({ done: true })`.

## 8. Tiêu chí nghiệm thu

**AC-2 — Quick-log ≤10s (SPEC §8)**
- *Given* sheet Quick-log đã mở, *When* chọn 1 preset hoặc gõ mô tả rồi bấm "⚡ Ghi nhanh ngay", *Then* lưu xong trong **≤10 giây** (đo `performance.now()` từ lúc sheet mở đến lúc toast hiện) và **không phải chờ AI trả lời** — request AI-02 chưa xong vẫn ghi được.
- *Given* mạng bị chặn hoàn toàn (API AI không trả lời), *When* ghi bằng preset, *Then* vẫn tạo `Activity` đúng domain/type/thời lượng trong ≤10 s.

**AC-QL-1 — 2 chạm tạo đúng hoạt động**
- *Given* sheet mới mở, *When* bấm preset `2 🎯 Luyện tập` rồi bấm "Ghi nhanh ngay", *Then* tạo đúng 1 `Activity` với `domain="professional"`, `type="study"`, `minutes` theo preset, `title` = mô tả preset.

**AC-QL-2 — AI điền sẵn 4 trường**
- *Given* có API key và cây kỹ năng đã seed, *When* gõ "ôn 25 từ vựng HSK 4 tiếng Trung" và đợi 1,5 s, *Then* panel Bước 2 hiện `domain="language"`, `skillId` trỏ tới node tiếng Trung, `minutes=25`, `difficulty` ∈ 1–4; nút "Ghi nhanh ngay" **vẫn bấm được** trong lúc đang chờ.

**AC-QL-3 — Offline vẫn ghi được**
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở sheet và ghi 1 hoạt động, *Then* ghi thành công vào SQLite, badge nguồn hiện "Rule cục bộ", và **không** có phản hồi nào được giả lập là của AI.

**AC-QL-4 — Chống ghi trùng**
- *Given* sheet đang mở, *When* bấm Enter 5 lần liên tiếp trong 1 giây, *Then* DB chỉ có **1** `Activity` mới (không có 5 bản ghi trùng).

**AC-QL-5 — Bằng chứng làm tăng level (P3, FR-SK-03)**
- *Given* kỹ năng có 2 `Evidence` `rating=3`, *When* ghi 1 hoạt động nữa với mức độ khó 4 ⭐ và bật "Tạo Evidence", *Then* `Skill.level` của kỹ năng đó tăng 1, và `Evidence.rating` mới = 4.
- *Given* kỹ năng có 2 `Evidence` `rating=3`, *When* ghi 1 hoạt động với mức độ khó 2 ⭐, *Then* `Skill.level` **không** đổi (chỉ có `rating ≥ 3` mới tính).

**AC-QL-6 — FR-DL-03: bấm "Xong" sinh bằng chứng**
- *Given* hôm nay có `PlanItem` slot 1 chưa `done`, *When* bấm "Xong" ở S01, *Then* tạo `Activity` (title = action của plan item, minutes = plan item minutes, skillId = plan item skillId) + 1 `Evidence`, `PlanItem.done = true`, và tất cả xảy ra trong cùng 1 transaction (nếu bước Evidence lỗi thì `PlanItem.done` vẫn `false`).

**AC-QL-7 — Sửa và xoá lịch sử**
- *Given* hôm nay có 1 hoạt động `language` 25′ mức độ khó 3 ⭐ kèm Evidence, *When* sửa mức độ khó thành 1 ⭐, *Then* `Evidence.rating = 1`, `Activity.quality = 1` và `Skill.level` được tính lại (giảm nếu không còn đủ bằng chứng `rating ≥ 3`).
- *Given* hôm nay có 1 hoạt động, *When* xoá mục đó, *Then* `Activity` và `Evidence` biến mất khỏi DB, mục biến mất khỏi lịch sử, và `Skill.level` được tính lại.

**AC-QL-8 — Lịch sử theo ngày, lọc theo domain**
- *Given* hôm nay có 7 hoạt động (2 chuyên môn, 3 ngoại ngữ, 1 giao tiếp, 1 cá nhân), *When* mở `/log/history`, *Then* chip "Tất cả (7)" hiện đúng 7; bấm chip "Ngoại ngữ" chỉ còn 3 mục, và URL phản ánh bộ lọc để chia sẻ/bookmark được.

**AC-QL-9 — AI trả domain không hợp lệ → fallback**
- *Given* có API key và AI-02 bị mock trả `domain="health"`, *When* ghi nhận, *Then* hệ thống bỏ kết quả AI, dùng rule cục bộ, ghi `AiCall{ok:false, error:"invalid_autofill"}`, và `Activity.domain` vẫn thuộc 1 trong 4 domain hợp lệ.

**AC-QL-10 — A11y & mobile**
- *Given* viewport 390×844, *When* mở sheet và điều hướng bằng bàn phím, *Then* mọi chip/nút/input focus được bằng `Tab`, có `focus-visible:ring-2 focus-visible:ring-primary`, mọi icon-only button có `aria-label`, toast dùng `aria-live="polite"`, và `Esc` đóng sheet rồi trả focus về nút mở.
