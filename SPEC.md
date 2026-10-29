# SPEC — Daily Loop OS

> Ứng dụng web hỗ trợ phát triển bản thân: kỹ năng chuyên môn, giao tiếp, ngoại ngữ (Tiếng Trung, Tiếng Anh — level 0), theo dõi cá nhân, tích hợp AI.
> Single-user, local-first. Ngôn ngữ giao diện: Tiếng Việt.

- **Phiên bản:** 1.2 (draft để review) — §2.7 và §5 cập nhật cho **AI router hybrid** theo 21 màn hình Stitch
- **Ngày:** 2026-10-29
- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Prisma + SQLite · Anthropic SDK (cloud) + Ollama (local) · ts-fsrs · Web Speech API
- **Trạng thái:** Đã cài deps, chưa viết code ứng dụng.
- **Phạm vi:** 21 màn hình · 9 nhóm yêu cầu chức năng · 15 model dữ liệu · 19 mã AI-xx (11 cloud · 7 local · 1 chọn lọc tất định — tương ứng 18 task router: 17 gọi AI + 1 không gọi AI) · 16 tiêu chí nghiệm thu
- **Đặc tả Kiro:** `.kiro/specs/daily-loop-os/{requirements.md, design.md, tasks.md}` + `.kiro/steering/{product.md, tech.md, structure.md}` — tài liệu này là đặc tả gốc, Kiro spec là bản triển khai chi tiết theo 21 màn hình.

---

## 0. Tổng quan

### 0.1 Vấn đề

Các app tự phát triển bản thân hiện có đều hỏng ở một trong hai chỗ:

| Loại app | Vấn đề |
|---|---|
| Notion / Obsidian (ghi chú) | Không chấm, không đo, không ép hành vi → chỉ là kho lưu |
| Duolingo / Babbel (ngoại ngữ) | Chấm bằng rule cứng, không hiểu ngữ cảnh, không theo dõi tiến bộ bức tranh rộng |
| Habitica / Streaks (thói quen) | Đếm số ngày, không tạo ra năng lực |
| ChatGPT (AI) | Không biết bạn đã làm gì, không có lịch sử, không đo được |

### 0.2 Định vị

Một ứng dụng duy nhất, nơi **AI là người chấm và người phân tích**, không phải chatbot. Bốn mảng người dùng muốn (chuyên môn, giao tiếp, ngoại ngữ, cá nhân) không phải bốn app riêng — chúng là **bốn nguồn dữ liệu đổ vào cùng một vòng lặp ngày**.

```
Học (Input) → Luyện (Practice) → Chấm (Feedback) → Ghi (Reflect) → Đo (Track)
   ↑                                                                        │
   └──────────────── Tuần sau AI điều chỉnh kế hoạch ◄───────────────────┘
```

### 0.3 Nguyên tắc bất di bất dịch

| # | Nguyên tắc | Hệ quả thiết kế |
|---|---|---|
| P1 | **Một màn hình quyết định hôm nay.** | Trang chủ = Daily Loop. Không có dashboard tổng hợp nhiều tab. |
| P2 | **Ghi nhập dưới 10 giây.** | Quick-log 2 chạm; AI điền sẵn form; có nút "vừa học gì" mặc định. |
| P3 | **Tiến độ = bằng chứng, không phải checkbox.** | Mỗi hoạt động tạo ra `Evidence` gắn với một kỹ năng. Không có "% hoàn thành" tự khai. |
| P4 | **AI chấm theo rubric cố định, không tự do bịa tiêu chuẩn.** | Mọi prompt chấm điểm đều kèm rubric định nghĩa sẵn trong system prompt. |
| P5 | **Không thêm domain thứ 5.** | Phạm vi domain đóng băng: chuyên môn, giao tiếp, ngoại ngữ, cá nhân. |
| P6 | **Local-first.** | SQLite trên máy. Nhật ký cá nhân không rời máy. Chỉ nội dung người dùng gửi lên API. |
| P7 | **Không có vanity metric.** | Cấm số liệu không dẫn tới hành động (vd: "đã học 47 tiếng" mà không gắn với kỹ năng nào). |

### 0.4 Phạm vi

**Trong phạm vi (MVP — Phase 0 → 2)**

- Daily Loop với 6 hành động nhỏ/ngày
- Cây kỹ năng 4 domain + bằng chứng
- Quick-log hoạt động
- AI sinh kế hoạch ngày (streaming)
- Module ngoại ngữ: SRS (FSRS) cho zh + en, cấp độ 0
- Module giao tiếp: luyện viết + AI chấm theo rubric
- Nhật ký + AI phản hồi
- Đánh giá chính (mood/energy/sleep)
- Weekly Review do AI tổng hợp
- Báo cáo tiến bộ theo kỹ năng
- Role-play hội thoại AI (đối tác ngoại ngữ)

**Ngoài phạm vi (hiện tại)**

- Tài khoản nhiều người dùng / đồng bộ đám mây
- Mobile native app (PWA ở Phase 3)
- Tích hợp bên thứ ba (Notion, Google Calendar, Strava…)
- Gamification nặng (avatar, quà, cấp độ)
- Sức khỏe & thể chất chuyên sâu (chỉ giữ 1 slot "chăm sóc bản thân")

---

## 1. Người dùng & tình huống sử dụng

**Chủ sở hữu:** 1 người, học 2 ngôn ngữ từ con số 0 (Tiếng Trung, Tiếng Anh), đang làm việc và muốn nâng cao kỹ năng chuyên môn + giao tiếp.

| ID | Tình huống | Màn hình | Kết quả mong đợi |
|---|---|---|---|
| U1 | Mở app lúc 7h sáng, hôm nay học gì? | S01 | Thấy ngay 6 việc nhỏ, không phải suy nghĩ |
| U2 | Học xong 1 chủ đề chuyên môn 25 phút | S05 | Ghi nhập trong ≤10s, tiến độ kỹ năng tăng ngay |
| U3 | Cần ôn 15 từ Trung | S08 | 15 thẻ, tự điều chỉnh độ khó bằng FSRS |
| U4 | Viết email xin nghỉ phép bằng tiếng Anh | S07 | AI chấm theo 5 tiêu chí + gợi ý sửa |
| U5 | Nói chuyện với người bản xứ | S10 | Role-play AI, sửa lỗi phát âm/ngữ pháp sau mỗi lượt |
| U6 | Buổi tối, nhìn lại ngày | S06 | Viết 3 dòng, AI phản hồi 1 câu hỏi sắc |
| U7 | Chủ nhật, xem tuần vừa qua | S12 | Biết mình tiến ở đâu, tuần sau nên làm gì |
| U8 | Đi bộ 20 phút, không biết ghi vào đâu | S05 | Quick-log 2 chạm → hoạt động "chăm sóc bản thân" |
| **U9** | **Muốn biết mình giỏi kỹ năng chuyên môn đến đâu** | **S16–S18** | **1 phiên mock interview 8 câu → điểm 5 tiêu chí + 3 điểm mạnh/3 điểm yếu + gợi ý luyện tiếp** |
| **U10** | **Muốn biết trình độ Trung/Anh hiện tại** | **S19–S21** | **Bài định vị 25 câu → ước lượng level + danh sách từ yếu** |
| **U11** | **Muốn thi lại đề tuần trước để so sánh** | **S19–S21** | **Đề song song về độ khó → biết mình tiến bao nhiêu** |

---

## 2. Yêu cầu chức năng

### 2.1 Daily Loop (hạt nhân)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-DL-01 | Trang chủ hiển thị tối đa **6 hành động nhỏ** cho ngày hiện tại, đúng thứ tự, gắn nhãn domain. | P0 |
| FR-DL-02 | Mỗi hành động có: nhãn domain, tiêu đề hành động, mô tả ngắn (≤120 ký tự), thời lượng dự kiến, kỹ năng liên quan (nếu có). | P0 |
| FR-DL-03 | Bấm "Xong" trên 1 hành động → tự tạo `Activity` + `Evidence` (nếu gắn kỹ năng) + đánh dấu plan item `done`. | P0 |
| FR-DL-04 | Nút "Hoàn thành nhanh" mở Quick-log: chỉ cần chọn domain + gõ 3–5 ký tự mô tả, AI tự điền phần còn lại (kỹ năng, thời lượng, mức độ khó). | P0 |
| FR-DL-05 | Hiển thị chuỗi ngày liên tiếp (streak) và "năng lượng tuần" (0–100%) tính từ tỷ lệ hoàn thành 7 ngày gần nhất. | P0 |
| FR-DL-06 | Nút "Lập lại kế hoạch hôm nay" → gọi AI sinh lại 6 hành động, giữ nguyên các hành động đã xong. | P1 |
| FR-DL-07 | Nếu chưa có kế hoạch trong ngày → hiển thị CTA "Lập kế hoạch hôm nay" (gọi AI) kèm fallback cục bộ khi không có API key. | P0 |
| FR-DL-08 | Ngày mới không tự xóa kế hoạch cũ; lịch sử theo ngày, có thể xem lại bất kỳ ngày nào. | P1 |

**Định dạng 6 slot cố định** (AI chỉ được điền nội dung, không được đổi cấu trúc):

| Slot | Domain | Nội dung | Thời lượng |
|---|---|---|---|
| 1 | `professional` | Học kỹ năng chuyên môn | 25–45′ |
| 2 | `communication` | Luyện giao tiếp | 15–30′ |
| 3 | `language` | Ôn ngoại ngữ (SRS) | 10–20′ |
| 4 | `language` | Luyện ngoại ngữ chủ động (viết/hội thoại) | 15–25′ |
| 5 | `personal` | Nhật ký / suy nghĩ | 5–10′ |
| 6 | `personal` | Chăm sóc thể chất & tinh thần | 15–30′ |

### 2.2 Cây kỹ năng & bằng chứng

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-SK-01 | Cây 3 tầng: **Domain → Kỹ năng → Mục kỹ năng con**. Ví dụ: `Chuyên môn → System Design → Phân tích yêu cầu`. | P0 |
| FR-SK-02 | Mỗi kỹ năng có `level` hiện tại (0–5) và `targetLevel`. | P0 |
| FR-SK-03 | `level` **không tự tăng từ checkbox**. Tăng khi tích lũy đủ `Evidence` với `rating ≥ 3` (ngưỡng cấu hình được). | P0 |
| FR-SK-04 | Mỗi mục kỹ năng có thể mở rộng: khai báo tên, domain, mục cha, mức mục tiêu. | P1 |
| FR-SK-05 | Trang chi tiết kỹ năng hiển thị: lịch sử bằng chứng (ngày, loại hoạt động, điểm), thời gian đã bỏ ra, điểm trung bình. | P0 |
| FR-SK-06 | Điểm kỹ năng hiển thị dạng **thang 0–5 + số bằng chứng**, không phải phần trăm mơ hồ. | P0 |

### 2.3 Ngoại ngữ — Tiếng Trung & Tiếng Anh, level 0

Đây là module phức tạp nhất vì hai ngôn ngữ có cơ chế nhận dạng khác nhau ở level 0.

#### 2.3.1 Thiết kế level 0

**Tiếng Trung (zero → A1)**

| Yếu tố | Xử lý ở level 0 |
|---|---|
| Chữ viết | Hiển thị **pinyin luôn**, kèm hanzi. Hanzi là tùy chọn bật/tắt. |
| Thứ tự bội (stroke order) | Chưa làm giai đoạn 0. Chỉ giới thiệu 4 thanh điệu trong phần "nhận biết" (module học thuật, không phải SRS). |
| Hướng ôn | 3 bước theo thứ tự: **nghe → nhận dạng → sản sinh**. |
| Từ vống | 60 từ cốt lõi độc lập (không dựa vào từ ghép), chia 6 nhóm: chào hỏi/người/thân xã/đồ ăn/địa điểm/thời gian. |
| Ngữ pháp | 10 mẫu câu cơ bản (你好 / 我是… / 这是… / 我要… / 我喜欢… / 我不会… / …在哪里？ / …多少钱？ / 我想学中文 / 谢谢你). |
| Nghe | Dùng Web Speech API (`zh-CN`) để phát âm — không cần TTS trả phí. |

**Tiếng Anh (zero → A1)**

| Yếu tố | Xử lý ở level 0 |
|---|---|
| Chữ viết | Chỉ chữ cái Latin + phonics cơ bản (a/e/i/o/u, nguyên âm dài, phụ âm ghép). |
| Từ vống | 60 từ cốt lõi: pronouns, numbers 1–20, family, food, colors, basic verbs (be/have/go/do/like/want), adjectives. |
| Ngữ pháp | 10 mẫu câu (I am… / My name is… / I have… / I like… / I want… / This is… / What is…? / How are you? / Nice to meet you / Thank you). |
| Nghe | Web Speech API (`en-US`). |
| Cổng vào | "Đường vào" cho người Việt: mỗi từ hiển thị **phiên âm gần đúng kiểu Việt** (vd: `water` → "u-tờ-ờ") trong 2 tuần đầu, sau đó tắt dần. |

#### 2.3.2 Yêu cầu SRS

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-LG-01 | Mỗi thẻ có `lang` (zh/en), mặt trước, mặt sau, ghi chú, ví dụ câu, nhóm/chủ đề, `mode` (recognize/recall/produce). | P0 |
| FR-LG-02 | Lịch ôn dùng **FSRS** (thuật toán `ts-fsrs`), lưu state dạng JSON. | P0 |
| FR-LG-03 | 4 nút chấm: **Again / Hard / Good / Easy** — hiển thị kèm gợi ý thời gian tới lượt ôn kế tiếp (đọc từ state FSRS). | P0 |
| FR-LG-04 | Phiên ôn: lấy thẻ đến hạn trước; nếu hết thẻ đến hạn → lấy thẻ mới từ nhóm chưa học, tối đa 20 thẻ/phiên. | P0 |
| FR-LG-05 | Ở level 0, mặt trước hiển thị **pinyin (zh) hoặc từ (en) + nút nghe**, mặt sau hiển thị **hanzi + nghĩa + ví dụ câu + nút nghe**. | P0 |
| FR-LG-06 | Chế độ `produce`: hiển thị nghĩa, người dùng **gõ** hoặc **nói** (Web Speech Recognition `zh-CN`/`en-US`), app so khớp chuỗi và chấm fuzzy. | P2 |
| FR-LG-07 | Thẻ sai (rating 1) → tự sinh lại thẻ biến thể: ví dụ câu khác, hoặc thẻ "điền vào chỗ trống". | P2 |
| FR-LG-08 | Từ khóa trong bài viết của người dùng → hiện nút "Thêm vào ôn" (Phase 2). | P2 |
| FR-LG-09 | Tiến độ mỗi ngôn ngữ: số thẻ đã học / đang học / đã thuộc, chuỗi ngày ôn. | P0 |
| FR-LG-10 | Seed sẵn 60 thẻ zh + 60 thẻ en + 10 mẫu câu mỗi ngôn ngữ (nội dung biên tập sẵn, không nhờ AI sinh — chất lượng level 0 cần người biết ngôn ngữ duyệt). | P0 |

### 2.4 Giao tiếp

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-CM-01 | 3 chế độ luyện: **Viết**, **Nói**, **Hội thoại AI**. | P0 (viết) / P1 (nói) / P2 (hội thoại) |
| FR-CM-02 | AI chấm viết theo **rubric 5 tiêu chí**: ① Rõ ràng ② Cấu trúc ③ Giọng văn ④ Tự nhiên ⑤ Ngữ pháp — mỗi tiêu chí 0–5, kèm 1 câu nhận xét + 1 đề xuất sửa cụ thể. | P0 |
| FR-CM-03 | So sánh với lần ghi trước của chính người dùng (cùng tiêu chí) → hiển thị delta "tăng/giảm". | P1 |
| FR-CM-04 | Chế độ Nói: ghi âm qua MediaRecorder → Web Speech API transcribe → AI chấm theo cùng rubric + ghi chú về từ điệu/độ rõ. | P1 |
| FR-CM-05 | Chế độ Hội thoại AI: chọn tình huống (phỏng vấn xin việc, đàm phán giá, hội thoại với đồng nghiệp nước ngoài, trình bày dự án), AI đóng vai, trả lời bằng tiếng Anh/Trung theo level người dùng. | P2 |
| FR-CM-06 | Tình huống hội thoại có **mục tiêu ẩn** (ví dụ "thuyết phục đối tác chấp nhận deadline mới") — sau cuộc hội thoại AI chấm mức độ đạt mục tiêu. | P2 |
| FR-CM-07 | Mọi bài luyện giao tiếp đều lưu vào `Activity` với domain `communication` và tạo `Evidence` cho kỹ năng giao tiếp tương ứng. | P0 |
| FR-CM-08 | Kho bài luyện: người dùng tự tạo prompt luyện (vd: "Nhắn bạn hủy lịch họp") nếu muốn. | P1 |

### 2.5 Theo dõi cá nhân

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-PS-01 | Đánh giá chính 4 chỉ số: **mood** (1–5), **energy** (1–5), **giấc ngủ** (giờ), **tập trung** (1–5). Ghi trong ≤15 giây. | P0 |
| FR-PS-02 | Nhật ký tự do, có gợi ý 3 câu hỏi mở theo ngữ cảnh (sau buổi học / cuối ngày / cuối tuần). | P0 |
| FR-PS-03 | AI phản hồi nhật ký: tóm tắt 1 câu + **1 câu hỏi sắc** (không phải lời khuyên dài). | P0 |
| FR-PS-04 | AI tự gán domain/kỹ năng cho nội dung nhật ký (classification → `claude-haiku-4-5`). | P1 |
| FR-PS-05 | Phân tích tương quan: tìm quan hệ giữa chỉ số chính ↔ hiệu suất học. Ví dụ "khi ngủ < 6h, điểm tập trung hôm sau giảm 30%". | P2 |
| FR-PS-06 | Biểu đồ: mood/energy/sleep theo tuần, overlay với số hành động hoàn thành. | P1 |
| FR-PS-07 | Dữ liệu cá nhân **không rời máy**: chỉ gửi lên API những đoạn người dùng chủ động nhờ AI phản hồi/phân tích. Có màn hình hiển thị "dữ liệu nào đã gửi lên". | P0 |

### 2.6 Weekly Review

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-WR-01 | Tự chạy Chủ nhật 20:00 (hoặc mở app lần đầu trong tuần mới). | P1 |
| FR-WR-02 | Tổng hợp: số hành động hoàn thành, phân bố theo domain, kỹ năng tiến bộ nhiều nhất, chỉ số cá nhân, so với tuần trước. | P1 |
| FR-WR-03 | AI sinh **nhận định 3 điểm** (1 điều đã làm tốt, 1 điểm cần sửa, 1 điều nên thử tuần sau). | P1 |
| FR-WR-04 | AI đề xuất kế hoạch tuần sau dựa trên dữ liệu + kỹ năng còn yếu. | P1 |
| FR-WR-05 | Nếu người dùng trượt ≥2 ngày liên tiếp → AI **tự giảm tải** kế hoạch tuần sau (ít slot hơn, thời lượng ngắn hơn), có ghi chú lý do. | P2 |
| FR-WR-06 | Người dùng có thể chỉnh kế hoạch AI đề xuất trước khi duyệt. | P1 |

### 2.7 AI layer (chung)

> **Bối cảnh (sửa ở v1.2):** 21 màn hình Stitch thể hiện một **AI router hybrid**, không phải Anthropic-only. Header mọi màn hình hiển thị badge `AI Offline / Local (Ollama)`; các màn hình cụ thể nhắc tới `Ollama Qwen-2.5 7B`, `Local Llama-3.3 + Opus`, `Qwen2.5-Coder-7B-Instruct (Local)`. Vì vậy §5 bổ sung tầng local. Bản đặc tả chi tiết: `.kiro/specs/daily-loop-os/design.md` §6 và `.kiro/steering/tech.md`.

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-AI-01 | Mọi lời gọi AI dùng **prompt caching** với system prompt cố định làm prefix. | P0 |
| FR-AI-02 | Mọi lời gọi trả về nội dung dài dùng **streaming**. | P0 |
| FR-AI-03 | Phân tuyến model: `claude-opus-5` cho chấm điểm/sinh kế hoạch/role-play; `claude-haiku-4-5` cho phân loại & trích xuất. | P0 |
| FR-AI-04 | Output có cấu trúc (rubric, plan) dùng **structured outputs** (`output_config.format`), không parse text tự do. | P0 |
| FR-AI-05 | Xử lý `stop_reason: "refusal"` và lỗi API theo chuỗi exception typed của SDK; hiển thị thông báo thân thiện, không crash. | P0 |
| FR-AI-06 | Nếu không có `ANTHROPIC_API_KEY` → app chạy ở **chế độ offline**: kế hoạch ngày sinh bằng rule cục bộ, mọi tính năng AI khác hiển thị "cần API key". | P0 |
| FR-AI-07 | Ghi log usage (input/output/cache tokens) vào bảng `AiCall` để theo dõi chi phí. | P1 |
| FR-AI-08 | Prompt caching phải kiểm chứng được: hiển thị `cache_read_input_tokens` ở màn hình Cài đặt → Chi phí. | P2 |
| **FR-AI-09** | **Router duy nhất**: mọi lời gọi AI đi qua `src/lib/ai/router.ts`; route handler **không** gọi SDK trực tiếp. Router trả `{ provider, model, effort }` với `provider` ∈ `local` / `anthropic`. | P0 |
| **FR-AI-10** | **Fallback chain bắt buộc**: `anthropic → local (Ollama) → rule cục bộ`. Không bao giờ trả lỗi trần cho UI; luôn có phản hồi kèm nhãn provider đã dùng. | P0 |
| **FR-AI-11** | **Badge header phản ánh provider thật**: `AI Offline / Local (Ollama)` khi dùng local, `Claude Opus 5` / `Claude Haiku 4.5` khi dùng cloud. Nhãn cập nhật theo kết quả gọi gần nhất, không hardcode. | P1 |
| **FR-AI-12** | **Phát hiện Ollama**: hệ thống gọi `GET /api/tags` (timeout 3s) để biết model local nào khả dụng và hiển thị danh sách tại S15; nếu Ollama không chạy → hiển thị trạng thái "Offline" + hướng dẫn cài đặt. | P1 |
| **FR-AI-13** | **Mọi lần gọi provider `local`** ghi `AiCall{provider:"local", estimatedCost:0}` để S15 tách chi phí cloud vs local. | P0 |
| **FR-AI-14** | **Khi xảy ra fallback**, ghi `AiCall.fallbackFrom` = provider gốc để đếm chính xác số lượt offline fallback (S15 hiển thị `3 offline fallback`). | P1 |
| **FR-AI-15** | **Bảng định tuyến task → provider là hợp đồng**, đối chiếu trực tiếp nhãn provider trong 21 màn hình Stitch. Bảng chuẩn: `design.md` §6.1. Khi thiết kế đổi → cập nhật cả 3 bảng (`SPEC.md` §5.2 · `design.md` §6.1 · `tech.md`). | P0 |
| **FR-AI-16** | **Sinh đề tự tạo từ nguồn văn bản** (S19 `from_content`) chạy provider **local** (`qwen2.5:7b`) theo nhãn `CẤU TRÚC ĐỀ TỰ TẠO: Ollama Qwen-2.5 7B` — không dùng cloud. | P1 |
| **FR-AI-17** | **Blueprint bài kiểm tra (AI-14) không gọi AI** — chọn lọc tất định từ thẻ đến hạn + ngân hàng seed đã biên tập (đúng FR-LT-12 "đề song song về độ khó"). Chỉ `from_content` mới thật sự sinh đề. Mọi nội dung **sinh trước** (role profile S16, ngân hàng câu hỏi S08, bài kiểm tra seed S19) là dữ liệu tĩnh trong DB — **không** gọi AI lúc render. | P0 |
| **FR-AI-18** | **Suy diễn tương quan sinh trắc ↔ hiệu suất** (S12, task `biometric_correlate`) chạy provider **local** (`llama3.3`) theo nhãn `Engine suy diễn cục bộ (Local Vector Engine)`; dữ liệu sinh trắc **không** rời máy (P6 STRICT). | P1 |
| **FR-AI-19** | **Sinh câu hỏi tiếp theo** trong adaptive loop (S17, task `mock_next_question`) chạy provider **local** (`llama3.3`) theo nhãn `Mô hình đánh giá: Local Llama-3.3 + Opus`; phần **chấm điểm** vẫn là cloud. | P1 |
| **FR-AI-20** | **Phân loại nội dung** (task `classify`, mã AI-06) mặc định dùng provider **local** (`qwen2.5:7b`, 0 token, offline-safe). Đường cloud `claude-haiku-4-5` chỉ dùng khi người dùng **tuỳ chọn** trong S15 (chấp nhận chi phí). Nguyên tắc chung: **tác vụ local được ưu tiên khi phù hợp** — autofill quick-log (`qwen2.5:7b`), sửa lỗi ngữ pháp (`qwen2.5-coder:7b-instruct`). | P1 |

### 2.8. Mock Interview — Tự đánh giá kỹ năng chuyên môn

> **Vì sao đây là tính năng quan trọng nhất của app:** nó biến "theo dõi tiến độ" thành "đo được". Không có nó, `Evidence` chỉ là bằng chứng năng lực — không có bài kiểm tra nào đo bạn đã tiến bao xa.

#### 2.8.1 Nguyên tắc thiết kế

**Câu hỏi lấy từ cây kỹ năng CỦA CHÍNH BẠN.** AI không hỏi câu hỏi chung chung ("giải thích REST"), mà hỏi về đúng những mục kỹ năng bạn đang xây — ưu tiên những mục **ít bằng chứng nhất, level thấp nhất**. Kết quả: bài kiểm tra đo đúng chỗ bạn yếu, thay vì hỏi về thứ bạn đã thành thạo.

**Một phiên = một vòng hỏi–đáp–chấm liên tục**, không phải 8 câu rời rạc. AI chấm câu trước rồi *quyết định câu tiếp theo* dựa trên chất lượng trả lời (follow-up nếu trả lời hời hợt, chuyển sang câu mới nếu đã đủ).

#### 2.8.2 Yêu cầu chức năng

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-MI-01 | Hồ sơ vai trò: `jobTitle`, `seniority` (junior/mid/senior), `focusSkills[]`, `language` phỏng vấn, `questionKinds[]`. Lưu được nhiều hồ sơ (VD: "Backend Engineer", "Product Manager"). | P0 |
| FR-MI-02 | Sinh câu hỏi từ `Skill` tree: ưu tiên mục có ít bằng chứng nhất; cân bằng giữa các dạng câu đã chọn. | P0 |
| FR-MI-03 | 5 dạng câu hỏi: `concept` (kiến thức nền) · `design` (thiết kế hệ thống) · `debug` (điều tra sự cố) · `tradeoff` (đánh đổi) · `behavioral` (hành vi, theo STAR). | P0 |
| FR-MI-04 | **Rubric kỹ thuật** (5 tiêu chí, 0–5): ① Chính xác (nội dung đúng) ② Chiều sâu (đi sâu không dừng ở bề mặt) ③ Lập luận (có bước suy luận rõ) ④ Giao tiếp (diễn đạt rõ, có cấu trúc) ⑤ Nhận biết đánh đổi (nói được cái giá của lựa chọn). | P0 |
| FR-MI-05 | **Rubric hành vi** (4 tiêu chí, 0–5): ① Cụ thể (có ví dụ thật, không chung chung) ② Đầy đủ STAR (tình huống→nhiệm vụ→hành động→kết quả) ③ Tự nhận thức (biết mình sai ở đâu) ④ Kết quả (có kết quả đo được). | P0 |
| FR-MI-06 | **Adaptive**: mỗi lượt AI làm 2 việc trong 1 call — chấm câu vừa trả lời + sinh câu tiếp theo (follow-up hoặc câu mới). | P0 |
| FR-MI-07 | Trả lời bằng **văn bản** (luôn) hoặc **giọng nói** (STT qua Web Speech API). Ngôn ngữ trả lời theo hồ sơ. | P0 (văn bản) / P1 (giọng nói) |
| FR-MI-08 | Báo cáo cuối phiên: điểm từng tiêu chí, điểm tổng, **3 điểm mạnh cụ thể** (trích dẫn câu trả lời) + **3 điểm yếu cụ thể**, và **đề xuất luyện tiếp** trỏ tới `Skill` cụ thể trong cây. | P0 |
| FR-MI-09 | So sánh với phiên trước cùng hồ sơ vai trò: delta từng tiêu chí + biểu đồ tiến bộ theo thời gian. | P1 |
| FR-MI-10 | Lưu: 1 `Activity` (domain `professional`, type `mock_interview`, `aiScore` = điểm tổng) + `Evidence` cho `Skill` trọng tâm nhất của phiên. | P0 |
| FR-MI-11 | Nút "Câu hỏi này có vấn đề" → ghi log để cải thiện chất lượng sinh câu hỏi. | P1 |
| FR-MI-12 | Chọn số câu: 5 (khai thác nhanh) · 8 (chuẩn) · 12 (kỹ). | P0 |
| FR-MI-13 | Cho phép dừng giữa chừng; phiên bị bỏ dở giữ nguyên, resume được. | P1 |
| FR-MI-14 | Trả lời bằng **tiếng Anh** → phiên đó vừa đo kỹ năng chuyên môn **vừa** đo tiếng Anh. Điểm ghi riêng cho "clarity of expression". | P2 |

#### 2.8.3 Chi phí

Một phiên 8 câu = 9 call. Nhờ prompt caching (hồ sơ vai trò + rubric là prefix cố định) và lịch sử hội thoại **chỉ append** (nên phần lớn token vẫn ăn cache), ước tính **~$0.15–0.30 mỗi phiên**. 2 phiên/tuần ≈ **$1–2.5/tháng**. Đây là tính năng **rẻ nhất** trong toàn bộ app, dù giá trị cao nhất.

### 2.9. Bài kiểm tra ngoại ngữ

> **Điểm mấu chốt:** điểm kiểm tra phải **chảy ngược về SRS**. Bài kiểm tra không phải một màn hình tách rời — nó là cách bạn phát hiện từ nào còn yếu, và SRS tự đưa những từ đó về đến hạn sớm.

#### 2.9.1 Bốn loại bài kiểm tra

| Loại | Mã | Mục đích | Số câu | Có timer |
|---|---|---|---|---|
| **Định vị** | `placement` | Xác định level khởi đầu thật (chạy 1 lần, kết quả set `zhLevel`/`enLevel` + gợi ý nhóm từ bắt đầu) | 25 | Không |
| **Theo chủ đề** | `topic` | Luyện/skim 1 chủ đề cụ thể ("ẩm thực", "đi làm") | 20 | Không |
| **Chuẩn** | `benchmark` | Đo tiến bộ định kỳ (2–4 tuần/lần), so sánh được giữa các lần | 40 | Có |
| **Từ nội dung** | `from_content` | Dán bài báo/đoạn sách → câu hỏi đọc hiểu + chấm bài tóm tắt của bạn | 10 | Có |

#### 2.9.2 Yêu cầu chức năng

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-LT-01 | Blueprint sinh câu: `{lang, level, topic, itemTypes[], count}` → AI sinh đúng số câu, đúng phân bố dạng. | P0 |
| FR-LT-02 | 6 dạng câu: `mc_vocab` (nghe → chọn nghĩa) · `mc_grammar` · `cloze` (điền từ vào chỗ trống) · `listening` (nghe đoạn → trả lời) · `writing` (tự luận) · `translation` (dịch). | P0 |
| FR-LT-03 | Timer đếm ngược (benchmark, from_content), lưu thời gian từng câu. | P1 |
| FR-LT-04 | Chấm tự động cho `mc_*`/`cloze`/`listening`; AI chấm cho `writing`/`translation` theo **rubric 4 nhóm lỗi** (ngữ pháp · từ vựng · cách diễn đạt · ngữ cảnh). | P0 |
| FR-LT-05 | Kết quả: tổng điểm, phân tách theo `itemType`, ước lượng level, danh sách câu sai kèm giải thích. | P0 |
| FR-LT-06 | **Feedback loop SRS (quan trọng nhất)**: mỗi câu sai gắn với `cardId` → đặt `due = hôm nay`, hạ `stability`, tăng `lapses` (tương đương FSRS rating `Again`). Người dùng thấy: "3 thẻ này bị đẩy về ôn sớm". | P0 |
| FR-LT-07 | `placement` → set `UserProfile.zhLevel`/`enLevel`, gợi ý bắt đầu từ nhóm từ nào và có bài tập đầu tiên. | P0 |
| FR-LT-08 | `benchmark` định kỳ → biểu đồ level theo thời gian, song song với tiến bộ SRS. | P1 |
| FR-LT-09 | `from_content`: dán văn bản → AI sinh câu đọc hiểu + chấm phần tóm tắt bằng tiếng đích. | P2 |
| FR-LT-10 | **Item từ vựng lấy từ thẻ của chính người dùng** (ưu tiên thẻ yếu: nhiều `lapses`, `difficulty` cao) + ngân hàng seed cho level đó → bài kiểm tra đo **tiến bộ thật** chứ không phải trí nhớ tình cờ. | P0 |
| FR-LT-11 | Mọi bài kiểm tra tạo `Activity` (domain `language`, type `test`) + `Evidence` cho skill ngôn ngữ tương ứng. | P0 |
| FR-LT-12 | Đề thi cho cùng 1 `topic` phải **song song về độ khó** (parallel form) để điểm các lần so sánh được. | P1 |

#### 2.9.3 Vì sao vẫn cần seed 120 thẻ thủ công

AI sinh được câu hỏi, nhưng **từ vựng nền tảng vẫn phải biên tập tay** (rủi ro R6). Trong bài kiểm tra, các item từ vựng luôn lấy từ: (a) thẻ người dùng đã học, hoặc (b) ngân hàng seed đã duyệt. AI chỉ được sinh **cách hỏi** (câu hỏi nghe, câu điền chỗ trống, câu dịch) chứ không được sinh **từ mới**.

---

## 3. Danh sách màn hình

### 3.1 Bảng tổng quan

| ID | Tên | Route | Phase | Mục đích |
|---|---|---|---|---|
| S01 | Daily Loop | `/` | 0 | Màn hình duy nhất quyết định hôm nay làm gì |
| S02 | Sinh kế hoạch AI | `/plan` | 0 | Xem/sửa 6 hành động, sinh lại, duyệt |
| S03 | Cây kỹ năng | `/skills` | 0 | Nhìn toàn bộ kỹ năng + tiến độ |
| S04 | Chi tiết kỹ năng | `/skills/[id]` | 0 | Lịch sử bằng chứng, thời gian, điểm |
| S05 | Quick-log | `/log` (sheet) + `/log/history` | 0 | Ghi hoạt động trong ≤10s |
| S06 | Nhật ký & phản hồi AI | `/journal` | 0 | Viết nhật ký, nhận phản hồi |
| S07 | Luyện giao tiếp — Viết | `/speak/write` | 1 | Viết & AI chấm theo rubric |
| S08 | Luyện giao tiếp — Nói | `/speak/talk` | 1 | Nói & AI chấm |
| S09 | Ôn ngoại ngữ (SRS) | `/language` | 0 | Phiên ôn thẻ zh/en |
| S10 | Chi tiết thẻ ôn | `/language/session` | 0 | 1 thẻ 1 lượt, 4 nút chấm |
| S11 | Luyện ngoại ngữ chủ động | `/language/practice` | 2 | Viết / hội thoại AI theo ngôn ngữ |
| S12 | Đánh giá chính | `/state` | 0 | Mood/energy/sleep/focus |
| S13 | Báo cáo tuần | `/review` | 1 | Tổng hợp tuần + AI nhận định |
| S14 | Báo cáo tiến bộ | `/progress` | 1 | Biểu đồ theo kỹ năng & domain |
| S15 | Cài đặt | `/settings` | 0 | Hồ sơ, mục tiêu, API key, chi phí, xuất dữ liệu |
| S16 | Mock Interview — cấu hình | `/interview/setup` | 1 | Chọn hồ sơ vai trò, dạng câu, số câu |
| S17 | Mock Interview — phiên | `/interview/session` | 1 | Hỏi–đáp–chấm liên tục, AI chấm từng câu |
| S18 | Mock Interview — kết quả | `/interview/[id]` | 1 | Điểm rubric, 3 điểm mạnh/3 điểm yếu, đề xuất luyện |
| S19 | Bài kiểm tra ngoại ngữ | `/test` | 1 | Danh sách bài kiểm tra theo loại |
| S20 | Làm bài kiểm tra | `/test/session` | 1 | 1 câu 1 lượt, timer, chấm ngay |
| S21 | Kết quả bài kiểm tra | `/test/[id]` | 1 | Điểm, phân tách theo dạng, câu sai, ước lượng level |

**Điều hướng:** Trang chủ `S01` không có thanh điều hướng dưới (bottom nav) dày; chỉ 4 nút dưới: **Hôm nay · Kỹ năng · Ôn tập · Nhật ký**. Các màn hình khác mở từ S01 hoặc từ menu trên góc phải.

**Điều hướng phụ:** Menu góc phải S01 mở ra: Báo cáo tuần · Báo cáo tiến bộ · Mock Interview · Bài kiểm tra · Cài đặt.

### 3.2 Chi tiết từng màn hình

---

#### S01 — Daily Loop (Trang chủ)

**Route:** `/` · **Component:** `app/page.tsx` (Server Component) + `components/daily-loop/*.tsx` (Client)

```
┌──────────────────────────────────────────────┐
│  Thứ Tư 29/10          🔥 12   ⚡ 78%   ⚙︎   │
├──────────────────────────────────────────────┤
│  HÔM NAY                                  ⋮  │
│  ┌────────────────────────────────────────┐  │
│  │ ● Chuyên môn    35′   Phân tích yêu cầu│  │
│  │   Viết 5 use case cho hệ thống đặt vé   │  │
│  │                                  [Xong] │  │
│  ├────────────────────────────────────────┤  │
│  │ ● Giao tiếp      20′   Trình bày bản thảo│  │
│  │   Nói 60 giây về dự án của bạn          │  │
│  │                                  [Xong] │  │
│  ├────────────────────────────────────────┤  │
│  │ ○ Ngoại ngữ     15′   Ôn 15 từ · Tiếng Trung│
│  │   12 thẻ đến hạn, 3 thẻ mới             │  │
│  │                             [Bắt đầu →] │  │
│  ├────────────────────────────────────────┤  │
│  │ ○ Ngoại ngữ     20′   Luyện nói · Tiếng Anh│
│  │   Tình huống: giới thiệu bản thân        │  │
│  │                             [Bắt đầu →] │  │
│  ├────────────────────────────────────────┤  │
│  │ ○ Cá nhân       10′   Nhật ký tối       │  │
│  │   3 câu hỏi gợi ý                       │  │
│  │                             [Viết →]    │  │
│  ├────────────────────────────────────────┤  │
│  │ ○ Cá nhân       20′   Đi bộ & thở        │  │
│  │   20 phút đi bộ ngoài trời              │  │
│  │                             [Xong]      │  │
│  └────────────────────────────────────────┘  │
│                                               │
│  [+ Ghi nhanh]        [Lập lại kế hoạch hôm nay]│
├──────────────────────────────────────────────┤
│  TRỌNG TÂM HÔM NAY: Phân tích yêu cầu        │
│  Thang 2/5  ·  7 bằng chứng  ·  1.5h đã bỏ   │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░           │
└──────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Nguồn dữ liệu | `PlanItem` của ngày hôm nay, `Activity` 7 ngày gần nhất, `Skill` trọng tâm |
| Hành vi | Vẽ bằng Server Component; phần tương tác (đánh dấu xong, mở sheet) là Client Component |
| Hành động | Đánh dấu xong · Mở quick-log · Mở màn hình đích của slot · Lập lại kế hoạch · Đổi trọng tâm |
| Trạng thái rỗng | "Chưa có kế hoạch hôm nay" + nút `[Lập kế hoạch hôm nay]` |
| Trạng thái lỗi | API lỗi → hiện kế hoạch fallback cục bộ + banner "Đang dùng kế hoạch offline" |
| Mobile-first | 1 cột; nút hành động full-width, đặt ở giữa ngón cái |

---

#### S02 — Sinh kế hoạch AI

**Route:** `/plan`

| Thuộc tính | Nội dung |
|---|---|
| Mục đích | Xem trước, sửa, duyệt 6 hành động AI đề xuất |
| Luồng | `POST /api/plan/generate` (stream) → hiển thị từng slot khi text về → nút `[Duyệt kế hoạch]` ghi vào DB |
| Chỉnh sửa | Sửa tiêu đề/thời lượng/kỹ năng của từng slot inline; kéo đổi thứ tự slot |
| Giữ nguyên | Slot đã `done` không bị ghi đè khi sinh lại |
| Trạng thái | Đang sinh (skeleton từng slot) · Sinh xong · Lỗi (nút thử lại) · Không có API key (dùng bộ sinh rule cục bộ) |

---

#### S03 — Cây kỹ năng

**Route:** `/skills`

```
Chuyên môn                    ▓▓▓▓▓▓▓░░░  2/5
├─ System Design         ▓▓▓▓░░░░░░░  1/5   · 12 bằng chứng
│  ├─ Phân tích yêu cầu    ● trọng tâm   · 4 bằng chứng
│  └─ Lựa chọn giải pháp              · 0 bằng chứng
└─ Quản lý dữ liệu        ▓░░░░░░░░░░  0/5

Giao tiếp
├─ Viết                  ▓▓▓░░░░░░░░  0/5
├─ Nói                   ▓░░░░░░░░░░  0/5
└─ Phỏng vấn             ▓░░░░░░░░░░  0/5

Ngoại ngữ
├─ Tiếng Trung            ▓▓░░░░░░░░  0/5
└─ Tiếng Anh             ▓░░░░░░░░░░  0/5

Cá nhân
├─ Nhật ký               ▓▓░░░░░░░░  0/5
├─ Thể chất              ▓░░░░░░░░░░  0/5
└─ Quản lý thời gian      ▓░░░░░░░░░░  0/5
```

| Thuộc tính | Nội dung |
|---|---|
| Dữ liệu | `Skill` (cây) + đếm `Evidence` + mức hiện tại |
| Hành vi | Expand/collapse theo domain; bấm mục → S04 |
| Hành động | Thêm kỹ năng · Thêm mục con · Đặt mức mục tiêu · Đặt trọng tâm hôm nay |
| Bổ sung | Nút `+ Thêm kỹ năng` mở form nhỏ; tên tiếng Việt, gắn domain, mức mục tiêu 1–5 |

---

#### S04 — Chi tiết kỹ năng

**Route:** `/skills/[id]`

| Thuộc tính | Nội dung |
|---|---|
| Nội dung | Header (tên, đường dẫn cha–con, thang 0–5, số bằng chứng) · Biểu đồ thang theo thời gian · Tổng thời gian đã bỏ ra · Điểm trung bình theo loại hoạt động · **Bảng bằng chứng** (ngày · loại · tiêu đề · điểm) · Nút "Ôn kỹ năng này" |
| Hành động | Ghi hoạt động cho kỹ năng này · Xem chi tiết 1 bằng chứng |
| Edge | Kỹ năng chưa có bằng chứng → hiện hướng dẫn "Làm gì để tạo bằng chứng đầu tiên" |

---

#### S05 — Quick-log

**Route:** `/log` (mở dạng bottom sheet từ S01) · `/log/history` (toàn bộ lịch sử)

**Sheet — 2 bước, mục tiêu ≤10 giây**

```
Bước 1 (2 chạm)                     Bước 2 (nếu muốn chi tiết)
┌──────────────────────────┐        ┌──────────────────────────┐
│ Hôm nay bạn đã làm gì?  │        │ ▸ Chuyên môn   [Đã học] │
│                          │        │ ▸ Giao tiếp    [Luyện nói]│
│ [Học] [Luyện] [Viết]    │        │ ▸ Ngoại ngữ   [Ôn từ]   │
│ [Nói]  [Nhật ký] [Khác]  │        │ ▸ Cá nhân     [Đi bộ]  │
│                          │        │                          │
│ [ Ôn từ vựng Trung Quốc ]│        │ Thời lượng:  [25'] [45']│
│           [Ghi nhanh]    │        │ Mức độ khó:  ●○○○       │
└──────────────────────────┘        │ Ghi chú (tuỳ chọn)      │
                                    │      [Lưu]  [Bỏ qua]    │
                                    └──────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Hành vi | Bước 1: chọn loại + gõ tự do (vd "ôn từ vựng Trung Quốc") → app tự suy ra domain + kỹ năng + thời lượng bằng AI (nếu có key) hoặc rule cục bộ (nếu không). Người dùng có thể bấm `[Bỏ qua]` và lưu ngay. |
| Lưu | `POST /api/log` → tạo `Activity` (+ `Evidence` nếu có kỹ năng) → toast "Đã ghi" |
| Lịch sử | `/log/history`: danh sách theo ngày, lọc theo domain, sửa/xoá 1 mục |

---

#### S06 — Nhật ký & phản hồi AI

**Route:** `/journal`

| Thuộc tính | Nội dung |
|---|---|
| Bố cục | Textarea lớn + 3 gợi ý câu hỏi (chips, bấm để chèn) + nút `[Gửi AI phản hồi]` + khung phản hồi bên dưới |
| Gợi ý theo ngữ cảnh | Sau buổi học → "Điều gì học được hôm nay khiến bạn bất ngờ nhất?" · Cuối ngày → "Hôm nay có lý do gì để không làm hết kế hoạch?" · Cuối tuần → "Tuần này bạn đã nói 'không' với điều gì?" |
| Phản hồi AI | 1 câu tóm tắt + 1 câu hỏi sắc. Không có mục "lời khuyên dài". |
| Lưu | Mỗi mục nhật ký = 1 `Activity` type `journal` + 1 `Reflection` (prompt, answer, aiFeedback) |
| Không có API key | Nút AI bị ẩn, hiện "Bật phản hồi AI bằng cách thêm API key trong Cài đặt" |

---

#### S07 — Luyện giao tiếp (Viết)

**Route:** `/speak/write`

```
Bài tập: "Viết email cho sếp xin 2 ngày nghỉ phép"
Mức độ: [A1] [A2] [B1] [B2] [C1]

┌────────────────────────────────────────────┐
│ Subject: ...                               │
│ Dear ...                                   │
│ ...                                        │
└────────────────────────────────────────────┘
        [Chấm bằng AI]   (Ctrl+Enter)

Kết quả:
┌────────────────────────────────────────────┐
│ Rõ ràng        4/5  ✓ Nêu rõ việc cần nghỉ │
│ Cấu trúc       3/5  ~ Thiếu 1 dòng chào mừng │
│ Giọng văn      5/5  ✓ Lịch sự, đúng mức     │
│ Tự nhiên       3/5  ~ "Dear Sir" hơi cứng  │
│ Ngữ pháp       4/5  ✓ Chỉ 1 lỗi dấu câu     │
├────────────────────────────────────────────┤
│ Tổng: 3.8/5   ·  So với lần trước: ▲ +0.4   │
│ 1 đề xuất sửa: "Dear Sir" → "Hi Mr. Minh"  │
└────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Kho bài | 12 bài mẫu có sẵn (5 level × ngôn ngữ) + bài tự tạo |
| AI chấm | `claude-opus-5`, structured output, rubric cố định trong system prompt (P4) |
| So sánh | Tra cùng rubric của lần ghi gần nhất → delta |
| Lưu | `Activity` domain `communication` + `Evidence` cho kỹ năng "Viết" |

---

#### S08 — Luyện giao tiếp (Nói)

**Route:** `/speak/talk` — ghi âm → transcribe → chấm. Chi tiết để ở Phase 1.

---

#### S09 — Ôn ngoại ngữ (SRS)

**Route:** `/language`

```
Tiếng Trung   Đang học 24  ·  Đã thuộc 18  ·  Đến hạn 12
Tiếng Anh     Đang học 31  ·  Đã thuộc 22  ·  Đến hạn 9

┌────────────────────────────────────────────┐
│  Ôn Tiếng Trung        hôm nay 12 thẻ      │
│  Tiếng Anh             hôm nay  9 thẻ      │
│                                              │
│  [Bắt đầu phiên ôn]                         │
└────────────────────────────────────────────┘

Nhóm: Chào hỏi (6) · Người & thân xã (12) · Đồ ăn (10) · Địa điểm (8) ...
```

| Thuộc tính | Nội dung |
|---|---|
| Hành động | Chọn ngôn ngữ → phiên ôn (S10) · Xem danh sách thẻ · Thêm thẻ thủ công |
| Chuỗi ngày ôn | Streak riêng cho từng ngôn ngữ |

---

#### S10 — Phiên ôn (1 thẻ)

**Route:** `/language/session`

```
┌────────────────────────────────────────────┐
│  ●●●○○○○○○○  3/12                          │
├────────────────────────────────────────────┤
│            nǐ hǎo  🔊                       │
│         (nghe / hiện hanzi)                 │
│                                              │
│         Nghĩa là gì?                        │
│                                              │
│      [Hiện đáp án]  [Gợi ý]                │
├────────────────────────────────────────────┤
│  Đáp án: 你好 · xin chào                    │
│  Ví dụ: 你好，很高兴认识你。                 │
│  "Nǐ hǎo, hěn gāoxìng rènshi nǐ."  🔊     │
├────────────────────────────────────────────┤
│  [Again]   [Hard]   [Good]   [Easy]         │
│            1′       10′      4 ngày        │
└────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Mặt trước (zh) | Pinyin + nút nghe; tùy chọn hiện hanzi |
| Mặt trước (en) | Từ + nút nghe + phiên âm gợi ý (2 tuần đầu) |
| Mặt sau | Hanzi (zh) / từ (en) + nghĩa + ví dụ câu + nút nghe |
| Chấm | 4 nút FSRS, mỗi nút hiện khoảng cách tới lượt sau (đọc từ state) |
| Lưu | Ghi `Review` + cập nhật `Card` (state, due, stability, difficulty) |
| Edge | Hết thẻ → "Đã ôn xong hôm nay" + gợi ý ôn sớm hơn |

---

#### S11 — Luyện ngoại ngữ chủ động (Phase 2)

**Route:** `/language/practice` — 2 tab: **Viết** (viết câu bằng ngôn ngữ đích, AI sửa lỗi theo 4 nhóm) và **Hội thoại** (AI đóng vai, trả lời bằng `zh-CN`/`en-US`).

Chi tiết rubric sửa lỗi 4 nhóm:

| Nhóm | Nội dung ví dụ |
|---|---|
| Ngữ pháp | Sai trật tự, thiếu mạo từ, chia động từ sai |
| Từ vựng | Dùng từ không tự nhiên, lặp từ, từ quá hàn lâm |
| Cách diễn đạt | Cấu trúc đúng ngữ pháp nhưng nghe không tự nhiên (chỉ ghép từ dịch từng chữ) |
| Ngữ cảnh | Đúng ngữ pháp nhưng sai tình huống (vd: chào bằng cách hỏi thăm sức khoẻ khi gặp khách lạ) |

---

#### S12 — Đánh giá chính

**Route:** `/state`

| Thuộc tính | Nội dung |
|---|---|
| Bố cục | 4 thanh trượt 1–5 (mood, energy, focus) + 1 ô nhập giờ ngủ + nút `[Lưu]` |
| Thời gian | Mục tiêu ≤15 giây. Ghi nhớ giá trị hôm qua để prefill. |
| Lịch sử | 7 ngày gần nhất dạng chấm nhỏ, bấm để sửa |

---

#### S13 — Báo cáo tuần

**Route:** `/review`

| Thuộc tính | Nội dung |
|---|---|
| Khối số liệu | Hoàn thành X/42 hành động · phân bố domain (thanh) · top 3 kỹ năng tiến bộ · mood trung bình · giấc ngủ trung bình · so sánh tuần trước (▲▼) |
| Khối AI | 3 nhận định: 1 tốt · 1 cần sửa · 1 nên thử tuần sau |
| Khối kế hoạch | 6 slot đề xuất cho tuần sau → chỉnh sửa → `[Duyệt]` (ghi `PlanItem` cho tuần tới) |

---

#### S14 — Báo cáo tiến bộ

**Route:** `/progress`

| Thuộc tính | Nội dung |
|---|---|
| Nội dung | Biểu đồ thang kỹ năng theo domain theo thời gian · cột thời gian bỏ ra theo tuần · heatmap hoạt động (GitHub-style) · so sánh tự với chính mình 30 ngày trước |
| Ràng buộc | Chỉ hiện số liệu gắn được với kỹ năng (P3). Không hiện "tổng giờ học" trần trụi. |

---

#### S15 — Cài đặt

**Route:** `/settings`

| Thuộc tính | Nội dung |
|---|---|
| Hồ sơ | Tên · mục tiêu dài hạn (textarea) · giọng văn AI mong muốn (direct/coach/gentle) |
| Ngôn ngữ đang học | Toggle zh / en · mức hiện tại |
| API key | Nhập `ANTHROPIC_API_KEY` → lưu vào `.env.local` (không commit) · trạng thái kết nối (test 1 call) |
| Chi phí | Bảng `AiCall`: theo ngày · theo tính năng · tổng input/output/cache tokens · ước tính USD |
| Dữ liệu | Xuất toàn bộ JSON · xoá dữ liệu (có xác nhận 2 bước) · dung lượng DB |

---

## 4. Data model

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

// ── Cây kỹ năng ────────────────────────────────────────
model Skill {
  id          String   @id @default(cuid())
  name        String
  nameZh      String?          // tên tiếng Trung cho kỹ năng ngôn ngữ
  domain      String           // professional | communication | language | personal
  parentId    String?
  parent      Skill?    @relation("SkillTree", fields: [parentId], references: [id])
  children    Skill[]   @relation("SkillTree")
  level       Int      @default(0)     // 0..5, chỉ tăng qua Evidence
  targetLevel Int      @default(3)
  position    Int      @default(0)
  createdAt   DateTime @default(now())
  activities  Activity[]
  evidences   Evidence[]
}

// ── Hoạt động (bảng trung tâm, domain-agnostic) ─────────
model Activity {
  id         String   @id @default(cuid())
  skillId    String?
  skill      Skill?   @relation(fields: [skillId], references: [id])
  domain     String
  type       String   // study|write|speak|roleplay|srs|journal|health|custom
  minutes    Int      @default(0)
  title      String
  content    String?
  quality    Int?     // 1..5 tự đánh giá
  aiScore    Float?   // điểm AI nếu có (rubric trung bình)
  createdAt  DateTime @default(now())
  evidences  Evidence[]
  reflection Reflection?
}

// ── Bằng chứng (P3: tiến độ = bằng chứng) ───────────────
model Evidence {
  id         String   @id @default(cuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  skillId    String
  skill      Skill    @relation(fields: [skillId], references: [id], onDelete: Cascade)
  rating     Int      // 1..4 chất lượng bằng chứng
  createdAt  DateTime @default(now())
  @@index([skillId])
}

// ── Nhật ký & phản hồi AI ───────────────────────────────
model Reflection {
  id         String   @id @default(cuid())
  activityId String   @unique
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  prompt     String
  answer     String
  aiFeedback String?
  createdAt  DateTime @default(now())
}

// ── Kế hoạch ngày ───────────────────────────────────────
model PlanItem {
  id        String   @id @default(cuid())
  date      DateTime @default(now())     // chuẩn hoá 00:00 local
  slot      Int      // 0..5
  domain    String
  action    String
  detail    String?
  minutes   Int      @default(15)
  skillId   String?
  done      Boolean  @default(false)
  source    String   @default("ai")      // ai | manual | fallback
  createdAt DateTime @default(now())
  @@index([date])
}

// ── SRS ─────────────────────────────────────────────────
model Card {
  id         String   @id @default(cuid())
  lang       String   // zh | en
  front      String   // zh: pinyin · en: word
  frontAlt   String?  // zh: hanzi
  back       String   // nghĩa
  note       String?
  example    String?
  examplePinyin String?
  hint       String?  // phiên âm gợi ý kiểu Việt (chỉ dùng 2 tuần đầu)
  group      String?  // nhóm chủ đề
  mode       String   @default("recognize")  // recognize|recall|produce
  cardState  Json     // state FSRS
  due        DateTime
  stability Float    @default(0)
  difficulty Float   @default(0)
  reps       Int      @default(0)
  lapses     Int      @default(0)
  createdAt  DateTime @default(now())
  reviews    Review[]
  @@index([lang, due])
}

model Review {
  id     String   @id @default(cuid())
  cardId String
  card   Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  rating Int      // 1=Again 2=Hard 3=Good 4=Easy
  state  Json
  at     DateTime @default(now())
}

// ── Chỉ số cá nhân ──────────────────────────────────────
model DailyState {
  id        String   @id @default(cuid())
  date      DateTime @unique
  mood      Int?
  energy    Int?
  sleep     Float?
  focus     Int?
  note      String?
  updatedAt DateTime @updatedAt
}

// ── Hồ sơ ───────────────────────────────────────────────
model UserProfile {
  id           String   @id @default(cuid())
  name         String?
  goals        String?
  aiTone       String   @default("direct")  // direct|coach|gentle
  learningLangs String  @default("zh,en")
  zhLevel      String   @default("zero")
  enLevel      String   @default("zero")
  createdAt    DateTime @default(now())
}

// ── Theo dõi chi phí AI ─────────────────────────────────
model AiCall {
  id          String   @id @default(cuid())
  feature     String   // daily_plan|grading|journal_feedback|weekly_review|classify|roleplay|mock_interview|language_test|quick_log_autofill|biometric_correlation
  provider    String   @default("anthropic") // provider thực sự đã trả lời: anthropic|local|rule
  model       String   // claude-opus-5 | claude-haiku-4-5 | qwen2.5:7b | qwen2.5-coder:7b-instruct | llama3.3
  inputTokens Int      @default(0)
  outputTokens Int     @default(0)
  cacheRead   Int      @default(0)
  cacheWrite  Int      @default(0)
  estimatedCost Float  @default(0)   // luôn 0 cho provider "local"
  latencyMs   Int      @default(0)   // S15 hiển thị "Độ trễ trung bình 418ms"
  ok          Boolean  @default(true)
  error       String?
  fallbackFrom String? // provider gốc bị lỗi, ví dụ "anthropic" khi đã fallback sang "local"
  createdAt   DateTime @default(now())
  @@index([createdAt])
  @@index([provider])
  @@index([feature])
}

// ── Mock Interview ─────────────────────────────────────
model InterviewProfile {
  id           String   @id @default(cuid())
  label        String            // "Backend Engineer"
  jobTitle     String
  seniority    String   @default("mid")   // junior|mid|senior|lead
  language     String   @default("en")    // en|vi
  questionKinds String  @default("concept,design")  // concept|design|debug|tradeoff|behavioral
  focusSkills  String   @default("[]")   // JSON: [skillId]
  createdAt    DateTime @default(now())
  sessions     InterviewSession[]
}

model InterviewSession {
  id          String   @id @default(cuid())
  profileId   String
  profile     InterviewProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  plannedCount Int     @default(8)
  askedCount  Int      @default(0)
  status      String   @default("active")  // active|done|abandoned
  totalScore  Float?
  skillsFocused String  @default("[]")  // JSON: [skillId]
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  turns       InterviewTurn[]
  activity    Activity?
}

model InterviewTurn {
  id          String   @id @default(cuid())
  sessionId   String
  session     InterviewSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  index       Int
  question    String
  kind        String   // concept|design|debug|tradeoff|behavioral
  skillName   String?
  answer      String?
  scores      Json?    // {clarity:[score,note], depth:[...], reasoning:[...], communication:[...], tradeoff:[...]}
  total       Float?
  feedback    String?
  nextQuestion String?
  createdAt   DateTime @default(now())
}

// ── Bài kiểm tra ngoại ngữ ─────────────────────────────
model TestSession {
  id          String   @id @default(cuid())
  lang        String   // zh|en
  testType    String   // placement|topic|benchmark|from_content
  topic       String?
  level       String?  // level ước lượng sau bài
  score       Float?
  maxScore    Float?
  durationSec Int?
  blueprint   Json?    // {itemTypes:[...], count:n}
  createdAt   DateTime @default(now())
  items       TestItem[]
  activity    Activity?
}

model TestItem {
  id         String   @id @default(cuid())
  testId     String
  test       TestSession @relation(fields: [testId], references: [id], onDelete: Cascade)
  index      Int
  itemType   String   // mc_vocab|mc_grammar|cloze|listening|writing|translation
  prompt     String
  audioText  String?  // cho item listening: text để TTS đọc
  options    Json?    // ["a","b","c","d"]
  answer     String?  // đáp án đúng (objective)
  userAnswer String?
  isCorrect  Boolean?
  cardId     String?  // thẻ SRS liên quan → nếu sai thì đẩy về ôn
  skillName  String?
  errorGroups Json?   // writing/translation: {grammar:[],vocab:[],expression:[],context:[]}
  notes      String?
  seconds    Int?
}
```

**Ghi chú thiết kế:**
- `Activity` là bảng trung tâm, **không tách theo domain**. Đây là điều kiện để tính năng "AI phát hiện tương quan" (FR-PS-05) khả thi bằng một truy vấn SQL đơn giản.
- `Card.cardState` lưu state FSRS dạng JSON — không cần cột riêng cho từng field của FSRS.
- `PlanItem.source` cho phép biết kế hoạch đến từ AI, từ rule fallback, hay do người dùng tự thêm.

---

## 5. AI layer — đặc tả từng tính năng

> **Sửa ở v1.2 — AI router hybrid.** 21 màn hình Stitch thể hiện 2 tầng AI: **local (Ollama)** và **cloud (Anthropic)**. Bảng routing dưới đây đã thêm cột `Provider`. Chi tiết đầy đủ: `.kiro/specs/daily-loop-os/design.md` §6.

### 5.1 Kiến trúc router

```
route handler → router.route(task) → { provider: "local" | "anthropic", model, effort }
                                 ├─ local     → Ollama HTTP (0 token, offline-safe)
                                 └─ anthropic → Anthropic SDK (streaming + prompt cache)
```

- Router: `src/lib/ai/router.ts` — **điểm vào duy nhất** (FR-AI-09).
- Client cloud: `src/lib/ai/anthropic.ts` · Client local: `src/lib/ai/ollama.ts` · Streaming: `src/lib/ai/streaming.ts`.
- Route handler chỉ nhận request → gọi router → ghi `AiCall` → trả response. **Không chứa logic nghiệp vụ.**

**Fallback chain (FR-AI-10):** `anthropic → local → rule cục bộ`.
Sau mỗi lần fallback, response phải kèm `provider` thật đã dùng, để header badge (FR-AI-11) hiển thị đúng.

### 5.2 Bảng routing

> Bảng này đối chiếu trực tiếp với nhãn provider hiển thị trong 21 màn hình Stitch.
> Cột **Bằng chứng thiết kế** trích nguyên văn nhãn trong mockup — dùng để truy vết khi có tranh chấp.

| Mã | Tính năng | Màn hình | Provider | Model | Streaming | Effort | Bằng chứng thiết kế |
|---|---|---|---|---|---|---|---|
| AI-01 | Sinh kế hoạch ngày | S01, S02 | anthropic | `claude-opus-5` | Có | `medium` | `Claude Opus 5` (S02 badge) |
| AI-02 | Hoàn thành nhanh (điền form) | S05 | **local** | `qwen2.5:7b` | Không | `low` | `Local AI … tự parsing` + `Zero Cloud Latency Guarantee 0ms delay` |
| AI-03 | Chấm giao tiếp (viết) | S07 | anthropic | `claude-opus-5` | Có | `medium` | `Chấm bằng AI (Claude Opus 5)` |
| AI-04 | Chấm giao tiếp (nói) | S08 | anthropic | `claude-opus-5` | Có | `medium` | `Claude Opus 5` (S08 badge) |
| AI-05 | Phản hồi nhật ký | S06 | anthropic | `claude-opus-5` | Có | `low` | `✨ Gửi AI phản hồi (Claude Opus 5)` |
| AI-06 | Phân loại nhật ký → domain/skill | S06 | **local** (mặc định) | `qwen2.5:7b` | Không | `low` | `Phân loại tự động (Claude Haiku 4.5)` ⚠️ xem ghi chú bên dưới |
| AI-07 | Báo cáo tuần | S13 | anthropic | `claude-opus-5` | Có | `high` | `Claude Opus 5` (S13 badge) |
| AI-08 | Role-play ngoại ngữ | S11 | anthropic | `claude-opus-5` | Có | `medium` | `LOCAL VOX` + `Claude Opus 5 streaming` |
| AI-09 | Sửa lỗi bài viết ngoại ngữ | S11 | **local** | `qwen2.5-coder:7b-instruct` | Có | `low` | `Model: Qwen2.5-Coder-7B-Instruct (Local)` (S21) |
| AI-10 | Sinh flashcard từ bài viết | S11 | anthropic | `claude-haiku-4-5` | Không | `low` | `Phân loại (Claude Haiku 4.5)` (S06) |
| AI-11 | **Sinh câu hỏi mock interview** (lượt đầu) | S17 | anthropic | `claude-opus-5` | Có | `medium` | `Claude Opus 5 — Adaptive Lead Evaluator` |
| AI-12 | **Chấm câu trả lời** (5 tiêu chí kỹ thuật) | S17 | anthropic | `claude-opus-5` | Có | `medium` | `Mô hình đánh giá: Local Llama-3.3 + Opus` |
| AI-13 | **Báo cáo cuối phiên** (3 mạnh / 3 yếu / gợi ý) | S18 | anthropic | `claude-opus-5` | Có | `high` | `Claude Opus 5 (Evaluator v2.4)` |
| AI-14 | **Blueprint bài kiểm tra** (chọn item từ thẻ + ngân hàng seed) | S20 | **không AI** | — | — | — | Chọn lọc tất định từ seed — xem ghi chú bên dưới |
| AI-15 | **Chấm câu tự luận** (writing/translation) theo 4 nhóm lỗi | S20 | anthropic | `claude-opus-5` | Có | `medium` | `Evaluator Engine: Neural-Grammar-v2` (S21) |
| AI-16 | **Ước lượng level** từ kết quả bài kiểm tra | S21 | **local** | `qwen2.5-coder:7b-instruct` | Không | `low` | `Model: Qwen2.5-Coder-7B-Instruct (Local)` |
| AI-17 | **Sinh đề từ nguồn văn bản** (`from_content`) | S19 → S20 | **local** | `qwen2.5:7b` | Có | `medium` | `CẤU TRÚC ĐỀ TỰ TẠO: Ollama Qwen-2.5 7B` (S19) |
| AI-18 | **Tương quan sinh học ↔ hiệu suất** | S12 | **local** | `llama3.3` | Không | `low` | `Engine suy diễn cục bộ (Local Vector Engine)` |
| AI-19 | **Sinh câu hỏi tiếp theo** (adaptive loop) | S17 | **local** | `llama3.3` | Không | `low` | `Local Llama-3.3 + Opus` (S17) |

**Ghi chú đối chiếu thiết kế — 3 điểm cần chốt (đã xử lý ở đây):**

1. **S06 ghi `Phân loại tự động (Claude Haiku 4.5)`** nhưng S05 ghi `Local AI Haiku 4.5` cho cùng loại tác vụ — hai màn hình mâu thuẫn nhau. Thực tế `Haiku 4.5` là model **cloud**. Quyết định: **mặc định local** (`qwen2.5:7b`, 0 token, offline-safe — khớp badge `AI Offline / Local (Ollama)` trên mọi màn hình và P6), với **đường cloud Haiku 4.5 làm tuỳ chọn** bật được trong S15 (chấp nhận chi phí). Ghi chú này là drift nhãn của mockup, không phải yêu cầu thiết kế.
2. **S19 ghi `CẤU TRÚC ĐỀ TỰ TẠO: Ollama Qwen-2.5 7B`** → AI-17 chạy **local**, không phải cloud. Sửa so với bản routing cũ.
3. **AI-14 không cần AI**: blueprint bài kiểm tra là **chọn lọc tất định** từ thẻ đến hạn + ngân hàng seed đã biên tập sẵn (đúng tinh thần FR-LT-12 "đề song song về độ khó"). Chỉ có `from_content` (AI-17) mới thật sự **sinh** đề từ nguồn văn bản người dùng nhập.

**Tác vụ KHÔNG gọi AI** (FR-AI-17) — dữ liệu tĩnh trong DB, render server-side:
role profile mock interview (S16), ngân hàng câu hỏi luyện nói (S08), bài kiểm tra seed + form đề (S19), câu hỏi ghi nhận tự luận seed, blueprint đề (AI-14).

### 5.3 Prompt caching

Mọi call có system prompt dạng:

```ts
system: [
  { type: "text", text: STABLE_SYSTEM },                          // luôn giống nhau
  { type: "text", text: RUBRIC_BLOCK, cache_control: { type: "ephemeral" } }, // rubric + hướng dẫn chấm
]
```

Quy tắc bắt buộc:
1. Thứ tự `tools → system → messages` giữ nguyên.
2. **Mọi nội dung biến động** (ngày, dữ liệu hôm nay, lịch sử) đặt sau breakpoint cuối cùng, trong `messages`.
3. Không chèn `Date.now()` hay UUID vào system prompt — sẽ phá cache mỗi lượt.
4. Kiểm chứng: đọc `response.usage.cache_read_input_tokens`; nếu = 0 sau lượt gọi thứ hai → có silent invalidator.
5. Ngưỡng cache tối thiểu theo model (512–4096 token tuỳ model) — system prompt phải đủ dài, nếu không sẽ **im lặng không cache**.
6. Ghi `cache_read_input_tokens` vào `AiCall` — S15 hiển thị `CACHE HIT RATE (PREFIX) 91.4% OPTIMAL — 128,450 tokens tái sử dụng`.

### 5.4 Structured outputs

```ts
const PlanSchema = z.object({
  slots: z.array(z.object({
    slot: z.number().int().min(0).max(5),
    domain: z.enum(["professional","communication","language","personal"]),
    action: z.string(),
    detail: z.string(),
    minutes: z.number().int(),
    skillName: z.string().nullable(),
  }))
});

const response = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 16000,
  output_config: { format: zodOutputFormat(PlanSchema) },
  ...
});
```

### 5.5 Rubric cố định (P4)

Rubric được khai báo trong `src/lib/rubrics.ts` dưới dạng hằng số — **không để AI tự định nghĩa tiêu chí**:

```
RUBRIC_COMMUNICATION = [
  { key: "clarity",   name: "Rõ ràng",    desc: "Người đọc hiểu ngay điều cần biết trong 1 câu đầu" },
  { key: "structure", name: "Cấu trúc",   desc: "Có mở–thân–kết rõ ràng, điều quan trọng nhất đứng đầu" },
  { key: "tone",      name: "Giọng văn",  desc: "Phù hợp với vai trò và mối quan hệ với người nhận" },
  { key: "natural",   name: "Tự nhiên",   desc: "Cách diễn đạt tự nhiên, không dịch từng chữ" },
  { key: "grammar",   name: "Ngữ pháp",   desc: "Cấu trúc câu và dấu câu đúng" }
]

RUBRIC_TECHNICAL = [
  { key: "accuracy",    name: "Chính xác",           desc: "Nội dung kỹ thuật đúng, không sai lệch kiến thức nền" },
  { key: "depth",       name: "Chiều sâu",           desc: "Đi sâu vào bản chất vấn đề, không dừng ở mặt ngoài" },
  { key: "reasoning",   name: "Lập luận",            desc: "Có chuỗi suy luận rõ ràng từ giả định đến kết luận" },
  { key: "communication", name: "Giao tiếp",         desc: "Diễn đạt rõ ràng, có cấu trúc, người nghe theo kịp" },
  { key: "tradeoff",    name: "Nhận biết đánh đổi", desc: "Nói được cái giá của lựa chọn và khi nào không dùng" }
]

RUBRIC_BEHAVIORAL = [
  { key: "specific",   name: "Cụ thể",      desc: "Có ví dụ cụ thể từ trải nghiệm thật, không nói chung chung" },
  { key: "star",       name: "Đầy đủ STAR", desc: "Rõ tình huống → nhiệm vụ → hành động → kết quả" },
  { key: "selfaware",  name: "Tự nhận thức", desc: "Nhận ra điều mình làm chưa tốt và vì sao" },
  { key: "outcome",    name: "Kết quả",     desc: "Kết quả có thể đo được, không chỉ là cảm nhận" }
]

RUBRIC_LANGUAGE_ERRORS = [
  { key: "grammar",    name: "Ngữ pháp" },
  { key: "vocab",      name: "Từ vựng" },
  { key: "expression", name: "Cách diễn đạt" },
  { key: "context",    name: "Ngữ cảnh" }
]
```

> Nguồn duy nhất: `src/lib/rubrics.ts`. UI đọc từ đây — không hardcode tên tiêu chí trong component.

### 5.6 Xử lý lỗi

- Bắt theo chuỗi typed exception: `AuthenticationError` → `RateLimitError` → `APIStatusError` → `APIConnectionError`.
- Kiểm tra `stop_reason === "refusal"` **trước khi** đọc `content`.
- Mọi lỗi → `AiCall` với `ok=false` + `error`, và UI hiển thị thông báo ngắn, có nút thử lại.
- Không bao giờ để lỗi API làm sập trang.
- Khi lỗi cloud → **tự động** thử local (không hỏi user), ghi `AiCall.provider = "local"`, `fallbackFrom = "anthropic"`, `ok = true`.

### 5.7 Chế độ offline (FR-AI-06)

Khi thiếu `ANTHROPIC_API_KEY` **hoặc** mất mạng:
- Tác vụ local (AI-02, AI-06, AI-09, AI-16, AI-17, AI-18, AI-19) vẫn chạy bình thường qua Ollama — **0 token**.
- `AI-01` dùng bộ sinh rule cục bộ (`src/lib/plan.ts`): xoay vòng kỹ năng theo mức độ thấp nhất, gắn slot cố định, tiêu đề lấy từ tên kỹ năng.
- Tác vụ cần cloud (AI-03, AI-04, AI-05, AI-07, AI-08, AI-11, AI-12, AI-13, AI-15): ẩn nút, hiện hướng dẫn thêm key — **không** giả lập phản hồi AI.
- Header badge chuyển sang `AI Offline / Local (Ollama)`.

### 5.8 Ước tính chi phí

| Kịch bản | Input/tháng | Output/tháng | Ước tính USD/tháng |
|---|---|---|---|
| Nhẹ (1 kế hoạch + 1 bài chấm/ngày, có cache) | ~1.2M | ~250K | **4 – 7** |
| Vừa (thêm role-play 10 lượt/ngày) | ~2.8M | ~600K | **8 – 14** |
| Nặng (mọi call Opus 5, không cache) | ~4.5M | ~900K | **15 – 22** |
| **+ Mock Interview** (2 phiên 8 câu/tuần) | +~250K | +~90K | **+1 – 2.5** |
| **+ Bài kiểm tra** (2 bài 40 câu/tuần) | +~180K | +~50K | **+1 – 1.5** |

Giả định: `claude-opus-5` $5/$25 mỗy 1M token, phân loại chuyển `claude-haiku-4-5` ($1/$5), cache đọc tính giá rẻ hơn nhiều. Tác vụ local **0 token**. **Đây là ước tính — cần đo thật sau khi chạy 1 tuần**, dùng bảng `AiCall` (S15).

## 6. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí |
|---|---|---|
| NFR-01 | Mobile-first | Mọi màn hình dùng được ở 390px. Thao tác chính nằm trong vùng ngón cái. ⚠️ **Xung đột với thiết kế** — 21 màn hình Stitch dùng sidebar cố định `w-72` không có drawer mobile. Xem `design.md` §9.5 và **Q9**. |
| NFR-02 | Tốc độ | Trang chủ render server-side < 500ms. Quick-log đóng modal ngay (không chờ AI). |
| NFR-03 | Offline | Toàn bộ tính năng không-AI hoạt động khi mất mạng. Ghi được vào SQLite. |
| NFR-04 | Privacy | SQLite cục bộ. Chỉ gửi lên API nội dung người dùng chủ động nhờ AI. Hiển thị log trong S15. |
| NFR-05 | Ngôn ngữ | Giao diện tiếng Việt. Nội dung học: zh-Hans + en-US. Kiểm tra hợp lệ ngữ cảnh theo `lang`. |
| NFR-06 | A11y | Tương phản WCAG AA, điều hướng bằng bàn phím, nhãn cho icon, `aria-live` cho phản hồi AI. |
| NFR-07 | Không phụ thuộc ngoài | Không app trung gian. TTS/STT dùng Web Speech API của trình duyệt. |
| NFR-08 | Dữ liệu | Xuất/nhập JSON đầy đủ — không ràng buộc người dùng vào hệ thống. |
| NFR-09 | An toàn key | API key lưu `.env.local`, không commit, không hiển thị đầy đủ trong UI. |
| **NFR-10** | **Token thiết kế nhất quán** | `DESIGN.md` và HTML tham chiếu lệch ở `borderRadius`; `headline-sm` sai ở 4 màn hình. Một bộ token duy nhất ở `src/app/globals.css`, kiểm chứng bằng test token (NFR-10 của Kiro spec). |
| **NFR-11** | **Badge AI phản ánh provider thật** | Header hiển thị đúng `AI Offline / Local (Ollama)` hoặc `Claude Opus 5` theo kết quả gọi gần nhất — không hardcode. |
| **NFR-12** | **Chi phí local = 0** | Tác vụ local (AI-02, AI-06, AI-09, AI-16, AI-17, AI-18, AI-19) không phát sinh token Anthropic; `AiCall.estimatedCost = 0`. |

---

## 7. Lộ trình triển khai

| Phase | Nội dung | Điều kiện hoàn thành (Definition of Done) |
|---|---|---|
| **0 — Hạt nhân** | Schema Prisma + seed · trang Daily Loop (S01) · Quick-log (S05) · Cây kỹ năng (S03, S04) · Đánh giá chính (S12) · AI-01 sinh kế hoạch · chế độ offline · S15 cài đặt cơ bản | Mở app thấy 6 hành động; đánh dấu xong tạo bằng chứng; cây kỹ năng cập nhật tiến độ; chạy được khi không có API key |
| **1 — Luyện tập cốt lõi** | SRS zh/en (S09, S10) + seed 120 thẻ + chấm giao tiếp viết (S07) + nhật ký & phản hồi AI (S06) + **Mock Interview (S16–S18)** + **Bài kiểm tra ngoại ngữ (S19–S21)** + báo cáo tuần (S13) + báo cáo tiến bộ (S14) | Ôn được 2 ngôn ngữ; viết bài và nhận điểm rubric có delta; mock interview trả về điểm 5 tiêu chí + 3 mạnh/3 yếu; bài kiểm tra đẩy thẻ sai về ôn |
| **2 — Luyện chủ động** | Role-play AI (S08, S11) · sửa lỗi 4 nhóm · sinh flashcard từ bài viết · phân tích tương quan chỉ số (FR-PS-05) · AI-07 tự động giảm tải · bài kiểm tra `from_content` | Hội thoại AI với mục tiêu ẩn; bài viết sai được sửa đúng nhóm lỗi; app báo "khi ngủ <6h thì…" |
| **3 — Bổ sung** | PWA offline · chế độ `produce` với STT · xuất dữ liệu · nhiều ngôn ngữ · mock interview bằng giọng nói | Cài lên màn hình chính; đi bộ bộ offline vẫn ghi được; trả lời phỏng vấn bằng giọng nói |

**Ghi chú về thứ tự:** Mock Interview và Bài kiểm tra ngoại ngữ nằm ở **Phase 1** vì chúng là hai tính năng **tạo ra bằng chứng đo được** — chúng biến app từ "ghi nhận" thành "đo". Nếu chỉ có Phase 0 (ghi + ôn + kế hoạch), app sẽ là một tracker, không phải một công cụ phát triển bản thân.

**Ưu tiên cứng:** Không bắt đầu Phase 1 trước khi Phase 0 dùng được hằng ngày trong 7 ngày liên tiếp. Nếu không dùng hằng ngày thì vấn đề là friction, không phải thiếu tính năng — sửa friction, đừng thêm tính năng.

---

## 8. Tiêu chí nghiệm thu

**AC-1 — Daily Loop**
- *Given* hôm nay chưa có kế hoạch, *When* mở `/`, *Then* hiện CTA "Lập kế hoạch hôm nay" và không có lỗi.
- *Given* đã có kế hoạch, *When* bấm "Xong" ở slot 1, *Then* slot chuyển sang trạng thái hoàn thành, `Activity` + `Evidence` được tạo, streak tăng nếu đây là hoạt động đầu tiên trong ngày.

**AC-2 — Quick-log ≤10s**
- *Given* mở sheet Quick-log, *When* chọn loại + gõ mô tả + bấm "Ghi nhanh", *Then* lưu xong trong ≤10s và không cần chờ AI trả lời.

**AC-3 — Tiến độ = bằng chứng**
- *Given* kỹ năng có 2 bằng chứng rating 3, *When* thêm bằng chứng thứ 3 rating 4, *Then* `level` của kỹ năng tăng 1 lần. Khi chỉ tick checkbox không có hoạt động, `level` **không** đổi.

**AC-4 — SRS đúng thuật toán**
- *Given* thẻ mới, *When* chấm "Good", *Then* lần ôn kế tiếp theo đúng state FSRS; "Again" → thẻ quay lại hôm nay và `lapses` tăng.

**AC-5 — Prompt caching hoạt động**
- *Given* 2 call liên tiếp cùng system prompt, *When* đọc `usage.cache_read_input_tokens` của call thứ 2, *Then* > 0. Nếu = 0 → có silent invalidator phải sửa.

**AC-6 — Chấm điểm theo rubric**
- *Given* bài viết giao tiếp, *When* AI chấm, *Then* trả về đúng 5 tiêu chí với điểm 0–5 và tổng điểm = trung bình; không có tiêu chí nào ngoài rubric.

**AC-7 — Offline**
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở app và bấm "Lập kế hoạch hôm nay", *Then* vẫn sinh được 6 hành động từ rule cục bộ và ghi được vào DB.

**AC-8 — Refusal không crash**
- *Given* API trả `stop_reason: "refusal"`, *When* app gọi AI, *Then* hiện thông báo lỗi thân thiện, ghi log `AiCall{ok:false}`, trang không crash.

**AC-9 — Mock Interview chấm đúng rubric**
- *Given* một phiên 8 câu, *When* xong phiên, *Then* mỗi câu có điểm đủ 5 tiêu chí (0–5), điểm tổng = trung bình 5 tiêu chí, và báo cáo có đúng 3 điểm mạnh + 3 điểm yếu. Không tiêu chí nào ngoài rubric.
- *Given* người dùng trả lời hời hợt ở câu 1, *When* AI sinh câu 2, *Then* câu 2 là follow-up của câu 1 (cùng chủ đề, đào sâu thêm), không nhảy sang câu mới.

**AC-10 — Mock Interview hỏi đúng chỗ yếu**
- *Given* cây kỹ năng có "Lựa chọn giải pháp" (0 bằng chứng) và "Phân tích yêu cầu" (2 bằng chứng), *When* sinh câu hỏi, *Then* câu hỏi ưu tiên "Lựa chọn giải pháp".

**AC-11 — Bài kiểm tra đẩy thẻ về ôn**
- *Given* bài kiểm tra có 5 câu sai, *When* xem kết quả, *Then* đúng 5 thẻ liên quan có `due = hôm nay` và `lapses` tăng 1, và nút "Ôn ngay" mở S10 với đúng 5 thẻ đó.
- *Given* bài kiểm tra có 5 câu sai nhưng không gắn thẻ nào, *When* xem kết quả, *Then* hiện "0 thẻ bị đẩy về ôn" — không crash, không giả lập số liệu.

**AC-12 — Câu tự luận chấm đúng 4 nhóm lỗi**
- *Given* một câu `writing` bị sai, *When* AI chấm, *Then* lỗi được phân loại vào đúng 1 trong 4 nhóm (ngữ pháp/từ vựng/cách diễn đạt/ngữ cảnh), không trả nhóm nào ngoài 4.

**AC-13 — So sánh được giữa các lần**
- *Given* 2 phiên mock interview cùng hồ sơ vai trò, *When* mở báo cáo phiên thứ 2, *Then* hiện delta từng tiêu chí so với phiên trước.

**AC-14 — Fallback chain hoạt động**
- *Given* Anthropic API trả lỗi 500, *When* gọi một tác vụ chấm điểm, *Then* hệ thống **tự** thử provider local; nếu local cũng lỗi thì dùng rule cục bộ. Trang không báo lỗi trần, không crash.
- *Given* fallback xảy ra, *Then* `AiCall` ghi `provider = "local"`, `fallbackFrom = "anthropic"`, và header badge đổi sang `AI Offline / Local (Ollama)`.

**AC-15 — Tác vụ local không tốn token**
- *Given* tác vụ AI-02 (autofill quick-log) chạy thành công qua Ollama, *Then* `AiCall.estimatedCost = 0`, `inputTokens = 0`, `outputTokens = 0` — và S15 hiển thị nhóm "Local (0 token)".

**AC-16 — Badge AI không hardcode**
- *Given* lần gọi gần nhất thất bại và fallback sang local, *When* nhìn header, *Then* badge hiển thị đúng provider thật đã dùng, không phải giá trị mặc định cứng.

---

## 9. Rủi ro & giảm thiểu

| # | Rủi ro | Xác suất | Tác động | Giảm thiểu |
|---|---|---|---|---|
| R1 | **Scope creep** — dựng cả 4 domain cùng lúc | Cao | Cao | Đóng băng domain 4 (P5). Điều kiện vào Phase 1 = dùng đều 7 ngày. |
| R2 | **Friction ghi nhập** → bỏ app tuần 2 | Cao | Cao | Quick-log 2 chạm, AI điền sẵn form, offline-first. Đo: nếu tỷ lệ ngày không ghi > 30% thì ưu tiên giảm friction, **không** thêm tính năng. |
| R3 | **AI chấm không đáng tin** (hallucination tiêu chí) | Trung bình | Trung bình | Rubric cố định trong prompt (P4), structured output, chỉ chấm theo tiêu chí có sẵn. |
| R4 | **Chi phí API vượt dự kiến** | Trung bình | Trung bình | Bảng `AiCall` + ngân sách cảnh báo trong S15. Haiku cho phân loại. Cache prefix. |
| R5 | **TTS/STT Web Speech API không hỗ trợ `zh-CN`** trên một số thiết bị | Trung bình | Thấp | Dùng `speechSynthesis` với fallback danh sách giọng; nếu không có → chỉ dùng pinyin + hán tự. |
| R6 | **AI sinh nội dung level 0 sai chuẩn** | Trung bình | Trung bình | Seed 120 thẻ biên tập tay, **không** để AI sinh từ vựng nền. AI chỉ sinh bài luyện, không sinh từ vựng. |
| R7 | **Dữ liệu cá nhân rò rỉ** | Thấp | Cao | Local-first (P6). Danh sách "đã gửi lên" trong S15. Không gửi khi người dùng không nhờ. |
| R8 | **Câu hỏi mock interview chung chung** — AI hỏi kiểu "Giải thích cách hoạt động của hệ phân tán" cho mọi người | Trung bình | Trung bình | Bắt buộc truyền `focusSkills` + `jobTitle` + `seniority` vào prompt; sinh câu hỏi theo mục kỹ năng cụ thể. Đo: nếu người dùng đánh dấu "câu hỏi này có vấn đề" >10% → siết prompt. |
| R9 | **Điểm mock interview không ổn định** — cùng 1 câu trả lời, 2 lần chấm khác nhau | Trung bình | Trung bình | Cố định `temperature` mặc định (không đặt cao), rubric chi tiết, lưu điểm từng tiêu chí kèm lý do để người dùng tự phản biện. Chấp nhận sai số ±0.3. |
| R10 | **Bài kiểm tra bị lộ đề** — lặp lại cùng bộ câu đã làm | Trung bình | Trung bình | FR-LT-12: đề song song về độ khó cho `benchmark`; `topic` lấy item từ thẻ chưuộc đến hạn. |
| R11 | **Chi phí mock interview tăng nhanh** — mỗi lượt gửi lại toàn bộ lịch sử | Thấp | Trung bình | Lịch sử chỉ append (giữ được cache prefix) · `effort: medium` cho lượt chấm · `high` chỉ cho báo cáo cuối. Ghi `AiCall` để theo dõi. |
| **R12** | **Ollama không khả dụng** — người dùng không cài, hoặc model chưa tải, hoặc máy quá yếu | Cao | Trung bình | Tự phát hiện qua `GET /api/ollama/health` (timeout 2s). Nếu không có → bộ sinh rule cục bộ. Badge header hiện `AI Offline / Local (Ollama)` kèm tooltip giải thích. Không chặn app khởi động. |
| **R13** | **Chất lượng model local thấp hơn cloud** — sửa lỗi ngữ pháp bằng `qwen2.5-coder:7b` kém hơn Opus | Trung bình | Trung bình | Chỉ giao cho local các tác vụ **có cấu trúc chặt** (phân loại, trích xuất). Tác vụ cần phán đoán chất lượng cao vẫn gọi cloud. Nếu người dùng đặt chất lượng cao → cho phép ép provider trong S15. |
| **R14** | **Fallback che giấu lỗi** — cloud hỏng nhưng local trả kết quả kém, người dùng không biết | Trung bình | Trung bình | Mọi response kèm `provider` + `fallback`; UI hiển thị chip nhỏ "đã dùng fallback local" bên cạnh kết quả AI. `AiCall.fallback` đếm được trong S15. |

---

## 10. Câu hỏi cần chốt trước khi code

| # | Câu hỏi | Tại sao quan trọng | Mặc định nếu không trả lời |
|---|---|---|---|
| Q1 | **Chuyên môn** — bạn đang trong lĩnh vực nào, và 3–5 kỹ năng cụ thể muốn lên? | Cây kỹ năng seed sẽ rỗng nếu không biết | Seed cây trung tính: System Design, Quản lý dữ liệu, Giao tiếp, Tiếng Trung, Tiếng Anh, Nhật ký, Thể chất |
| Q2 | **Giao tiếp** — cần luyện tiếng Anh, tiếng Việt, hay cả hai? | Rubric và ngôn ngữ luyện | Tiếng Anh (khớp mục tiêu ngoại ngữ) |
| Q3 | **Cấp độ thật sự của tiếng Anh** — "level 0" là chưa đọc được chữ, hay đọc được nhưng chưa nói được? | Ẩn/hiện phonics theo mức | Đọc được chữ Latin nhưng vốn từ và ngữ pháp thấp → hiện phiên âm gợi ý kiểu Việt |
| Q4 | **Mục tiêu thời gian** — muốn đạt được gì sau 6 tháng? | AI điều chỉnh cường độ kế hoạch | Mặc định: 6 hành động/ngày, 15–45′/slot, 6 tháng |
| Q5 | **Dữ liệu đã có sẵn** — có note cũ, flashcard Anki, hay lịch tập cần import? | Tiết kiệm nhiều giờ nếu có | Bắt đầu từ số 0, có nút import JSON ở Phase 3 |
| **Q6** | **Mock Interview theo hướng nào** — ứng tuyển vào vị trí cụ thể (Điện toán, Sản phẩm, Marketing…) hay luyện chung "kỹ năng chuyên môn" của bạn? | Quyết định cách AI sinh câu hỏi và hồ sơ vai trò mặc định | Hồ sơ mặc định lấy từ cây kỹ năng + `jobTitle` bạn nhập ở S16; câu hỏi thiên về `concept`/`design` |
| **Q7** | **Bài kiểm tra ngoại ngữ theo chuẩn nào** — CEFR, HSK, TOEIC, IELTS hay chỉ cần thang 5 mức nội bộ? | Ảnh hưởng cách "ước lượng level" và đề song song | Thang nội bộ 5 mức (A1–C1), có ghi chú tương đương CEFR |
| **Q8** | **Chuẩn bị cho kỳ thi cụ thể nào không?** (HSK, TOEIC, IELTS...) | Nếu có, app nên lấy đề đúng cấu trúc đề thi thật | Chưa chốt — làm bài kiểm tra tổng quát trước |
| **Q9** | **Mobile-first hay desktop-first?** — 21 màn hình Stitch dùng sidebar cố định `w-72`, không có drawer mobile; nhưng NFR-01 yêu cầu dùng được ở 390px | Quyết định có phải viết lại shell cho mobile hay chấp nhận desktop-first | **Desktop-first** (khớp thiết kế đã duyệt) + thanh cuộn ngang cho bảng rộng; mobile-native để Phase 3. Ghi rõ giới hạn trong `design.md` §9.5 |
| **Q10** | **Ollama bắt buộc hay tuỳ chọn?** — badge header ghi `AI Offline / Local (Ollama)` trên mọi màn hình | Quyết định có cần cài Ollama + tải model (~4.7GB) không | **Tuỳ chọn**: nếu Ollama không chạy → fallback `rule` cục bộ, app vẫn dùng được. Tự phát hiện qua `GET /api/ollama/health` |
| **Q11** | **Model local nào dùng cho tác vụ nào?** | Ảnh hưởng chất lượng phân loại & sửa lỗi | Theo `tech.md`: `qwen2.5:7b` (phân loại/autofill) · `qwen2.5-coder:7b-instruct` (sửa lỗi ngữ pháp) · `llama3.3` (tổng hợp tương quan) |
| **Q12** | **AiCall lưu token của local hay chỉ cloud?** | Tương tác với bảng chi phí S15 | Lưu cả hai nhưng `estimatedCost = 0` cho local; S15 tách 2 nhóm "Cloud" / "Local (0 token)" |

---

#### S16 — Mock Interview: Cấu hình

**Route:** `/interview/setup`

```
┌──────────────────────────────────────────────┐
│  Hồ sơ vai trò                              │
│  ┌────────────────────────────────────────┐  │
│  │ Backend Engineer            ✎ Sửa      │  │
│  │ Senior · Tiếng Anh · 5 dạng câu        │  │
│  ├────────────────────────────────────────┤  │
│  │ Product Manager              ✎ Sửa      │  │
│  │ Mid · Tiếng Việt · 3 dạng câu           │  │
│  ├────────────────────────────────────────┤  │
│  │ + Hồ sơ mới                           │  │
│  └────────────────────────────────────────┘  │
├──────────────────────────────────────────────┤
│  Dạng câu hỏi                               │
│  ☑ Kiến thức nền    ☑ Thiết kế hệ thống     │
│  ☑ Điều tra sự cố   ☑ Đánh đổi quyết định   │
│  ☐ Hành vi (STAR)                           │
├──────────────────────────────────────────────┤
│  Số câu:  (5) (8) (12)                      │
│  Trả lời bằng:  (Văn bản) (Giọng nói)       │
│                                               │
│  Tập trung vào (auto — chọn mục yếu nhất):   │
│  ● Phân tích yêu cầu   (2 bằng chứng)       │
│  ○ Lựa chọn giải pháp   (0 bằng chứng)      │
│                                               │
│         [Bắt đầu phỏng vấn]                 │
└──────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Hồ sơ vai trò | `jobTitle`, `seniority` (junior/mid/senior/lead), `focusSkills[]` (chọn trong cây kỹ năng), `language` phỏng vấn (en/vi), `questionKinds[]` |
| Tự động chọn kỹ năng yếu | Mặc định bật: hệ thống tự chọn mục kỹ năng có **ít bằng chứng nhất** trong `focusSkills` → đúng tinh thần "đo chỗ bạn yếu" |
| Lưu hồ sơ | Nhiều hồ sơ, dùng lại cho các phiên sau |

---

#### S17 — Mock Interview: Phiên

**Route:** `/interview/session`

```
┌──────────────────────────────────────────────┐
│  Backend Engineer      Câu 3/8      ⏱ 04:12  │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├──────────────────────────────────────────────┤
│  AI (đóng vai interviewer):                  │
│  ┌────────────────────────────────────────┐  │
│  │ Bạn đang thiết kế hệ thống đặt vé sân  │  │
│  │ bay. Với 10 triệu người dùng đỉnh cao, │  │
│  │ hãy mô tả kiến trúc bạn chọn.          │  │
│  └────────────────────────────────────────┘  │
│                                               │
│  Bạn:                                        │
│  ┌────────────────────────────────────────┐  │
│  │ Tôi sẽ tách hệ thống thành 3 phần...  │  │
│  │                                          │  │
│  └────────────────────────────────────────┘  │
│                          [Gửi]  (Ctrl+Enter) │
├──────────────────────────────────────────────┤
│  Điểm câu trước (mở rộng)                   │
│  ▸ Chính xác 4/5  ▸ Chiều sâu 3/5  ▸ Lập luận 4/5 │
└──────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Luồng | AI hỏi → bạn trả lời → bấm "Gửi" → 1 call vừa **chấm câu vừa trả lời** vừa **sinh câu tiếp theo** → hiển thị điểm câu vừa rồi (thu gọn) + câu mới |
| Adaptive | AI sinh follow-up nếu câu trả lời hời hợt (thiếu chiều sâu / thiếu đánh đổi); chuyển câu mới nếu đã đạt |
| Feedback | Chỉ hiện **điểm 5 tiêu chí** trong phiên. Diễn giải chi tiết dành cho báo cáo cuối (S18) — tránh làm người dùng mất tập trung |
| Dừng giữa chừng | `POST /api/interview/session` tạo phiên trước; mọi lượt lưu → resume được |
| Điều hướng trong lúc thi | Chặn tab khác (fullscreen) là *tùy chọn* — không ép, vì ép thường gây bỏ |
| Edge | Hết câu → nút "Xem kết quả" → S18 |

---

#### S18 — Mock Interview: Kết quả

**Route:** `/interview/[id]`

```
┌──────────────────────────────────────────────┐
│  Kết quả phỏng vấn · Backend Engineer        │
│  29/10/2026 · 8 câu · 23 phút               │
├──────────────────────────────────────────────┤
│  TỔNG 4.1/5     ▲ +0.6 so với phiên trước    │
├──────────────────────────────────────────────┤
│  Chính xác          4.5 ▓▓▓▓▓▓░░░░          │
│  Chiều sâu          3.8 ▓▓▓▓░░░░░░          │
│  Lập luận          4.3 ▓▓▓▓▓░░░░░          │
│  Giao tiếp          4.4 ▓▓▓▓▓░░░░░          │
│  Nhận biết đánh đổi 3.6 ▓▓▓▓░░░░░░         │
├──────────────────────────────────────────────┤
│  ĐIỂM MẠNH                                       │
│  ✓ "Tôi tách theo hướng ghi và hướng đọc..."  │
│    → phân tích vấn đề đọc-heavy đúng         │
│  ✓ Đưa ra được cái giá của việc thêm queue    │
│                                               │
│  ĐIỂM YẾU                                       │
│  ✗ 2/8 câu không nêu đánh đổi về latency      │
│  ✗ Câu 5: trả lời chung chung, thiếu ví dụ    │
│    cụ thể về hệ thống đã làm                │
├──────────────────────────────────────────────┤
│  NÊN LUYỆN TIẾP                                 │
│  → "Lựa chọn giải pháp" (0 bằng chứng)       │
│    3 bài tập về đánh đổi đã lên                │
│  → "Phân tích yêu cầu" (2 bằng chứng)        │
│    Viết 1 tài liệu phân tích yêu cầu          │
├──────────────────────────────────────────────┤
│  [Làm lại với hồ sơ này]  [Chọn kỹ năng khác] │
└──────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Nội dung | Điểm tổng + 5 tiêu chí (thang 0–5, có delta so với phiên trước) · 3 điểm mạnh **có trích dẫn câu trả lời** · 3 điểm yếu **kèm số câu** · Đề xuất luyện tiếp trỏ tới `Skill` cụ thể |
| Hành động | "Làm lại" (cùng hồ sơ) · "Chọn kỹ năng khác" · "Luyện đề xuất" (tạo `PlanItem` cho ngày mai) · "Tạo bài tập về điểm yếu" |
| Lưu | 1 `Activity` (domain `professional`, type `mock_interview`) + `Evidence` cho `Skill` trọng tâm nhất |

---

#### S19 — Danh sách bài kiểm tra ngoại ngữ

**Route:** `/test`

```
Tiếng Trung      level ước lượng: A1
Tiếng Anh        level ước lượng: A1

┌──────────────────────────────────────────────┐
│  ĐỊNH VỊ              chưa làm               │
│  Xác định level khởi đầu thật · 25 câu       │
│                              [Bắt đầu →]      │
├──────────────────────────────────────────────┤
│  THEO CHỦ ĐỀ                                   │
│  Chào hỏi · Đồ ăn · Địa điểm · Thời gian      │
│  Mỗi chủ đề: 20 câu        [Chọn →]           │
├──────────────────────────────────────────────┤
│  CHUẨN (định kỳ)                               │
│  Lần gần nhất: 12/10 · 68% · level A1          │
│  Đề song song về độ khó                       │
│                              [Bắt đầu →]      │
├──────────────────────────────────────────────┤
│  TỪ NỘI DUNG                                   │
│  Dán bài báo → câu đọc hiểu + chấm tóm tắt    │
│                              [Bắt đầu →]      │
└──────────────────────────────────────────────┘
```

---

#### S20 — Làm bài kiểm tra

**Route:** `/test/session`

```
┌──────────────────────────────────────────────┐
│  Tiếng Trung · Đề chuẩn      Câu 7/40  12:30 │
├──────────────────────────────────────────────┤
│  🔊 Nghe câu hỏi (bấm để phát lại)           │
│  "你今天怎么样？"                             │
│                                               │
│  [ ] Tôi hôm nay rất tốt                     │
│  [ ] Tôi hôm nay rất mệt                    │
│  [ ] Tôi không biết                         │
│  [ ] Hôm nay là thứ Hai                      │
│                                               │
│              [Câu trước] [Câu sau →]          │
└──────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Luồng | 1 câu 1 lượt · trả lời → bấm "Câu sau" → chấm ngay (câu objective) hoặc chờ hết bài (câu tự luận) |
| Kiểu câu | `mc_vocab` / `mc_grammar` (chọn) · `cloze` (điền từ) · `listening` (nghe) · `writing` (textarea) · `translation` (textarea) |
| Timer | Chỉ bật với `benchmark` và `from_content`; hiện đồng hồ đếm ngược |
| Điều hướng | Cho phép quay lại câu đã trả lời trong cùng phiên (để sửa) |
| Lưu | Lưu từng câu ngay khi trả lời — không mất dữ liệu nếu đóng tab giữa chừng |
| Sau khi nộp | Câu sai → **đẩy thẻ về ôn hôm nay** (FR-LT-06) → sang S21 |

---

#### S21 — Kết quả bài kiểm tra

**Route:** `/test/[id]`

```
┌──────────────────────────────────────────────┐
│  Tiếng Trung · Đề chuẩn · 12/10              │
│  27/40 đúng (67.5%) · 22:14                 │
├──────────────────────────────────────────────┤
│  Theo dạng câu                                │
│  Từ vựng     12/15  ▓▓▓▓▓▓▓▓░░  80%         │
│  Ngữ pháp     7/10  ▓▓▓▓▓▓░░░░  70%         │
│  Nghe         5/8   ▓▓▓▓▓░░░░░  62%         │
│  Viết         3/7   ▓▓▓▓░░░░░░  43%  ← yếu  │
├──────────────────────────────────────────────┤
│  Ước lượng level:  A1  (hạn chế ở điểm 22/40) │
│  So với lần trước:  ▲ +2 câu đúng             │
├──────────────────────────────────────────────┤
│  Câu sai (7)                                  │
│  ✗ "苹果" nghĩa là?  → bạn chọn "chuối" — đúng│
│    ↳ thẻ này đã bị đẩy về ôn hôm nay         │
│  ✗ "我喜欢__" → "喝"  (đúng: 吃)               │
│    ↳ thẻ này đã bị đẩy về ôn hôm nay         │
├──────────────────────────────────────────────┤
│  3 thẻ bị đẩy về ôn sớm  →  [Ôn ngay →]      │
└──────────────────────────────────────────────┘
```

| Thuộc tính | Nội dung |
|---|---|
| Nội dung | Tổng điểm · phân tách theo `itemType` (bar) · ước lượng level (có ghi chú giới hạn) · danh sách câu sai kèm giải thích · **danh sách thẻ bị đẩy về ôn sớm** |
| Hành động | "Ôn ngay" (mở S10 với đúng các thẻ đó) · "Ôn lại đề này" · "Xem từ vựng yếu" |
| Lưu | `Activity` domain `language` type `test` + `Evidence` cho skill ngôn ngữ + cập nhật state FSRS của các thẻ liên quan |

---

## Phụ lục A — Cấu trúc thư mục dự kiến

```
prisma/
  schema.prisma
  seed.ts                 # 120 thẻ zh/en + cây kỹ năng + user profile
src/
  app/
    layout.tsx
    page.tsx                          # S01 Daily Loop
    globals.css
    plan/page.tsx                     # S02
    skills/page.tsx                   # S03
    skills/[id]/page.tsx              # S04
    log/page.tsx                      # S05 sheet
    log/history/page.tsx
    journal/page.tsx                  # S06
    speak/write/page.tsx              # S07
    speak/talk/page.tsx               # S08
    language/page.tsx                 # S09
    language/session/page.tsx         # S10
    language/practice/page.tsx        # S11
    state/page.tsx                    # S12
    review/page.tsx                   # S13
    progress/page.tsx                 # S14
    settings/page.tsx                 # S15
    interview/setup/page.tsx          # S16
    interview/session/page.tsx        # S17
    interview/[id]/page.tsx           # S18
    test/page.tsx                     # S19
    test/session/page.tsx             # S20
    test/[id]/page.tsx                # S21
    api/
      plan/generate/route.ts          # AI-01
      log/route.ts                    # Quick-log
      log/autofill/route.ts           # AI-02 (local)
      grade/route.ts                  # AI-03/04
      journal/feedback/route.ts       # AI-05
      journal/classify/route.ts       # AI-06 (local, mặc định)
      review/weekly/route.ts          # AI-07
      roleplay/route.ts               # AI-08
      language/correct/route.ts       # AI-09 (local)
      language/cards/route.ts         # AI-10
      interview/start/route.ts        # AI-11
      interview/turn/route.ts         # AI-12 (chấm) + AI-19 (sinh câu tiếp theo, local)
      interview/report/route.ts       # AI-13
      test/blueprint/route.ts         # AI-14 (chọn lọc tất định — KHÔNG gọi AI)
      test/from-content/route.ts      # AI-17 (sinh đề từ nguồn văn bản — local)
      test/grade-open/route.ts        # AI-15 (writing/translation)
      test/level/route.ts             # AI-16 (local)
      state/correlate/route.ts        # AI-18 (local — tương quan sinh học)
      srs/next/route.ts
      srs/grade/route.ts
      settings/key/route.ts
  components/
    daily-loop/  quick-log/  skills/  journal/  language/  charts/  ui/
    interview/   test/        rubric/  speech/
  lib/
    db.ts             # Prisma client singleton
    ai/
      router.ts       # ĐIỂM VÀO DUY NHẤT — provider routing (local|anthropic) + fallback chain
      anthropic.ts    # client cloud + wrapper ghi log AiCall
      ollama.ts       # client local (Ollama HTTP API)
      streaming.ts    # helper SSE
    rubrics.ts        # 4 rubric hằng số (nguồn duy nhất)
    prompts.ts        # system prompt + task prompts
    fsrs.ts           # wrapper ts-fsrs
    plan.ts           # bộ sinh rule cục bộ (fallback offline)
    skills.ts         # chọn kỹ năng yếu nhất (cho mock interview)
    nav.ts            # NAV_ITEMS dùng chung (9 mục sidebar)
    errors.ts         # lớp exception typed
    dates.ts
    types.ts
```

## Phụ lục B — Bảng seed thẻ ngoại ngữ level 0 (tóm tắt)

**Tiếng Trung — 6 nhóm × 10 từ**

| Nhóm | Từ (hanzi / pinyin / nghĩa) |
|---|---|
| Chào hỏi | 你好 nǐ hǎo xin chào · 谢谢 xièxie cảm ơn · 再见 zàijiàn tạm biệt · 对不起 duìbuqǐ xin lỗi · 没关系 méiguānxi không sao · 请 qǐng làm ơn · 早上好 zǎoshanghǎo chào buổi sáng · 晚上好 wǎnshanghǎo chào buổi tối · 你好嗎 nǐ hǎo ma bạn khỏe không · 很高兴认识你 hěn gāoxìng rènshi nǐ rất vui gặp bạn |
| Người & thân xã | 我 wǒ tôi · 你 nǐ bạn · 他 tā anh ấy · 她 tā cô ấy · 我们 wǒmen chúng tôi · 爸爸 bàba bố · 妈妈 māma mẹ · 哥哥 gēge anh trai · 弟弟 dìdi em trai · 朋友 péngyou bạn bè |
| Đồ ăn | 水 shuǐ nước · 茶 chá trà · 米饭 mǐfàn cơm · 面条 miàntiáo mì · 肉 ròu thịt · 鱼 yú cá · 菜 cài rau · 苹果 píngguǒ táo · 牛奶 niúnǎi sữa · 好吃 hǎochī ngon |
| Địa điểm | 家 jiā nhà · 学校 xuéxiào trường học · 公司 gōngsī công ty · 中国 Zhōngguó Trung Quốc · 医院 yīyuàn bệnh viện · 商店 shāngdiàn cửa hàng · 车站 chēzhàn nhà ga · 房间 fángjiān phòng · 公园 gōngyuán công viên · 中国人 Zhōngguó rén người Trung Quốc |
| Thời gian | 今天 jīntiān hôm nay · 明天 míngtiān ngày mai · 昨天 zuótiān hôm qua · 早上 zǎoshang buổi sáng · 中午 zhōngwǔ trưa · 晚上 wǎnshang buổi tối · 现在 xiànzài bây giờ · 一点 yī diǎn một giờ · 星期 xīngqī tuần · 年 nián năm |
| Động từ & phó từ | 是 shì là · 不 bù không · 有 yǒu có · 吃 chī ăn · 喝 hē uống · 学 xué học · 工作 gōngzuò làm việc · 去 qù đi · 来 lái tới · 很 hěn rất |

**Mẫu câu tiếng Trung (10)**: 你好，我是… · 这是… · 我要… · 我喜欢… · 我不会… · …在哪里？ · …多少钱？ · 我想学中文 · 你会说中文吗？ · 谢谢你。

**Tiếng Anh — 6 nhóm × 10 từ**

| Nhóm | Từ |
|---|---|
| Pronouns & cơ bản | I · you · he · she · we · they · my · your · this · that |
| Numbers & family | one–ten · family · mother · father · sister · brother · baby · parents |
| Food & drink | water · tea · coffee · rice · bread · fish · meat · apple · milk · egg |
| Places | home · school · work · hospital · shop · station · park · city · country · room |
| Time | today · tomorrow · yesterday · morning · afternoon · evening · night · now · year · week |
| Verbs & adjectives | be · have · go · do · like · want · eat · drink · read · write · good · big · small · new · happy |

**Mẫu câu tiếng Anh (10)**: I am… · My name is… · I have… · I like… · I want… · This is… · What is…? · How are you? · Nice to meet you. · Thank you.

> ⚠️ Danh sách trên là **bản khởi đầu để review**, chưa phải bản cuối. Trước khi seed, cần xác nhận: từ nào thuộc về bạn, từ nào thừa, và có cần thêm từ theo ngành của bạn (Q1).
