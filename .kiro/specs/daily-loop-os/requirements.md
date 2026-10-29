# Requirements Document — Daily Loop OS

> **Feature slug:** `daily-loop-os`
> **Nguồn thiết kế:** `stitch_daily_loop_os/` — 21 màn hình Stitch (`s01`…`s21`, mỗi màn hình gồm `code.html` + `screen.png`) + design system `stitch_daily_loop_os/focus_flow/DESIGN.md`
> **Đặc tả gốc:** `SPEC.md` (1445 dòng) — nguồn cho mã FR/AC, data model, rủi ro
> **Steering:** `.kiro/steering/{product.md, tech.md, structure.md}`
> **Trạng thái:** Draft · Đã bao phủ 21/21 màn hình

---

## 1. Introduction

### 1.1 Vấn đề

Một người đang làm việc phải đồng thời theo dõi **4 mảng song song**: kỹ năng chuyên môn, giao tiếp, ngoại ngữ (Tiếng Trung + Tiếng Anh từ con số 0), và sức khoẻ/thể chất tinh thần. Các công cụ hiện có (todo app, flashcard app, habit tracker, AI chat) là **4 app riêng**, dẫn tới:

- Dữ liệu rời rạc — không trả lời được câu hỏi "hôm nay tôi nên làm gì?"
- Tiến bộ là **vanity metric** ("đã học 47 tiếng") — không gắn với hành động cụ thể
- AI bị dùng như chatbot (hỏi–đáp) thay vì **người chấm điểm**
- Không có vòng đóng: chấm xong rồi rơi vào hư không, không quay lại kế hoạch

### 1.2 Giải pháp

**Daily Loop OS** là một ứng dụng web **local-first**, **single-user**, có **một màn hình quyết định hôm nay** (S01). Mọi hoạt động của 4 domain đổ vào **cùng một vòng lặp ngày**:

```
Học (Input) → Luyện (Practice) → Chấm (Feedback) → Ghi (Reflect) → Đo (Track)
   ↑                                                                        │
   └──────────────── Tuần sau AI điều chỉnh kế hoạch ◄───────────────────┘
```

AI **không phải chatbot** — AI là **người chấm điểm theo rubric cố định** và **người phân tích**, không tự bịa tiêu chí.

**Bối cảnh AI — AI router hybrid (không phải Anthropic-only):**

```
route handler → lib/ai/router.ts → route(task) → { provider: "local" | "anthropic", model, effort }
                                              ├─ local     → Ollama HTTP (0 token, offline-safe)
                                              └─ anthropic → Anthropic SDK (streaming + prompt cache)
```

| Provider | Model | Dùng cho | Chi phí |
|---|---|---|---|
| **Local (Ollama)** | `qwen2.5:7b`, `llama3.3`, `qwen2.5-coder:7b-instruct` | phân loại nhanh, autofill quick-log, sửa lỗi ngữ pháp, tổng hợp thống kê | **0 token** |
| **Cloud (Anthropic)** | `claude-opus-5` (chấm điểm / sinh kế hoạch / mock / báo cáo) · `claude-haiku-4-5` (phân loại) · `Claude 3.5 Sonnet / Opus` (dự phòng) | chấm rubric, sinh nội dung dài, role-play | có |

- **Fallback chain bắt buộc:** `anthropic lỗi → local → rule cục bộ`. Không bao giờ trả lỗi trần cho UI.
- **Prompt caching là yêu cầu kiểm chứng được**, không phải tối ưu sau: badge `Prompt Cache Engine: ACTIVE` + `Cache Hit Rate 91.4%` ở S15.
- App **chạy được hoàn toàn khi không có key nào** (chế độ offline) — thiếu key thì dùng local model hoặc rule cục bộ, **không bao giờ giả lập phản hồi AI**.

**Hai vòng đóng bắt buộc** (nếu cắt một trong hai, app chỉ còn là tracker):

1. **FR-LT-06 — Bài kiểm tra → SRS:** câu sai → thẻ SRS bị đẩy về `due = hôm nay`, `lapses` tăng → S10 ôn ngay.
2. **FR-MI-08 / FR-MI-10 — Mock interview → Evidence:** phiên mock → `Evidence` cho kỹ năng trọng tâm → S03 cây kỹ năng tăng level → đề xuất luyện tiếp quay lại S01.

### 1.3 Mục tiêu

| # | Mục tiêu | Đo được bằng |
|---|---|---|
| G1 | Người dùng biết chính xác phải làm gì hôm nay trong ≤10 giây | Thời gian từ mở app → bắt đầu slot đầu tiên |
| G2 | Ghi nhận một hoạt động trong ≤10 giây | Timer đo trong S05 (mục tiêu ≤10s, TB 4.8s) |
| G3 | Tiến bộ chỉ tính khi có bằng chứng kiểm thử | Tỷ lệ node có `level > 0` mà không có `Evidence` = 0 |
| G4 | AI chấm điểm nhất quán, có thể so sánh giữa các kỳ | Rubric cố định trong `lib/rubrics.ts`, điểm theo thang 0–5 |
| G5 | Hai vòng đóng hoạt động | FR-LT-06 (bài kiểm tra → SRS) và FR-MI-08 / FR-MI-10 (mock → Evidence → cây kỹ năng) |
| G6 | Dữ liệu cá nhân không rời máy | Nhật ký truy cập dữ liệu đã gửi lên (S15) + cờ `STRICT_LOCAL` |
| G7 | Không phụ thuộc dịch vụ ngoài để hoạt động cốt lõi | Mất mạng → vẫn ghi được, vẫn ôn được, vẫn log được |

### 1.4 Phạm vi

**Trong phạm vi (Phase 0 → 2)** — 21 màn hình:

| Domain | Màn hình |
|---|---|
| Daily Loop | S01 Hôm nay · S02 Thiết lập kế hoạch AI |
| Kỹ năng | S03 Cây kỹ năng & Bằng chứng · S04 Chi tiết kỹ năng |
| Ghi chép | S05 Quick-log sheet (≤10s) |
| Nhật ký | S06 Nhật ký & AI phản hồi |
| Giao tiếp | S07 Luyện giao tiếp (Viết) · S08 Luyện giao tiếp (Nói) |
| Ngoại ngữ | S09 Trung tâm SRS · S10 Ôn tập FSRS · S11 Luyện ngoại ngữ chủ động |
| Cá nhân | S12 Đánh giá chính & sinh trắc |
| Báo cáo | S13 Báo cáo tuần · S14 Báo cáo tiến bộ |
| Hệ thống | S15 Cài đặt & chi phí AI |
| Phỏng vấn | S16 Cấu hình · S17 Phiên · S18 Báo cáo |
| Khảo thí | S19 Trung tâm khảo thí · S20 Phiên thi · S21 Kết quả |

**Ngoài phạm vi:** multi-user · cloud sync · mobile native (PWA ở Phase 3) · tích hợp bên thứ ba · gamification nặng · sức khoẻ chuyên sâu · domain thứ 5.

### 1.5 Nguyên tắc bất di bất dịch

| # | Nguyên tắc | Hệ quả thiết kế |
|---|---|---|
| P1 | Một màn hình quyết định hôm nay | S01 là trang chủ. Không có dashboard tổng hợp nhiều tab. |
| P2 | Ghi nhập dưới 10 giây | Quick-log 2 chạm; AI điền sẵn form; đo được. |
| P3 | Tiến độ = bằng chứng, không phải checkbox | Mỗi hoạt động tạo `Evidence` gắn với một kỹ năng. Cấm "% hoàn thành" tự khai. |
| P4 | AI chấm theo rubric cố định | Rubric nằm trong `lib/rubrics.ts`, nhúng vào system prompt. AI không tự bịa tiêu chí. |
| P5 | Không thêm domain thứ 5 | Domain đóng băng: professional, communication, language, personal. |
| P6 | Local-first | SQLite trên máy. Dữ liệu cá nhân không rời máy trừ khi người dùng chủ động nhờ AI. |
| P7 | Không có vanity metric | Cấm số liệu không dẫn tới hành động. |

### 1.6 Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| **Slot** | 1 hành động nhỏ trong kế hoạch ngày. Cấu trúc cố định 6 slot/ngày (`STABLE_SLOTS_V1.1`). |
| **Evidence (Bằng chứng)** | Bản ghi chứng minh một kỹ năng được thực hành, có `rating` 0–5 và hash. Đơn vị đo tiến bộ duy nhất. |
| **Rubric** | Tập tiêu chí chấm điểm cố định, mỗi tiêu chí 0–5. 4 bộ: communication · technical · behavioral · language-errors. |
| **FSRS** | Free Spaced Repetition Scheduler v4.5 (`ts-fsrs`) — lịch ôn thích ứng. |
| **SRS** | Spaced Repetition System — hệ thống ôn tập thưa. |
| **Stability (S)** | Tham số độ ổn định nhớ của FSRS, tính bằng ngày. |
| **Difficulty (D)** | Tham số độ khó của FSRS, thang 1–10. |
| **Lapse** | Số lần quên/lỡ. `lapses` tăng khi chấm `Again`. |
| **Retrievability** | Xác suất nhớ lại được ở thời điểm hiện tại. |
| **Activity** | Bảng trung tâm, domain-agnostic, ghi mọi hoạt động có thước đo. Nền tảng cho phân tích tương quan 1 truy vấn SQL. |
| **Level (0–5)** | Cấp độ kỹ năng. Chỉ tăng khi đủ `Evidence` với `rating ≥ ngưỡng`. |
| **AI router** | Lớp định tuyến duy nhất cho mọi lời gọi AI: `local` (Ollama) hoặc `anthropic`, có fallback chain. |
| **Local (Ollama)** | Model chạy trên máy: `qwen2.5:7b`, `llama3.3`, `qwen2.5-coder:7b-instruct`. Token 0, offline-safe. |
| **Cloud (Anthropic)** | `claude-opus-5` (chấm điểm/sinh nội dung), `claude-haiku-4-5` (phân loại), fallback `claude-3-5-sonnet`. |
| **Prompt cache** | Cơ chế cache prefix của Anthropic; `cache_read_input_tokens` được ghi log để kiểm chứng. |
| **P2 Protocol** | Giao diện ghi nhanh 2 chạm, mục tiêu ≤10 giây. |
| **Wind-down Zone** | Khung giờ ≥21:00, bảo vệ mục tiêu giấc ngủ 7.2h. |
| **Chronotype** | Kiểu nhịp sinh học; dùng để xếp slot theo đỉnh năng lượng (08:30–11:30). |
| **E2EE** | End-to-end encryption — mã hoá dữ liệu lưu cục bộ, không gửi lên cloud. |
| **STRICT_LOCAL** | Chế độ cam kết bảo mật của S12: không dữ liệu sinh trắc nào rời máy. |

---

## 2. User Stories & Acceptance Criteria

> **Cú pháp EARS** dùng trong tài liệu này:
> - **Ubiquitous:** `THE SYSTEM SHALL …`
> - **Event-driven:** `WHEN <trigger> THE SYSTEM SHALL …`
> - **State-driven:** `WHILE <state> THE SYSTEM SHALL …`
> - **Optional feature:** `WHERE <feature is enabled> THE SYSTEM SHALL …`
> - **Unwanted behaviour:** `IF <condition> THEN THE SYSTEM SHALL …`

---

### 2.1 US-01 — Tôi biết hôm nay mình phải làm gì

> **Story 1:** As a người dùng đang làm việc, I want mở app và thấy ngay 6 hành động nhỏ của hôm nay đã được xếp theo thứ tự và gắn nhãn domain, so that tôi không phải tự lập kế hoạch mỗi sáng và không bị phân tâm.

**Màn hình:** S01 (`/`) · S02 (`/plan`)

#### Acceptance Criteria

- **1.1** THE SYSTEM SHALL hiển thị tối đa **6 slot hành động** cho ngày hiện tại trên S01, theo thứ tự thời gian, mỗi slot mang nhãn domain.
- **1.2** THE SYSTEM SHALL hiển thị mỗi slot với: nhãn domain, tiêu đề hành động, mô tả ngắn ≤120 ký tự, thời lượng dự kiến (phút), và kỹ năng liên quan nếu có.
- **1.3** WHEN người dùng bấm nút **Xong** trên một slot, THE SYSTEM SHALL tạo 1 bản ghi `Activity` với `domain` và `type` tương ứng, tạo 1 `Evidence` gắn vào skill node nếu slot có gắn kỹ năng, và đánh dấu `PlanItem` là `done`.
- **1.4** WHEN người dùng bấm **Hoàn thành nhanh** trên một slot, THE SYSTEM SHALL mở Quick-log (S05) với slot đó được chọn sẵn.
- **1.5** THE SYSTEM SHALL hiển thị **chuỗi ngày liên tiếp (streak)** và **năng lượng tuần (0–100%)** tính từ tỷ lệ hoàn thành của 7 ngày gần nhất.
- **1.6** THE SYSTEM SHALL hiển thị widget **FSRS Retrievability** gồm: retention hiện tại (%), độ ổn định TB (ngày), độ khó TB (/10), và đường cong suy giảng trí nhớ 7 ngày.
- **1.7** WHEN chưa có kế hoạch cho hôm nay, THE SYSTEM SHALL hiển thị CTA **Lập kế hoạch hôm nay** gọi AI, kèm fallback rule cục bộ khi không có API key.
- **1.8** WHEN người dùng bấm **Lập lại kế hoạch hôm nay (AI)**, THE SYSTEM SHALL sinh lại 6 slot qua AI-01 và **giữ nguyên các slot đã hoàn thành**.
- **1.9** WHEN người dùng bấm **Cân chỉnh lại hôm nay**, THE SYSTEM SHALL sinh lịch mới dựa trên năng lượng hiện tại, số nhiệm vụ đã chốt và số thẻ FSRS quá hạn, đồng thời hiển thị 2 lựa chọn **Giữ nguyên** / **Áp dụng lịch trình mới**.
- **1.10** WHEN một ngày mới bắt đầu, THE SYSTEM SHALL **không xóa** kế hoạch cũ; lịch sử theo ngày và xem lại được bất kỳ ngày nào.
- **1.11** WHEN người dùng mở S02, THE SYSTEM SHALL hiển thị **6 khối thời gian** theo template `STABLE_SLOTS_V1.1`, cho phép **kéo để đổi thứ tự ưu tiên**, **sửa inline** tiêu đề/thời lượng, và **đổi kỹ năng** gắn với slot.
- **1.12** THE SYSTEM SHALL **không cho AI thay đổi cấu trúc 4 trục thực thi** (Chuyên môn · Giao tiếp · Ngoại ngữ · Cá nhân); AI chỉ điền nội dung và tối ưu thời lượng.
- **1.13** THE SYSTEM SHALL hiển thị tổng thời lượng cam kết (chuẩn P1 = 120 phút) và tự cân bằng khi người dùng sửa thời lượng slot.
- **1.14** THE SYSTEM SHALL hiển thị **Ràng Buộc Sinh Học**: biểu đồ dự phóng năng lượng theo khung giờ, đánh dấu slot đã được xếp vào đỉnh năng lượng cao nhất.
- **1.15** WHEN người dùng bấm **Duyệt & Áp dụng Kế hoạch** trên S02, THE SYSTEM SHALL ghi 6 slot vào `PlanItem` và chuyển hướng về S01.
- **1.16** THE SYSTEM SHALL hỗ trợ phím tắt `Ctrl/Cmd + Enter` để duyệt kế hoạch.
- **1.17** WHEN người dùng không có `ANTHROPIC_API_KEY` và Ollama không khả dụng, THE SYSTEM SHALL sinh kế hoạch bằng **rule cục bộ** (`lib/plan.ts`) theo cùng template 6 slot.

---

### 2.2 US-02 — Tôi thấy tiến bộ của mình là bằng chứng thật

> **Story 2:** As a người dùng, I want xem cây kỹ năng 4 domain với mỗi node có mức độ 0–5 và danh sách bằng chứng kiểm thử kèm theo, so that tôi tin được con số thay vì tự khai "% hoàn thành".

**Màn hình:** S03 (`/skills`) · S04 (`/skills/[id]`)

#### Acceptance Criteria

- **2.1** THE SYSTEM SHALL hiển thị cây kỹ năng 3 tầng: **Domain → Kỹ năng → Mục kỹ năng con** (ví dụ `Chuyên môn → System Design → Phân tích yêu cầu`).
- **2.2** THE SYSTEM SHALL hiển thị đúng **4 domain**: Chuyên môn · Giao tiếp · Ngoại ngữ · Cá nhân.
- **2.3** THE SYSTEM SHALL hiển thị mỗi node với `level` hiện tại (0–5), `targetLevel`, và số bằng chứng xác thực.
- **2.4** THE SYSTEM SHALL **không tự tăng level từ checkbox**. Level chỉ tăng khi tích lũy đủ `Evidence` với `rating ≥ ngưỡng` (mặc định 3).
- **2.5** THE SYSTEM SHALL hiển thị **thang 0–5 + số bằng chứng**, không dùng phần trăm mơ hồ.
- **2.6** THE SYSTEM SHALL cho phép **thêm mục con** cho bất kỳ kỹ năng nào (tên, domain, mục cha, mức mục tiêu).
- **2.7** THE SYSTEM SHALL cho phép **đánh dấu 1 node là "Trọng tâm hôm nay"** (duy nhất 1 node/ngày), và thuật toán Daily Loop ưu tiên đẩy bài tập/SRS/mock của node đó vào ca làm việc chính.
- **2.8** THE SYSTEM SHALL hiển thị **feed bằng chứng gần đây** dạng timeline, mỗi dòng gồm: thời gian, `rating`, tiêu đề hoạt động, loại hoạt động, và liên kết điều hướng.
- **2.9** THE SYSTEM SHALL cho phép xem **toàn bộ lịch sử bằng chứng** (không giới hạn 4 dòng mới nhất).
- **2.10** THE SYSTEM SHALL hiển thị trên S04: cấp độ hiện tại, mục tiêu, số bằng chứng, tỷ lệ verified, thời gian tích lũy, điểm trung bình, biểu đồ tích lũy theo tuần, và phân bổ hoạt động theo danh mục.
- **2.11** THE SYSTEM SHALL hiển thị **Tiêu chuẩn thăng cấp** dạng checklist với ngưỡng cụ thể (ví dụ Level 3 cần 10 bằng chứng ≥3★, rating TB ≥3.5, ≥2 hoạt động mock interview).
- **2.12** WHEN người dùng bấm **+ Ghi bằng chứng (≤10s)** trên S04, THE SYSTEM SHALL mở Quick-log với skill node đó được chọn sẵn.
- **2.13** WHEN người dùng bấm **Tạo slot luyện tập ngày mai**, THE SYSTEM SHALL tạo 1 `PlanItem` cho ngày mai gắn với skill node hiện tại.
- **2.14** THE SYSTEM SHALL hiển thị **Lỗ hổng phân tích được** — phân tích bằng chứng gần đây phát hiện kịch bản chưa phủ (ví dụ mới chỉ làm Happy Path) — kèm **đề xuất bài tập thực chiến** và thời lượng dự kiến.
- **2.15** THE SYSTEM SHALL ghi mỗi bằng chứng kèm **hash vector ngữ nghĩa** (`HASH#xxxxx`) và trạng thái SQLite (`SQLite State`) để chống sửa đổi.
- **2.16** THE SYSTEM SHALL cho phép **mở bằng chứng** (thao tác `open_in_new`) để xem nội dung chứng minh đầy đủ.

---

### 2.3 US-03 — Tôi ghi lại việc tôi vừa làm trong 10 giây

> **Story 3:** As a người dùng đang làm việc, I want ghi nhanh một hoạt động chỉ bằng 2 chạm và để AI tự đoán domain/kỹ năng/thời lượng, so that tôi không bỏ cuộc ghi chép vì chi phí thời gian.

**Màn hình:** S05 (`/log`, `/log/history`)

#### Acceptance Criteria

- **3.1** THE SYSTEM SHALL mở Quick-log bằng nút header `+ Ghi nhanh (≤10s)` (mọi màn hình) hoặc phím tắt `⌘K`.
- **3.2** THE SYSTEM SHALL trình bày 2 bước: **Bước 1 chọn nhanh hoặc gõ tự do** → **Bước 2 AI tự phân tích & gợi ý cây kỹ năng**.
- **3.3** THE SYSTEM SHALL cung cấp 6 lựa chọn nhanh (phím `1`–`6`): Học 25' · Luyện tập · Viết · Luyện nói · Nhật ký · Chăm sóc bản thân.
- **3.4** WHEN người dùng gõ tự do vào ô nội dung, THE SYSTEM SHALL hỗ trợ cú pháp nhanh dạng inline chip: `/skill` · `/review` · `/evidence` · `/mood`.
- **3.5** WHEN người dùng chuyển sang Bước 2, THE SYSTEM SHALL gọi AI parse nội dung và trả về: **Lĩnh vực (Domain)**, **Kỹ năng gắn kèm (Skill Node)**, **Thời lượng thực tế**, **Nỗ lực / Độ sâu tư duy (1–4)**, kèm `confidence`.
- **3.6** THE SYSTEM SHALL cho phép **Sửa** trường Domain trước khi lưu.
- **3.7** WHEN người dùng xác nhận, THE SYSTEM SHALL tạo **1 `Activity`** + **1 `Evidence`** tự động gắn vào skill node đã chọn, và hiển thị XP cộng thêm (ví dụ `+45 XP`).
- **3.8** THE SYSTEM SHALL hiển thị **timer đo thời gian thao tác** (`Ready 00:00s` → `Ghi nhận trong 3.2s`) và cảnh báo khi vượt 10 giây.
- **3.9** THE SYSTEM SHALL hiển thị **lịch sử hoạt động hôm nay** dạng timeline, mỗi dòng gồm giờ, domain, thời lượng, mô tả, skill node, độ khó ★, và cờ `Evidence`.
- **3.10** THE SYSTEM SHALL hỗ trợ lọc lịch sử theo domain (Tất cả · Chuyên môn · Ngoại ngữ · Giao tiếp · Cá nhân).
- **3.11** WHEN người dùng nhấn `Enter` trong ô nội dung, THE SYSTEM SHALL lưu ngay theo P2 Protocol.
- **3.12** WHEN người dùng nhấn `⌘Enter`, THE SYSTEM SHALL lưu **chi tiết + đóng sheet**.
- **3.13** THE SYSTEM SHALL hiển thị footer cam kết **Zero Cloud Latency Guarantee** — ghi lập tức vào SQLite cục bộ, không qua trung gian.
- **3.14** THE SYSTEM SHALL hiển thị **phân bổ nỗ lực trong ngày** (tổng phút + theo domain) ở chế độ đọc.
- **3.15** THE SYSTEM SHALL cho phép mở lại sheet từ lịch sử (nút `Mở lại Sheet (⌘K)`) — hành vi này **toggle mở/đóng sheet**, không chỉ focus vào ô nhập.

---

### 2.4 US-04 — Tôi suy ngẫm cuối ngày và nhận được phản hồi sắc bén

> **Story 4:** As a người dùng, I want viết nhật ký tự do với gợi ý câu hỏi theo ngữ cảnh và nhận về một tóm tắt cùng **một câu hỏi sắc** từ AI, so that tôi bị thúc đẩy để nhìn lại thay vì đọc một lời khuyên dài dòng.

**Màn hình:** S06 (`/journal`)

#### Acceptance Criteria

- **4.1** THE SYSTEM SHALL cung cấp trình soạn thảo Markdown có bộ đếm ký tự và nhãn `Markdown hỗ trợ`.
- **4.2** THE SYSTEM SHALL cung cấp **3 gợi ý câu hỏi đào sâu** theo ngữ cảnh (sau buổi học / cuối ngày / cuối tuần), bấm được để chèn vào nhật ký.
- **4.3** THE SYSTEM SHALL hiển thị **timer ghi** (`14m 20s đang viết`) và **tự đếm tiến**.
- **4.4** WHEN người dùng bấm **Lưu bản nháp cục bộ (Offline)**, THE SYSTEM SHALL ghi bản nháp vào SQLite mà **không** gửi lên cloud.
- **4.5** WHEN người dùng bấm **Gửi AI phản hồi**, THE SYSTEM SHALL gửi **duy nhất đoạn văn bản người dùng chủ động gửi** tới `claude-opus-5` và nhận về: **Tóm tắt cốt lõi** (1 câu) + **Câu hỏi sắc bén (Tự chất vấn)** (1 câu).
- **4.6** THE SYSTEM SHALL cho phép **Ghi câu trả lời** cho câu hỏi sắc bén, lưu thành một entry nhật ký nối tiếp.
- **4.7** THE SYSTEM SHALL chạy **Phân loại tự động** song song (model `claude-haiku-4-5`) trả về các chip category + `confidence`.
- **4.8** WHEN AI đề xuất tạo bằng chứng (ví dụ `+1 Bằng chứng tư duy đánh đổi kiến trúc`), THE SYSTEM SHALL hiển thị nút **Chấp nhận** để tạo `Evidence` gắn vào skill node tương ứng.
- **4.9** THE SYSTEM SHALL hiển thị **Đối chiếu Nhật ký gần đây** — 3 entry gần nhất, mỗi entry có ngày, chip domain, trích đoạn (clamp 2 dòng) và dòng nhận xét AI nếu có.
- **4.10** THE SYSTEM SHALL hiển thị **Xu hướng suy ngẫm 7 ngày** (tính nhất quán %, delta so với tuần trước).
- **4.11** THE SYSTEM SHALL hiển thị banner cam kết bảo mật: *"Chỉ đoạn văn bản được bạn chủ động gửi mới chuyển đến Claude Opus 5"* kèm trạng thái `Encrypted` và `SQLite: Encrypted DB Connected`.
- **4.12** THE SYSTEM SHALL hỗ trợ phím tắt `Ctrl/Cmd + Enter` để gửi AI.

---

### 2.5 US-05 — Tôi luyện giao tiếp viết và nhận được điểm theo rubric cố định

> **Story 5:** As a người dùng cần luyện viết công sở bằng tiếng Anh, I want viết bài theo một đề có sẵn ở level CEFR, nhận điểm 5 tiêu chí và **1 đề xuất sửa cụ thể**, so that tôi biết chính xác cần cải thiện điều gì và có thể cam kết bằng chứng vào cây kỹ năng.

**Màn hình:** S07 (`/speak/write`)

#### Acceptance Criteria

- **5.1** THE SYSTEM SHALL hiển thị **đề bài thực hành hiện tại** kèm ngôn ngữ đích, level CEFR hiện hành và thời gian khuyến nghị.
- **5.2** THE SYSTEM SHALL cho phép chọn level CEFR **A1 / A2 / B1 / B2 / C1**; level đã chọn là state thật, điều khiển cả bộ lọc kho đề lẫn ngưỡng kỳ vọng của rubric.
- **5.3** THE SYSTEM SHALL cung cấp trình soạn thảo Markdown với toolbar định dạng (In đậm / In nghiêng / Trích dẫn / Danh sách), nhãn `Markdown Enabled`, và **bộ đếm từ cập nhật trực tiếp** khi gõ.
- **5.4** THE SYSTEM SHALL hiển thị trạng thái **tự động lưu nháp** kèm mốc thời gian.
- **5.5** WHEN người dùng bấm **Chấm bằng AI (Claude Opus 5)** (hoặc `Ctrl/Cmd + Enter`), THE SYSTEM SHALL gửi `{ draft, cefrLevel, rubricVersion: "P4 Professional" }` và nhận về điểm 5 tiêu chí.
- **5.6** THE SYSTEM SHALL hiển thị **5 tiêu chí rubric chuẩn hoá**, mỗi tiêu chí gồm nhãn, điểm 0–5, verdict và 1 câu nhận xét: ① Rõ ràng (Clarity & Purpose) ② Cấu trúc (Structure & Cohesion) ③ Giọng văn (Tone & Register) ④ Độ tự nhiên (Natural Collocation) ⑤ Ngữ pháp & Từ vựng (Grammar & Range).
- **5.7** THE SYSTEM SHALL hiển thị **điểm tổng** trên radial meter (SVG `stroke-dasharray`), và điểm tổng **bằng đúng trung bình cộng của 5 tiêu chí**.
- **5.8** THE SYSTEM SHALL hiển thị **chuẩn đạt** (`Đạt chuẩn giao tiếp` / `Cần rèn luyện`), **mức sẵn sàng CEFR** (ví dụ `B2 Ready`), **độ tin cậy %** và **chuẩn đánh giá** (`P4 Professional`).
- **5.9** WHEN có bài viết trước cùng tiêu chí, THE SYSTEM SHALL hiển thị **delta** (ví dụ `▲ +0.4 so với bài viết ngày 22/10`).
- **5.10** THE SYSTEM SHALL hiển thị **đúng 1 đề xuất cải thiện** gồm: bản hiện tại (gạch ngang, màu error) → bản đề xuất (màu primary) → lý do.
- **5.11** THE SYSTEM SHALL hiển thị **Kho đề luyện nhanh** — bộ sưu tập đề có `{id, cefr, genre, title, skillTags}`; con số badge phải khớp với số đề thực sự tải được.
- **5.12** WHEN người dùng bấm một thẻ đề trong kho, THE SYSTEM SHALL nạp đề đó vào editor và cập nhật level CEFR tương ứng.
- **5.13** THE SYSTEM SHALL hiển thị card **Xác thực bằng chứng (Evidence)** với: skill path (`Giao tiếp → Viết (Email đối ngoại & Quản trị)`), `Rating`, định danh phiên `#EV-YYYYMMDD-S07`, dung lượng, thời gian chấm.
- **5.14** WHEN người dùng bấm **Chấp nhận & Cập nhật Cây kỹ năng**, THE SYSTEM SHALL tạo 1 `Evidence` gắn vào node giao tiếp viết, đặt `evidenceId` theo phiên, và **cho phép hoàn tác** (undo).
- **5.15** WHEN người dùng bấm **Chỉnh sửa thêm**, THE SYSTEM SHALL mở form sửa bằng chứng (rating, nội dung, skill node) trước khi commit.
- **5.16** THE SYSTEM SHALL hiển thị nút header `+ Ghi nhanh (≤10s)` với `data-path` trỏ về S05 — **giống hệt mọi màn hình khác** (sửa lỗi thiếu `data-path` trong bản tham chiếu).

---

### 2.6 US-06 — Tôi luyện nói kỹ thuật và AI chấm được cả nội dung lẫn cách diễn đạt

> **Story 6:** As a người dùng cần luyện pitching kỹ thuật, I want ghi âm trong một khoảng thời gian giới hạn và nhận điểm 5 tiêu chí kèm nhận xét về nhịp nói, từ điệu và filler words, so that tôi rèn được cả nội dung lẫn cách trình bày.

**Màn hình:** S08 (`/speak/talk`)

#### Acceptance Criteria

- **2.1 → 6.1** THE SYSTEM SHALL hiển thị tình huống luyện (bài tập, target level, giới hạn thời gian) cùng **kho tình huống role-play** gồm `{id, duration, title, description, level, tag}`.
- **6.2** WHEN người dùng bấm **Bắt đầu**, THE SYSTEM SHALL mở chế độ ghi âm (MediaRecorder, 48kHz stereo) với đồng hồ đếm ngược và **tự động ngắt khi chạm giới hạn** (ví dụ 01:00).
- **6.3** WHILE đang ghi, THE SYSTEM SHALL hiển thị **mức tín hiệu mic** (peak dBFS) và trạng thái nguồn vào.
- **6.4** WHILE đang ghi, THE SYSTEM SHALL hiển thị **bản ghi thời gian thực (Live STT Transcript)** qua Web Speech API, hiển thị phần interim ở màu phụ và phần đã xác nhận ở màu chính.
- **6.5** WHEN người dùng bấm **Tạm dừng**, THE SYSTEM SHALL dừng ghi mà giữ nguyên thời gian đã ghi.
- **6.6** WHEN người dùng bấm **Thu lại từ đầu**, THE SYSTEM SHALL xoá bản ghi hiện tại và đặt lại đồng hồ về 00:00.
- **6.7** WHEN người dùng bấm **Gửi AI Chấm & Phân tích âm vị** (hoặc `Ctrl/Cmd + Enter`), THE SYSTEM SHALL gửi transcript + chỉ số âm thanh tới `claude-opus-5` và nhận về bảng điểm 5 tiêu chí.
- **6.8** THE SYSTEM SHALL hiển thị **5 tiêu chí nói**: ① Rõ ràng & Tốc độ nói (Pacing) ② Cấu trúc & Logic (Structure) ③ Giọng văn & Sự tự tin (Tone) ④ Tự nhiên & Ngữ điệu (Prosody) ⑤ Phát âm kỹ thuật (Phonetics) — mỗi tiêu chí kèm nhận xét chi tiết.
- **6.9** THE SYSTEM SHALL hiển thị **Phân tích Filler Words & Nhịp thở**: số lần ậm ừ, mốc thời gian, và khuyến nghị huấn luyện viên cụ thể.
- **6.10** THE SYSTEM SHALL hiển thị **Từ vựng kỹ thuật được tự động bắt cặp** (đối chiếu từ điển kiến trúc phần mềm) kèm số từ đã nhận diện.
- **6.11** WHEN người dùng bấm **Chấp nhận & Ghi nhận 1 Evidence vào Cây kỹ năng**, THE SYSTEM SHALL tạo `Evidence` cho node `Giao tiếp → Nói / Architecture Pitching` với rating = điểm tổng.
- **6.12** THE SYSTEM SHALL hiển thị số liệu kỹ thuật ghi: tần số lấy mẫu, độ trễ STT, độ trễ xử lý.
- **6.13** THE SYSTEM SHALL hỗ trợ `Ctrl/Cmd + Enter` để gửi chấm.

---

### 2.7 US-07 — Tôi thấy hàng đợi ôn tập và hiểu được FSRS đang làm gì

> **Story 7:** As a người học 2 ngôn ngữ từ con số 0, I want xem rõ hàng đợi ôn tập, chỉ số giữ lại và trạng thái từng cụm từ vựng, so that tôi biết hôm nay học gì và học vì sao.

**Màn hình:** S09 (`/language`)

#### Acceptance Criteria

- **7.1** THE SYSTEM SHALL hiển thị 2 deck (Tiếng Trung zh-CN · Tiếng Anh en-US) với: trạng thái học, số thẻ đang học / đã thuộc / đến hạn, chuỗi ngày, và tỷ lệ nạp.
- **7.2** THE SYSTEM SHALL hiển thị **Hôm Nay Cần Xử Lý** — số thẻ đến hạn, ước tính thời gian, và CTA mở phiên ôn.
- **7.3** THE SYSTEM SHALL hiển thị **6 Nhóm Từ Vựng Cốt Lõi Level 0** (Phụ lục B — HSK1 / CEFR A1 Pre), mỗi nhóm gồm: tên, ví dụ từ, tỷ lệ thuộc, số thẻ, số thẻ đến hạn/lapse, và `S` (stability).
- **7.4** THE SYSTEM SHALL hiển thị **bảng tra cứu thẻ** với cột: mặt trước, mặt sau (nghĩa), `S`, `D`, `Reps`, `Lapses`, hạn ôn kế tiếp — kèm bộ lọc (Tất cả / Đến hạn / Đang học / Đã thuộc / Trượt-Lapse) và phân trang.
- **7.5** THE SYSTEM SHALL hiển thị **Chỉ Số Ghi Nhớ FSRS**: retention thực tế %, delta, đường cong phân rã `R(t) = (1 + Factor · t/S)^-w`, và các tham số (Request Retention, Maximum Interval, W-Vector).
- **7.6** THE SYSTEM SHALL hiển thị thẻ dạng `zh` với **mặt trước = pinyin/hanzi**, `en` với **mặt trước = từ + IPA**.
- **7.7** WHEN người dùng bấm **Xuất Deck JSON**, THE SYSTEM SHALL tải file JSON chứa toàn bộ thẻ + state FSRS của deck đó.
- **7.8** WHEN người dùng bấm **Thêm thẻ thủ công**, THE SYSTEM SHALL mở form nhập thẻ mới với đầy đủ field theo FR-LG-01.
- **7.9** THE SYSTEM SHALL hiển thị nhãn thuật toán `FSRS v4.5 (ts-fsrs)` và trạng thái `SQLite Cục bộ (Offline)`.

---

### 2.8 US-08 — Tôi ôn thẻ và hệ thống tự tính lịch ôn tiếp theo

> **Story 8:** As a người học, I want ôn thẻ với 4 nút chấm Again/Hard/Good/Easy và xem khoảng cách lượt ôn kế tiếp trước khi bấm, so that tôi học đúng nhịp trí nhớ thay vì học theo cảm tính.

**Màn hình:** S10 (`/language/session`)

#### Acceptance Criteria

- **8.1** THE SYSTEM SHALL hiển thị mặt trước thẻ với pinyin (zh) hoặc từ + IPA (en) và nút nghe phát âm.
- **8.2** THE SYSTEM SHALL hỗ trợ **chế độ Active Recall**: hiện nghĩa trước, người dùng tự nhớ lại, sau đó mới lật.
- **8.3** THE SYSTEM SHALL cung cấp nút **Kích hoạt gợi nhớ (Active Recall)** và nút **Hiện chữ Hán Hanzi**.
- **8.4** WHEN người dùng lật thẻ, THE SYSTEM SHALL hiển thị mặt sau gồm: hanzi, nghĩa, **gợi ý ngữ cảnh**, **mẫu câu thực tế** (kèm nút nghe), **ghi chú ngữ cảnh**, và `Tính ổn định FSRS: S=…d`.
- **8.5** THE SYSTEM SHALL hiển thị **4 nút chấm FSRS** — `Again (1)`, `Hard (2)`, `Good (3)`, `Easy (4)` — kèm **khoảng cách lượt ôn kế tiếp tính sẵn** đọc từ state FSRS.
- **8.6** WHEN người dùng bấm 1 nút chấm, THE SYSTEM SHALL ghi `rating` vào SQLite, tính lại `S`/`D`/`due` bằng `ts-fsrs`, và tăng `lapses` khi chấm `Again`.
- **8.7** THE SYSTEM SHALL hỗ trợ phím tắt: `Space` lật thẻ, `R` nghe phát âm, `1`–`4` chấm, `H` xem gợi ý ngữ cảnh.
- **8.8** THE SYSTEM SHALL hiển thị **thanh tiến trình phiên** (ví dụ `3/12 thẻ`) và **thống kê phiên** (đã thuộc / đang học / đến hạn, retention rate).
- **8.9** THE SYSTEM SHALL hiển thị đồng hồ phiên (ví dụ `04:18`) và khối **Phím tắt thao tác nhanh**.
- **8.10** WHEN người dùng đánh dấu gợi ý ngữ cảnh, THE SYSTEM SHALL ghi nhận sự kiện để tạo bằng chứng cho domain ngoại ngữ.
- **8.11** THE SYSTEM SHALL lấy **thẻ đến hạn trước**; khi hết thẻ đến hạn thì lấy thẻ mới từ nhóm chưa học, **tối đa 20 thẻ/phiên**.

---

### 2.9 US-09 — Tôi luyện viết ngoại ngữ chủ động và nhận đủ 4 nhóm lỗi

> **Story 9:** As a người học Tiếng Trung từ con số 0, I want viết theo chủ đề có bắt buộc từ vựng và nhận lỗi theo 4 nhóm sư phạm, so that tôi biết chính xác mình sai ở đâu và lỗi đó được ôn lại bằng SRS.

**Màn hình:** S11 (`/language/practice`)

#### Acceptance Criteria

- **9.1** THE SYSTEM SHALL hiển thị chủ đề chủ động với mã (`#ZH-042`), tag (`HSK 3+`), mô tả bài tập, và **danh sách từ khóa bắt buộc** (hanzi + pinyin).
- **9.2** THE SYSTEM SHALL cung cấp khung nhập văn bản hỗ trợ IME (Hanzi + Pinyin / English) kèm bộ đếm **ký tự Hanzi** và **số câu**.
- **9.3** WHEN người dùng nhấn `Ctrl/Cmd + Enter`, THE SYSTEM SHALL chấm tức thì qua `claude-opus-5` (streaming) theo **4 nhóm lỗi**: ① Ngữ pháp ② Từ vựng ③ Cách diễn đạt ④ Ngữ cảnh.
- **9.4** THE SYSTEM SHALL hiển thị **điểm tổng /10** cùng verdict (TỐT / ĐẠT / CẦN CẢI THIỆN) và số điểm cần cải thiện.
- **9.5** THE SYSTEM SHALL hiển thị **Đối Chiếu Trực Quan & Phiên Âm Chuẩn Hóa**: bản gốc của người dùng → bản chuẩn hóa (native fluency) → pinyin → giải thích ngữ pháp từng điểm.
- **9.6** THE SYSTEM SHALL hiển thị **bản chuẩn hóa** kèm nút phát âm mẫu (TTS `zh-CN`).
- **9.7** THE SYSTEM SHALL hiển thị **mục lỗi thường gặp** (ví dụ trật tự từ thời gian) kèm lời khuyên dùng cụ thể.
- **9.8** THE SYSTEM SHALL hiển thị latency + token in/out của lần chấm.
- **9.9** WHEN người dùng bấm **Tạo 2 thẻ Flashcard mới**, THE SYSTEM SHALL tạo 2 thẻ SRS từ lỗi vừa mắc và đưa vào deck, đồng thời ghi 1 `Evidence` cho skill ngoại ngữ.
- **9.10** THE SYSTEM SHALL hiển thị **Vòng Lặp Lưu Giữ Trí Nhớ (AI-10)** — trạng thái tự động hóa, số thẻ tạo, và lịch ôn kế tiếp.
- **9.11** THE SYSTEM SHALL hiển thị **Tab 2: Hội thoại AI Role-Play** (LOCAL VOX) với badge trạng thái.
- **9.12** THE SYSTEM SHALL hiển thị **Mục tiêu ngày** (2/3 bài viết) và **Tỷ lệ chính xác FSRS** ở đầu trang.
- **9.13** WHEN người dùng bấm **Xoá nhập lại**, THE SYSTEM SHALL xoá nội dung editor và đặt lại bộ đếm.

---

### 2.10 US-10 — Tôi ghi lại trạng thái cá nhân trong 15 giây và thấy mối liên hệ với hiệu suất

> **Story 10:** As a người dùng, I want ghi mood/energy/focus/sleep trong 15 giây và thấy hệ thống tự phát hiện quy luật giữa giấc ngủ với số slot hoàn thành, so that tôi điều chỉnh lịch dựa trên dữ liệu của chính mình.

**Màn hình:** S12 (`/state`)

#### Acceptance Criteria

- **10.1** THE SYSTEM SHALL hiển thị 3 slider **có nhãn ngữ nghĩa 5 mức**:
  - **Mood (Tâm trạng):** 1 Kiệt sức · 2 Chùng chình · 3 Ổn định · 4 Tích cực · 5 Thăng hoa
  - **Energy (Năng lượng sinh lý):** 1 Uể oải · 2 Hơi mỏi · 3 Vừa đủ · 4 Tràn đầy · 5 Cực đỉnh
  - **Focus (Mức độ tập trung):** 1 Phân tán · 2 Gián đoạn · 3 Kiểm soát · 4 Rất sâu · 5 Flow State
- **10.2** THE SYSTEM SHALL cho phép nhập **giấc ngủ đêm qua (giờ)** kèm phân rã REM / ngủ sâu / ngủ nông và 1 dòng ghi chú nhịp sinh học tuỳ chọn.
- **10.3** WHEN người dùng bấm **Lưu trạng thái (≤15s)**, THE SYSTEM SHALL ghi 1 bản ghi chỉ số sinh học vào SQLite và hiển thị thời gian thao tác thực tế.
- **10.4** THE SYSTEM SHALL **prefill từ hôm qua** và hiển thị chỉ báo mức độ khớp (ví dụ `Prefill hôm qua: 100% khớp`).
- **10.5** THE SYSTEM SHALL hiển thị **Tương quan sinh học AI** từ engine cục bộ, mỗi quy luật gồm: tên quy luật, tác động định lượng (`+42% Slots` / `-35% Focus`), điều kiện kích hoạt, và khuyến nghị.
- **10.6** THE SYSTEM SHALL hiển thị **Biểu đồ nhịp độ 7 ngày** — 2 trục (Mood/Energy 1–5) và (Slots Daily Loop 0–10) — kèm hệ số tương quan `r`.
- **10.7** THE SYSTEM SHALL hiển thị **Ma trận điểm 7 ngày** cho phép **bấm để sửa nhanh** một ngày bất kỳ.
- **10.8** THE SYSTEM SHALL hiển thị **Khung giờ sinh học lý tưởng** (đỉnh tư duy phân tích) kèm cờ `Active Slot`.
- **10.9** THE SYSTEM SHALL hiển thị cam kết **P6 / STRICT_LOCAL**: dữ liệu sinh trắc chỉ lưu trên SQLite thiết bị, không tải lên cloud, phân tích do engine cục bộ xử lý.
- **10.10** THE SYSTEM SHALL hiển thị 3 stat: **Điểm phục hồi %**, **Ngủ TB (h)**, **Độ ổn định**.
- **10.11** THE SYSTEM SHALL cho phép chuyển cửa sổ phân tích giữa `7 Ngày` và `30 Ngày`.

---

### 2.11 US-11 — Tôi xem báo cáo tuần và nhận 3 nhận định cùng kế hoạch tuần sau

> **Story 11:** As a người dùng, I want mỗi Chủ nhật 20:00 nhận báo cáo tuần có tổng kết định lượng, 3 nhận định AI và kế hoạch tuần sau, so that tôi điều chỉnh hành vi theo bằng chứng chứ không theo cảm giác.

**Màn hình:** S13 (`/review`)

#### Acceptance Criteria

- **11.1** THE SYSTEM SHALL tự tạo báo cáo tuần lúc **Chủ nhật 20:00**, hoặc khi mở app lần đầu trong tuần mới nếu chưa có báo cáo.
- **11.2** THE SYSTEM SHALL hiển thị **4 KPI tổng hợp**: tỷ lệ hoàn thành slot, chuỗi kỷ luật, năng lượng trung bình, FSRS retention rate (kèm số lượt ôn).
- **11.3** THE SYSTEM SHALL hiển thị **Phân bổ 4 Trục Thực Thi** — mỗi trục: số slot hoàn thành / cam kết, phần trăm, nhận xét ngắn, và khuyến nghị điều chỉnh nếu dưới ngưỡng.
- **11.4** THE SYSTEM SHALL hiển thị **Nhịp Độ Năng Lượng & Điểm Slot Trong Tuần** — 7 ngày, mỗi ngày `x/y` slot.
- **11.5** THE SYSTEM SHALL hiển thị **Top 3 Kỹ Năng Bứt Phá** dựa trên bằng chứng, mỗi mục: tên skill, delta level, số bằng chứng tăng, và mô tả.
- **11.6** THE SYSTEM SHALL hiển thị **Chỉ Số Sinh Trắc Học Tuần**: mood TB, focus TB, giấc ngủ TB.
- **11.7** THE SYSTEM SHALL hiển thị **Quy luật tương quan vàng** — quy luật sinh học nổi bật nhất trong tuần.
- **11.8** THE SYSTEM SHALL hiển thị **Khối Nhận Định 3 Điểm** — ① Điều đã làm rất tốt ② Điểm cần sửa ngay ③ Nên thử tuần sau — mỗi mục kèm bằng chứng cụ thể tham chiếu.
- **11.9** THE SYSTEM SHALL hiển thị **Khung Lập Kế Hoạch Động** — 6 slot đề xuất cho tuần sau, mỗi slot có: khung giờ, domain, tiêu đề, mô tả, mục tiêu bằng chứng, và chỉ báo (Focus, Peak Energy, Shield On, Sleep Guard, Retention).
- **11.10** THE SYSTEM SHALL cho phép **chỉnh sửa kế hoạch đề xuất trước khi duyệt**.
- **11.11** WHEN người dùng bấm **Duyệt Tuần 44**, THE SYSTEM SHALL ghi 6 slot vào `PlanItem` cho tuần tới.
- **11.12** THE SYSTEM SHALL áp dụng **quy tắc thích ứng P2**: nếu bất kỳ ngày nào trượt >2 slot, hệ thống tự giãn biên độ ôn SRS và giảm tải slot phụ ngày kế tiếp, kèm ghi chú lý do.
- **11.13** THE SYSTEM SHALL cho phép **Xuất JSON** báo cáo tuần.
- **11.14** THE SYSTEM SHALL hiển thị mã báo cáo dạng `HASH: #REV-2026-W43-FSRS` và trạng thái `Sync State: Local SQLite · Ready`.
- **11.15** THE SYSTEM SHALL có nút **Khôi phục Offline Fallback** để dựng lại báo cáo bằng rule cục bộ khi AI không khả dụng.

---

### 2.12 US-12 — Tôi xem quỹ đạo năng lực 6 tháng và chỉ số thực chiến

> **Story 12:** As a người dùng, I want xem cấp độ kỹ năng theo thời gian cùng mật độ bằng chứng và thời gian thực chiến thật, so that tôi biết mình đang tiến bộ ở đâu và bằng chứng nào.

**Màn hình:** S14 (`/progress`)

#### Acceptance Criteria

- **12.1** THE SYSTEM SHALL hiển thị **Cấp độ kỹ năng bình quân** (0–5) kèm delta so với 30 ngày trước.
- **12.2** THE SYSTEM SHALL hiển thị 4 KPI domain (chuyên môn / giao tiếp / ngoại ngữ / cá nhân) với level hiện tại và mô tả nguồn đo.
- **12.3** THE SYSTEM SHALL hiển thị **Quỹ Đạo Tăng Trưởng Cây Kỹ Năng (6 tháng)** — 4 đường theo domain, trục Lv 1.0–5.0.
- **12.4** THE SYSTEM SHALL hiển thị **Heatmap Tích Lũy Bằng Chứng (90 ngày)** với chú giải màu theo số evidence/ngày, và **không tính** ô không có sản phẩm thực tế.
- **12.5** THE SYSTEM SHALL hiển thị **Tự đối sánh năng lực (T-30 Days Benchmark)** — tốc độ phân tích PRD, tỷ lệ sai ngữ pháp, vốn từ vựng phản xạ — mỗi mục có giá trị trước/sau và delta.
- **12.6** THE SYSTEM SHALL hiển thị **Thực chiến có giá trị** — danh sách hoạt động kèm giờ thực, mô tả sản phẩm, và tỷ trọng % tổng.
- **12.7** THE SYSTEM SHALL hiển thị **tổng thực chiến hữu ích (giờ)** và cờ `100% Focused`.
- **12.8** THE SYSTEM SHALL hiển thị **SHA-256 Digest** của báo cáo và trạng thái lưu trữ SQLite.
- **12.9** WHEN người dùng bấm **Xuất JSON tiến độ**, THE SYSTEM SHALL tải file chứa toàn bộ số liệu báo cáo.
- **12.10** THE SYSTEM SHALL cho phép lọc theo domain (Tất cả / Chuyên môn / Giao tiếp / Ngoại ngữ / Cá nhân) và ẩn/hiện từng nhóm KPI.
- **12.11** THE SYSTEM SHALL hiển thị **chuỗi liên tục dài nhất** và **ngày năng suất nhất**.

---

### 2.13 US-13 — Tôi kiểm soát chi phí AI và biết dữ liệu nào đã gửi lên

> **Story 13:** As a người dùng có giới hạn ngân sách, I want xem chi phí theo tính năng, tỷ lệ cache hit và nhật ký từng lần gọi API, so that tôi biết app tốn bao nhiêu và điều chỉnh khi cần.

**Màn hình:** S15 (`/settings`)

#### Acceptance Criteria

- **13.1** THE SYSTEM SHALL hiển thị trạng thái hệ thống: SQLite version + số record, `Prompt Cache Engine: ACTIVE`, `Local Vault: Sealed`.
- **13.2** THE SYSTEM SHALL hiển thị **ngân sách tháng** (ví dụ `$4.82 / $15.00 limit`), tỷ lệ hạn mức sử dụng, và badge **TỐI ƯU**.
- **13.3** THE SYSTEM SHALL hiển thị **Cache Hit Rate (Prefix)** kèm số token tái sử dụng.
- **13.4** THE SYSTEM SHALL hiển thị **tổng số lượt gọi (AiCall)** — số lượt, số thành công, số offline fallback, độ trễ trung bình.
- **13.5** THE SYSTEM SHALL hiển thị **phân bổ chi phí theo tính năng**: tên tính năng, model, số lượt chạy, chi phí USD, tỷ trăm.
- **13.6** THE SYSTEM SHALL hiển thị **bảng nhật ký gọi API** cột: thời gian, tính năng, model, input token, cache read, output token, chi phí, trạng thái — kèm phân trang và xuất CSV.
- **13.7** THE SYSTEM SHALL cho phép **lọc theo tháng** và **lọc theo tính năng**.
- **13.8** WHEN người dùng nhập API key, THE SYSTEM SHALL ghi vào `.env.local`, **không commit**, và **không hiển thị đầy đủ** trong UI (chỉ hiện trạng thái `Đã kiểm tra: OK (42ms)`).
- **13.9** THE SYSTEM SHALL có nút **Chạy kiểm tra Ping Anthropic Endpoint** báo độ trễ kiểm tra.
- **13.10** THE SYSTEM SHALL hiển thị **chế độ khẩn cấp tiết kiệm**: chỉ dùng Claude Haiku + rule cục bộ khi offline hoặc vượt 80% ngân sách tháng.
- **13.11** THE SYSTEM SHALL cung cấp **Backup & Sao Lưu** — xuất/nhập toàn bộ dữ liệu cục bộ.
- **13.12** THE SYSTEM SHALL **không bao giờ** gửi API key qua máy chủ trung gian hay dịch vụ lưu trữ đám mây.

---

### 2.14 US-14 — Tôi cấu hình một phiên mock interview đúng với vai trò của mình

> **Story 14:** As a người dùng chuẩn bị phỏng vấn, I want chọn hồ sơ vai trò, dạng câu hỏi và độ dài phiên, with hệ thống tự ghim các kỹ năng yếu nhất, so that tôi luyện đúng chỗ đang thiếu bằng chứng.

**Màn hình:** S16 (`/interview/setup`)

#### Acceptance Criteria

- **14.1** THE SYSTEM SHALL hiển thị danh sách **hồ sơ vai trò** với: ngôn ngữ phỏng vấn, seniority, job title, focus skills, số dạng câu, số phiên đã làm, điểm TB — và cho phép **tạo hồ sơ vai trò mới**.
- **14.2** THE SYSTEM SHALL hiển thị **Kỹ Năng Trọng Tâm Từ Cây Kỹ Năng (Smart Focus)** — tự động ghim các node yếu nhất kèm lý do suy giảm bằng chứng (FSRS decay rate).
- **14.3** THE SYSTEM SHALL cho phép **tùy chỉnh chọn node thủ công**, ghi đè lựa chọn tự động.
- **14.4** THE SYSTEM SHALL cho phép chọn **5 dạng câu hỏi**: Kiến thức nền (Concept) · Thiết kế hệ thống (System Design) · Điều tra sự cố (Debugging & RCA) · Đánh đổi quyết định (Trade-off Analysis) · Hành vi theo STAR (Behavioral).
- **14.5** THE SYSTEM SHALL cho phép chọn **độ dài phiên**: 5 câu (~15 phút) · 8 câu (~25 phút, khuyến nghị) · 12 câu (~40 phút).
- **14.6** THE SYSTEM SHALL cho phép chọn **phương thức trả lời**: Văn bản (Markdown & Code Snippet) hoặc Giọng nói (Web Speech STT trực tiếp).
- **14.7** THE SYSTEM SHALL cho phép bật **Chế độ thích ứng thông minh (Adaptive Loop)** và **Đo lường song song tiếng Anh chuyên ngành**.
- **14.8** THE SYSTEM SHALL hiển thị **Rubric Chấm Chuẩn Hóa (FR-MI-04)** dạng 5 chiều vector kèm ngưỡng đạt Senior (≥4.0/5.0).
- **14.9** THE SYSTEM SHALL hiển thị **Ước Tính Tài Nguyên AI** — model, độ dài phiên, tỷ lệ cache tối ưu, latency trung bình, chi phí ước tính USD.
- **14.10** WHEN người dùng bấm **Bắt đầu Phiên Phỏng Vấn**, THE SYSTEM SHALL mở màn hình phiên ở chế độ tập trung, ghi 1 `InterviewSession` và tạo `Activity` type `mock_interview`.
- **14.11** THE SYSTEM SHALL hiển thị trạng thái đồng bộ vector cục bộ và thông báo lưu trữ cục bộ SQLite (`/evals/session_xxx`).

---

### 2.15 US-15 — Tôi trả lời phỏng vấn và AI chấm + sinh câu hỏi tiếp theo trong một lượt

> **Story 15:** As a người dùng đang phỏng vấn, I want mỗi lượt trả lời được chấm điểm và nhận câu hỏi tiếp theo ngay lập tức, so that phiên có chiều sâu thay vì hỏi–đáp rời rạc.

**Màn hình:** S17 (`/interview/session`)

#### Acceptance Criteria

- **15.1** THE SYSTEM SHALL hiển thị **thanh tiến độ thích ứng năng lực** với điểm từng câu đã chấm và trạng thái câu hiện tại / chờ sinh.
- **15.2** THE SYSTEM SHALL hiển thị **thời gian câu hiện tại**, **tổng thời gian phiên**, và nút **Tạm dừng & Lưu**.
- **15.3** THE SYSTEM SHALL hiển thị **câu hỏi** kèm **kỹ năng mục tiêu** (breadcrumb `System Design → Concurrency & Locks`) và cờ **Ưu tiên node yếu nhất** nếu AI sinh theo node thiếu bằng chứng.
- **15.4** THE SYSTEM SHALL cung cấp ô trả lời **hỗ trợ Markdown, Code snippet & Giọng nói** (STT).
- **15.5** THE SYSTEM SHALL hiển thị **số từ** và **thời gian gõ** của câu trả lời.
- **15.6** THE SYSTEM SHALL hiển thị trạng thái **Local Autosave** với thời gian ghi.
- **15.7** WHEN người dùng gửi câu trả lời, THE SYSTEM SHALL thực hiện **1 lần gọi AI làm 2 việc**: chấm câu vừa trả lời theo rubric 5 tiêu chí **và** sinh câu hỏi tiếp theo (adaptive).
- **15.8** THE SYSTEM SHALL hiển thị **bảng điểm rubric 5 tiêu chí** ngay sau khi chấm: Chính xác kỹ thuật · Chiều sâu giải pháp · Khả năng lập luận · Phân tích đánh đổi · Giao tiếp.
- **15.9** THE SYSTEM SHALL hiển thị **Ghi chú thích ứng (Adaptive Trigger)** — lý do AI sinh câu hỏi này.
- **15.10** WHEN người dùng bấm **Flag**, THE SYSTEM SHALL ghi log cờ để cải thiện chất lượng sinh câu hỏi.
- **15.11** THE SYSTEM SHALL cho phép **Xem lại gợi ý cấu trúc (STAR)** và **Xóa làm lại** câu trả lời.
- **15.12** WHEN người dùng dừng giữa chừng, THE SYSTEM SHALL lưu phiên để **resume được** mà không mất tiến độ.
- **15.13** THE SYSTEM SHALL hỗ trợ `Ctrl/Cmd + Enter` để gửi câu trả lời, và `Esc` để huỷ.
- **15.14** THE SYSTEM SHALL hiển thị **trạng thái phát âm** (Web Speech API, độ trễ, độ khắt khe ngữ pháp, model đánh giá).

---

### 2.16 US-16 — Tôi xem báo cáo mock interview có bằng chứng trích dẫn và đề xuất luyện tiếp

> **Story 16:** As a người dùng vừa phỏng vấn xong, I want xem điểm từng tiêu chí, 3 điểm mạnh có trích dẫn câu trả lời, 3 điểm yếu có đề xuất, and đề xuất luyện tiếp trỏ về cây kỹ năng, so that tôi biết chính xác phải luyện gì.

**Màn hình:** S18 (`/interview/[id]`)

#### Acceptance Criteria

- **16.1** THE SYSTEM SHALL hiển thị header kết quả: hồ sơ vai trò, model đánh giá, ngày, số câu hỏi, thời lượng, độ tin cậy dữ liệu.
- **16.2** THE SYSTEM SHALL hiển thị **Chỉ số năng lực tổng hợp** (điểm tổng /5.0) kèm nhãn cấp độ (ví dụ `Senior L5 Ready`) và delta so với phiên trước cùng vị trí.
- **16.3** THE SYSTEM SHALL hiển thị **phân vị ứng viên** và mô tả năng lực.
- **16.4** THE SYSTEM SHALL hiển thị **Khung kỹ thuật chuẩn hoá — 5 Tiêu chí Rubric Chuyên môn (FR-MI-04)** kèm legend `Đạt chuẩn` / `Cần rèn luyện`, mỗi tiêu chí có điểm và nhận xét: ① Chính xác ② Chiều sâu ③ Lập luận ④ Giao tiếp ⑤ Nhận biết đánh đổi.
- **16.5** THE SYSTEM SHALL hiển thị **3 Điểm mạnh cụ thể (Đã kiểm chứng)** — mỗi mục gồm **trích dẫn nguyên văn** câu trả lời và **nhận xét AI**.
- **16.6** THE SYSTEM SHALL hiển thị **3 Điểm yếu cần khắc phục ngay** — mỗi mục gồm: câu hỏi liên quan, tag lỗ hổng, mô tả vấn đề, và **đề xuất cụ thể**.
- **16.7** THE SYSTEM SHALL hiển thị khối **Đồng bộ tiến độ học tập (FR-MI-08)** — đề xuất luyện tiếp trỏ về skill node cụ thể, kèm số bằng chứng hiện có và mục tiêu level.
- **16.8** WHEN người dùng bấm **Tạo 3 bài tập về …**, THE SYSTEM SHALL tạo 3 `PlanItem` luyện tập cho skill node đó.
- **16.9** WHEN người dùng bấm **Tạo bằng chứng kỹ năng**, THE SYSTEM SHALL tạo 1 `Evidence` cho skill node trọng tâm của phiên (đóng vòng lặp FR-MI-08).
- **16.10** THE SYSTEM SHALL cho phép **Xuất báo cáo PDF/JSON** và **Làm lại với hồ sơ này**.
- **16.11** THE SYSTEM SHALL hiển thị xác nhận **dữ liệu phiên đã lưu ngoại tuyến vào SQLite nội bộ**.

---

### 2.17 US-17 — Tôi chọn dạng bài kiểm tra và biết chính xác nó đo gì

> **Story 17:** As a người học, I want chọn giữa bài định vị, bài theo chủ đề, bài chuẩn định kỳ và bài sinh từ tài liệu, with thấy rõ điểm chuẩn và cơ chế đồng bộ FSRS, so that tôi biết mình đang đo điều gì.

**Màn hình:** S19 (`/test`)

#### Acceptance Criteria

- **17.1** THE SYSTEM SHALL hiển thị **Level Ước Lượng Hiện Tại** cho cả 2 ngôn ngữ kèm điểm chuẩn gần nhất và độ tin cậy thuật toán.
- **17.2** THE SYSTEM SHALL hiển thị cảnh báo **"3 thẻ sai từ kỳ thi trước đã tự động đẩy về SRS hôm nay"** kèm CTA ôn ngay.
- **17.3** THE SYSTEM SHALL hiển thị **4 hình thức khảo thí**:
  - `placement` — Bài Kiểm Tra Định Vị: không timer, 25 câu, độ phủ HSK 1–2, target deck 60 từ lõi
  - `topic` — Bài Kiểm Tra Theo Chủ Đề: 20 câu/đề, danh sách chủ đề kèm % đạt
  - `benchmark` — Bài Kiểm Tra Chẩn (Định Kỳ): timer 30:00, đề song song về độ khó
  - `from_content` — Kiểm Tra Từ Nội Dung Thực Tế: timer 15:00, sinh bằng engine local
- **17.4** WHEN người dùng bấm `placement`, THE SYSTEM SHALL set `UserProfile.zhLevel`/`enLevel` và **khởi tạo lộ trình 60 từ lõi** vào hàng đợi học.
- **17.5** THE SYSTEM SHALL hiển thị **KẾ QUẢ GẦN NHẤT** (điểm, %, đề tuần, ngày thi) cho benchmark.
- **17.6** THE SYSTEM SHALL hiển thị **Tiến Độ Benchmark** theo tuần (T40–T43) kèm ngưỡng đỗ A1.
- **17.7** THE SYSTEM SHALL hiển thị **Tỷ Lệ Đúng Theo 6 Kỹ Năng** (mc_vocab, mc_grammar, cloze, listening, translation, writing) kèm N.
- **17.8** THE SYSTEM SHALL hiển thị **5 Từ Sai Nhiều Nhất** kèm pinyin, nghĩa, số lần sai.
- **17.9** THE SYSTEM SHALL cho phép nhập **nguồn văn bản UTF-8 không giới hạn** để sinh đề `from_content` (10 câu trắc nghiệm + 1 bài tóm tắt chấm 4 nhóm lỗi).
- **17.10** THE SYSTEM SHALL hiển thị quy tắc **FEEDBACK LOOP FSRS v4.5** — câu sai kích hoạt giảm `S`, lên lịch ôn cấp tốc trong 24h.
- **17.11** THE SYSTEM SHALL hiển thị cờ **Không được tạm dừng sau khi bắt đầu** cho benchmark.
- **17.12** THE SYSTEM SHALL hiển thị trạng thái **FSRS v4.5 Active Sync** kèm giờ đồng bộ.

---

### 2.18 US-18 — Tôi làm bài kiểm tra và được hướng dẫn thao tác nhanh

> **Story 18:** As a người dùng đang làm bài, I want timer, ma trận câu hỏi, phím tắt và lưu tự động từng câu, so that tôi không mất dữ liệu khi làm bài.

**Màn hình:** S20 (`/test/session`)

#### Acceptance Criteria

- **18.1** THE SYSTEM SHALL hiển thị **timer đếm ngược** từ tổng thời gian đề (ví dụ 30:00) kèm thời gian còn lại.
- **18.2** THE SYSTEM SHALL hiển thị **tiến độ**: số câu đã làm / đang làm / chưa trả lời, và % hoàn thành.
- **18.3** THE SYSTEM SHALL hiển thị **nhãn dạng câu** (ví dụ `mc_grammar — Điền trợ từ & Ngữ pháp cấu trúc`) và **tag bộ đề** (HSK 1 Core Vocabulary).
- **18.4** THE SYSTEM SHALL hiển thị **nút nghe phát âm** (TTS `zh-CN`) cho câu nghe.
- **18.5** THE SYSTEM SHALL hiển thị **câu hỏi + pinyin + dịch nghĩa** và **4 lựa chọn A–D** kèm pinyin/nghĩa của từng lựa chọn.
- **18.6** THE SYSTEM SHALL hỗ trợ chọn đáp án bằng **click hoặc phím `1`–`4` / `A`–`D`**.
- **18.7** THE SYSTEM SHALL hỗ trợ phím tắt **đúng như đã quảng bá**: `Ctrl+Enter` → câu tiếp theo, `F` → gắn cờ xem lại, `P` → câu trước, `Space` → nghe audio.
- **18.8** THE SYSTEM SHALL hiển thị **Ma trận câu hỏi** 40 ô với 4 trạng thái: đã làm / hiện tại / gắn cờ / trống.
- **18.9** THE SYSTEM SHALL **lưu tự động từng câu** vào SQLite và hiển thị mốc thời gian lưu.
- **18.10** THE SYSTEM SHALL hiển thị **Offline Safe Mode** và tham số FSRS (`w_4 = 1.12`) cùng độ ổn định dự phóng của câu hiện tại.
- **18.11** WHEN người dùng bấm **Nộp bài sớm**, THE SYSTEM SHALL xác nhận rồi chấm toàn bộ câu đã trả lời.
- **18.12** THE SYSTEM SHALL hiển thị **Quy tắc FSRS SRS Tự động** — 3 điều kiện: trích xuất thẻ từ câu sai/đánh dấu, kích hoạt ôn cấp tốc tại S10, cập nhật thẳng điểm thành thạo vào cây kỹ năng S03.

---

### 2.19 US-19 — Tôi xem kết quả và thấy lỗi của mình quay lại bảng ôn tập

> **Story 19:** As a người học, I want xem điểm, radar năng lực, phân rã theo dạng câu, và **3 thẻ sai được đẩy về ôn hôm nay**, so that tôi thấy bài kiểm tra thực sự cải thiện việc học chứ không chỉ là một con số.

**Màn hình:** S21 (`/test/[id]`)

#### Acceptance Criteria

- **19.1** THE SYSTEM SHALL hiển thị header kết quả: mã đề (`TEST-YYYYMMDD-ZH-01`), ngày, chu kỳ, điểm tổng, tỷ lệ đúng, delta so với tuần trước, thời lượng, tốc độ trung bình/câu.
- **19.2** THE SYSTEM SHALL hiển thị **Đánh giá CEFR** (level + verdict), **bottleneck** (dạng câu yếu nhất) và khuyến nghị trọng tâm.
- **19.3** THE SYSTEM SHALL hiển thị **Radar Profile** 4 trục (Từ vựng, Ngữ pháp, Nghe hiểu, Viết) và **Phản xạ**.
- **19.4** THE SYSTEM SHALL hiển thị **Thống kê chi tiết theo dạng câu (itemType)** — điểm, số đúng/sai, %, so sánh benchmark, và nhận xét.
- **19.5** THE SYSTEM SHALL hiển thị **Chấm điểm Tự luận AI (4 Nhóm lỗi sư phạm)** cho câu tự luận, mỗi nhóm 0–10 kèm nhận xét.
- **19.6** THE SYSTEM SHALL hiển thị **Phân tích sai sót & Lời giải chi tiết** — từng câu sai kèm giải thích ngữ pháp và bộ lọc theo dạng câu.
- **19.7** THE SYSTEM SHALL hiển thị khối **FR-LT-06 Closed Loop — FSRS Memory Trigger** liệt kê các thẻ bị đẩy về ôn hôm nay, mỗi thẻ gồm: từ, pinyin, số lapse, **nghĩa chuẩn**, **lựa chọn sai của người dùng**, **Retrievability %**, và trạng thái `Ôn: Ngay bây giờ`.
- **19.8** WHEN người dùng bấm **Ôn ngay N thẻ này trong SRS (S10)**, THE SYSTEM SHALL mở phiên ôn FSRS giới hạn đúng N thẻ sai vừa liệt kê.
- **19.9** THE SYSTEM SHALL hiển thị **Độ tin cậy bài test**, **dung sai FSRS (± ngày)** và **model đã dùng**.
- **19.10** THE SYSTEM SHALL hiển thị xác nhận **Đã đồng bộ 1 Activity (Language Test) vào Daily Loop và cập nhật Evidence node** trên cây kỹ năng.
- **19.11** THE SYSTEM SHALL cho phép nghe lại âm thanh chuẩn của từ trong phần sai sót.

---

## 3. Yêu cầu chức năng theo domain (FR)

> Mã FR giữ nguyên như `SPEC.md` để truy vết 2 chiều. Mỗi FR ở đây là **tóm tắt định nghĩa**; chi tiết nghiệp vụ nằm ở Acceptance Criteria §2.

### 3.1 FR-DL — Daily Loop

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-DL-01 | S01 hiển thị tối đa 6 hành động nhỏ cho ngày hiện tại, đúng thứ tự, gắn nhãn domain | P0 |
| FR-DL-02 | Mỗi hành động có nhãn domain, tiêu đề, mô tả ≤120 ký tự, thời lượng dự kiến, kỹ năng liên quan | P0 |
| FR-DL-03 | Bấm "Xong" → tạo `Activity` + `Evidence` (nếu gắn kỹ năng) + đánh dấu `PlanItem` done | P0 |
| FR-DL-04 | "Hoàn thành nhanh" mở Quick-log: chọn domain + gõ 3–5 ký tự, AI điền phần còn lại | P0 |
| FR-DL-05 | Hiển thị streak và năng lượng tuần (0–100%) tính từ 7 ngày gần nhất | P0 |
| FR-DL-06 | "Lập lại kế hoạch hôm nay" → AI sinh lại 6 hành động, giữ nguyên hành động đã xong | P1 |
| FR-DL-07 | Chưa có kế hoạch → CTA "Lập kế hoạch hôm nay" + fallback cục bộ khi không có API key | P0 |
| FR-DL-08 | Ngày mới không xoá kế hoạch cũ; lịch sử theo ngày, xem lại được mọi ngày | P1 |

### 3.2 FR-SK — Cây kỹ năng & bằng chứng

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-SK-01 | Cây 3 tầng: Domain → Kỹ năng → Mục kỹ năng con | P0 |
| FR-SK-02 | Mỗi kỹ năng có `level` (0–5) và `targetLevel` | P0 |
| FR-SK-03 | `level` không tự tăng từ checkbox; tăng khi đủ `Evidence` với `rating ≥ ngưỡng` | P0 |
| FR-SK-04 | Mỗi mục kỹ năng có thể mở rộng: tên, domain, mục cha, mức mục tiêu | P1 |
| FR-SK-05 | Trang chi tiết kỹ năng hiển thị lịch sử bằng chứng, thời gian đã bỏ ra, điểm trung bình | P0 |
| FR-SK-06 | Điểm kỹ năng hiển thị thang 0–5 + số bằng chứng, không phải phần trăm mơ hồ | P0 |

### 3.3 FR-LG — Ngoại ngữ & SRS

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-LG-01 | Mỗi thẻ có `lang`, mặt trước, mặt sau, ghi chú, ví dụ câu, nhóm, `mode` | P0 |
| FR-LG-02 | Lịch ôn dùng FSRS (`ts-fsrs`), lưu state dạng JSON | P0 |
| FR-LG-03 | 4 nút chấm Again/Hard/Good/Easy kèm gợi ý thời gian tới lượt ôn kế tiếp | P0 |
| FR-LG-04 | Phiên ôn lấy thẻ đến hạn trước; hết thì lấy thẻ mới, tối đa 20 thẻ/phiên | P0 |
| FR-LG-05 | Level 0: mặt trước pinyin/từ + nút nghe; mặt sau hanzi + nghĩa + ví dụ + nút nghe | P0 |
| FR-LG-06 | Chế độ `produce`: hiện nghĩa, người dùng gõ hoặc nói, app so khớp và chấm fuzzy | P2 |
| FR-LG-07 | Thẻ sai (rating 1) → tự sinh thẻ biến thể | P2 |
| FR-LG-08 | Từ khóa trong bài viết → nút "Thêm vào ôn" | P2 |
| FR-LG-09 | Tiến độ mỗi ngôn ngữ: đã học / đang học / đã thuộc, chuỗi ngày ôn | P0 |
| FR-LG-10 | Seed 60 thẻ zh + 60 thẻ en + 10 mẫu câu mỗi ngôn ngữ (biên tập sẵn, không AI sinh) | P0 |

### 3.4 FR-CM — Giao tiếp

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-CM-01 | 3 chế độ luyện: Viết · Nói · Hội thoại AI | P0 / P1 / P2 |
| FR-CM-02 | AI chấm viết theo rubric 5 tiêu chí (Rõ ràng · Cấu trúc · Giọng văn · Tự nhiên · Ngữ pháp), mỗi tiêu chí 0–5 + 1 nhận xét + 1 đề xuất sửa cụ thể | P0 |
| FR-CM-03 | So sánh với lần ghi trước của chính người dùng → hiển thị delta | P1 |
| FR-CM-04 | Chế độ Nói: MediaRecorder → Web Speech transcribe → chấm cùng rubric + ghi chú từ điệu/độ rõ | P1 |
| FR-CM-05 | Chế độ Hội thoại AI: chọn tình huống, AI đóng vai, trả lời theo level người dùng | P2 |
| FR-CM-06 | Tình huống có mục tiêu ẩn → AI chấm mức độ đạt mục tiêu | P2 |
| FR-CM-07 | Mọi bài luyện giao tiếp lưu vào `Activity` domain `communication` + tạo `Evidence` cho kỹ năng giao tiếp | P0 |
| FR-CM-08 | Kho bài luyện: người dùng tự tạo prompt luyện | P1 |

### 3.5 FR-PS — Cá nhân & sinh trắc

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-PS-01 | Đánh giá chính 4 chỉ số mood/energy/giấc ngủ/tập trung, ghi trong ≤15 giây | P0 |
| FR-PS-02 | Nhật ký tự do, gợi ý 3 câu hỏi mở theo ngữ cảnh | P0 |
| FR-PS-03 | AI phản hồi nhật ký: tóm tắt 1 câu + **1 câu hỏi sắc** (không lời khuyên dài) | P0 |
| FR-PS-04 | AI tự gán domain/kỹ năng cho nội dung nhật ký | P1 |
| FR-PS-05 | Phân tích tương quan giữa chỉ số chính ↔ hiệu suất học | P2 |
| FR-PS-06 | Biểu đồ mood/energy/sleep theo tuần, overlay số hành động hoàn thành | P1 |
| FR-PS-07 | Dữ liệu cá nhân không rời máy; có màn hình hiển thị "dữ liệu nào đã gửi lên" | P0 |

### 3.6 FR-WR — Weekly review

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-WR-01 | Tự chạy Chủ nhật 20:00 hoặc mở app lần đầu trong tuần mới | P1 |
| FR-WR-02 | Tổng hợp: số hành động hoàn thành, phân bố domain, kỹ năng tiến bộ, chỉ số cá nhân, so với tuần trước | P1 |
| FR-WR-03 | AI sinh nhận định 3 điểm (đã làm tốt · cần sửa · nên thử) | P1 |
| FR-WR-04 | AI đề xuất kế hoạch tuần sau dựa trên dữ liệu + kỹ năng yếu | P1 |
| FR-WR-05 | Trượt ≥2 ngày liên tiếp → AI tự giảm tải kế hoạch tuần sau, có ghi chú lý do | P2 |
| FR-WR-06 | Người dùng chỉnh được kế hoạch AI đề xuất trước khi duyệt | P1 |

### 3.7 FR-AI — Lớp AI

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-AI-01 | Mọi lời gọi AI dùng **prompt caching** với system prompt cố định làm prefix | P0 |
| FR-AI-02 | Lời gọi trả nội dung dài dùng **streaming** | P0 |
| FR-AI-03 | Phân tuyến model: `claude-opus-5` cho chấm điểm/sinh kế hoạch/role-play; `claude-haiku-4-5` cho phân loại & trích xuất; **model local (Ollama)** cho phân loại nhanh, autofill quick-log, sửa lỗi ngữ pháp và tổng hợp thống kê (chi phí 0 token) | P0 |
| FR-AI-04 | Output có cấu trúc dùng **structured outputs** (`output_config.format`), không parse text tự do | P0 |
| FR-AI-05 | Xử lý `stop_reason: "refusal"` và lỗi API theo chuỗi exception typed; thông báo thân thiện, không crash | P0 |
| FR-AI-06 | IF không có `ANTHROPIC_API_KEY` THEN hệ thống chạy chế độ offline: ưu tiên model local (Ollama) nếu sẵn có, nếu không thì dùng rule cục bộ cho kế hoạch ngày; tính năng AI khác hiển thị "cần API key", KHÔNG giả lập phản hồi AI | P0 |
| FR-AI-07 | Ghi log usage (input/output/cache tokens) vào bảng `AiCall` để theo dõi chi phí | P1 |
| FR-AI-08 | Prompt caching **kiểm chứng được**: hiển thị `cache_read_input_tokens` ở S15 | P2 |
| FR-AI-09 | Mọi lời gọi AI đi qua **một router duy nhất** (`lib/ai/router.ts`) chọn provider `local` (Ollama) hoặc `anthropic` theo bảng định tuyến task; route handler **không** gọi SDK trực tiếp | P0 |
| FR-AI-10 | Chuỗi fallback bắt buộc `anthropic → local → rule cục bộ`; **không bao giờ** trả lỗi trần cho UI | P0 |
| FR-AI-11 | Badge trạng thái AI trên header mọi màn hình phản ánh provider đang hoạt động thật (`AI Offline / Local (Ollama)` hoặc `AI Online / Cloud (Claude Opus 5)`) | P1 |
| FR-AI-12 | Hệ thống phát hiện Ollama qua `GET /api/tags` (timeout 3s) và hiển thị danh sách model local khả dụng tại S15; nếu Ollama không chạy → hiển thị trạng thái "Offline" + hướng dẫn cài đặt | P1 |
| FR-AI-13 | Mọi lần gọi provider `local` ghi `AiCall{provider:"local", estimatedCost:0}` để S15 tách chi phí cloud vs local | P0 |
| FR-AI-14 | Khi xảy ra fallback, ghi `AiCall.fallbackFrom` = provider gốc để đếm chính xác số lượt offline fallback (S15 hiển thị `3 offline fallback`) | P1 |
| FR-AI-15 | Bảng định tuyến task → provider là **hợp đồng**, đối chiếu trực tiếp nhãn provider trong 21 màn hình Stitch. Bảng chuẩn: `design.md` §6.1. Khi thiết kế đổi → cập nhật cả 3 bảng (spec §5.2 · design §6.1 · `tech.md`) | P0 |
| FR-AI-16 | Tác vụ **sinh đề tự tạo từ nguồn văn bản** (S19 `from_content`) chạy provider **local** (`qwen2.5:7b`) theo nhãn `CẤU TRÚC ĐỀ TỰ TẠO: Ollama Qwen-2.5 7B` — không dùng cloud | P1 |
| FR-AI-17 | **Blueprint bài kiểm tra (AI-14) không gọi AI** — chọn lọc tất định từ thẻ đến hạn + ngân hàng seed đã biên tập (FR-LT-12 đề song song về độ khó). Chỉ `from_content` mới thật sự sinh đề | P0 |
| FR-AI-18 | Tác vụ **suy diễn tương quan sinh trắc ↔ hiệu suất** (S12, task `biometric_correlate`, mã AI-18) chạy provider **local** (`llama3.3`) theo nhãn `Engine suy diễn cục bộ (Local Vector Engine)`; dữ liệu sinh trắc **không** rời máy (P6 STRICT) | P1 |
| FR-AI-19 | Tác vụ **sinh câu hỏi tiếp theo** trong adaptive loop (S17, task `mock_next_question`, mã AI-19) chạy provider **local** (`llama3.3`) theo nhãn `Mô hình đánh giá: Local Llama-3.3 + Opus`; phần **chấm điểm** vẫn là cloud | P1 |
| FR-AI-20 | Tác vụ **phân loại nội dung** (task `classify`, mã AI-06) mặc định dùng provider **local** (`qwen2.5:7b`, 0 token, offline-safe). Đường cloud `claude-haiku-4-5` chỉ dùng khi người dùng **tuỳ chọn** trong S15 (chấp nhận chi phí) | P1 |

> **Mở rộng so với `SPEC.md` §2.7:** AI router là **hybrid** (local + cloud), không phải Anthropic-only — theo `product.md` §"Bối cảnh AI" và `tech.md` §"AI Router".
>
> **3 drift nhãn trong mockup đã chốt** (xem `design.md` §6.1): S06 ghi `Claude Haiku 4.5` cho classify trong khi S05 ghi `Local AI Haiku 4.5` (mâu thuẫn nhau) → chọn local mặc định; S19 ghi `Ollama Qwen-2.5 7B` cho `from_content` → chạy local; AI-14 blueprint đề → không gọi AI.

### 3.8 FR-MI — Mock interview

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-MI-01 | Hồ sơ vai trò: `jobTitle`, `seniority`, `focusSkills[]`, `language`, `questionKinds[]`; lưu được nhiều hồ sơ | P0 |
| FR-MI-02 | Sinh câu hỏi từ cây kỹ năng, ưu tiên mục ít bằng chứng nhất; cân bằng dạng câu đã chọn | P0 |
| FR-MI-03 | 5 dạng câu hỏi: `concept` · `design` · `debug` · `tradeoff` · `behavioral` | P0 |
| FR-MI-04 | Rubric kỹ thuật 5 tiêu chí 0–5: Chính xác · Chiều sâu · Lập luận · Giao tiếp · Nhận biết đánh đổi | P0 |
| FR-MI-05 | Rubric hành vi 4 tiêu chí 0–5: Cụ thể · Đầy đủ STAR · Tự nhận thức · Kết quả | P0 |
| FR-MI-06 | **Adaptive**: mỗi lượt 1 call làm 2 việc — chấm câu vừa trả lời + sinh câu tiếp theo | P0 |
| FR-MI-07 | Trả lời bằng văn bản luôn, hoặc giọng nói (STT). Ngôn ngữ theo hồ sơ | P0 / P1 |
| FR-MI-08 | Báo cáo cuối phiên: điểm từng tiêu chí, điểm tổng, **3 điểm mạnh có trích dẫn** + **3 điểm yếu**, và **đề xuất luyện tiếp** trỏ về `Skill` cụ thể | P0 |
| FR-MI-09 | So sánh với phiên trước cùng hồ sơ: delta từng tiêu chí + biểu đồ tiến bộ | P1 |
| FR-MI-10 | Lưu 1 `Activity` (domain `professional`, type `mock_interview`) + **tạo `Evidence` cho `Skill` trọng tâm nhất khi người dùng bấm "Tạo bằng chứng kỹ năng"** (vòng đóng bắt buộc — xem FR-MI-10a/b/c/d) | P0 |
| FR-MI-11 | Nút "Câu hỏi này có vấn đề" → ghi log cải thiện chất lượng sinh câu hỏi | P1 |
| FR-MI-12 | Chọn số câu: 5 · 8 · 12 | P0 |
| FR-MI-13 | Cho phép dừng giữa chừng; phiên bỏ dở resume được | P1 |
| FR-MI-14 | Trả lời bằng tiếng Anh → đo cả kỹ năng chuyên môn lẫn tiếng Anh; điểm riêng cho "clarity of expression" | P2 |

#### Vòng đóng bắt buộc #2 — FR-MI-08 / FR-MI-10 (Mock interview → Evidence → cây kỹ năng)

> `product.md` gọi vòng đóng này là **FR-MI-08**. Trong bảng FR trên, **FR-MI-08 = báo cáo cuối phiên** (nội dung báo cáo) và **FR-MI-10 = tạo Evidence** (hành vi đóng vòng). Hai mã này **cùng phục vụ một vòng đóng** — giữ nguyên mã để không phá tham chiếu chéo với `SPEC.md`.

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-MI-10a | WHEN người dùng bấm "Tạo bằng chứng kỹ năng" THEN hệ thống tạo 1 `Evidence` gắn với `Skill` trọng tâm nhất của phiên, kèm `activityId` trỏ về `Activity` của phiên mock | P0 |
| FR-MI-10b | WHEN `Evidence` được tạo THEN hệ thống cập nhật level của `Skill` → S03 cây kỹ năng hiển thị level mới | P0 |
| FR-MI-10c | WHEN `Evidence` được tạo THEN hệ thống hiển thị đề xuất "luyện tiếp" trỏ về skill node cụ thể → S01 đưa vào kế hoạch ngày mai | P0 |
| FR-MI-10d | IF người dùng **không** bấm "Tạo bằng chứng kỹ năng" THEN hệ thống **không** tự ý tạo `Evidence` (P3: tiến độ = bằng chứng do người dùng chấp nhận) | P0 |

### 3.9 FR-LT — Bài kiểm tra ngoại ngữ

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-LT-01 | Blueprint sinh câu `{lang, level, topic, itemTypes[], count}` → đúng số câu, đúng phân bố dạng | P0 |
| FR-LT-02 | 6 dạng câu: `mc_vocab` · `mc_grammar` · `cloze` · `listening` · `writing` · `translation` | P0 |
| FR-LT-03 | Timer đếm ngược (benchmark, from_content), lưu thời gian từng câu | P1 |
| FR-LT-04 | Chấm tự động cho `mc_*`/`cloze`/`listening`; AI chấm `writing`/`translation` theo rubric 4 nhóm lỗi | P0 |
| FR-LT-05 | Kết quả: tổng điểm, phân tách theo `itemType`, ước lượng level, danh sách câu sai kèm giải thích | P0 |
| FR-LT-06 | **Vòng đóng bắt buộc (quan trọng nhất).** WHEN người dùng trả lời sai một câu trong bài kiểm tra THEN hệ thống đẩy thẻ SRS tương ứng về `due = hôm nay`, giảm `stability`, tăng `lapses +1` | P0 |
| FR-LT-07 | `placement` → set `zhLevel`/`enLevel`, gợi ý nhóm từ bắt đầu và bài tập đầu tiên | P0 |
| FR-LT-08 | `benchmark` định kỳ → biểu đồ level theo thời gian, song song với tiến bộ SRS | P1 |
| FR-LT-09 | `from_content`: dán văn bản → AI sinh câu đọc hiểu + chấm phần tóm tắt bằng tiếng đích | P2 |
| FR-LT-10 | Item từ vựng lấy từ **thẻ của chính người dùng** (ưu tiên thẻ yếu) + ngân hàng seed cho level đó | P0 |
| FR-LT-11 | Mọi bài kiểm tra tạo `Activity` (domain `language`, type `test`) + `Evidence` cho skill ngôn ngữ | P0 |
| FR-LT-12 | Đề cùng `topic` phải **song song về độ khó** (parallel form) để điểm các lần so sánh được | P1 |

#### Vòng đóng bắt buộc #1 — FR-LT-06 (Bài kiểm tra → SRS)

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-LT-06a | WHEN bài kiểm tra nộp xong THEN hệ thống hiển thị khối "N thẻ bị đẩy về ôn hôm nay" kèm từ, pinyin, nghĩa, lựa chọn sai, `retrievability %` và nút "Ôn ngay" → S10 mở đúng N thẻ đó | P0 |
| FR-LT-06b | WHEN không có câu nào sai THEN hệ thống hiển thị "0 thẻ bị đẩy về ôn" (không hiển thị khối rỗng) | P1 |

---

## 4. Danh mục màn hình (Screen Inventory)

> Route = màn hình. 21/21 màn hình Stitch đã được phân tích và ánh xạ.

| ID | Màn hình | Route | Domain | FR chính | AI? | Nguồn |
|---|---|---|---|---|---|---|
| S01 | Hôm nay (Daily Loop) | `/` | cross | FR-DL-01..08 | AI-01 | `s01_daily_loop_h_m_nay` |
| S02 | Thiết lập kế hoạch AI | `/plan` | professional | FR-DL-06, FR-AI-01..04 | AI-01 streaming | `s02_sinh_k_ho_ch_ai_k_ho_ch_ng_y` |
| S03 | Cây kỹ năng & bằng chứng | `/skills` | cross | FR-SK-01..06 | local | `s03_c_y_k_n_ng_b_ng_ch_ng` |
| S04 | Chi tiết kỹ năng | `/skills/[id]` | cross | FR-SK-05, FR-SK-03 | local | `s04_chi_ti_t_k_n_ng_b_ng_ch_ng` |
| S05 | Quick-log sheet (≤10s) | `/log`, `/log/history` | cross | FR-DL-04, FR-LG-01 | AI-02 (local) | `s05_quick_log_sheet_10s` |
| S06 | Nhật ký & AI phản hồi | `/journal` | personal | FR-PS-02..04 | AI-05, AI-06 | `s06_nh_t_k_ai_ph_n_h_i` |
| S07 | Luyện giao tiếp (Viết) | `/speak/write` | communication | FR-CM-02, FR-CM-03 | AI-03 | `s07_luy_n_giao_ti_p_vi_t` |
| S08 | Luyện giao tiếp (Nói) | `/speak/talk` | communication | FR-CM-04 | AI-03 | `s08_luy_n_giao_ti_p_n_i` |
| S09 | Trung tâm ôn tập SRS | `/language` | language | FR-LG-01,02,09 | — | `s09_n_t_p_ngo_i_ng_srs_hub` |
| S10 | Ôn tập FSRS | `/language/session` | language | FR-LG-03..05 | TTS | `s10_n_t_p_ngo_i_ng_srs_fsrs` |
| S11 | Luyện ngoại ngữ chủ động | `/language/practice` | language | FR-LG-08, FR-CM-02 | AI-09, AI-10 | `s11_luy_n_ngo_i_ng_ch_ng` |
| S12 | Đánh giá chính & sinh trắc | `/state` | personal | FR-PS-01,05,06,07 | local engine | `s12_nh_gi_sinh_tr_c_nh_p` |
| S13 | Báo cáo tuần | `/review` | cross | FR-WR-01..06 | AI-07 | `s13_b_o_c_o_tu_n_weekly_review` |
| S14 | Báo cáo tiến bộ | `/progress` | cross | FR-SK-05, FR-PS-05 | local | `s14_b_o_c_o_ti_n_b` |
| S15 | Cài đặt & chi phí AI | `/settings` | system | FR-AI-07, FR-AI-08 | — | `s15_c_i_t_qu_n_l_chi_ph_ai` |
| S16 | Cấu hình mock interview | `/interview/setup` | professional | FR-MI-01,02,03,12 | local vector | `s16_mock_interview_c_u_h_nh` |
| S17 | Phiên mock interview | `/interview/session` | professional | FR-MI-04,06,07 | AI-11, AI-12 | `s17_mock_interview_c_u_h_nh` |
| S18 | Báo cáo mock interview | `/interview/[id]` | professional | FR-MI-08,09,10 | AI-13 | `s18_b_o_c_o_tu_n_mock_interview` |
| S19 | Trung tâm khảo thí | `/test` | language | FR-LT-07,08 | — | `s19_danh_s_ch_b_i_ki_m_tra_ngo_ai_ng` |
| S20 | Phiên thi | `/test/session` | language | FR-LT-01..04 | AI-14, AI-15 | `s20_...` |
| S21 | Kết quả bài kiểm tra | `/test/[id]` | language | FR-LT-05,06,10,11 | AI-16 | `s21_k_t_qu_a_b_i_ki_m_tra_ngo_ai_ng` |

### 4.1 App shell dùng chung (21/21 màn hình)

| Thành phần | Đặc tả |
|---|---|
| **Sidebar** | Cố định `w-72` (288px), `bg-surface-container-lowest`, `border-r border-outline-variant/30`, `shadow-[0_1px_8px_rgba(0,0,0,0.25)]`. Brand row `h-16` + logo + tên `Daily Loop OS` + badge `Local-First v1.1` + sub-label `Personal Operating System`. Section header `Phân hệ tác vụ`. **9 mục nav** (dùng chung 1 nguồn `lib/nav.ts`): Hôm nay (Daily Loop) · Cây kỹ năng · Ôn tập ngoại ngữ (SRS) · Luyện giao tiếp · Nhật ký & AI · Mock Interview · Bài kiểm tra · Báo cáo tuần & tiến độ · Cài đặt. Footer card: dot `animate-pulse` + `SQLite / Vector` + `Local DB Active` + icon `database`. |
| **Header** | Cố định `h-16`, `left-72 right-0`, `bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/30`. Cụm trái: chip ngày (`Thứ Tư 29/10`) · `Streak 12 ngày` (tertiary) · `Năng lượng tuần 78%` (primary) · chip AI (secondary, phản ánh provider thật). Cụm phải: CTA `+ Ghi nhanh (≤10s)` (`bg-primary-container text-on-primary`, `shadow-[0_0_12px_rgba(16,185,129,0.2)]`) + avatar. |
| **Content** | `<main class="w-full pt-16 bg-surface min-h-screen">` → wrapper `max-w-[1600px] mx-auto px-gutter-lg py-space-lg flex flex-col gap-space-lg`. |
| **Context bar** | Badge FR (`FR-XX-NN: TIÊU ĐỀ`) + tên màn hình + chip `S0N Workspace` + status pill AI (dot `animate-ping`) + trạng thái index. |

---

## 5. Yêu cầu phi chức năng (NFR)

### 5.1 Hiệu năng

| Mã | Yêu cầu | Đo |
|---|---|---|
| NFR-01 | Mỗi màn hình render nội dung chính trong ≤1.5 giây trên máy local | Lighthouse / `performance.now()` |
| NFR-02 | Ghi nhanh hoạt động (S05) hoàn tất trong ≤10 giây, mục tiêu TB ≤5 giây | Timer trong S05 |
| NFR-03 | Ghi chỉ số cá nhân (S12) hoàn tất trong ≤15 giây | Timer trong S12 |
| NFR-04 | Chấm điểm AI: latency p50 ≤3 giây, p95 ≤8 giây | `AiCall.latencyMs` |
| NFR-05 | Phiên ôn FSRS (S10) không giật khi chuyển thẻ; mục tiêu 60fps | Đo trong DevTools |
| NFR-06 | Lịch ôn FSRS tính tức thời khi chấm; không chờ round-trip mạng | Local compute |

### 5.2 Bảo mật & riêng tư

| Mã | Yêu cầu | Đo |
|---|---|---|
| NFR-07 | API key chỉ lưu trong `.env.local`; **không** commit, **không** gửi lên client, **không** hiển thị đầy đủ trong UI | Kiểm tra `.gitignore` + review |
| NFR-08 | Dữ liệu sinh trắc cá nhân (mood/energy/focus/sleep) **không bao giờ** rời máy | Cờ `STRICT_LOCAL` tại S12 + kiểm tra network |
| NFR-09 | Chỉ nội dung người dùng **chủ động gửi** mới được chuyển tới cloud AI | Banner S06 + log `AiCall` |
| NFR-10 | Database file SQLite nằm trong thư mục dự án, không được sync lên repo | `.gitignore` |

### 5.3 Khả dụng & offline

| Mã | Yêu cầu | Đo |
|---|---|---|
| NFR-11 | Mất mạng: ghi log, ôn tập, xem cây kỹ năng, xem báo cáo **vẫn hoạt động** | Tắt network → smoke test |
| NFR-12 | Không có API key: app vẫn chạy ở chế độ offline; tính năng AI hiển thị thông báo "cần API key" thay vì crash | Xoá `.env.local` → smoke test |
| NFR-13 | Có Ollama → dùng model local cho task nhẹ, **token cost = 0** | Badge header + S15 |
| NFR-14 | Chuỗi fallback `anthropic → local → rule` luôn tạo ra phản hồi dùng được | Test tắt cả 2 provider |

### 5.4 Khả năng tiếp cận & chất lượng giao diện

| Mã | Yêu cầu | Đo |
|---|---|---|
| NFR-15 | Toàn bộ UI tiếng Việt; font `Be Vietnam Pro` render dấu tiếng Việt không va chạm | Visual QA |
| NFR-16 | Tương phản chữ ≥4.5:1 trên nền tối theo thang surface | Kiểm tra tự động token |
| NFR-17 | Mọi thao tác chuẩn có phím tắt (Space / 1–4 / F / P / Ctrl+Enter) **khai báo đúng với hành vi thật** | Đối chiếu `keydown` handler |
| NFR-18 | Tất cả 21 màn hình dùng **cùng một** design token, breakpoint `xl`, max-width `1600px`, 9 mục nav, badge version thống nhất | Lint + review |

### 5.5 Bền vững & khả năng kiểm thử

| Mã | Yêu cầu | Đo |
|---|---|---|
| NFR-19 | Mọi dữ liệu người dùng có thể export JSON (deck, tiến độ, báo cáo tuần, AiCall CSV) | Nút export ở S09/S13/S14/S15 |
| NFR-20 | Có thể import lại dữ liệu đã backup mà không mất tham chiếu | Round-trip test |
| NFR-21 | Mọi mô hình Prisma có `createdAt`/`updatedAt`; xoá mềm cho `Evidence` và `Activity` | Schema review |
| NFR-22 | Rubric, nav, prompt là **hằng số có type** — không hardcode trong component | `lib/rubrics.ts`, `lib/nav.ts` |

---

## 6. Ngoài phạm vi

| # | Hạng mục | Ghi chú |
|---|---|---|
| 1 | Multi-user / cloud sync | Chỉ 1 người, 1 máy |
| 2 | Mobile native | PWA ở Phase 3 |
| 3 | Tích hợp bên thứ ba (Notion, Jira, Google Calendar) | Không |
| 4 | Gamification nặng (shop, avatar, leaderboard) | P3 + P7 cấm |
| 5 | Sức khoẻ chuyên sâu (chẩn đoán, đeo máy y tế) | S12 chỉ ghi nhận |
| 6 | Domain thứ 5 | P5 — đóng băng 4 domain |
| 7 | Việc nhóm / cộng tác | Single-user |
| 8 | Đồng bộ Apple Health / Oura | Badge hiển thị trên S13 là **minh hoạ**; chưa có adapter thật |

---

## 7. Tiêu chí nghiệm thu xuyên màn hình (Cross-cutting AC)

> Các AC này áp dụng cho **toàn hệ thống**, kiểm chứng bằng test tự động (xem `design.md` §8.2 và `tasks.md` §Checklist nghiệm thu cuối).

| AC | EARS | Kiểm chứng |
|---|---|---|
| AC-5 | WHEN có 2 lời gọi AI cùng system prompt THEN hệ thống SHALL ghi `cache_read_input_tokens > 0` cho lời gọi thứ 2 | `tests/integration/cache.test.ts` |
| AC-7 | IF không có `ANTHROPIC_API_KEY` THEN hệ thống SHALL vẫn sinh được 6 hành động (qua Ollama hoặc rule cục bộ) và SHALL KHÔNG giả lập phản hồi AI | `tests/integration/offline.test.ts` |
| AC-7b | THE SYSTEM SHALL định tuyến mọi lời gọi AI qua `lib/ai/router.ts`; khi provider cloud lỗi THEN hệ thống SHALL fallback sang provider local và ghi `AiCall{provider:"local", fallbackFrom:"anthropic"}` | `tests/unit/router.test.ts` |
| AC-15 | THE SYSTEM SHALL render 21 route với cùng một sidebar 9 mục (có đúng 1 mục active) + header 4 chip + footer trạng thái DB | `tests/e2e/shell.spec.ts` |
| AC-16 | THE SYSTEM SHALL lưu API key chỉ trong `.env.local` trên máy người dùng; SHALL KHÔNG commit; SHALL KHÔNG hiển thị đầy đủ trong UI; SHALL KHÔNG gửi qua dịch vụ trung gian hoặc cloud storage | `tests/e2e/settings.spec.ts` + grep `sk-ant-` trong repo |
| AC-17 | WHEN người dùng trả lời sai câu trong bài kiểm tra THEN hệ thống SHALL đẩy thẻ tương ứng về `due = hôm nay` + `lapses +1`, và nút "Ôn ngay" SHALL mở S10 đúng các thẻ đó | `tests/integration/test-session.test.ts` |
| AC-18 | WHEN người dùng bấm "Tạo bằng chứng kỹ năng" ở S18 THEN hệ thống SHALL tạo 1 `Evidence` cho skill trọng tâm và cập nhật level; IF người dùng KHÔNG bấm THEN hệ thống SHALL KHÔNG tạo `Evidence` | `tests/integration/interview-report.test.ts` |
| AC-19 | THE SYSTEM SHALL dùng đúng token design system: `headline-sm` = 1.25rem, `rounded-full` = 0.75rem, sidebar `bg-surface-container-lowest`, header `bg-surface-container-lowest/80 backdrop-blur-xl` | snapshot visual + assert token |

---

## 8. Bảng theo dõi truy vết

| Nhóm | Bao phủ | Ghi chú |
|---|---|---|
| User stories | 19 / 21 màn hình | S01+S02 gộp 1 story; S16+S17+S18 tách 3 story |
| Acceptance criteria | 241 mục EARS (§2) + 8 cross-cutting (§7) | |
| Functional requirements | **97 FR** (91 FR gốc + 6 FR mở rộng: FR-AI-09..20, FR-LT-06a/b, FR-MI-10a/b/c/d) | §3 |
| Non-functional | 22 NFR | §5 |
| Screen inventory | 21 / 21 | §4 |
| AI routing | **19 mã AI-xx** → 17 task router gọi AI (10 anthropic · 7 local) + 1 task không gọi AI (`test_blueprint` = AI-14) | §3.7 + `design.md` §6.1 + `SPEC.md` §5.2 |
| Đối chiếu `SPEC.md` | §2, §3, §4, §5, §9 | Task #6 cập nhật §5 cho hybrid router |

---

## 9. Glossary

| Thuật ngữ | Định nghĩa |
|---|---|
| **Active Recall** | Chế độ ôn thẻ hiện nghĩa trước, người học tự nhớ rồi mới lật. |
| **Adaptive Loop** | Cơ chế AI sinh câu hỏi tiếp theo dựa trên độ sâu câu trả lời vừa rồi. |
| **AiCall** | Bảng log mỗi lần gọi AI: provider, model, token, cache read, chi phí, latency, trạng thái, `fallbackFrom`. |
| **AI Router** | Module duy nhất (`src/lib/ai/router.ts`) chọn provider `local` hoặc `anthropic` + model + effort cho mỗi task AI. Không route handler nào gọi SDK trực tiếp. |
| **Fallback chain** | Chuỗi xử lý lỗi bắt buộc: `anthropic lỗi → local (Ollama) → rule cục bộ`. Không bao giờ trả lỗi trần cho UI. |
| **Ollama** | Runtime model local chạy trên máy người dùng (`localhost:11434`). Dùng cho task nhẹ (phân loại, autofill, sửa lỗi ngữ pháp) — **0 token**. |
| **Provider local** | Provider `local` của AI Router: gọi Ollama, không tốn token, hoạt động offline. |
| **Vòng đóng bắt buộc** | 2 vòng: (1) bài kiểm tra → SRS (FR-LT-06), (2) mock interview → Evidence → cây kỹ năng (FR-MI-08/FR-MI-10). Cắt một trong hai thì app chỉ còn là tracker. |
| **Anchor card** | Thẻ được ghim vào đầu phiên ôn tập để đảm bảo mục tiêu hẹn giờ hôm nay không bị bỏ sót. |
| **Anchoring (Neo chức năng)** | Việc ghim 1 thẻ cụ thể lên đầu hàng đợi ôn tập, thay vì để thuật toán tự sắp xếp. |
| **Artifact** | Bản ghi kết quả một hoạt động: bài viết, bản ghi âm, câu trả lời mock interview, bài làm bài kiểm tra. Là nguồn của `Evidence`. |
| **Auto-Verified** | Bằng chứng được hệ thống tự ghi nhận khi hoạt động hoàn tất đúng chuẩn (VD: học xong 1 thẻ SRS) — không cần người dùng xác nhận. |
| **Bằng chứng (Evidence)** | Bản ghi chứng minh một kỹ năng đã được luyện. Mỗi `Evidence` gắn với đúng 1 node cây kỹ năng và có `rating` 0–5. |
| **Bento grid** | Lưới bố cục không đồng nhất: các ô khác nhau về kích thước nhưng lấp đầy không gian, dùng ở S01 và các dashboard. |
| **Biometric** | Chỉ số sinh học: mood, energy, focus, giấc ngủ. Nguồn của mối tương quan giữa trạng thái cơ thể và hiệu suất học. |
| **Cache hit rate** | Tỷ lệ token đầu vào được đọc từ cache thay vì gửi lại. S15 hiển thị `91.4% OPTIMAL`. |
| **CEFR** | Khung thang trình độ dùng chung cho tiếng Anh: A1 → C2. App hiển thị thang nội bộ 5 mức kèm nhãn tương đương. |
| **Context bar** | Dải thông tin nằm dưới header, hiển thị ngữ cảnh của màn hình hiện tại (VD: tên kỹ năng, ID phiên). |
| **Evidence node** | Node trong cây kỹ năng được cấp bằng chứng — mỗi node có `level` 0–5, `targetLevel`, `evidenceCount`. |
| **Focus Flow** | Tên design system của dự án. Nguồn: `stitch_daily_loop_os/focus_flow/DESIGN.md`. |
| **FSRS** | Free Spaced Repetition Scheduler — thuật toán ôn tập giãn cách, phiên bản dùng là **v4.5** (`ts-fsrs`). |
| **Ghi nhanh (Quick-log)** | Sheet 2 bước ghi hoạt động, mục tiêu ≤10 giây (P2). AI điền sẵn domain/kỹ năng/thời lượng/độ khó. |
| **Handoff** | Khoảnh khắc chuyển từ học → luyện → chấm, nơi dữ liệu đi từ đầu vào vào hệ thống đo. |
| **Level** | Cấp độ kỹ năng 0–5 của một node cây kỹ năng. **Không** tự tăng từ checkbox — chỉ tăng khi tích lũy đủ `Evidence` với `rating ≥ 3`. |
| **Local-first** | Nguyên tắc P6: SQLite là nguồn sự thật, không có server giữ trạng thái, dữ liệu cá nhân không rời máy. |
| **Mock Interview** | Phiên phỏng vấn giả lập do AI dẫn (S16–S18), chấm theo rubric kỹ thuật, sinh câu hỏi tiếp theo thích ứng. |
| **Node yếu nhất** | Node cây kỹ năng có điểm ưu tiên thấp nhất (ít bằng chứng / điểm thấp) — điểm neo cho AI sinh câu hỏi. |
| **Ollama Qwen-2.5 7B** | Model local cho phân loại nội dung & autofill quick-log. |
| **Pinyin** | Phiên âm Hán tự Trung Quốc, hiển thị **luôn** ở level 0. |
| **Prompt cache** | Cơ chế cache tiền tố của Anthropic API. System prompt cố định là prefix, có `cache_control`. |
| **Quick-log** | Xem **Ghi nhanh**. |
| **Retention (FSRS)** | Xác suất nhớ được thẻ tại thời điểm hiện tại. Mục tiêu 90%. |
| **Rubric** | Bộ tiêu chí chấm điểm cố định (P4). 4 bộ: communication (5), technical (5), behavioral (4), language-errors (4 nhóm). |
| **Rule-based fallback** | Bộ sinh nội dung bằng quy tắc cục bộ khi không có cả cloud lẫn local — dùng cho kế hoạch ngày. |
| **Skill tree** | Cây 3 tầng `Domain → Kỹ năng → Mục kỹ năng con`, ví dụ `Chuyên môn → System Design → Phân tích yêu cầu`. |
| **Slot** | 1 trong 6 vị trí hành động cố định của ngày. AI chỉ điền nội dung, không được đổi cấu trúc. |
| **Stability (S)** | Tham số FSRS đo quãng thời gian thẻ được nhớ bền. |
| **Difficulty (D)** | Tham số FSRS đo độ khó của thẻ (1–10). |
| **STABLE_SLOTS_V1.1** | Khung 6 slot cố định, dùng làm hợp đồng dữ liệu giữa S01 và S02. |
| **STT / TTS** | Speech-to-Text (nhận dạng giọng nói) / Text-to-Speech (phát âm) — qua Web Speech API, không dùng dịch vụ trả phí. |
| **Stretch** | Tác vụ AI kéo dài hơn dự kiến để đủ độ sâu (VD: phân tích câu trả lời 52 từ trong mock interview). |
| **Target level** | Cấp độ mục tiêu của một node, dùng để tính `Tiêu chuẩn thăng cấp` (S04). |
| **Turn (mock interview)** | Một lượt hỏi–đáp trong mock interview. Mỗi turn: 1 câu hỏi + 1 câu trả lời + điểm 5 tiêu chí. |
| **Vòng lặp** | `Học → Luyện → Chấm → Ghi → Đo`, khép lại bằng AI điều chỉnh kế hoạch tuần sau. |
| **XP** | Điểm kinh nghiệm hiển thị ở quick-log (`+45 XP Skill Node`) — **không** phải tiêu chí thăng cấp (P3). |
| **Zero cloud latency** | Trạng thái khi tác vụ được xử lý hoàn toàn bằng model local — độ trễ mạng = 0. |
