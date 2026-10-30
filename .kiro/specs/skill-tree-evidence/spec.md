# Cây Kỹ Năng & Bằng Chứng

> **Màn hình:** S03 (`/skills`), S04 (`/skills/[id]`) · **Route:** `/skills`, `/skills/[id]` · **Phase:** 0
> **Nguồn:** `system-design/SPEC.md` §0.3 (P3), §2.2 (FR-SK-01..06), §3.2 (S03, S04), §4 (`Skill`/`Activity`/`Evidence`), §8 (AC-3) · prototype `system-design/s03_c_y_k_n_ng_b_ng_ch_ng/`, `system-design/s04_chi_ti_t_k_n_ng_b_ng_ch_ng/`
> **Phụ thuộc:** `app-foundation` (phải xong trước)

## 1. Tổng quan

Hai màn hình này là **nơi duy nhất** trong ứng dụng hiển thị "tôi đã tiến được bao nhiêu" — và con số đó **chỉ có một nguồn: `Evidence`**.

S03 (`/skills`) là bản đồ năng lực: 4 domain, mỗi domain là 1 node tầng 1, bên dưới là các kỹ năng (tầng 2) và các mục kỹ năng con (tầng 3). Mỗi node hiển thị **thang 0–5 + số bằng chứng** — không có phần trăm, không có thanh "hoàn thành 73%". Cột phải là feed bằng chứng gần đây, đọc trực tiếp từ SQLite.

S04 (`/skills/[id]`) là hồ sơ của một kỹ năng: breadcrumb cha–con, thang level hiện tại, biểu đồ level theo thời gian, tổng thời gian đã bỏ ra, điểm trung bình theo loại hoạt động, tiêu chuẩn thăng cấp còn thiếu, và **Nhật ký bằng chứng (Evidence Log)** — bảng từng dòng bằng chứng với ngày, loại hoạt động, tiêu đề + nội dung chứng minh, điểm đánh giá và trạng thái lưu trữ.

Nguyên tắc chi phối: **P3** (tiến độ = bằng chứng, không phải checkbox), **P5** (domain đóng băng 4 nhóm), **P7** (không vanity metric — mọi số đều gắn được với một kỹ năng cụ thể). Feature này **không gọi AI**: toàn bộ số liệu là truy vấn SQL thuần, nên hoạt động đầy đủ khi không có `ANTHROPIC_API_KEY` (NFR-03).

## 2. Bối cảnh & vấn đề

- **SPEC §0.1 — "đếm số ngày, không tạo ra năng lực".** Streak và checkbox không đo năng lực. Người dùng cần thấy: "tôi đã **làm** gì, kết quả ra sao, và mốc tiếp theo còn thiếu gì".
- **SPEC §0.3 P3 — tiến độ = bằng chứng.** Mỗi hoạt động tạo ra `Evidence` gắn với một kỹ năng. Nếu `level` tăng được bằng cách tick, P3 không còn ý nghĩa và toàn bộ tính năng đo lường của app trở nên vô nghĩa.
- **SPEC §2.2 FR-SK-06 — không phần trăm mơ hồ.** "80% hoàn thành" không trả lời được "tôi giỏi chuyên môn tới đâu". Thang 0–5 + số bằng chứng thì có.
- **SPEC §3.2 S03 — người dùng không biết nên luyện gì tiếp.** Cây kỹ năng phải làm lộ rõ *mục nào còn trống* để thuật toán Daily Loop (AI-01) và `src/lib/plan.ts` chọn đúng.
- **SPEC §3.2 S04 — không truy được về hoạt động cụ thể.** Level tăng mà không biết tăng nhờ cái gì thì bằng không. Nhật ký bằng chứng là bằng chứng (audit trail) để người dùng tự phản biện (NFR-06, steering tech §5 "Chấm điểm").

## 3. Yêu cầu chức năng

### 3.1 Cây kỹ năng

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SK-01 | Cây **3 tầng**: Domain (tầng 1) → Kỹ năng (tầng 2) → Mục kỹ năng con (tầng 3). Mỗi domain là 1 node gốc (`parentId = null`), các node con lồng nhau bằng `parentId`. | P0 | FR-SK-01 |
| FR-SK-02 | Mỗi kỹ năng có `level` hiện tại (0–5) **và** `targetLevel` (1–5). `targetLevel` là mốc tham chiếu, không phải trần cứng cho `level`. | P0 | FR-SK-02 |
| FR-SK-04 | Mỗi mục kỹ năng **mở rộng được**: khai báo **tên**, **domain**, **mục cha**, **mức mục tiêu**. Không thêm node tầng 4. | P1 | FR-SK-04 |
| FR-SK-07 | Mỗi node hiển thị **số bằng chứng** (tổng) và **số bằng chứng đạt chuẩn** (`rating ≥ 3`). Node tầng 1 hiển thị `level` = mức cao nhất trong toàn bộ hậu duệ. | P0 | FR-SK-06 (mở rộng) + prototype S03 |
| FR-SK-08 | Đặt **trọng tâm hôm nay** cho một kỹ năng (một tại một thời điểm); trọng tâm được Daily Loop đọc để đẩy bài tập/SRS vào ca chính. | P1 | prototype S03 ("Đặt trọng tâm") + SPEC §3.2 S03 |
| FR-SK-09 | Chỉ ra kỹ năng **yếu nhất** (node lá `level = 0`) để gợi ý luyện tiếp — dùng cho nút "Luyện tập đo lường ngay" và cho `src/lib/plan.ts` (fallback offline). | P1 | FR-AI-19 (fallback xoay vòng kỹ năng yếu nhất) + prototype S03 |
| FR-SK-10 | Feed **bằng chứng gần đây** (toàn hệ thống) hiển thị trên S03: thời gian, tiêu đề hoạt động, loại hoạt động, rating, kỹ năng liên quan. Click 1 bản ghi → S04 của kỹ năng đó. | P1 | prototype S03 ("Bằng Chứng Gần Đây") |
| FR-SK-11 | Xoá được một node: node con được **chuyển lên ông bà** (không mất dữ liệu), `Evidence` của node bị xoá bị cascade, các node còn lại được tính lại level. | P1 | SPEC §4 (`onDelete: Cascade`) + edge case "node cha bị xoá" |

### 3.2 Bằng chứng & quy tắc tăng level

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-SK-03 | `level` **không tự tăng từ checkbox**. `level` chỉ tăng khi tích lũy đủ `Evidence` có `rating ≥ EVIDENCE_RATING_MIN` (mặc định 3), với ngưỡng `EVIDENCE_THRESHOLD` (mặc định 3) bằng chứng đạt chuẩn cho mỗi level. Công thức & điều kiện KHÔNG tăng: §6.4. | P0 | FR-SK-03, AC-3 |
| FR-SK-05 | S04 hiển thị: **lịch sử bằng chứng** (ngày · loại hoạt động · tiêu đề + nội dung chứng minh · điểm đánh giá), **thời gian đã bỏ ra** (tổng phút của các hoạt động có bằng chứng), **điểm trung bình**. | P0 | FR-SK-05 |
| FR-SK-06 | Điểm kỹ năng hiển thị dạng **thang 0–5 + số bằng chứng**. Tuyệt đối không hiển thị phần trăm mơ hồ ("hoàn thành 73%"). | P0 | FR-SK-06, P7 |
| FR-SK-12 | Mỗi dòng bằng chứng hiển thị **mã định danh ngắn trong SQLite** (mã băm 6 ký tự) + trạng thái `DB Local: Active`, để đối chiếu cục bộ. | P1 | prototype S04 (cột "SQLite State") |
| FR-SK-13 | S04 hiển thị **tiêu chuẩn thăng cấp còn thiếu**: số bằng chứng ≥3★ còn thiếu, điểm trung bình tối thiểu, và nhịp duy trì (bằng chứng trong 14 ngày gần nhất) — mỗi mục có trạng thái đạt/chưa đạt. | P1 | prototype S04 ("Tiêu chuẩn thăng cấp") |
| FR-SK-14 | Biểu đồ **level theo thời gian** của kỹ năng, theo tuần, kèm đường ngưỡng của level kế tiếp. Không vẽ chart rỗng khi thiếu dữ liệu. | P1 | prototype S04 + FR-SK-05 |
| FR-SK-15 | Phân bổ hoạt động theo loại: mỗi loại có số bằng chứng + điểm trung bình. Chỉ tính loại **có bằng chứng** (P7). | P1 | prototype S04 ("Phân bổ hoạt động") |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-SK-01 | **Không phụ thuộc AI.** Mọi số liệu S03/S04 là truy vấn SQLite thuần | Xoá `ANTHROPIC_API_KEY` → S03/S04 hiển thị đầy đủ, không mất khối nào |
| NFR-SK-02 | **Mobile-first 390px.** Cây 3 tầng xuống 1 cột; bảng nhật ký bằng chứng cuộn ngang; mọi nút hành động nằm trong vùng ngón cái | Kiểm tra ở 390px: không tràn ngang ngoài bảng, không tràn viewport |
| NFR-SK-03 | **Không số liệu hardcode trong JSX.** Mọi con số (160 bằng chứng, 2/5, 4.8 giờ) đến từ truy vấn | Review code: không có hằng số nghiệp vụ trong component; test với fixture rỗng → hiển thị 0 |
| NFR-SK-04 | **Query không N+1.** Cây 3 tầng + đếm bằng chứng + feed gần đây trong ≤ 5 query | `EXPLAIN QUERY PLAN` không có N query con; test với 4 domain × 3 kỹ năng × 3 mục con |
| NFR-SK-05 | **A11y.** Cây là `<ul>/<li>` có nhãn; thanh thang có `aria-label` "Cấp 2 trên 5"; bảng là `<table>` semantic; icon-only có `aria-label`; focus ring `focus-visible:ring-2 focus-visible:ring-primary` | Axe: 0 lỗi nghiêm trọng; điều hướng bàn phím mở/đóng từng domain |
| NFR-SK-06 | **Tương phản WCAG AA.** `outline` cho label, `on-surface` cho body; `primary` không dùng làm nền chữ nhỏ | Kiểm tra token tương phản ≥ 4.5:1 |
| NFR-SK-07 | **Không hardcode hex.** Chỉ dùng class token của `design-system.md` (kể cả đường nối dashed của cây) | Không có `#` hex trong `src/components/skills/**` |
| NFR-SK-08 | **Tính năng không-AI hoạt động khi mất mạng** (NFR-03 steering) | Tắt network → mở S03/S04 vẫn đọc được dữ liệu SQLite |
| NFR-SK-09 | **Tính lại level tức thì.** Ghi/xoá bằng chứng phải cập nhật `Skill.level` trong cùng transaction, không cần tải lại trang | Sau `POST /api/skills/[id]/evidence`, response trả `level` mới; `GET /api/skills` sau đó trả đúng level đó |

## 4.1 Cây kỹ năng seed (Q1 — Java Backend Developer)

> Nguồn chân lý: `.kiro/steering/user-profile-decisions.md` §2.
> Cây **phải** phản ánh người dùng thật, không phải cây trung tính.

```
Chuyên môn (Java Backend)                    [professional]
├── Java Core & Collections
│   ├── Generics, Comparable, Iterable
│   ├── Stream API & Optional
│   └── Exception handling & try-with-resources
├── JVM & Hiệu năng
│   ├── Garbage Collection (GC) & memory leak
│   ├── JIT compiler, profiling (JFR / async-profiler)
│   └── Thread dump, phân tích bottleneck
├── Spring Boot
│   ├── Dependency Injection & Bean lifecycle
│   ├── Web layer: Controller / Filter / Interceptor
│   └── Auto-configuration & Starter
├── Truy cận dữ liệu
│   ├── JPA / Hibernate: N+1, fetch strategies
│   ├── Connection pool (HikariCP) & transaction
│   └── Query tuning & index
├── System Design
│   ├── Phân tích yêu cầu & use case          ← TRỌNG TÂM
│   ├── Lựa chọn giải pháp & đánh đổi        ← TRỌNG TÂM
│   └── Phân tích & độ khó (load, latency, consistency)
├── Luyện tập kỹ năng
│   ├── Java Algorithms (LeetCode)
│   ├── System Design (coding round)
│   └── Coding Interview
└── Hệ sinh thái & vận hành
    ├── Docker & container
    ├── CI/CD & Git workflow
    └── Observability: log, metric, trace

Giao tiếp                                    [communication]
├── Viết · Nói · Phỏng vấn & Thuyết trình

Ngoại ngữ                                     [language]
├── Tiếng Anh · Tiếng Trung · Tiếng Việt (giao tiếp công sở)

Cá nhân                                       [personal]
├── Nhật ký & Phản tư · Thể chất & Tinh thần · Quản lý năng lượng
```

**Tổng: 4 node domain · 16 node tầng 2 · 33 node tầng 3.**

**Ràng buộc:**
- Node `Phân tích yêu cầu & use case` và `Lựa chọn giải pháp & đánh đổi` là 2 mục **trọng tâm**
  ⇒ mock interview hỏi sâu nhất vào đây (AI Interview Studio, Q6).
- Node `Tiếng Việt (giao tiếp công sở)` chỉ thuộc module giao tiếp — **không có SRS deck** (Q2).
- Seed là **file tĩnh**, không gọi AI.

---

## 5. Mô hình dữ liệu

Feature dùng lại model có sẵn trong `system-design/SPEC.md` §4 — **không thêm model mới**. Thay đổi chỉ gồm 2 chỉ số bổ sung và 1 trường mở rộng.

> **Registry:** `.kiro/steering/data-model-registry.md` — `UserProfile.focusSkillId` = **`C3`**
> (FK `onDelete: SetNull`). Quy tắc hành vi **B1** (không route nào ghi `Skill.level` trực tiếp)
> và **B4** (công thức tăng level) là nguồn chân lý dùng chung với `quick-log`.

### 5.1 Model dùng lại

| Model | Field | Kiểu | Ghi chú trong feature này |
|---|---|---|---|
| `Skill` | `id` | String (cuid) | Khoá node trong cây. |
| `Skill` | `name` | String | Tên tiếng Việt (2–80 ký tự). |
| `Skill` | `nameZh` | String? | Tên tiếng Trung cho kỹ năng ngoại ngữ. |
| `Skill` | `domain` | String | `professional` \| `communication` \| `language` \| `personal` (P5 — 4 domain đóng băng). |
| `Skill` | `parentId` | String? | `null` = node tầng 1 (domain). Tự tham chiếu, quan hệ `"SkillTree"`. |
| `Skill` | `children` | Skill[] | Quan hệ ngược cùng `"SkillTree"`. |
| `Skill` | `level` | Int (0–5) | **Chỉ tăng qua `Evidence`** — không có API nào ghi trực tiếp field này. |
| `Skill` | `targetLevel` | Int (1–5) | Mốc mục tiêu; mặc định 3. Không chặn `level`. |
| `Skill` | `position` | Int | Thứ tự anh chị trong cùng nhóm (0,1,2…). |
| `Activity` | `id` | String | Hoạt động sinh ra bằng chứng. |
| `Activity` | `skillId` | String? | Kỹ năng được gắn. `null` → **không** sinh bằng chứng, không tính vào kỹ năng nào. |
| `Activity` | `type` | String | `study`\|`write`\|`speak`\|`roleplay`\|`srs`\|`journal`\|`health`\|`custom`. |
| `Activity` | `minutes` | Int | Cộng dồn thành "Thời gian đã bỏ ra" của S04. |
| `Activity` | `quality` | Int? | Tự đánh giá 1–5. |
| `Activity` | `aiScore` | Float? | Điểm rubric 0–5 (nếu hoạt động được AI chấm). |
| `Activity` | `title` / `content` | String / String? | Tiêu đề + nội dung chứng minh hiển thị ở cột 3 của Nhật ký bằng chứng. |
| `Evidence` | `id` | String | Mã định danh dùng để sinh mã băm 6 ký tự (FR-SK-12). |
| `Evidence` | `activityId` | String | Quan hệ tới `Activity`, `onDelete: Cascade`. |
| `Evidence` | `skillId` | String | Quan hệ tới `Skill`, `onDelete: Cascade`. `@@index([skillId])`. |
| `Evidence` | `rating` | Int | **1–4** (SPEC §4). Chỉ `rating ≥ 3` mới tính vào tăng level. |
| `Evidence` | `createdAt` | DateTime | Mốc thời gian cho biểu đồ level theo tuần. |

### 5.2 Mở rộng (không có trong SPEC §4 — ghi rõ lý do)

| Thay đổi | Vị trí | Lý do | Ảnh hưởng |
|---|---|---|---|
| `@@index([parentId])` | `Skill` | Truy vấn cây 3 tầng theo cha; không có index thì mỗi node là 1 full scan | Không đổi API công khai |
| `@@index([domain])` | `Skill` | Lọc 4 domain ở S03/S04 | Không đổi API công khai |
| `focusSkillId String?` + quan hệ `focusSkill` | `UserProfile` | Trọng tâm hôm nay (FR-SK-08) là **một** giá trị toàn cục, không cần lịch sử theo ngày ở Phase 0 → thêm 1 trường thay vì thêm 1 model (giữ đúng 15 model của SPEC §4) | `onDelete: SetNull` → xoá skill trọng tâm không làm hỏng hồ sơ |

### 5.3 Quan hệ & ràng buộc

```
UserProfile ──focusSkill──► Skill (node bất kỳ, thường là node lá)
Skill(parentId) ──"SkillTree"──► Skill(children)     // tự tham chiếu, 3 tầng
Skill ──► Evidence ──► Activity                        // cascade khi xoá Skill hoặc Activity
```

| # | Ràng buộc | Mức |
|---|---|---|
| C1 | Độ sâu node ≤ 3 (domain → kỹ năng → mục con). Node tầng 3 không được có con | Bắt buộc |
| C2 | Mỗi domain có **đúng 1** node gốc (`parentId = null`) | Bắt buộc |
| C3 | `domain` của node con = `domain` của node cha | Bắt buộc |
| C4 | `level ∈ [0, 5]`, `targetLevel ∈ [1, 5]` | Bắt buộc |
| C5 | `rating ∈ [1, 4]` | Bắt buộc |
| C6 | Một `Activity` chỉ tạo **tối đa 1** `Evidence` cho mỗi `skillId`; ghi trùng cặp (activityId, skillId) → `409` | Bắt buộc |
| C7 | `domain` chỉ thuộc 4 giá trị đóng băng (P5) | Bắt buộc |
| C8 | `name` trong cùng nhóm cha không được trùng (không phân biệt hoa thường) | Khuyến nghị |

**Truy vấn tổng hợp (chuẩn P3):**

```sql
-- Đếm bằng chứng theo skill — 1 query cho TOÀN CÂY (không N+1)
-- countAll = TỔNG bằng chứng (kể cả rating < 3)
-- countQualified = bằng chứng ĐẠT CHUẨN (rating >= 3) → quyết định level
SELECT "skillId",
       COUNT(*)                                                  AS countAll,
       SUM(CASE WHEN "rating" >= 3 THEN 1 ELSE 0 END)            AS countQualified,
       AVG("rating")                                             AS avgRating
FROM "Evidence"
GROUP BY "skillId";

-- Tổng phút: CHỈ tính Activity có bằng chứng (P7)
SELECT "skillId", SUM("minutes")
FROM "Activity"
WHERE "skillId" IS NOT NULL
GROUP BY "skillId";

-- Level của node tầng 1 = MAX(level) trong toàn bộ hậu duệ
SELECT "parentId", MAX("level") AS maxLevel
FROM "Skill"
WHERE "parentId" IS NOT NULL
GROUP BY "parentId";
```

> `countQualified` là con số **duy nhất** quyết định `level` (§6.4). `countAll` chỉ để hiển thị, **không** dùng để tăng level. Toàn bộ SQL nằm trong `src/lib/skills.ts` — tầng UI không biết SQL tồn tại.

## 6. Giao diện & hành vi

### 6.1 Bố cục — S03 Cây kỹ năng (`/skills`)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ ▪CẤU TRÚC NĂNG LỰC P5   Định lượng thực tế 100% bằng chứng   ● 1 Bằng chứng = 1 Hành động đo lường │
├──────────────────────────────────────────────┬────────────────────────────────────┤
│ CÂY KỸ NĂNG & BẰNG CHỨNG                   │ HÀNH ĐỘNG KHỞI TẠO                  │
│ Không sử dụng phần trăm ước lượng. Mọi nấc  │ Điều Phối Tập Trung                 │
│ thăng cấp 0→5 đều yêu cầu mốc bằng chứng.  │ [▶ Luyện tập đo lường ngay]         │
│                                              │ [⚙ Đặt trọng tâm] [⊞ + Thêm mục con]│
│ ┌────────────┬──────────────┬─────────────┬──────────────┐                      │
│ │TỔNG DOMAIN │TỔNG BẰNG CHỨNG│TRỌNG TÂM HÔM NAY│KỸ NĂNG CHỜ LUYỆN│              │
│ │4 nhóm      │160 bản ghi    │Phân tích Y/C │4 mục mốc 0    │              │
│ │Đều kích hoạt│+6 tuần này  │Rating TB 3.8 │Cần bài đo    │              │
│ └────────────┴──────────────┴─────────────┴──────────────┘                      │
├──────────────────────────────────────────────┬────────────────────────────────────┤
│ DOMAIN 1/4 · TẦNG 1 CORE                   │ BẰNG CHỨNG GẦN ĐÂY  ● SQLite Local  │
│ ▣ Chuyên môn                     Thang 3/5  │ ┌────────────────────────────────┐ │
│   ▓▓▓▓▓▓▓▓▓░░░░░░ (31 bằng chứng · 17 đạt)│ │ Hôm nay, 14:20      Rating 4/4  │ │
│ ┌───────────────────────────────────────┐   │ │ SRS: Ôn tập 32 Flashcard…        │ │
│ │ 🌳 System Design   12 bằng chứng  1/5 │   │ │ ⚯ Hoạt động: Flashcard Run #84   │ │
│ │ ┌────────────┬─────────────┬─────────┐ │   │ └────────────────────────────────┘ │
│ │ │●Trọng tâm  │Cần luyện tập │Kiến trúc│ │   │ ┌────────────────────────────────┐ │
│ │ │Phân tích   │Lựa chọn giải │Microser.│ │   │ │ Hôm nay, 10:15    Rating 3/4  │ │
│ │ │yêu cầu 9 BC│pháp 0 BC    │Cache 8 BC│ │   │ │ Phân tích PR & Spec review…     │ │
│ │ │▓▓▓░░░ 3/5  │░░░░░ 0/5    │▓▓░░░ 1/5│ │   │ └────────────────────────────────┘ │
│ │ └────────────┴─────────────┴─────────┘ │   │ [🕘 Xem toàn bộ 160 bằng chứng]     │
│ └───────────────────────────────────────┘   │ ┌────────────────────────────────┐ │
│ ▣ Giao tiếp                     Thang 1/5  │ │ Nguyên tắc đo lường      SPEC P3  │ │
│   ┌──────────┬──────────┬───────────────┐   │ │ 1. Level ↑ chỉ khi đủ BC rating≥3│ │
│   │Viết 1/5  │Nói 0/5   │Phỏng vấn 0/5 │   │ │ 2. Rating TB phản ánh ổn định    │ │
│   └──────────┴──────────┴───────────────┘   │ └────────────────────────────────┘ │
│ ▣ Ngoại ngữ · ▣ Cá nhân  (mỗi domain 1 khối) │                                    │
└──────────────────────────────────────────────┴────────────────────────────────────┘
```

> Số liệu trong wireframe là **ví dụ minh hoạ** — luôn lấy từ truy vấn (NFR-SK-03). Các số trên **nhất quán** với công thức §6.4: `Phân tích yêu cầu` có 9 bằng chứng đạt chuẩn → `level = ⌊9/3⌋ = 3`; `System Design` có 5/12 đạt chuẩn → `level = ⌊5/3⌋ = 1`; domain `Chuyên môn` lấy **MAX** của hậu duệ → `3`.

**Cấu trúc cây 3 tầng trong 1 domain:**

```
TẦNG 1  ▣ Chuyên môn                Thang 3/5   ▓▓▓▓▓▓▓▓▓░░░░░░░   (MAX hậu duệ)
          │  ← đường nối dọc, 1.5px dashed
TẦNG 2  ├── 🌳 System Design    12 bằng chứng (5 đạt)  1/5  ▓░░░░░░░░░
          │      │  ← đường nối ngang
TẦNG 3  │      ├── ● Phân tích yêu cầu   9 bằng chứng (9 đạt)  3/5
          │      ├── Lựa chọn giải pháp   0 bằng chứng (0 đạt)  0/5
          │      └── Microservices & Cache 8 bằng chứng (3 đạt)  1/5
          └── 📦 Quản lý dữ liệu  2 bằng chứng (0 đạt)  0/5
                 (chưa có mục con → hiện lời nhắc "Thêm mục con")
```

> Node tầng 1 hiển thị **tổng** bằng chứng của cả domain (31) nhưng `level` lấy **MAX** của hậu duệ (3) — vì domain là nhóm chứa, không phải một kỹ năng có bằng chứng riêng. Nhãn hiển thị: "Thang 3/5" + "(31 bằng chứng · 17 đạt)" — **không** áp công thức ⌊17/3⌋ cho domain.

### 6.2 Bố cục — S04 Chi tiết kỹ năng (`/skills/[id]`)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Cây kỹ năng › Chuyên môn › System Design › Phân tích yêu cầu   │[📅 Tạo slot luyện tập ngày mai]│[+ Ghi bằng chứng (≤10s)]│
├───────────────────────────────────────────────────────────────────────────────────┤
│ ▪ĐANG LÀ TRỌNG TÂM HÔM NAY  ID: SKILL-SD-04   ● Nguyên tắc P3: Tiến độ = Bằng chứng│
│ Phân tích yêu cầu (Use Case & Event Modeling)                                     │
│ Khả năng bóc tách luồng nghiệp vụ phức tạp thành Domain Events, Commands, Read Models.│
│ ┌──────────────┬──────────────┬────────────────┬──────────────┐                    │
│ │CẤP ĐỘ HIỆN TẠI│BẰNG CHỨNG(P3)│THỜI GIAN TÍCH LŨY│ĐIỂM TRUNG BÌNH │                    │
│ │ Cấp 3 / 5    │ 9 bản ghi     │ 4.8 giờ        │ 4.1 / 5.0    │                    │
│ │ Mục tiêu:Cấp4│ 9 đạt chuẩn   │ ~32m / phiên   │ AI & Evaluator│                    │
│ └──────────────┴──────────────┴────────────────┴──────────────┘                    │
│ Điểm đánh giá TB: 4.2 / 4.0 (thang riêng, không phải 0–5)                         │
├──────────────────────────────────────────────┬────────────────────────────────────┤
│ TIẾN TRÌNH XÁC THỰC (FR-SK-03)   [Rating ≥3]│ PHÂN BỔ HOẠT ĐỘNG        4 danh mục│
│  [area chart: số bằng chứng ≥3★ theo tuần] │  System Design RFC  4 bản ghi 4.3★ │
│  - - - - - - ngưỡng Cấp 4 - - - - - - - -  │  ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Tuần 38 (khởi tạo) … Hiện tại (9/12)       │  Mock Interview Q&A 3 bản ghi 4.2★ │
│                                            │  Viết Use Case Spec  1 bản ghi 4.0★ │
├──────────────────────────────────────────────┤  Code Review Kiến trúc 1 bản ghi 3.8★│
│ ✓ NHẬT KÝ BẰNG CHỨNG (EVIDENCE LOG — P3)    │                                    │
│ [Lọc: Tất cả (9)] [● DB Local: Active]      │ TIÊU CHUẨN THĂNG CẤP    Mục tiêu C4│
│ ┌───────────┬──────────────┬───────────────────────────┬─────────┬─────────────┬────┐│
│ │ NGÀY      │ LOẠI HOẠT ĐỘNG│ TIÊU ĐỀ & NỘI DUNG CHỨNG MINH│ ĐÁNH GIÁ│SQLITE STATE│ THAO│
│ │28/10/2026 │[Mock Interview]│ Thiết kế Order Saga &…  │ ★ 4/4   │● HASH#9a8f2│ ↗  ││
│ │           │               │ Phản xạ Compensating Tx… │         │             │    ││
│ └───────────┴──────────────┴───────────────────────────┴─────────┴─────────────┴────┘│
└───────────────────────────────────────────────────────────────────────────────────┘
```

> Số liệu trong wireframe S04 **khớp** với S03: `Phân tích yêu cầu` có 9 bằng chứng đạt chuẩn → `level = ⌊9/3⌋ = 3`; `targetLevel = 4` → cần `(3+1) × 3 = 12` bằng chứng đạt chuẩn, còn thiếu 3. Thời gian 4.8 giờ = 288 phút ÷ 9 phiên ≈ 32m/phiên.

**Bảng nhật ký bằng chứng — 6 cột (bắt buộc theo prototype S04):**

| Cột | Nội dung | Nguồn dữ liệu |
|---|---|---|
| Ngày | `dd/MM/yyyy` (định dạng Việt Nam), `font-code-md` tabular | `Evidence.createdAt` |
| Loại hoạt động | chip màu theo `Activity.type` | `Activity.type` |
| Tiêu đề hoạt động & Nội dung chứng minh | dòng 1 = `Activity.title` (`body-md font-medium`), dòng 2 = `Activity.content` (`label-sm text-outline`, cắt 1 dòng) | `Activity` |
| Đánh giá | chip `★ 4/4` — số nguyên theo `Evidence.rating` (1–4) | `Evidence.rating` |
| SQLite State | `● HASH#xxxxxx` + `DB Local: Active` | mã băm 6 ký tự từ `Evidence.id` + `createdAt` |
| Thao tác | nút icon `open_in_new` → mở chi tiết bằng chứng | — |

### 6.3 Bảng thành phần

#### S03

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Chip nguyên tắc | "Cấu trúc năng lực P5" | `px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm uppercase tracking-wider` | Tĩnh |
| Tiêu đề trang | "Cây Kỹ Năng & Bằng Chứng" | `font-headline-lg text-on-surface font-semibold tracking-tight` | Tĩnh |
| 4 metric tile | Tổng domain · Tổng bằng chứng · Trọng tâm hôm nay · Kỹ năng chờ luyện | nền `bg-surface-container/50 rounded-lg p-space-md`; nhãn `font-label-sm text-outline uppercase`; số `font-headline-md text-on-surface font-bold`; nhấn mạnh `text-primary` / `text-tertiary` / `text-secondary` | Tính từ DB |
| Panel "Điều Phối Tập Trung" | 1 nút primary + 2 nút phụ | nút primary `bg-primary-container text-on-primary font-label-md font-semibold`; nút phụ `bg-surface-container-high text-on-surface` | "Luyện tập đo lường ngay" → S04 kỹ năng yếu nhất (FR-SK-09); "Đặt trọng tâm" → mở picker trọng tâm; "+ Thêm mục con" → mở form thêm node |
| Khối domain (tầng 1) | icon domain, "Domain n/4", tên domain, thang level, số bằng chứng | `section.bg-surface-container-low rounded-xl p-gutter-lg`; icon trong `w-10 h-10 rounded-lg bg-{domain}/10`; tên `font-headline-md text-on-surface font-bold` | Click header → mở/đóng nhánh |
| Thang level (segmented) | 5 ô, số ô đầu = `level` | ô đầy `bg-primary` (theo màu domain), ô trống `bg-surface-variant`, track nền `bg-surface-container-highest`; kích thước `w-6 h-2 rounded-xs` (tầng 1) / `w-4 h-1.5` (tầng 2) / `h-1 flex-1` (tầng 3) | `aria-label="Cấp 2 trên 5"` |
| Node tầng 2 | icon, tên, chip số bằng chứng, thang level, mô tả ngắn | `div.bg-surface-container rounded-lg p-space-lg`; tên `font-headline-sm text-on-surface font-semibold`; chip `rounded bg-surface-container-high text-on-surface-variant font-label-sm` | Click → S04 |
| Node tầng 3 (lá) | badge trạng thái, tên, số bằng chứng, thang level | `div.bg-surface-container-high/80 rounded-lg p-space-md`; badge trọng tâm `rounded-full bg-tertiary/20 text-tertiary`; badge cần luyện `bg-error-container/40 text-error` | Click → S04; "+ Bắt đầu" → tạo slot luyện tập cho node đó |
| Đường nối cây | nối cha–con | `border-dashed border-[1.5px] border-outline-variant` (dọc/ngang); chuyển `border-primary` **solid** khi node cha đã đạt `targetLevel` | Vẽ bằng pseudo-element `::before`/`::after` — xem design.md §3.7 |
| Panel "Bằng Chứng Gần Đây" | danh sách bằng chứng toàn hệ thống + nút mở rộng | `div.bg-surface-container p-space-md rounded-lg`; thời gian `font-label-sm text-outline`; chip rating `bg-primary/10 text-primary` (≥3) hoặc `bg-tertiary/10 text-tertiary` | Click 1 bản ghi → S04 của kỹ năng đó |
| Panel "Nguyên tắc đo lường" | 2 dòng quy tắc P3 | `font-body-sm text-on-surface-variant`, số thứ tự `text-primary font-bold` | Tĩnh, link tới SPEC §0.3 |

#### S04

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Breadcrumb | Cây kỹ năng › domain › kỹ năng › mục con | `font-label-md text-on-surface-variant`; phần cuối `text-on-surface font-semibold`; icon `chevron_right` 14px | Click từng cấp → S04 tương ứng |
| Chip trạng thái | "Đang là trọng tâm hôm nay" / ID kỹ năng / ghi chú P3 | `bg-primary/10 text-primary` · `bg-surface-container text-on-surface-variant font-code-md` · `text-outline` | Tĩnh |
| 4 metric tile | Cấp độ hiện tại · Bằng chứng · Thời gian tích lũy · Điểm trung bình | `bg-surface-container rounded-lg p-space-md`; số `font-headline-md font-bold` (`text-primary` / `text-on-surface` / `text-tertiary`); đơn vị `font-label-md text-outline` | Tính từ DB |
| Biểu đồ level theo tuần | đường + vùng đầy, đường ngưỡng level kế tiếp | stroke `text-primary` (2.5px), vùng đầy gradient `primary` 25%→0%, đường ngưỡng `stroke-tertiary` dashed 4 4, lưới `stroke-surface-container-high` dashed 3 3 | `< 2` tuần có dữ liệu → hiện dạng danh sách, không vẽ chart rỗng |
| Phân bổ hoạt động | mỗi loại: tên, số bản ghi + điểm TB, thanh | thanh `h-1.5 rounded-full bg-surface-container` + fill theo màu domain (`bg-primary`/`bg-secondary`/`bg-tertiary`/`bg-outline`) | Chỉ hiện loại **có** bằng chứng |
| Nhật ký bằng chứng | bảng 6 cột | `table.font-body-sm`; `thead.font-label-sm text-outline uppercase tracking-wider bg-surface-container/60`; `tr.hover:bg-surface-container/40`; `divide-y-0 space-y-1` | Sắp theo `createdAt` giảm dần; phân trang 20 dòng/trang |
| Tiêu chuẩn thăng cấp | số BC cần, gauge, 3 điều kiện | gauge `h-2 rounded-full bg-surface-container` + fill `bg-primary`; điều kiện đạt `bg-surface-container` + icon `check_circle text-primary`; chưa đạt `radio_button_unchecked text-tertiary` | Số liệu từ công thức §6.4 |
| Nút "Ghi bằng chứng (≤10s)" | mở Quick-log đã chọn sẵn kỹ năng | `bg-primary-container text-on-primary font-code-md font-semibold` | Mở sheet Quick-log với `skillId` prefilled (thuộc feature `daily-loop-core`) |
| Nút "Tạo slot luyện tập ngày mai" | tạo `PlanItem` ngày mai cho kỹ năng này | `bg-surface-container-high text-on-surface font-label-md` + icon `calendar_add_on` | Ghi `PlanItem` ngày mai, `source: "manual"` |

### 6.4 Quy tắc tăng level (FR-SK-03, P3)

**Hằng số cấu hình** (`src/lib/config.ts`, theo `project.md` §5):

```ts
export const SKILL_LEVEL_MAX   = 5;   // thang 0–5
export const EVIDENCE_RATING_MIN = 3; // chỉ rating >= 3 mới tính
export const EVIDENCE_THRESHOLD  = 3; // số bằng chứng đạt chuẩn cho mỗi level
```

**Công thức (nguồn sự thật duy nhất):**

```
qualifiedCount(skill) = COUNT(Evidence WHERE skillId = skill.id AND rating >= EVIDENCE_RATING_MIN)

level(skill)  = MIN(SKILL_LEVEL_MAX, FLOOR(qualifiedCount(skill) / EVIDENCE_THRESHOLD))

level(node tầng 1) = MAX(level) của toàn bộ hậu duệ trong domain
```

| `qualifiedCount` | 0 | 1 | 2 | **3** | 4 | 5 | **6** | 9 | 12 | 15+ |
|---|---|---|---|---|---|---|---|---|---|---|
| `level` | 0 | 0 | 0 | **1** | 1 | 1 | **2** | 3 | 4 | **5** |

**Điều kiện KHÔNG tăng level (bắt buộc — kiểm được):**

| # | Tình huống | Kết quả | Kiểm chứng |
|---|---|---|---|
| K1 | Bằng chứng `rating` = 1 hoặc 2 | Không tăng. Vẫn hiển thị trong Nhật ký bằng chứng và **đếm** vào `evidenceCount`, nhưng **không** tính vào `qualifiedCount` | 3 bằng chứng rating 2 → `level` vẫn 0 |
| K2 | Chỉ tick checkbox / đánh dấu "Xong" mà không tạo `Activity` + `Evidence` | `level` **không đổi** | AC-3 |
| K3 | Ghi lại bằng chứng cho cùng một `activityId` + `skillId` | API trả `409 duplicate_evidence`, `level` không đổi | Test integration |
| K4 | Đổi `targetLevel` | `level` **không đổi** (`targetLevel` không phải nguồn của `level`) | Test unit |
| K5 | `level` đã bằng `SKILL_LEVEL_MAX` (5) | Không tăng thêm; `level` = 5 kể cả khi `qualifiedCount` = 99 | Test unit |
| K6 | Bằng chứng thuộc kỹ năng khác | Không ảnh hưởng `level` của kỹ năng này | Test unit |
| K7 | `level` bị ghi trực tiếp từ API/UI | **Không tồn tại** endpoint nào ghi `Skill.level`; mọi thay đổi đi qua `recomputeSkillLevel()` trong transaction | Review code + test |
| K8 | Bằng chứng `rating ≥ 3` nhưng `Activity.skillId = null` (không gắn kỹ năng) | Không tính vào bất kỳ kỹ năng nào | Test integration |

**Quy tắc phụ (hành vi có chủ đích, phải hiển thị rõ trong UI):**

| # | Tình huống | Kết quả |
|---|---|---|
| K9 | **Xoá** một bằng chứng | `qualifiedCount` giảm → `level` có thể **giảm** (level là giá trị **tính ra**, không phải mốc đã đạt). UI phải cảnh báo trước khi xoá nếu `level` sẽ giảm. |
| K10 | Xoá một node cha | Node con được chuyển lên ông bà (giữ `domain`), `level` các node còn lại được tính lại; `Evidence` của node bị xoá bị cascade theo SPEC §4 |
| K11 | `level` vượt quá `targetLevel` | Vẫn hiển thị `level` thật (ví dụ 4/5 khi mục tiêu là 3). `targetLevel` chỉ là mốc tham chiếu, không phải trần cứng |

**Điều kiện thăng cấp (hiển thị ở S04, FR-SK-13):**

```
required   = (level + 1) * EVIDENCE_THRESHOLD          // số BC ≥3★ cần cho level kế tiếp
current    = qualifiedCount
missing    = MAX(0, required - current)
```

Ba mục kiểm tra hiển thị cạnh nhau:

| Mục | Điều kiện đạt | Ghi chú |
|---|---|---|
| Số bằng chứng đạt chuẩn | `current >= required` | Điều kiện cứng — không đạt thì không thăng cấp |
| Điểm đánh giá trung bình | `avgRating >= 3.5` **và** `evidenceCount >= 3` | Chỉ hiện khi đã có ≥3 bằng chứng để tránh trung bình của 1 mẫu |
| Nhịp duy trì | `lastEvidenceAt` trong 14 ngày gần nhất | Nhịp làm việc thật, không phải 1 bằng chứng cũ |

### 6.5 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Cây rỗng (chưa seed) | 0 node tầng 1 | Empty state: "Chưa có cây kỹ năng" + nút `[+ Tạo domain đầu tiên]` mở form thêm node tầng 1. **Không** hiển thị cây rỗng trơn |
| Domain chưa có kỹ năng | node tầng 1 không có con | Nhánh rỗng + lời nhắc "Thêm kỹ năng cho domain này" (nút `+ Thêm mục con`) |
| Kỹ năng chưa có bằng chứng | `evidenceCount = 0` | Node lá: badge "Cần luyện tập" (`bg-error-container/40 text-error`) + nút "+ Bắt đầu". S04: bảng nhật ký trống + hướng dẫn "Làm gì để tạo bằng chứng đầu tiên" (3 gợi ý theo domain) |
| Có bằng chứng nhưng rating thấp | `evidenceCount > 0`, `qualifiedCount = 0` | Node hiển thị `0/5` + chip cảnh báo "Có bằng chứng nhưng chưa đạt chuẩn (rating ≥ 3)". S04: metric "Bằng chứng" = N, "đạt chuẩn" = 0, thang level vẫn 0 |
| Đang ghi bằng chứng | POST đang chạy | Nút "Ghi bằng chứng" ở trạng thái disabled + `aria-busy="true"`; tên node đổi khi trả về (không reload trang) |
| Ghi bằng chứng thất bại | lỗi mạng / DB | Toast lỗi ngắn + nút "Thử lại"; **không** đổi `level` |
| Node cha bị xoá | sau khi xoá có node con | Node con tự động nổi lên 1 cấp; banner "Đã chuyển {n} mục con lên {tên ông bà}" |
| Skill không tồn tại (mở `/skills/xxx` cũ) | `id` không có trong DB | Trang 404 tiếng Việt: "Không tìm thấy kỹ năng này" + nút `Về Cây kỹ năng` |
| Trọng tâm chưa đặt | `focusSkillId = null` | Metric "Trọng tâm hôm nay" = "—" + nút "Đặt trọng tâm"; nút "Luyện tập đo lường ngay" dùng kỹ năng yếu nhất thay thế |
| Không có API key | thiếu `ANTHROPIC_API_KEY` | Không ảnh hưởng: S03/S04 không có khối AI. Mọi số liệu hiển thị đầy đủ |

### 6.6 Edge case

| Case | Xử lý |
|---|---|
| Cây rỗng (0 node) | Empty state + CTA tạo domain đầu tiên. Không hiển thị "0 bằng chứng" như thể đã có dữ liệu |
| Domain không có node tầng 2 | Nhánh rỗng + CTA "Thêm kỹ năng". Domain vẫn hiển thị `level = 0` |
| Node tầng 2 không có node tầng 3 | Hiển thị lời nhắc "Thêm mục con" (nút `+ Thêm mục con` cạnh node) |
| Skill chưa có bằng chứng | Badge "Cần luyện tập" + hướng dẫn tạo bằng chứng đầu tiên; S04 hiện hướng dẫn theo domain (không bịa số liệu) |
| Skill có bằng chứng nhưng rating thấp | `level` = 0; hiển thị rõ "Có bằng chứng nhưng chưa đạt chuẩn (rating ≥ 3)" để không gây hiểu nhầm là chưa làm gì |
| **Node cha bị xoá** | Node con chuyển lên ông bà (không mất dữ liệu); `Evidence` của node bị xoá cascade; `level` tính lại; có banner thông báo |
| Xoá node đang là trọng tâm | `UserProfile.focusSkillId` → `null` (SetNull); metric trọng tâm = "—" |
| Bằng chứng trỏ tới `Activity` đã bị xoá | `onDelete: Cascade` → bằng chứng bị xoá theo; `level` tính lại |
| `Activity.skillId = null` | Không tạo bằng chứng; không tính vào kỹ năng nào (P3 — hoạt động không gắn kỹ năng không được ghi nhận tiến độ) |
| Thêm node trùng tên trong cùng nhóm cha | Cảnh báo "Đã có mục cùng tên" — vẫn cho lưu (không chặn cứng), nhưng tên được gợi ý thêm hậu tố |
| Thêm node tầng 4 | Từ chối ở UI (ẩn nút "Thêm mục con" ở node tầng 3) và ở API (`400 depth_exceeded`) |
| `targetLevel` = 5 và `level` = 5 | Hiển thị "Đã đạt mục tiêu"; gauge thăng cấp = 100%, mục "số bằng chứng" hiện "Đã đủ" |
| Bằng chứng > 1000 bản ghi | Phân trang 20 dòng/trang; truy vấn dùng `skip/take` + index `Evidence.skillId`, `Evidence.createdAt` |
| Sửa tên kỹ năng đang có bằng chứng | Cho phép; lịch sử bằng chứng giữ nguyên (bằng chứng tham chiếu `skillId`, không tham chiếu tên) |
| Đồng hồ vượt nửa đêm giữa lúc ghi | Ngày hiển thị theo giờ local (`src/lib/dates.ts`), không theo UTC |
| Mất mạng khi ghi bằng chứng | Báo lỗi + nút "Thử lại"; dữ liệu cũ không đổi; không mất form đã nhập |

## 7. Hợp đồng API

Tất cả route trả `{ ok: true, data }` hoặc `{ ok: false, error }` (theo steering tech §5).

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| GET | `/api/skills` | — | `{ nodes: SkillNodeDTO[], totals, focusSkillId, recentEvidence[] }` — cây 3 tầng đã kèm `level`, `qualifiedCount`, `evidenceCount`, `avgRating`, `isFocus` | `500` lỗi DB |
| POST | `/api/skills` | `{ name, domain, parentId?, targetLevel, kind }` | `{ skill }` — node vừa tạo | `400 validation` · `400 depth_exceeded` · `409 duplicate_name` · `409 domain_root_exists` |
| GET | `/api/skills/[id]` | `?page=1&limit=20` | `{ skill, path[], metrics, levelTimeline[], byType[], nextLevel, evidence: { items[], total, page, limit } }` | `404 not_found` · `400 validation` |
| POST | `/api/skills/[id]/evidence` | `{ activityId?, title, type, minutes, rating, content?, quality? }` | `{ evidence, activity, skill: { level, qualifiedCount, levelUp, levelDown } }` | `400 validation` · `404 not_found` · `409 duplicate_evidence` |
| PATCH | `/api/skills/[id]` | `{ name?, targetLevel?, parentId? }` | `{ skill }` | `400` · `404` · `409` (đổi cha làm vượt tầng 3) |
| DELETE | `/api/skills/[id]` | `?cascade=true|false` | `{ deletedId, reparentedChildren: string[] }` | `404` · `400` (đang là trọng tâm mà `cascade=false`) |
| GET | `/api/skills/[id]/evidence` | `?page=1&limit=20&ratingMin=` | `{ items[], total, page, limit }` | `400` |
| POST | `/api/skills/focus` | `{ skillId \| null }` | `{ focusSkillId }` | `404` |

> `POST /api/skills/[id]/evidence` là **đường ghi bằng chứng duy nhất**. Nó tạo `Activity` + `Evidence` trong một transaction và tính lại `level` ngay trong transaction đó (NFR-SK-09).

## 8. Tiêu chí nghiệm thu

**AC-3 — Tiến độ = bằng chứng** (nguồn: `system-design/SPEC.md` §8)
- *Given* kỹ năng có 2 bằng chứng `rating = 3`, *When* thêm bằng chứng thứ 3 `rating = 4`, *Then* `level` của kỹ năng tăng đúng **1** lần (0 → 1), và `GET /api/skills` trả về `level = 1`.
- *Given* kỹ năng có 3 bằng chứng `rating = 3`, *When* chỉ tick một checkbox hoặc đánh dấu plan item "Xong" mà không tạo `Activity` + `Evidence`, *Then* `level` **không đổi**.
- *Given* kỹ năng có 3 bằng chứng `rating = 2`, *When* mở S04, *Then* `level` vẫn bằng 0 và UI hiển thị "Có bằng chứng nhưng chưa đạt chuẩn (rating ≥ 3)".

**AC-SK-1 — Cây 3 tầng đúng cấu trúc**
- *Given* seed có 4 domain × 2 kỹ năng × 2 mục con, *When* mở `/skills`, *Then* hiển thị đúng 4 khối domain, mỗi khối có các node tầng 2, và các node tầng 3 nằm trong node tầng 2 tương ứng.
- *Given* người dùng bấm "+ Thêm mục con" trên một node tầng 2, *When* điền tên + mức mục tiêu và lưu, *Then* node mới xuất hiện dưới node cha và `GET /api/skills` trả node đó ở đúng tầng 3.

**AC-SK-2 — Mở rộng cây (FR-SK-04)**
- *Given* mở form thêm mục con, *When* bỏ trống tên hoặc chọn mức mục tiêu ngoài khoảng 1–5, *Then* form không submit và hiện lỗi cụ thể.
- *Given* node tầng 3 đang có con (không hợp lệ theo C1), *When* gọi API tạo node con, *Then* trả `400 depth_exceeded`.

**AC-SK-3 — Thang 0–5 + số bằng chứng, không có phần trăm (FR-SK-06)**
- *Given* mở `/skills`, *Then* mọi node hiển thị `level/5` **và** số bằng chứng; không có chuỗi "%" nào trong cây.
- *Given* mở `/skills/[id]`, *Then* 4 metric tile hiển thị Cấp độ (x/5), Số bằng chứng, Thời gian tích lũy, Điểm trung bình — không có "% hoàn thành".

**AC-SK-4 — Nhật ký bằng chứng đầy đủ (FR-SK-05)**
- *Given* kỹ năng có 7 bằng chứng, *When* mở S04, *Then* bảng "Nhật ký bằng chứng (Evidence Log — P3)" có **6 cột** đúng thứ tự: Ngày · Loại hoạt động · Tiêu đề hoạt động & Nội dung chứng minh · Đánh giá · SQLite State · Thao tác; và tổng thời gian = tổng `Activity.minutes` của các hoạt động có bằng chứng.

**AC-SK-5 — Ngưỡng tăng level là cấu hình được**
- *Given* `EVIDENCE_THRESHOLD = 3` trong `src/lib/config.ts`, *When* đổi sang `5` và khởi động lại app, *Then* kỹ năng có 4 bằng chứng `rating ≥ 3` có `level = 0` (cần 5 để lên level 1).

**AC-SK-6 — Không tăng level từ bằng chứng kém**
- *Given* kỹ năng có 2 bằng chứng `rating ≥ 3` và 5 bằng chứng `rating = 2`, *When* mở S04, *Then* `level = 0`, `evidenceCount = 7`, `qualifiedCount = 2`, và thanh thang hiển thị 0/5.

**AC-SK-7 — Xoá node cha không mất dữ liệu**
- *Given* node "System Design" có 2 mục con và 12 bằng chứng, *When* xoá node đó, *Then* 2 mục con được chuyển lên node cha gốc (vẫn `domain = professional`), 12 bằng chứng của node bị xoá bị cascade, và S03 không còn hiển thị node đã xoá.

**AC-SK-8 — S04 với kỹ năng chưa có bằng chứng**
- *Given* kỹ năng mới tạo, `evidenceCount = 0`, *When* mở S04, *Then* hiện hướng dẫn "Làm gì để tạo bằng chứng đầu tiên" và bảng nhật ký rỗng có CTA — **không** hiển thị số 0 như kết quả đo.

**AC-SK-9 — Không phụ thuộc AI (NFR-01)**
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở `/skills` và `/skills/[id]`, *Then* **mọi** số liệu và biểu đồ hiển thị bình thường; không có khối nào bị ẩn hoặc báo lỗi.

**AC-SK-10 — Mobile 390px (NFR-02)**
- *Given* màn hình 390px, *When* mở S03, *Then* cây xuống 1 cột, thanh thang vẫn hiện đủ 5 ô, panel bằng chứng gần đây nằm dưới cây; mở S04 thì bảng nhật ký bằng chứng cuộn ngang trong `overflow-x-auto`, không tràn viewport.

**AC-SK-11 — Tiêu chuẩn thăng cấp đúng công thức**
- *Given* kỹ năng `level = 1`, `qualifiedCount = 4`, `EVIDENCE_THRESHOLD = 3`, *When* mở S04, *Then* khối "Tiêu chuẩn thăng cấp" hiển thị "Cần: 6 Bằng chứng (≥ 3★)", "4 / 6" và "Còn thiếu 2 bằng chứng".

**AC-SK-12 — Không vanity metric (P7)**
- *Given* 20 `Activity` không gắn `skillId`, *When* mở S03, *Then* tổng số bằng chứng **không** tính 20 hoạt động đó, và không có ô nào hiển thị "tổng giờ học" trần trụi.

## 9. Rủi ro riêng của feature

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R-SK-1 | Người dùng tick "Xong" ở Daily Loop nhưng không sinh `Evidence` → cây kỹ năng đứng yên, mất niềm tin vào P3 | `daily-loop-core` tạo `Activity` + `Evidence` **ngay khi** đánh dấu hoàn thành có `skillId`; `POST /api/skills/[id]/evidence` là đường ghi duy nhất để không có "đường vòng" |
| R-SK-2 | Người dùng tự tạo bằng chứng `rating = 4` hàng loạt để thăng cấp nhanh | Chỉ 1 nguồn rating là hệ thống chấm (AI rubric / tự đánh giá `Activity.quality`); `rating` do hệ thống sinh, form thủ công không cho chọn tự do ở Phase 0 (chỉ chấm tay trong seed/admin) |
| R-SK-3 | Cây phình to, 3 tầng × nhiều node → query chậm | Index `Skill.parentId`, `Skill.domain`; đếm bằng chứng bằng 1 `GROUP BY` (không N+1); giới hạn render 1 lần bằng `position` |
| R-SK-4 | Xoá nhầm node → mất bằng chứng (cascade) | Hộp thoại xác nhận nêu rõ số bằng chứng sẽ mất; cascade theo SPEC §4 là chủ ý, nhưng phải cảnh báo trước |
| R-SK-5 | `level` lệch với dữ liệu do ghi ngoài luồng (script, import) | `recomputeSkillLevel()` chạy trong **cùng** transaction với mọi thay đổi `Evidence`; thêm script `npx prisma db seed` gọi lại hàm recompute cho toàn bộ cây |
| R-SK-6 | Prototype hiển thị rating thập phân (`3.8/4.0`) trong khi `Evidence.rating` là Int 1–4 | Hiển thị **số nguyên** theo schema (`★ 4/4`); số thập phân chỉ dùng cho **điểm trung bình** tính từ nhiều bằng chứng, và luôn kèm thang tối đa để không gây hiểu nhầm |
| R-SK-7 | Số liệu "160 bằng chứng" trong prototype bị copy thẳng vào code | NFR-SK-03: mọi số từ truy vấn; test với fixture rỗng bắt buộc hiện 0 |
| R-SK-8 | S04 hiển thị "Điểm trung bình / 5.0" trong khi bằng chứng chỉ có thang 1–4 | Tách 2 số liệu: **Điểm đánh giá TB** (thang 1–4, từ `Evidence.rating`) và **Điểm TB** (thang 0–5, từ `Activity.aiScore`/`quality`); nếu không có nguồn 0–5 thì hiện "—", không dùng số của thang khác để đắp chỗ |
| R-SK-9 | Người dùng xoá bằng chứng → tụt level, thấy "phản công" | `level` là giá trị tính ra (K9) — nêu rõ trong UI: thẻ "Level tính từ bằng chứng"; cảnh báo trước khi xoá |
| R-SK-10 | Trọng tâm hôm nay không tồn tại sau khi xoá skill | `onDelete: SetNull`; metric hiện "—" + CTA "Đặt trọng tâm" |
