---
inclusion: always
---

# Steering — Data Model Registry

> Nguồn chân lý cho **mọi thay đổi schema**. Nếu một feature cần thêm field/model mới,
> khai báo ở đây trước, rồi tham chiếu bằng tên registry trong `spec.md`/`design.md` của feature đó.
> Nếu feature nào tự đặt field mà không có trong registry → **xung đột schema**.

Base: `system-design/SPEC.md` §4 (15 model). Mọi thay đổi dưới đây giữ nguyên 15 model, chỉ thêm
field/cột nullable — **không thêm model mới** trừ khi ghi rõ ở §3.

---

## 1. Bảng thay đổi đã chốt

| # | Model | Field | Kiểu | Mặc định | Feature đề xuất | Lý do |
|---|---|---|---|---|---|---|
| C1 | `Activity` | `planItemId` | `String?` | `null` | quick-log | Liên kết hoạt động với slot kế hoạch đã đánh dấu xong (FR-DL-03). |
| C2 | `Activity` | `clientRequestId` | `String?` | `null` | quick-log | Idempotency key chống tạo trùng khi bấm Enter nhiều lần. |
| C3 | `UserProfile` | `focusSkillId` | `String?` | `null` | skill-tree-evidence | Trọng tâm hôm nay — 1 giá trị toàn cục, không cần lịch sử theo ngày ở Phase 0. |
| C4 | `Reflection` | `activityId` | `String?` | `null` | personal-state-journal | Cho phép bản nháp tồn tại mà chưa tạo `Activity` (P3: nhật ký chỉ thành hoạt động khi commit). **Đổi từ bắt buộc (`@unique`) sang nullable.** |
| C5 | `Reflection` | `status` | `String` | `"published"` | personal-state-journal | `draft \| published`. Bản nháp không được tính vào thống kê hoạt động. |
| C6 | `Reflection` | `classifiedDomain` | `String?` | `null` | personal-state-journal | Domain do AI-06 hoặc rule cục bộ gán. |
| C7 | `Reflection` | `classifiedSkillId` | `String?` | `null` | personal-state-journal | Skill được gán — đã kiểm chứng tồn tại trong DB. |
| C8 | `Reflection` | `classificationConfidence` | `Float?` | `null` | personal-state-journal | 0–1. |
| C9 | `Reflection` | `draftUpdatedAt` | `DateTime?` | `null` | personal-state-journal | Mốc so sánh bản nháp mới/cũ. |
| C10 | `Reflection` | `updatedAt` | `DateTime @updatedAt` | — | personal-state-journal | Nhận biết phản hồi AI đã lỗi thời sau khi sửa. |
| C11 | `AiCall` | `sourceId` | `String?` | `null` | personal-state-journal | Trỏ tới `Reflection`/`Activity` đã gửi lên — dùng cho panel "dữ liệu đã gửi lên". |
| C12 | `AiCall` | `dataKinds` | `String?` | `null` | settings-cost | FR-PS-07 — phân loại dữ liệu đã gửi lên (JSON: `["journal","activity"]`). |
| C13 | `AiCall` | `dataPreview` | `String?` | `null` | settings-cost + personal-state-journal | FR-PS-07 — trích nội dung **đã gửi lên** để hiển thị ở panel minh bạch. `personal-state-journal` ghi tối đa **160** ký tự; `settings-cost` có thể hiển thị tối đa **280** ký tự (cắt giữa câu). Một field duy nhất cho cả hai. |
| C14 | `UserProfile` | `interviewLang` | `String` | `"en"` | settings-cost | Ngôn ngữ phỏng vấn mặc định (FR-MI-01). |
| C15 | `UserProfile` | `monthlyBudgetUsd` | `Float` | `15` | settings-cost | FR-SC-22 — ngân sách chi phí AI tháng (theo kịch bản "nặng" SPEC §5.7). |
| C16 | `UserProfile` | `saverMode` | `Boolean` | `false` | settings-cost | FR-SC-14 — chế độ khẩn cấp tiết kiệm. |
| C17 | `TestSession` | `status` | `String` | `"active"` | language-test | `active \| done \| abandoned \| expired`. `expired` = hết giờ timer. |
| C18 | `TestSession` | `formSignature` | `String?` | `null` | language-test | Hash `(itemTypes + difficultyBands)` — cơ sở kiểm chứng parallel form (FR-LT-12). |
| C19 | `TestSession` | `levelSource` | `String` | `"local"` | language-test | `ai \| local` — level S21 đến từ AI-16 hay bộ ước lượng cục bộ. |
| C20 | `TestSession` | `sourceText` | `String?` | `null` | language-test | Văn bản người dùng dán cho `from_content`. |
| C21 | `TestSession` | `startedAt` | `DateTime` | `now()` | language-test | Tách khỏi `createdAt` để đo thời gian làm bài. |
| C22 | `TestSession` | `endedAt` | `DateTime?` | `null` | language-test | — |
| C23 | `TestItem` | `explanation` | `String?` | `null` | language-test | Giải thích ngắn cho câu đúng (hoặc khi AI không kịp chấm). |
| C24 | `TestItem` | `flagged` | `Boolean` | `false` | language-test | Đánh dấu cờ (FR-LT-17). |
| C25 | `TestItem` | `rubric` | `Json?` | `null` | language-test | Điểm 4 nhóm lỗi câu tự luận: `{grammar, vocab, expression, context}`. |
| C26 | `TestItem` | `scored` | `Boolean` | `false` | language-test | Đã chấm xong (câu tự luận chờ AI → `false`). |
| C27 | `Review` | `source` | `String` | `"srs"` | language-test | `srs \| test` — phân biệt lượt ôn SRS và lượt do bài kiểm tra đẩy thẻ về ôn. |
| C28 | `InterviewSession` | `activityId` | `String?` | `null` | mock-interview | Khoá 1–1 với `Activity` — không có nó thì idempotency tạo Activity/Evidence không chắc chắn. |
| C29 | `UserProfile` | `viLevel` | `String` | `"B2"` | settings-cost | Tiếng Việt là bản ngữ — AI biết không cần dạy ngữ pháp vi (Q3). |
| C30 | `InterviewSession` | `sessionType` | `String` | `"interview_loop"` | mock-interview | `skill_drill \| interview_loop \| partner_sim` — 3 loại phiên của AI Interview Studio (Q6). |
| C31 | `InterviewSession` | `focusHint` | `String?` | `null` | mock-interview | Vì sao phiên này được đề xuất — để hiển thị lại sau (Q6). |
| C32 | `UserProfile` | `languageStandard` | `String` | `"cefr"` | settings-cost | `cefr \| hsk \| both` — chuẩn hiển thị ưu tiên (Q7). |
| C33 | `TestSession` | `standard` | `String` | `"cefr"` | language-test | Chuẩn dùng cho đề này, để so sánh giữa các lần (Q7). |
| C34 | `Activity` | `language` | `String?` | `null` | quick-log | Ngôn ngữ của hoạt động (`en`/`zh`/`vi`) — Q2. `vi` là bản ngữ ⇒ không tạo Evidence SRS. |

> ⚠️ **Xung đột đã hợp nhất:** `personal-state-journal` đề xuất `AiCall.preview` (160 ký tự) trong khi
> `settings-cost` đề xuất `AiCall.dataPreview` (280 ký tự) — **cùng ý nghĩa, khác tên và khác độ dài**.
> Quyết định: giữ **một** field `AiCall.dataPreview` (C13), bỏ `preview`.
> Panel "dữ liệu đã gửi lên" của `settings-cost` là nơi **hiển thị**; `personal-state-journal` chỉ **ghi** vào đó.
> Nếu feature nào cần giới hạn 160 ký tự, dùng `dataPreview.slice(0, 160)` — không thêm field mới.

**Quy tắc áp dụng C1–C34:** tất cả đều nullable hoặc có mặc định ⇒ **không phá model cũ**,
migration an toàn trên DB có dữ liệu.

---

## 2. Ràng buộc index & uniqueness

| Quy tắc | Áp dụng cho | Ghi chú |
|---|---|---|
| `Activity.planItemId` → `@@unique` | C1 | 1 slot kế hoạch sinh **tối đa 1** hoạt động. Chống double-click "Xong" tạo 2 `Activity`. |
| `Activity.clientRequestId` → `@@unique` | C2 | Idempotency key từ client. `null` không vi phạm unique (SQLite cho phép nhiều NULL). |
| `Reflection.activityId` → `@@unique`, **nullable** | C4 | Nhiều bản nháp `activityId = null` vẫn hợp lệ. |
| `AiCall.sourceId` → **không** index | C11 | Chỉ truy vấn theo `sourceId` khi xem log 1 mục; không cần index toàn bảng. |
| `UserProfile.focusSkillId` → FK `onDelete: SetNull` | C3 | Xoá skill trọng tâm → set null, không crash. |

---

## 3. Model bổ sung (ngoài 15 model của SPEC §4)

| # | Model | Feature | Lý do | Trạng thái |
|---|---|---|---|---|
| M1 | `SrsSession` | srs-language-review | Queue thẻ ổn định trong 1 phiên ôn, khôi phục phiên dang dở, đếm `3/12 thẻ` | **Đề xuất — chờ duyệt** |
| M2 | `LanguagePattern` | srs-language-review | 20 mẫu câu dùng lại cho S11 / S19–S21 | **Đề xuất — chờ duyệt** |
| M3 | `SpeakPrompt` | communication-training | Kho đề luyện nói (12 bài mẫu `EX-01..EX-12` + bài tự tạo). | **Đề xuất — chờ duyệt** |
| M4 | `SpeakAttempt` | communication-training | 1 lần luyện nói: transcript, rubric, tổng điểm, delta so với lần trước. | **Đề xuất — chờ duyệt** |
| M5 | `RoleplayScenario` | communication-training | Tình huống hội thoại + `hiddenGoal` (mục tiêu ẩn) + mục tiêu chấm. | **Đề xuất — chờ duyệt** |
| M6 | `RoleplaySession` | communication-training | 1 phiên hội thoại AI, gồm nhiều `RoleplayTurn`. | **Đề xuất — chờ duyệt** |
| M7 | `RoleplayTurn` | communication-training | 1 lượt (AI hỏi / người dùng đáp / chấm / đánh giá mục tiêu). | **Đề xuất — chờ duyệt** |
| M8 | `LanguagePractice` | communication-training | 1 bài luyện ngoại ngữ chủ động (S11) — viết hoặc hội thoại. | **Đề xuất — chờ duyệt** |
| M9 | `PracticeCard` | communication-training | Flashcard sinh từ bài viết (AI-10) chờ đẩy vào deck FSRS. | **Đề xuất — chờ duyệt** |
| M10 | `InterviewSuggestion` | mock-interview | Gợi ý phiên cụ thể do AI sinh: `title`, `whyNow`, `focusSkillIds[]`, `questionKinds[]`, `plannedCount`, `estMinutes`, `generatedAt`. Nhánh dự phòng: tính từ `Evidence` cục bộ. | **Đề xuất — chờ duyệt** |
| M11 | `UpcomingGoal` | settings-cost | Mục tiêu sắp tới: `kind` (`exam\|cert\|role\|skill`), `title`, `lang?`, `standard?`, `targetLevel?`, `targetDate?`, `status`, `priority`, `notes?`. Nhánh dự phòng: lưu JSON trong `UserProfile.goals`. | **Đề xuất — chờ duyệt** |

> **Tổng: 11 model đề xuất** (M1–M11) — mở rộng từ 15 model gốc của SPEC §4 lên **30 model**.
> Toàn bộ đều **chưa được duyệt**; mặc định mọi feature implement theo **nhánh dự phòng** để build được ngay.

| Mã | Model | Nhánh dự phòng khi chưa duyệt |
|---|---|---|
| M1 | `SrsSession` | Lưu queue phiên ôn vào `localStorage` + suy ra từ `Card.reps`/`due` |
| M2 | `LanguagePattern` | Hằng số trong `src/lib/seed/patterns.ts` |
| M3 | `SpeakPrompt` | Kho đề luyện nói: hằng số `src/lib/seed/speak-prompts.ts` (12 bài mẫu) |
| M4 | `SpeakAttempt` | Ghi vào `Activity` (`type="speak"`, `content` = transcript JSON) + `Evidence` |
| M5 | `RoleplayScenario` | Hằng số `src/lib/seed/roleplay-scenarios.ts` (6 tình huống + `hiddenGoal`) |
| M6 | `RoleplaySession` | Không lưu riêng — gộp vào `Activity` (`type="roleplay"`, `content` = transcript JSON) |
| M7 | `RoleplayTurn` | Không lưu riêng — gộp vào `Activity.content` dạng mảng lượt |
| M8 | `LanguagePractice` | Không lưu riêng — gộp vào `Activity` (`domain="language"`, `type="write"`/`"roleplay"`) |
| M9 | `PracticeCard` | Sinh thẻ trực tiếp vào `Card` với `mode="produce"`, `due = now + 12h` |
| M10 | `InterviewSuggestion` | Tính gợi ý phiên từ `Evidence` cục bộ (không cần AI) |
| M11 | `UpcomingGoal` | Lưu JSON trong `UserProfile.goals`; AI đọc từ đó |

> **Bắt buộc:** `tasks.md` của mỗi feature liên quan phải có **task dự phòng** cho trường hợp model chưa được duyệt.
> Nếu sau này duyệt model, task dự phòng được thay bằng task migration tương ứng.

---

## 4. Thay đổi hành vi (không đổi schema)

| # | Thay đổi | Feature | Ảnh hưởng tính toán |
|---|---|---|---|
| B1 | `Skill.level` **không** được route nào ghi trực tiếp | skill-tree-evidence | Nguồn sự thật duy nhất: `recomputeSkillLevel()` / `recomputeAncestors()` tính từ `COUNT(Evidence.rating >= 3)`. |
| B2 | `Activity.minutes` chỉ được tính vào "deliberate practice" khi `skillId IS NOT NULL` | weekly-progress-report | P7 — không vanity metric. |
| B3 | Heatmap đếm `Evidence`, **không** đếm `Activity` | weekly-progress-report | P3 — ô trống ≠ hoạt động ảo. |
| B4 | `Skill.level` tăng khi tích lũy đủ `Evidence` với `rating >= 3` | skill-tree-evidence + quick-log | Công thức: `level = MIN(5, FLOOR(qualifiedCount / EVIDENCE_THRESHOLD))`, `EVIDENCE_THRESHOLD = 3`. |
| B5 | `PlanItem.source` ∈ `ai \| manual \| fallback` | daily-loop-core | Biết kế hoạch đến từ AI, rule offline hay thủ công. |

---

## 5. Ràng buộc liên feature (rà soát khi implement)

| Ràng buộc | Feature liên quan | Kiểm tra |
|---|---|---|
| `POST /api/log` **không được** import Anthropic SDK | quick-log | AC-2 đảm bảo bằng cấu trúc, không bằng may mắn. AI-02 chỉ ở `/api/log/autofill`. |
| `POST /api/log` tạo `Activity` + `Evidence` + set `PlanItem.done` trong **1 transaction** | quick-log + daily-loop-core | Không để trạng thái nửa vời. |
| AI-12 (chấm + sinh câu tiếp) giữ `system` **cố định**, lịch sử chỉ **append** trong `messages` | mock-interview | Giữ prompt cache (SPEC §5.2). |
| Mọi lời gọi AI đi qua `src/lib/anthropic.ts` wrapper → tự ghi `AiCall` | ai-foundation + tất cả | Không feature nào tự gọi SDK rồi tự ghi log. |
| `reflection.answer` chỉ được đọc **sau** khi kiểm `consent === true` | personal-state-journal | P6 — không gửi khi người dùng không nhờ. |
| FR-PS-05 (tương quan chỉ số) chạy **100% cục bộ** | personal-state-journal | Gọi API sẽ vi phạm P6. |
| Feature không gọi AI phải ghi rõ trong `design.md` | srs-language-review, skill-tree-evidence | Tránh rò rỉ dữ liệu ngoài ý muốn. |
| Câu sai trong bài kiểm tra → FSRS rating `Again` (hạ stability, tăng lapses, due = hôm nay) | language-test | Phải dùng **cùng** helper `applyRating` của `srs-language-review`, không viết lại. |

---

## 6. Quy trình đề xuất thay đổi schema

1. Thêm dòng vào §1 (bảng C) hoặc §3 (bảng M) trong file này.
2. Ghi rõ: feature đề xuất · lý do · nullable hay bắt buộc · ảnh hưởng index.
3. Cập nhật `system-design/SPEC.md` §4 để 2 nguồn không lệch nhau.
4. Thêm task migration vào `tasks.md` của feature đề xuất.
5. Nếu thay đổi là **hành vi** (không đổi schema) → dùng §4, không thêm vào §1.
