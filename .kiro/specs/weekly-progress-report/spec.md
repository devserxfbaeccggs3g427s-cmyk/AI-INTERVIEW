# Báo cáo Tuần & Tiến Bộ

> **Màn hình:** S13 (`/review`), S14 (`/progress`) · **Phase:** 1
> **Nguồn:** `system-design/SPEC.md` §2.6, §3.2 (S13, S14), §4 · prototype `system-design/s13_.../`, `system-design/s14_.../`
> **Phụ thuộc:** `app-foundation`, `daily-loop-core`, `skill-tree-evidence` (phải xong trước)

## 1. Tổng quan

Hai màn hình báo cáo trả lời hai câu hỏi khác nhau ở hai thời điểm khác nhau:

| Màn hình | Câu hỏi | Tần suất | Bản chất |
|---|---|---|---|
| **S13 — Báo cáo tuần** | *"Tuần vừa qua tôi đã làm gì, điều gì cần sửa, tuần sau nên làm gì?"* | 1 lần/tuần (Chủ nhật 20:00) | **Quyết định** → sinh kế hoạch tuần tới |
| **S14 — Báo cáo tiến bộ** | *"Tôi đã tiến bao xa so với chính mình 30 ngày trước?"* | Bất cứ lúc nào | **Đo lường** → không sinh hành động |

Cả hai đều tuân thủ **P3** (tiến độ = bằng chứng) và **P7** (không vanity metric): mọi con số đều truy được về một `Skill` cụ thể, không có "tổng giờ học" trần trụi.

S13 là nơi vòng lặp khép lại: dữ liệu tuần → AI nhận định → kế hoạch tuần tới → `PlanItem` mới → Daily Loop.

## 2. Bối cảnh & vấn đề

- Không có báo cáo tuần thì người dùng chỉ biết "mình bận" mà không biết "mình tiến ở đâu" → không có điều chỉnh.
- AI không nhìn thấy dữ liệu tuần thì không thể đề xuất kế hoạch tuần tới có ý nghĩa.
- Báo cáo tiến bộ kiểu "tổng giờ học: 73.2h" là vanity metric (P7) — không dẫn tới hành động nào.
- Khi trượt ≥2 ngày liên tiếp, kế hoạch phải **tự giảm tải**, không phải tiếp tục đẩy.

## 3. Yêu cầu chức năng

### 3.1 Weekly Review (FR-WR)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-WR-01 | Tự chạy Chủ nhật 20:00, hoặc mở app lần đầu trong tuần mới | P1 | FR-WR-01 |
| FR-WR-02 | Tổng hợp: số hành động hoàn thành, phân bố theo domain, kỹ năng tiến bộ nhiều nhất, chỉ số cá nhân, so với tuần trước | P1 | FR-WR-02 |
| FR-WR-03 | AI sinh **nhận định 3 điểm**: 1 điều đã làm tốt · 1 điểm cần sửa · 1 điều nên thử tuần sau | P1 | FR-WR-03 |
| FR-WR-04 | AI đề xuất kế hoạch tuần sau dựa trên dữ liệu + kỹ năng còn yếu | P1 | FR-WR-04 |
| FR-WR-05 | Trượt ≥2 ngày liên tiếp → AI **tự giảm tải** kế hoạch tuần sau (ít slot hơn, thời lượng ngắn hơn), có ghi chú lý do | P2 | FR-WR-05 |
| FR-WR-06 | Người dùng chỉnh kế hoạch AI đề xuất trước khi duyệt | P1 | FR-WR-06 |

### 3.2 Báo cáo tiến bộ (FR-PR — bổ sung, không có trong SPEC, suy ra từ S14)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-PR-01 | Biểu đồ thang kỹ năng theo domain theo thời gian (6 tháng) | P1 | SPEC §3.2 S14 |
| FR-PR-02 | Heatmap tích lũy bằng chứng 90 ngày (chỉ tính ô có sản phẩm thực tế) | P1 | SPEC §3.2 S14 |
| FR-PR-03 | Tự đối sánh: hiện tại vs chính mình 30 ngày trước (delta từng chỉ số) | P1 | SPEC §3.2 S14 |
| FR-PR-04 | Thời gian deliberate practice — chỉ tính hoạt động có bằng chứng, chia theo domain | P1 | SPEC §3.2 S14 |
| FR-PR-05 | Bộ lọc theo domain (Tất cả / Chuyên môn / Giao tiếp / Ngoại ngữ / Cá nhân) | P1 | prototype S14 |
| FR-PR-06 | Xuất JSON tiến độ | P1 | prototype S14 |
| FR-PR-07 | **Không hiển thị "tổng giờ học" trần trụi** — mọi số liệu phải gắn được với skill | P0 | SPEC §3.2 S14 ràng buộc + P3 + P7 |
| FR-PR-08 | Khối **"Tiến độ về mục tiêu"**: hiện mức hiện tại vs `targetLevel` của `UpcomingGoal` đang `active`, **khoảng cách còn lại** (số bậc), và hành động tuần này đã làm gì cho mục tiêu | P1 | Q8 · M11 |
| FR-PR-09 | Biểu đồ thang kỹ năng có **đường ngang đích** (target line) để thấy rõ còn thiếu bao nhiêu | P1 | Q8 |
| FR-PR-10 | Mục tiêu `priority` cao nhất được ưu tiên trong đề xuất kế hoạch tuần (≥2/6 slot mỗi ngày); AI **cảnh báo xung đột** khi 2 mục tiêu cùng `priority` nhưng khác ngôn ngữ | P1 | Q8 · §8.2 |

> **Q8:** khối "Tiến độ về mục tiêu" đọc `UpcomingGoal` (model **`M11`**) — nguồn chân lý:
> `.kiro/steering/user-profile-decisions.md` §8.

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-RP-01 | Tính toán chỉ trên dữ liệu `Activity`/`Evidence`/`DailyState` thật | Không có số liệu hardcode trong UI |
| NFR-RP-02 | Chart không dùng palette mặc định của thư viện | Chỉ dùng token `primary`/`secondary`/`tertiary`/`on-surface-variant` |
| NFR-RP-03 | S14 tải được trong 1.5s với 90 ngày × 4 domain dữ liệu | Query tổng hợp server-side, không N+1 |
| NFR-RP-04 | Không có API key → S13 vẫn hiển thị số liệu thật, chỉ ẩn khối AI nhận định | Báo cáo số liệu không phụ thuộc AI |
| NFR-RP-05 | Xuất JSON chứa đủ dữ liệu để dựng lại báo cáo | Self-contained, không cần DB |

## 5. Mô hình dữ liệu

Feature này **không thêm model mới** — chỉ đọc và ghi `PlanItem`.

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `PlanItem` | `date` | DateTime | Chuẩn hoá 00:00 local. Tuần = 7 ngày tính từ Thứ Hai. |
| `PlanItem` | `slot` | Int | 0–5. Kế hoạch tuần tới ghi **6 slot/ngày × 7 ngày**. |
| `PlanItem` | `done` | Boolean | Nguồn sự thật cho "số hành động hoàn thành". |
| `PlanItem` | `source` | String | `ai` cho kế hoạch do AI-07 đề xuất. |
| `Activity` | `createdAt`, `domain`, `minutes`, `skillId`, `aiScore` | — | Nguồn cho phân bố domain, top kỹ năng, deliberate practice time. |
| `Evidence` | `skillId`, `rating`, `createdAt` | — | Nguồn cho top kỹ năng bứt phá, heatmap. |
| `DailyState` | `date`, `mood`, `energy`, `sleep`, `focus` | — | Nguồn cho khối chỉ số sinh trắc học tuần. |
| `Review` | `cardId`, `rating`, `at` | — | Nguồn cho "FSRS Retention Rate" & "380 lượt ôn tập thành công". |

**Truy vấn tổng hợp (P3 bắt buộc):**

```sql
-- S13: hoàn thành theo domain trong tuần
SELECT a.domain,
       COUNT(*)                  AS total,
       SUM(CASE WHEN p.done = 1 THEN 1 ELSE 0 END) AS done
FROM Activity a
LEFT JOIN PlanItem p ON p.date = date(a.createdAt) AND p.slot IS NOT NULL
WHERE a.createdAt >= :weekStart AND a.createdAt < :weekEnd
GROUP BY a.domain;

-- S13: top kỹ năng bứt phá (delta level trong tuần)
SELECT e.skillId, s.name, COUNT(*) AS evidenceCount,
       AVG(e.rating) AS avgRating
FROM Evidence e
JOIN Skill s ON s.id = e.skillId
WHERE e.createdAt >= :weekStart AND e.createdAt < :weekEnd
GROUP BY e.skillId
ORDER BY evidenceCount DESC, avgRating DESC
LIMIT 3;

-- S14: heatmap 90 ngày — CHỈ ô có bằng chứng thật
SELECT DATE(createdAt) AS day, COUNT(*) AS evidenceCount
FROM Evidence
WHERE createdAt >= :from AND createdAt < :to
GROUP BY DATE(createdAt);

-- S14: thời gian deliberate practice (chỉ hoạt động có skill gắn)
SELECT domain, SUM(minutes) AS minutes
FROM Activity
WHERE skillId IS NOT NULL
  AND createdAt >= :from AND createdAt < :to
GROUP BY domain;
```

> `FR-PR-07`: query deliberate practice **bắt buộc** có `skillId IS NOT NULL` — hoạt động không gắn kỹ năng không được đếm vào "giờ thực chiến".

## 6. Giao diện & hành vi

### 6.1 Bố cục — S13 Báo cáo tuần

```
┌────────────────────────────────────────────────────────────────────┐
│ FR-WR-01 · psychology Tự động tổng hợp Chủ nhật 20:00 bởi Opus 5 │
│ HASH: #REV-2026-W43-FSRS              ios_share Xuất JSON          │
├────────────────────────────────────────────────────────────────────┤
│ Báo cáo tuần 43 (23/10 - 29/10/2026)                               │
│ Tổng kết chu kỳ phản xạ có chủ đích (Deliberate Practice) kết hợp  │
│ phân tích tương quan sinh trắc học và hiệu suất bộ nhớ dài hạn FSRS │
│ Sync State: Local SQLite · Ready        verified Duyệt Tuần 44     │
├────────────────────────────────────────────────────────────────────┤
│ Tỷ lệ hoàn thành 38/42 (90.4%)  ▲ +4.2% so với Tuần 42            │
│ Chuỗi kỷ luật 12 ngày · Năng lượng TB 78% (biên độ ±6%)            │
│ FSRS Retention Rate 94.8% (Target 90%) · 380 lượt ôn thành công    │
├────────────────────────────────────────────────────────────────────┤
│ Phân bổ 4 Trục Thực Thi (FR-WR-02)                                │
│  Chuyên môn (Software & System Architecture) 14/14 (100%)  Elite    │
│  Ngoại ngữ (Trung HSK4 & Anh kỹ thuật)        13/14 (93%)   ▲     │
│  Giao tiếp (Viết & Thuyết trình)              6/7  (86%)   ▲     │
│  Cá nhân (Thể lực, Nhật ký, Đọc)              5/7  (71%)   ⚠     │
├────────────────────────────────────────────────────────────────────┤
│ Nhịp Độ Năng Lượng & Điểm Slot Trong Tuần                         │
│  Th2 6/6 ▰▰▰▰▰▰  90% | Th3 6/6 ▰▰▰▰▰▰ 100% | Th4 4/6 ▰▰▰▰ 67%    │
│  Top 3 Kỹ Năng Bứt Phá (dựa trên Evidence Nodes)                  │
│    System Design & Sharding   +6 Evidence  Level 3.4 → 3.9        │
│    Tiếng Trung HSK4 Vocab     +45 thẻ nhớ  820/1200 mục mail      │
│    Giao tiếp viết Email Tech  +3 Evidence   Điểm AI: 9.2/10       │
│  Chỉ Số Sinh Trắc Học Tuần: Mood 4.2 · Focus 4.5 · Sleep 7.2h    │
├────────────────────────────────────────────────────────────────────┤
│ Khối Nhận Định 3 Điểm (FR-WR-03 · AI Analysis)                    │
│  1. ✓ Điều đã làm rất tốt — Giữ vững kỷ luật ôn SRS lúc 14:00    │
│  2. ✗ Điểm cần sửa ngay — Trượt T4/T6 do lướt tin lúc 16:00       │
│  3. 💡 Nên thử tuần sau — Chuyển Mock Interview T6 → T3 08:30      │
├────────────────────────────────────────────────────────────────────┤
│ Kế Hoạch Đề Xuất Tuần 44 (30/10 - 05/11/2026)                     │
│  Slot 1 · 07:30-09:00  Chuyên môn  Deep Work: Distributed Trans.  │
│  Slot 2 · 09:15-10:15  Giao tiếp    Mock Interview (S17) / Tech   │
│  Slot 3 · 14:00-14:45  Ngoại ngữ   FSRS Drill Tiếng Trung HSK4    │
│  Slot 4 · 15:30-17:00  Chuyên môn  Cache Invalidation & Benchmark  │
│  Slot 5 · 17:15-18:00  Ngoại ngữ   Shadowing Tin Tức 30 phút      │
│  Slot 6 · 21:00-21:45  Cá nhân     Nhật ký & Chốt Ngày             │
│  [edit_note Chỉnh sửa inline] [done_all Duyệt & Áp dụng Tuần 44]  │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 Bố cục — S14 Báo cáo tiến bộ

```
┌────────────────────────────────────────────────────────────────────┐
│ Định kỳ 30 ngày qua · SQLite Sync · 160 Bằng chứng xác thực       │
│ [Tất cả domain][Chuyên môn][Giao tiếp][Ngoại ngữ][Cá nhân]        │
│ [download Xuất JSON tiến độ]                                       │
├────────────────────────────────────────────────────────────────────┤
│ Cấp độ kỹ năng bình quân  2.4/5.0  trending_up +0.6 vs 30 ngày    │
│ Bằng chứng tích lũy tháng  verified +48 Evidence nodes            │
│ 100% đạt chuẩn nghiệm thu P3 · Tốc độ 1.6 bằng chứng/ngày         │
│ FSRS Retention 94.2% (target 90%) ▲+4.2% · 740 flashcards hồi tưởng │
│ Phản xạ giao tiếp & Mock  4.1/5.0 (14 phiên AI, độ trễ 1.8s)     │
├────────────────────────────────────────────────────────────────────┤
│ Phần 1 · Quỹ Đạo Tăng Trưởng Cây Kỹ Năng (6 tháng)                 │
│  [line chart Lv 0→5]  Chuyên môn 3.2 · Giao tiếp 2.6 ·             │
│                       Ngoại ngữ 2.1 · Cá nhân 1.7                  │
│  insights Nhận định AI: bứt phá mạnh nhất ở Chuyên môn (+1.4 lvl)  │
├────────────────────────────────────────────────────────────────────┤
│ Phần 2 · Heatmap Tích Lũu Bằng Chứng (90 ngày)                    │
│  [lưới T2 T4 T6 CN × 13 tuần]   Chuỗi dài nhất 21 ngày            │
│  Ngày năng suất nhất: Thứ Năm (tb 3.8 nodes)                      │
├────────────────────────────────────────────────────────────────────┤
│ Phần 3A · Tự Đối Sánh: Hiện Tại vs 30 Ngày Trước                  │
│  Tốc độ PRD: 45 phút/bài → 18 phút/bài (nhanh 2.5x)              │
│  Lỗi ngữ pháp 28% → 11% (−17%) · Vốn HSK3: 24 từ → 60 từ (+150%)  │
├────────────────────────────────────────────────────────────────────┤
│ Phần 3B · Thời Gian Deliberate Practice (Nguyên tắc P7)            │
│  Kiến trúc & Backend 32.5h (44%) · Ôn thẻ FSRS 19.0h (26%)         │
│  Luyện phản xạ & Mock AI 14.5h (20%) · Tái cấu trúc 7.2h (10%)    │
│  Tổng thực chiến hữu ích: 73.2 giờ — 100% Focused                 │
└────────────────────────────────────────────────────────────────────┘
```

### 6.3 Bảng thành phần

#### S13

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header tuần | `#REV-{year}-W{week}-{hash}`, badge nguồn tổng hợp | `font-label-sm text-outline` + `bg-surface-container` | Tự sinh hash từ nội dung dữ liệu → idempotent |
| Metric row | tỷ lệ hoàn thành, chuỗi, năng lượng, retention | `font-headline-sm` + `text-primary` / `text-tertiary` | Delta so với tuần trước `▲`/`▼` `text-primary`/`text-error` |
| Phân bổ 4 trục | 4 dòng domain + progress bar | bar `bg-primary` / `bg-tertiary` / `bg-error` | Nhãn trạng thái: Elite / Ổn / Cần can thiệp |
| Nhịp độ 7 ngày | cột per ngày + % năng lượng | `bg-primary` cho ≥90%, `bg-tertiary` cho 60–89% | Tooltip số slot hoàn thành |
| Top 3 kỹ năng | tên + delta level + số bằng chứng | `bg-surface-container-low rounded-xl` | Click → S04 |
| Chỉ số sinh trắc | mood/focus/sleep TB | `font-code-md` (tabular) | So sánh tuần trước |
| Nhận định 3 điểm | 3 khối ✓ / ✗ / 💡 | ✓ `text-primary` · ✗ `text-error` · 💡 `text-tertiary` | Chỉ hiện khi có AI key |
| Kế hoạch tuần tới | 6 slot dạng card | `bg-surface-container` + `rounded-xl` | Sửa inline (FR-WR-06), kéo đổi slot |
| Nút duyệt | `done_all Duyệt & Áp dụng` | `bg-primary-container text-on-primary` | Ghi 42 `PlanItem` cho tuần tới |

#### S14

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Filter domain | 5 chip | `bg-surface-container-high` / active `bg-primary-container` | Client-side re-render, không reload |
| Metric tiles | level TB, evidence tháng, retention, phản xạ | `bg-surface-container rounded-lg` | Delta `trending_up` `text-primary` |
| Line chart 6 tháng | 4 series theo domain | stroke `text-primary` / `text-secondary` / `text-tertiary` / `text-on-surface-variant` | Tooltip hiện level từng domain |
| Heatmap 90 ngày | lưới ngày × tuần | cell `bg-surface-container-highest` → `bg-primary` theo số evidence | Legend "Ít ↔ Nhiều (≥4 evidence/ngày)" |
| T-30 benchmark | 3 cặp delta | `text-primary` khi tăng, `text-error` khi giảm | Chỉ hiện khi có đủ dữ liệu 30 ngày |
| Deliberate practice | bar theo domain + tổng | `bg-secondary` (AI/chuyên môn) / `bg-primary` (SRS) | Tổng có nhãn "100% Focused" |

### 6.4 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Chưa có dữ liệu tuần | 0 `Activity` trong tuần | "Chưa có hoạt động trong tuần này" + CTA quay lại Daily Loop |
| Tuần đang chạy | Hôm nay < Chủ nhật 20:00 | Banner "Báo cáo sẽ chốt vào Chủ nhật 20:00" + nút xem tạm |
| Đang tổng hợp AI | AI-07 đang stream | Skeleton khối "Nhận định 3 điểm" |
| Có nhận định | AI-07 xong | 3 khối nhận định |
| Không có API key | Thiếu `ANTHROPIC_API_KEY` | Số liệu thật hiển thị đầy đủ; khối AI hiện "Bật nhận định AI bằng cách thêm API key trong Cài đặt" |
| AI lỗi | 429 / refusal / timeout | Thông báo ngắn + nút "Thử lại"; số liệu vẫn hiển thị |
| Không đủ dữ liệu 30 ngày | Mới dùng app < 30 ngày | Ẩn khối T-30, hiện "Cần thêm {n} ngày dữ liệu" |
| Đề xuất giảm tải | Trượt ≥2 ngày liên tiếp | Ghi chú trên kế hoạch: "Tự giảm tải: 2 ngày trượt liên tiếp" |
| Xuất JSON | Bấm nút | Tải file `weekly-review-W{week}.json` / `progress-{date}.json` |

### 6.5 Edge case

| Case | Xử lý |
|---|---|
| Tuần có 0 hoạt động | Hiện empty state + CTA. **Không** để AI bịa nhận định về tuần trống. |
| Thiếu `DailyState` trong tuần | Ô chỉ số sinh trắc hiện "—" thay vì 0 |
| `Evidence` có `rating` < 3 | Vẫn đếm vào số bằng chứng nhưng **không** tính vào "đạt chuẩn nghiệm thu P3" |
| Skill bị xoá giữa tuần | Top kỹ năng bỏ qua, không crash (FK cascade đã xoá Evidence) |
| Kế hoạch tuần tới đã tồn tại | Nút duyệt → hỏi xác nhận ghi đè, không ghi trùng |
| Duyệt 2 lần liên tiếp | Idempotent: xoá `PlanItem` cùng tuần `source=ai` rồi ghi lại, trong 1 transaction |
| AI trả về 3 nhận định nhưng thiếu 1 loại | Hiện "—" cho loại thiếu + ghi log lỗi schema, không crash |
| Heatmap 90 ngày có ngày không có evidence | Ô đó tồn tại với màu nền, **không** bị co như 0 hoạt động (khác "không ghi nhận") |
| Xuất JSON khi DB > 50MB | Stream ra file, không buffer toàn bộ vào RAM |
| Bộ lọc domain trong S14 không có dữ liệu | Hiện "Chưa có bằng chứng cho domain này" |
| Người dùng chưa duyệt kế hoạch tuần tới rồi mở lại S13 | Khôi phục bản nháp đề xuất đang chỉnh (lưu localStorage) |

## 7. Hợp đồng API

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| GET | `/api/review/weekly?week=2026-W43` | week ISO | `{ week, range, completion, byDomain, streak, energy, retention, topSkills, bio, priorWeek }` | `400` week không hợp lệ |
| POST | `/api/review/weekly` | `{ week }` | stream NDJSON: `{ type: "insight" \| "plan" \| "done" }` | `429`, `refusal`, `no_api_key` |
| POST | `/api/review/weekly/apply` | `{ week, slots[], notes }` | `{ applied: 42 }` | `400` slot không hợp lệ |
| GET | `/api/progress?domain=all&days=180` | domain, days | `{ levelAvg, delta30, evidenceByMonth, heatmap, t30, practiceTime }` | — |
| GET | `/api/progress/export` | — | JSON file | — |

## 8. Tiêu chí nghiệm thu

**AC-RP-1 — Báo cáo tuần dùng số liệu thật**
- *Given* tuần có 38 `PlanItem` đánh dấu `done` trên tổng 42, *When* mở `/review`, *Then* hiển thị "38/42 (90.4%)" và tỷ lệ khớp đúng `COUNT(done)/COUNT(*)`.
- *Given* tuần trước có 33/42, *When* mở `/review`, *Then* hiện delta `▲ +4.2%` (làm tròn 1 chữ số).

**AC-RP-2 — Phân bổ domain đúng**
- *Given* tuần có hoạt động thuộc 4 domain, *When* mở `/review`, *Then* khối "Phân bổ 4 Trục" có đúng 4 dòng, mỗi dòng `done/total` khớp query SQL.

**AC-RP-3 — Nhận định 3 điểm đúng cấu trúc**
- *Given* có API key và AI-07 chạy thành công, *When* nhận định render, *Then* có **đúng 3** mục: 1 "✓ điều đã làm tốt", 1 "✗ điểm cần sửa", 1 "💡 nên thử tuần sau".
- *Given* không có API key, *When* mở `/review`, *Then* khối số liệu thật vẫn hiển thị đầy đủ, chỉ khối AI hiện hướng dẫn thêm key.

**AC-RP-4 — Tự giảm tải (FR-WR-05)**
- *Given* người dùng trượt 2 ngày liên tiếp trong tuần, *When* AI đề xuất kế hoạch tuần tới, *Then* kế hoạch có **ít slot hơn hoặc thời lượng ngắn hơn** so với tuần trước, kèm ghi chú lý do.

**AC-RP-5 — Duyệt kế hoạch tuần tới**
- *Given* người dùng chỉnh 1 slot inline rồi bấm "Duyệt & Áp dụng", *When* hoàn tất, *Then* `PlanItem` của tuần tới chứa **42** bản ghi (6 slot × 7 ngày), slot đã chỉnh dùng giá trị mới, và bấm lại lần 2 không nhân bản bản ghi.

**AC-RP-6 — Không vanity metric (P7)**
- *Given* có 20 `Activity` không gắn `skillId`, *When* mở `/progress`, *Then* thời gian của 20 hoạt động đó **không** được tính vào "Thời Gian Deliberate Practice".

**AC-RP-7 — Heatmap chỉ tính bằng chứng thật**
- *Given* một ngày có 3 `Activity` nhưng 0 `Evidence`, *When* vẽ heatmap, *Then* ô ngày đó không được tô màu "có hoạt động" — heatmap đếm `Evidence`, không đếm `Activity`.

**AC-RP-8 — Tự đối sánh 30 ngày**
- *Given* có dữ liệu đủ 30 ngày, *When* mở `/progress`, *Then* khối "Hiện Tại vs 30 Ngày Trước" hiện delta có dấu ▲/▼ cho từng chỉ số.
- *Given* mới dùng app 10 ngày, *When* mở `/progress`, *Then* khối đó ẩn và hiện "Cần thêm 20 ngày dữ liệu".

**AC-RP-8b — Tiến độ về mục tiêu**
- *Given* có 1 `UpcomingGoal` đang `active` với `targetLevel = "B2"` và `UserProfile.enLevel = "A1"`, *When* mở `/review`, *Then* khối "Tiến độ về mục tiêu" hiện `A1 → B2`, **còn 3 bậc**, và danh sách hành động tuần này liên quan tới mục tiêu.
- *Given* `targetDate = null` (chưa chốt ngày thi), *When* render, *Then* hiện "chưa chốt ngày" — **không** tự tính số tuần còn lại.

**AC-RP-9 — Xuất JSON**
- *Given* bấm "Xuất JSON tiến độ", *When* file tải xong, *Then* JSON chứa đủ `evidenceByMonth`, `heatmap`, `t30`, `practiceTime` và **không** chứa `ANTHROPIC_API_KEY` hay dữ liệu nhật ký cá nhân chưa được người dùng nhờ AI xử lý.
