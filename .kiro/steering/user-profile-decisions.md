---
inclusion: always
---

# Steering — Hồ sơ người dùng & Quyết định sản phẩm (đã chốt)

> Nguồn chân lý cho **8 câu hỏi còn mở** của `system-design/SPEC.md` §10.
> Trạng thái: **đã chốt bởi chủ sở hữu (2026-10-30)**. Khi implement, mọi feature phải tuân thủ file này.

---

## 1. Hồ sơ chủ sở hữu

| Thuộc tính | Giá trị |
|---|---|
| Nghề nghiệp | **Java Developer** |
| Ngôn ngữ lập trình chính | Java |
| Ngoại ngữ đang học | **Tiếng Anh** (vài từ cơ bản) · **Tiếng Trung** (chưa biết gì) · **Tiếng Việt** (bản ngữ) |
| Dữ liệu có sẵn | **Không có** — bắt đầu từ số 0 |
| Mục tiêu thời gian | **Không cố định** — AI đề xuất lộ trình, càng nhanh càng tốt |

---

## 2. Q1 — Chuyên môn: **Java Backend Developer**

**Cây kỹ năng seed** phải phản ánh đúng người dùng này (thay vì cây trung tính "System Design / Quản lý dữ liệu").

### 2.1 Domain `professional` — cây 3 tầng

```
Chuyên môn (Java Backend)
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
│   ├── Phân tích yêu cầu & use case
│   ├── Lựa chọn giải pháp & đánh đổi
│   └── Phân tích & độ khó (load, latency, consistency)
├── Luyện tập kỹ năng
│   ├── Java Algorithms (LeetCode)
│   ├── System Design (coding round)
│   └── Coding Interview
└── Hệ sinh thái & vận hành
    ├── Docker & container
    ├── CI/CD & Git workflow
    └── Observability: log, metric, trace
```

> **Bắt buộc:** node `Phân tích yêu cầu & use case` và `Lựa chọn giải pháp & đánh đổi` là 2 mục
> kỹ năng con **trọng tâm** — đây là nơi AI mock interview hỏi sâu nhất (§6).

### 2.2 Domain `communication` — không đổi

`Viết` · `Nói` · `Phỏng vấn & Thuyết trình` (tương ứng S07/S08/S16–S18)

### 2.3 Domain `language` — bổ sung ngôn ngữ luyện

`Tiếng Anh` · `Tiếng Trung` · `Tiếng Việt (giao tiếp công sở)` — xem §3

### 2.4 Domain `personal` — không đổi

`Nhật ký & Phản tư` · `Thể chất & Tinh thần` · `Quản lý năng lượng`

---

## 3. Q2 — Ngôn ngữ: chọn linh hoạt theo chế độ

**Không cố định `en` + `zh`.** Ba ngôn ngữ, chọn theo ngữ cảnh:

| Mã | Ngôn ngữ | Vai trò | Mặc định |
|---|---|---|---|
| `en` | Tiếng Anh | Ngoại ngữ học + giao tiếp quốc tế | ✅ bật |
| `zh` | Tiếng Trung | Ngoại ngữ học | ✅ bật |
| `vi` | Tiếng Việt | Giao tiếp công sở, luyện nói trong nước | ✅ bật (chỉ ở module giao tiếp) |

### 3.1 Ràng buộc

- `UserProfile.learningLangs` phải chứa **`en`** (mục tiêu chính theo Q3) và có thể chứa `zh`, `vi`.
- Tắt hết ngôn ngữ → `400` (không ôn được gì).
- **Tiếng Việt không có SRS deck seed** — nó là ngôn ngữ *luyện nói/ghi chép*, không phải ngôn ngữ *học thuộc*.
  Module SRS chỉ hỗ trợ `en` + `zh`. Xem §4.

### 3.2 Chọn ngôn ngữ theo chế độ — bắt buộc có UI

| Màn hình | Selector ngôn ngữ |
|---|---|
| S07 Viết | Chọn `en` / `vi` / `zh` cho **đề bài** (hiện prototype chỉ có A1–C1) |
| S08 Nói | Chọn `en` / `vi` / `zh` cho **giọng nói** + TTS `en-US` / `vi-VN` / `zh-CN` |
| S11 Luyện ngoại ngữ | Tab Viết + Tab Hội thoại, mỗi tab chọn ngôn ngữ riêng |
| S16 Mock Interview | `interviewLang` mặc định `en`, đổi được trong hồ sơ vai trò |
| S19 Bài kiểm tra | Chọn `en` / `zh` (theo deck SRS có sẵn) |
| S15 Cài đặt | Toggle 3 ngôn ngữ + mức hiện tại từng ngôn ngữ |

---

## 4. Q3 — Trình độ thực tế: EN vào giữa, ZH từ số 0

| Ngôn ngữ | Mức khởi đầu | Mức hiện tại (dùng để seed) | Ghi chú |
|---|---|---|---|
| **Tiếng Anh** | `zero` | **`A1` (sơ cấp)** — biết vài từ cơ bản | Đọc được chữ Latin; vốn từ & ngữ pháp thấp |
| **Tiếng Trung** | `zero` | **`zero`** — chưa biết gì | Pinyin luôn, hanzi bật/tắt, 4 thanh điệu từ đầu |
| **Tiếng Việt** | — | **B2 (bản ngữ)** | Không học thuộc — dùng làm ngôn ngữ luyện nói/giao tiếp |

### 4.1 Hệ level thống nhất (thay thế cả 2 bảng cũ)

> ⚠️ **Mâu thuẫn đã hợp nhất:** `settings-cost` dùng `zero|beginner|elementary|intermediate|upper_intermediate`,
> còn `language-test` dùng `zero|A1|A2|B1|B2|C1`. **Chuẩn mới: mã CEFR thật.**

```ts
export const LEVELS = ["zero", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, { vi: string; cefr: string; hsk: string | null }> = {
  zero:     { vi: "Chưa biết",        cefr: "—",  hsk: "HSK 0" },
  A1:       { vi: "Sơ cấp",           cefr: "A1", hsk: "HSK 1" },
  A2:       { vi: "Cơ bản",           cefr: "A2", hsk: "HSK 2" },
  B1:       { vi: "Trung cấp",        cefr: "B1", hsk: "HSK 3" },
  B2:       { vi: "Trung cấp cao",    cefr: "B2", hsk: "HSK 4" },
  C1:       { vi: "Cao cấp",          cefr: "C1", hsk: "HSK 5" },
  C2:       { vi: "Cao cấp (thành thạo)", cefr: "C2", hsk: "HSK 6" },
};
```

**Quy tắc dùng:**
- `UserProfile.zhLevel` / `enLevel` / `viLevel` dùng **đúng mã trên**.
- `TestSession.level` dùng **đúng mã trên** (bỏ `LEVEL_ORDER` cũ `["zero","A1","A2","B1","B2","C1"]` → thêm `C2`).
- **Tiếng Trung** có cột HSK tương ứng; **Tiếng Anh** dùng cột CEFR. Một mã, hai cách hiển thị.
- `zero` = chưa biết gì (chỉ dùng cho zh lúc đầu).

### 4.2 Cần thêm field

| Model | Field | Kiểu | Mặc định | Registry |
|---|---|---|---|---|
| `UserProfile` | `viLevel` | `String` | `"B2"` | **`C29`** — bản ngữ, để AI biết không cần dạy ngữ pháp cho vi |

### 4.3 Seed deck theo trình độ thật

| Deck | Seed | Ghi chú |
|---|---|---|
| Tiếng Anh | 60 thẻ **A1** — nhưng **rút gọn** về "vài từ cơ bản" | Nhóm đầu tiên nên là: pronouns, numbers 1–10, days, greetings, `I am / My name is / I like / I want` |
| Tiếng Anh level 0 | 60 thẻ **A2** | Dùng cho bài `placement` khi AI ước lượng ≥ A2 |
| Tiếng Trung | 60 thẻ **zero** | Như SPEC Phụ lục B (6 nhóm × 10) |
| Tiếng Trung level 1 | 60 thẻ **A1** | Cho `placement` |
| Tiếng Việt | **không seed** | Không có SRS deck |

---

## 5. Q4 — Mục tiêu: AI đề xuất lộ trình, không có deadline cứng

**Vấn đề:** không có mốc thời gian ⇒ app không thể hỏi "còn bao lâu nữa?".

**→ Quyết định:** `UserProfile.goals` (textarea) giữ vai trò mục tiêu **mềm**. AI đề xuất lộ trình dạng
**3 giai đoạn**, mỗi giai đoạn có **tiêu chí hoàn thành đo được** (không có deadline).

### 5.1 Mô hình lộ trình mới (bổ sung vào feature `daily-loop-core`)

```
Giai đoạn 1 — Nền tảng        [điều kiện: có ≥ 20 Evidence ở domain professional]
   └─ tiêu chí: viết được 1 REST service Spring Boot + 1 query JPA không N+1

Giai đoạn 2 — Vững chắc       [điều kiện: giai đoạn 1 đạt + mock interview ≥ 3.5/5]
   └─ tiêu chí: giải thích được GC, connection pool, và 1 đánh đổi system design

Giai đoạn 3 — Mở rộng          [điều kiện: giai đoạn 2 đạt]
   └─ tiêu chí: thiết kế 1 hệ thống đặt vé (10 triệu người dùng đỉnh cao)
```

- Giai đoạn hiện tại = giai đoạn đầu tiên chưa đạt điều kiện.
- Tiêu chí đo được từ `Evidence`/`Activity` thật ⇒ **không vanity metric** (P7).
- Mỗi giai đoạn sinh từ AI bằng **AI-01** (bộ sinh kế hoạch) — mỗi tuần AI đề xuất lại.

### 5.2 Hành vi AI khi không có deadline

- **Không** hỏi "bạn muốn đạt trong bao lâu?" — suy ra tốc độ từ dữ liệu 7 ngày gần nhất.
- Nếu tốc độ tăng → đề xuất giai đoạn tiếp theo. Nếu trượt ≥2 ngày → **giảm tải** (FR-WR-05).
- Prompt AI-01 nhận thêm `currentStage` + `stageCriteria` + `recentVelocity` (evidence/ngày).

---

## 6. Q6 — Mock Interview: **AI Interview Studio**

Không chỉ "1 phiên hỏi–đáp". Đây là một **studio** có nhiều phiên + gợi ý phiên cụ thể.

### 6.1 Ba loại phiên

| Loại | Mã | Mô tả |
|---|---|---|
| **Vòng lặp kỹ năng** | `skill_drill` | Hỏi sâu 1 mục kỹ năng cụ thể (VD: "JVM & Hiệu năng"). AI sinh câu hỏi theo từng tầng của cây. |
| **Vòng tròn tuyến tính** | `interview_loop` | Chuỗi cố định: giới thiệu → chuyên môn sâu → hệ thống → hỏi ngược. |
| **Mô phỏng đối tác** | `partner_sim` | AI đóng vai đối tác/sếp/khách hàng, không phải interviewer. |

### 6.2 Gợi ý phiên cụ thể (bắt buộc sinh, không generic)

`S16` phải hiển thị **≥3 gợi ý phiên cụ thể** được sinh từ dữ liệu thật của người dùng, mỗi gợi ý gồm:

| Trường | Nội dung |
|---|---|
| `title` | Tên phiên cụ thể (VD: "Phỏng vấn System Design — Hệ thống đặt vé") |
| `whyNow` | **Vì sao phiên này, lúc này** — dẫn chứng bằng `Evidence` cụ thể (VD: "2/14 Evidence ở 'Lựa chọn giải pháp'") |
| `focusSkillIds` | Các `Skill` node mà phiên này nhắm tới |
| `questionKinds` | 5 dạng câu đề xuất cho phiên này |
| `plannedCount` | Số câu |
| `estMinutes` | Thời lượng ước tính |

**Nguồn sinh:** AI-11 dựa trên `focusSkills` + `JobTitle` + `seniority` + **thống kê Evidence thật**.
Không được sinh câu hỏi chung chung ("Giải thích REST") — rủi ro R8.

### 6.3 Nhiều phiên — quản lý

| Nhu cầu | Hành vi |
|---|---|
| Tạo nhiều phiên | Mỗi phiên có `InterviewProfile` riêng hoặc dùng chung hồ sơ vai trò |
| So sánh | FR-MI-09 — delta từng tiêu chí so với phiên trước **cùng hồ sơ vai trò** |
| Lịch sử | Danh sách phiên: ngày, hồ sơ, loại phiên, điểm tổng, trạng thái |
| Tiếp tục phiên dang dở | FR-MI-13 — resume |
| Gợi ý "nên làm phiên nào tiếp" | AI đề xuất dựa trên mục kỹ năng yếu nhất |

### 6.4 Bổ sung field

| Model | Field | Kiểu | Mặc định | Registry |
|---|---|---|---|---|
| `InterviewSession` | `sessionType` | `String` | `"interview_loop"` | **`C30`** — `skill_drill \| interview_loop \| partner_sim` |
| `InterviewSession` | `focusHint` | `String?` | `null` | **`C31`** — vì sao phiên này được đề xuất (để hiển thị lại sau) |

### 6.5 Model mới đề xuất

| Mã | Model | Mục đích |
|---|---|---|
| **`M10`** | `InterviewSuggestion` | 1 gợi ý phiên cụ thể do AI sinh: `title`, `whyNow`, `focusSkillIds[]`, `questionKinds[]`, `plannedCount`, `estMinutes`, `generatedAt`. Nhánh dự phòng: tính từ `Evidence` cục bộ, không cần AI. |

---

## 7. Q7 — Chuẩn ngoại ngữ: **CEFR đầy đủ, chọn theo chế độ**

### 7.1 Thang CEFR đầy đủ

Dùng bảng §4.1: `zero · A1 · A2 · B1 · B2 · C1 · C2`.
Bỏ khái niệm "thang 5 mức nội bộ" — **CEFR là chuẩn duy nhất**, hiển thị kèm HSK cho tiếng Trung.

### 7.2 Chọn chuẩn theo chế độ

| Màn hình / chế độ | Chuẩn được dùng |
|---|---|
| S15 Cài đặt — mức hiện tại | CEFR (tiếng Anh/Việt) · CEFR + HSK (tiếng Trung) |
| S19 Bài kiểm tra — `placement` | CEFR + HSK, AI ước lượng trên thang §4.1 |
| S19 — `topic` | Chọn CEFR cụ thể → lọc deck theo band tương ứng |
| S19 — `benchmark` | **Cố định 1 chuẩn** (mặc định CEFR) → đề song song về độ khó (FR-LT-12) |
| S19 — `from_content` | CEFR của tài liệu, người dùng chọn |
| S16 Mock Interview | CEFR cho `language` của hồ sơ vai trò (khi trả lời bằng tiếng Anh → chấm thêm "clarity of expression", FR-MI-14) |

### 7.3 Tương đương HSK cho tiếng Trung

| CEFR | HSK | Ghi chú |
|---|---|---|
| `zero` | HSK 0 | Chưa biết gì |
| `A1` | HSK 1 | Đúng nhóm seed đầu tiên |
| `A2` | HSK 2 | |
| `B1` | HSK 3 | |
| `B2` | HSK 4 | Khớp prototype (`Tiếng Trung HSK4`) |
| `C1` | HSK 5 | |
| `C2` | HSK 6 | |

### 7.4 Bổ sung field

| Model | Field | Kiểu | Mặc định | Registry |
|---|---|---|---|---|
| `UserProfile` | `languageStandard` | `String` | `"cefr"` | **`C32`** — `cefr` \| `hsk` \| `both`; chuẩn hiển thị ưu tiên |
| `TestSession` | `standard` | `String` | `"cefr"` | **`C33`** — chuẩn dùng cho đề này, để so sánh giữa các lần |

---

## 8. Q8 — Chưa có kỳ thi → thêm **mục tiêu sắp tới** (Upcoming Goal)

### 8.1 Mô hình mới

`UserProfile.goals` (textarea) **không đủ** cho "kỳ thi sắp tới" vì cần ngày + chuẩn + mức đích.

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| **`UpcomingGoal`** | `id` | `String @id @default(cuid())` | |
| | `kind` | `String` | `exam` \| `cert` \| `role` \| `skill` — kỳ thi / chứng chỉ / vị trí / kỹ năng |
| | `title` | `String` | VD: "AWS SAA-C03", "Senior Java Engineer", "HSK 3" |
| | `lang` | `String?` | `en` \| `zh` \| `vi` \| `null` (kỳ thi không gắn ngôn ngữ) |
| | `standard` | `String?` | `cefr` \| `hsk` \| `vendor` (VD: `aws_saa_c03`) |
| | `targetLevel` | `String?` | CEFR/HSK đích — VD `B2` |
| | `targetDate` | `DateTime?` | Ngày thi — **có thể null** ("chưa chốt") |
| | `status` | `String` | `active` \| `achieved` \| `paused` |
| | `priority` | `Int` | 1 = cao nhất; AI dùng để ưu tiên |
| | `notes` | `String?` | |
| | `createdAt` / `updatedAt` | `DateTime` | |

| Mã | Model | Ghi chú |
|---|---|---|
| **`M11`** | `UpcomingGoal` | Nhánh dự phòng: lưu trong `UserProfile.goals` dạng JSON, không cần bảng riêng. |

### 8.2 AI đề xuất ưu tiên — hành vi bắt buộc

Khi có ≥1 `UpcomingGoal` đang `active`, AI (AI-01 sinh kế hoạch, AI-07 báo cáo tuần) phải:

1. **Ưu tiên theo `priority`** — mục tiêu `priority` cao nhất chiếm **≥2 trong 6 slot** mỗi ngày.
2. **Đo tiến độ về mục tiêu** — `targetLevel` là mốc, AI so sánh `UserProfile.{lang}Level` với `targetLevel`
   và tính **khoảng cách còn lại** (ví dụ: `A1 → B2 còn 3 bậc`).
3. **Đề xuất mục tiêu mới** khi chưa có — AI gợi ý mục tiêu hợp lý dựa trên `focusSkillIds` + trình độ hiện tại
   (VD: "Đề xuất: HSK 3 trong ~6 tháng ở nhịp hiện tại").
4. **Cảnh báo xung đột** — nếu 2 mục tiêu cùng `priority` nhưng khác ngôn ngữ → AI đề xuất chọn 1,
   kèm lý do.

### 8.3 UI

| Màn hình | Thay đổi |
|---|---|
| **S15 Cài đặt** → tab Hồ sơ | Thêm khu vực **"Mục tiêu sắp tới"**: list `UpcomingGoal` (tiêu đề, chuẩn, mức đích, ngày, trạng thái, priority) + nút thêm/sửa/xoá. Nút **"AI đề xuất mục tiêu"**. |
| **S01 Daily Loop** | Nếu có mục tiêu sắp tới → hiện chip "Đang hướng tới: <title> · còn N bậc" trên top strip. |
| **S13 Báo cáo tuần** | Khối "Tiến độ về mục tiêu" — mức hiện tại vs đích, gap, hành động tuần này. |
| **S14 Báo cáo tiến bộ** | Đường thẳng level theo thời gian với **đường ngang đích** (target) để thấy rõ còn thiếu bao nhiêu. |

---

## 9. Bổ sung field vào registry (C29–C33, M10–M11)

| Mã | Model | Field | Kiểu | Mặc định | Lý do |
|---|---|---|---|---|---|
| C29 | `UserProfile` | `viLevel` | `String` | `"B2"` | Bản ngữ — AI biết không cần dạy ngữ pháp vi |
| C30 | `InterviewSession` | `sessionType` | `String` | `"interview_loop"` | `skill_drill \| interview_loop \| partner_sim` |
| C31 | `InterviewSession` | `focusHint` | `String?` | `null` | Vì sao phiên này được đề xuất |
| C32 | `UserProfile` | `languageStandard` | `String` | `"cefr"` | `cefr \| hsk \| both` — chuẩn hiển thị ưu tiên |
| C33 | `TestSession` | `standard` | `String` | `"cefr"` | Chuẩn của đề này, để so sánh giữa các lần |
| M10 | `InterviewSuggestion` | (model mới) | — | — | Gợi ý phiên cụ thể do AI sinh |
| M11 | `UpcomingGoal` | (model mới) | — | — | Mục tiêu sắp tới (kỳ thi / chứng chỉ / vị trí / kỹ năng) |

Tất cả nullable hoặc có mặc định ⇒ migration an toàn.
