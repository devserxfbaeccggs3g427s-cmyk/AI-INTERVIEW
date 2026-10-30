# Điểm cần người dùng quyết — trước khi code Phase 0

> **Q5 (8 câu hỏi SPEC §10) đã chốt** → xem [`steering/user-profile-decisions.md`](steering/user-profile-decisions.md).
> 6 mục dưới đây giữ **mặc định** theo yêu cầu của chủ sở hữu.

> Tất cả điểm dưới đây là **quyết định sản phẩm/nghiệp vụ** mà spec không tự quyết được.
> Mỗi mục có **mặc định đã chọn** trong spec ⇒ nếu không trả lời, hệ thống vẫn build được.
> Trả lời bất kỳ mục nào bằng cách sửa trực tiếp dòng **→ Quyết định:** trong file này.

---

## Q1 — Seed 120 thẻ: bảng Phụ lục B không khớp 10 ô/nhóm

**Vấn đề.** SPEC.md Phụ lục B yêu cầu "6 nhóm × 10 từ" mỗi ngôn ngữ (= 60 từ), nhưng bảng thực tế lệch:

| Nhóm | Số mục trong Phụ lục B | Kỳ vọng | Sai lệch |
|---|---|---|---|
| Tiếng Anh — Numbers & family | 18 | 10 | +8 |
| Tiếng Anh — Verbs & adjectives | 15 | 10 | +5 |
| Tiếng Anh — Pronouns & cơ bản | 10 | 10 | ✔ |

Ngoài ra §2.3.1 yêu cầu `numbers 1–20` (20 số) + `colors` — **không có trong bảng seed**; nhóm Numbers chỉ có `one–ten`.

**→ Quyết định (mặc định đã chọn):** giữ **đúng 60 thẻ/ngôn ngữ** theo nhóm, lấy 10 từ đầu mỗi nhóm; phần dư (`eight`…`twenty`, `colors`, `big`/`small`/`new`) chuyển sang **deck Level 1** (`Card.group = "level1"`), dùng khi bài kiểm tra `placement` ước lượng ≥ A1.
**Cần người biết ngôn ngữ duyệt** trước khi seed (rủi ro R6: AI không được sinh từ vựng nền).

**→ Quyết định của bạn:** ______________________

---

## Q2 — `STABLE_SYSTEM` chưa đủ dài cho cache của `claude-haiku-4-5`

**Vấn đề.** Anthropic chỉ cache prompt khi đạt ngưỡng tối thiểu theo model. Ngưỡng của `claude-haiku-4-5` là **4096 token**.
`STABLE_SYSTEM` hiện ~1.050 ký tự ≈ **300 token** ⇒ **AI-02 / AI-06 / AI-10 sẽ không được cache**,
và API **không báo lỗi** (silent invalidator). `claude-opus-5` có ngưỡng thấp hơn nên vẫn cache được ⇒ 3 call rẻ nhất
trong app lại là 3 call tốn kém nhất.

**→ Quyết định (mặc định đã chọn):** mở rộng `STABLE_SYSTEM` + danh mục rubric thành **tài liệu chuẩn hoá**
dùng chung (mục tiêu ≥ 4.500 token): quy tắc chấm điểm, thang 0–5, cách xử lý câu trả lời hời hợt,
quy tắc output JSON, giọng văn `direct|coach|gentle`, nguyên tắc local-first.
Task đã có ở `ai-foundation/tasks.md` (§2.x, §17.3) và AC-5.

**→ Quyết định của bạn:** ______________________

---

## Q3 — Model mới: 9 model đề xuất (ngoài 19 model của SPEC §4)

**Vấn đề.** Các feature cần model mà SPEC §4 không có. Đã gom đủ trong
[`steering/data-model-registry.md`](steering/data-model-registry.md) §3:

| Mã | Model | Feature | Nhánh dự phòng khi chưa duyệt |
|---|---|---|---|
| M1 | `SrsSession` | srs-language-review | queue phiên ôn trong `localStorage` + `Card.reps`/`due` |
| M2 | `LanguagePattern` | srs-language-review | hằng số `src/lib/seed/patterns.ts` |
| M3 | `SpeakPrompt` | communication-training | hằng số `src/lib/seed/speak-prompts.ts` |
| M4 | `SpeakAttempt` | communication-training | gộp vào `Activity` (`type="speak"`) |
| M5 | `RoleplayScenario` | communication-training | hằng số `src/lib/seed/roleplay-scenarios.ts` |
| M6 | `RoleplaySession` | communication-training | gộp vào `Activity` (`type="roleplay"`) |
| M7 | `RoleplayTurn` | communication-training | gộp vào `Activity.content` dạng mảng lượt |
| M8 | `LanguagePractice` | communication-training | gộp vào `Activity` (`domain="language"`) |
| M9 | `PracticeCard` | communication-training | tạo thẳng vào `Card` (`mode="produce"`, `due=+12h`) |

Mở rộng từ **19 → 28 model**.

**→ Quyết định (mặc định đã chọn):** **chưa duyệt** — mọi feature implement theo **nhánh dự phòng** để build được ngay.
`tasks.md` mỗi feature có **task dự phòng** tương ứng.
**→ Quyết định của bạn:** duyệt cả 9 / duyệt theo nhóm (M1–M2 giai đoạn 1, M3–M9 giai đoạn 2) / ______________________

---

## Q4 — Thêm 28 field vào model có sẵn (không thêm model)

Đã chốt trong [`steering/data-model-registry.md`](steering/data-model-registry.md) §1 — tất cả nullable hoặc có mặc định,
migration an toàn trên DB có dữ liệu:

| Model | Field | Mã | Mục đích |
|---|---|---|---|
| `Activity` | `planItemId`, `clientRequestId` | C1, C2 | Liên kết slot + idempotency chống tạo trùng |
| `UserProfile` | `focusSkillId` | C3 | Trọng tâm hôm nay |
| `UserProfile` | `interviewLang`, `monthlyBudgetUsd`, `saverMode` | C14, C15, C16 | Mock interview + kiểm soát chi phí |
| `Reflection` | `activityId` (→nullable), `status`, `classifiedDomain`, `classifiedSkillId`, `classificationConfidence`, `draftUpdatedAt`, `updatedAt` | C4–C10 | Nháp offline + AI-06 gán domain/kỹ năng |
| `AiCall` | `sourceId`, `dataKinds`, `dataPreview` | C11–C13 | Minh bạch "dữ liệu nào đã gửi lên" (FR-PS-07) |
| `TestSession` | `status`, `formSignature`, `levelSource`, `sourceText`, `startedAt`, `endedAt` | C17–C22 | Đề song song (FR-LT-12), timer, ước lượng level |
| `TestItem` | `explanation`, `flagged`, `rubric`, `scored` | C23–C26 | Chấm câu tự luận 4 nhóm lỗi, cờ xem lại |
| `Review` | `source` | C27 | Phân biệt lượt ôn SRS vs lượt do bài kiểm tra đẩy thẻ về ôn |
| `InterviewSession` | `activityId` | C28 | Khoá 1–1 tới `Activity` — idempotency tạo Evidence |

**→ Quyết định (mặc định đã chọn):** chấp nhận toàn bộ.
**→ Quyết định của bạn:** ______________________

---

## Q5 — ~~Câu hỏi còn mở từ SPEC.md §10~~ → **ĐÃ CHỐT**

> **Nguồn chân lý: [`steering/user-profile-decisions.md`](steering/user-profile-decisions.md)**
> (8 câu trả lời của chủ sở hữu, chốt 2026-10-30). Tóm tắt:

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Lĩnh vực chuyên môn | **Java Backend Developer** — cây kỹ năng seed 8 nhánh: Java Core & Collections · JVM & Hiệu năng · Spring Boot · Truy cận dữ liệu (JPA/Hibernate) · System Design · Luyện tập kỹ năng · Hệ sinh thái & vận hành |
| Q2 | Ngôn ngữ luyện | **3 ngôn ngữ chọn theo chế độ**: `en` · `zh` · `vi`. Tiếng Việt dùng để luyện nói/giao tiếp, **không có SRS deck** |
| Q3 | Trình độ thật | EN → **A1** (vài từ cơ bản) · ZH → **zero** (chưa biết gì) · VI → **B2** (bản ngữ). Hệ level thống nhất: `zero·A1·A2·B1·B2·C1·C2` |
| Q4 | Mục tiêu thời gian | **Không deadline cứng** — AI đề xuất lộ trình 3 giai đoạn, mỗi giai đoạn có **tiêu chí hoàn thành đo được** |
| Q5 | Dữ liệu có sẵn | **Không có** — bắt đầu từ số 0 |
| Q6 | Mock interview | **AI Interview Studio** — 3 loại phiên (`skill_drill`/`interview_loop`/`partner_sim`), nhiều phiên, **≥3 gợi ý phiên cụ thể** có `whyNow` dẫn chứng Evidence |
| Q7 | Chuẩn ngoại ngữ | **CEFR đầy đủ** `A1–C2` + cột tương đương **HSK** cho tiếng Trung. Chọn chuẩn theo chế độ |
| Q8 | Kỳ thi | **Chưa chốt** → thêm mô hình **Mục tiêu sắp tới** (`UpcomingGoal`): kỳ thi / chứng chỉ / vị trí / kỹ năng. AI ưu tiên theo `priority`, đo gap tới `targetLevel`, và **đề xuất mục tiêu mới** khi chưa có |

## Q6 — Bảng giá Anthropic trong `settings-cost` là giả định

**Vấn đề.** `settings-cost` dùng giá `claude-opus-5` $5/$25 và `claude-haiku-4-5` $1/$5 mỗy 1M token — lấy từ SPEC §5.7.
Giá thực tế có thể khác ⇒ bảng "Chi phí AI" hiển thị sai.

**→ Quyết định (mặc định đã chọn):** dùng giá trong `src/lib/costs.ts` là **cấu hình**, có task bắt buộc đối chiếu
giá niêm yết trước khi code (task 34.5 của `settings-cost/tasks.md`).

**→ Quyết định của bạn:** ______________________

---

## Q7 — Prototype có số liệu minh hoạ giả (`$0.024`, `91.4%`, `1.429 bản ghi`)

**Vấn đề.** 21 prototype chứa số liệu minh hoạ không có nguồn. Nếu copy vào UI sẽ vi phạm P7.

**→ Quyết định (mặc định đã chọn):** **không** copy số liệu từ prototype. Mọi số liệu phải tính từ
`AiCall` / `Activity` / `Evidence` / `DailyState` thật. Prototype chỉ dùng để lấy **bố cục, nhãn, token màu**.

**→ Quyết định của bạn:** ______________________

---

## Checklist khi chốt

- [ ] Sửa dòng **→ Quyết định** của các mục áp dụng
- [ ] Chạy `python3 .kiro/scripts/validate_specs.py` → phải PASS
- [ ] Cập nhật `system-design/SPEC.md` §4 nếu Q3 được duyệt (thêm `SrsSession`, `LanguagePattern`)
- [ ] Bắt đầu Phase 0 theo `specs/ai-foundation/tasks.md` → `daily-loop-core/tasks.md`
