# Luyện Giao Tiếp & Luyện Ngoại Ngữ Chủ Động

> **Màn hình:** S07 (`/speak/write`), S08 (`/speak/talk`), S11 (`/language/practice`) · **Phase:** 1 (S07, S08) + Phase 2 (S11)
> **Nguồn:** `system-design/SPEC.md` §0.3 (P3, P4), §2.3.2 (FR-LG-08), §2.4 (FR-CM-01..08), §3.2 (S07, S08, S11), §4 (Activity/Evidence), §5.1 (AI-03/04/08/09/10), §5.4 (RUBRIC_COMMUNICATION, RUBRIC_LANGUAGE_ERRORS), §6 (NFR-07) · prototype `system-design/s07_luy_n_giao_ti_p_vi_t/`, `system-design/s08_luy_n_giao_ti_p_n_i/`, `system-design/s11_luy_n_ngo_i_ng_ch_ng/`
> **Phụ thuộc:** `app-foundation`, `ai-foundation` (phải xong trước)

## 1. Tổng quan

Feature này gom ba màn hình thực hành có đo được vào một chuỗi duy nhất: **viết → nói → hội thoại**.

| Màn hình | Chế độ (FR-CM-01) | Ngôn ngữ | AI | Phase |
|---|---|---|---|---|
| **S07** `/speak/write` | Viết (P0) | en / vi (CEFR A1–C1) | AI-03 chấm rubric 5 tiêu chí, streaming | 1 |
| **S08** `/speak/talk` | Nói (P1) | en / vi | AI-04 chấm cùng rubric + ghi chú từ điệu/độ rõ | 1 |
| **S11** `/language/practice` | Hội thoại AI (P2) + Luyện viết chủ động | zh-Hans / en-US | AI-08 role-play, AI-09 sửa lỗi 4 nhóm, AI-10 sinh flashcard | 2 |

Ba màn hình cùng tuân thủ **P4** (AI chấm theo rubric cố định khai báo sẵn trong system prompt, không tự bịa tiêu chí) và **P3** (mỗi bài luyện sinh ra `Activity` domain `communication`/`language` + `Evidence` gắn kỹ năng cụ thể). Điểm khác biệt so với các module khác: **đây là nơi AI thực sự "ra tay"** — không phải gợi ý, mà là chấm điểm, so delta với lần trước của chính người dùng, và chuyển lỗi sai thành thẻ ôn FSRS.

Điểm khác biệt về *hình thức*:

- S07/S08 dùng **rubric 5 tiêu chí** (`RUBRIC_COMMUNICATION`): Rõ ràng · Cấu trúc · Giọng văn · Tự nhiên · Ngữ pháp — mỗi tiêu chí 0–5, kèm 1 câu nhận xét + 1 đề xuất sửa cụ thể.
- S11 dùng **rubric 4 nhóm lỗi** (`RUBRIC_LANGUAGE_ERRORS`): Ngữ pháp · Từ vựng · Cách diễn đạt · Ngữ cảnh — mỗi nhóm là danh sách lỗi có vị trí, bản sửa và lý do.

Hai rubric **không trộn**: S07/S08 không có "ngữ cảnh" riêng; S11 không có điểm 5 tiêu chí. Điểm tổng của S07/S08 = trung bình 5 tiêu chí; S11 hiển thị điểm 0–10 nhưng điểm đó là **chỉ báo tổng hợp hiển thị**, không phải tiêu chí chấm điểm (tiêu chí chấm vẫn là 4 nhóm lỗi).

## 2. Bối cảnh & vấn đề

- **Viết không được chấm thì không luyện được.** Nhật ký AI (S06) có phản hồi nhưng không có điểm và không có so sánh — người dùng không biết mình có tiến không (FR-CM-02, FR-CM-03).
- **Luyện nói trên giấy thì không có độ rõ.** S08 yêu cầu `MediaRecorder` + Web Speech API để có transcript thật, rồi chấm **cùng rubric** để điểm viết và điểm nói so sánh được với nhau (FR-CM-04).
- **Role-play không có mục tiêu thì chỉ là chat vui.** Tình huống phải có **mục tiêu ẩn** để sau cuộc hội thoại AI chấm được "mức độ đạt" (FR-CM-06).
- **Sai lặp lại thì vẫn sai.** Lỗi viết ở S11 phải tự động biến thành thẻ ôn (AI-10 + FSRS) và từ khoá bài viết phải có nút "Thêm vào ôn" (FR-LG-08) — nếu không, app chỉ ghi nhận chứ không chữa.
- **Không có bằng chứng thì không có tiến độ.** Mọi bài luyện phải tạo `Activity` + `Evidence` (P3, FR-CM-07), nếu không cây kỹ năng sẽ không bao giờ đổi level.

## 3. Yêu cầu chức năng

### 3.1 Chế độ luyện giao tiếp (FR-CM)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-CM-01 | 3 chế độ luyện: **Viết** (S07), **Nói** (S08), **Hội thoại AI** (S11 Tab 2). Màn hình S07/S08 có switcher 3 chế độ ở thanh trên cùng. | P0 / P1 / P2 | FR-CM-01 |
| FR-CM-02 | AI chấm viết theo **rubric 5 tiêu chí** — mỗi tiêu chí 0–5, kèm **1 câu nhận xét** + **1 đề xuất sửa cụ thể** (kèm trích đoạn gốc → trích đoạn đề xuất). | P0 | FR-CM-02 |
| FR-CM-03 | So sánh với **lần ghi trước của chính người dùng** (cùng 5 tiêu chí) → hiện delta tăng/giảm từng tiêu chí + tổng. | P1 | FR-CM-03 |
| FR-CM-04 | Chế độ Nói: `MediaRecorder` → Web Speech API transcribe → AI chấm **cùng rubric 5 tiêu chí** + ghi chú **từ điệu / độ rõ** (tốc độ nói, filler words, điểm ngắt nhịp). | P1 | FR-CM-04 |
| FR-CM-05 | Chế độ Hội thoại AI: chọn tình huống, AI đóng vai đối tác, trả lời bằng **en / zh** theo level người dùng, **streaming** từng lượt. | P2 | FR-CM-05 |
| FR-CM-06 | Tình huống hội thoại có **mục tiêu ẩn** → sau cuộc hội thoại AI chấm **mức độ đạt mục tiêu** (0–5 + bằng chứng trích dẫn). | P2 | FR-CM-06 |
| FR-CM-07 | Mọi bài luyện lưu `Activity` (`domain` = `communication` cho S07/S08, `language` cho S11) + tạo `Evidence` cho kỹ năng tương ứng. | P0 | FR-CM-07 |
| FR-CM-08 | **Kho bài luyện**: 12 bài mẫu có sẵn + người dùng tự tạo prompt luyện (VD: "Nhắn bạn hủy lịch họp"). | P1 | FR-CM-08 |

### 3.2 Luyện ngoại ngữ chủ động (S11)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LG-11 | S11 có **2 tab**: Tab 1 *Luyện Viết & Sửa lỗi 4 nhóm* (AI-09), Tab 2 *Hội thoại AI Role-Play* (AI-08). Đề bài có **từ khoá bắt buộc** + gợi ý trật tự theo tiếng Trung. | P0 | SPEC §3.2 S11 + prototype |
| FR-LG-12 | AI-09 sửa lỗi theo **4 nhóm**: ngữ pháp · từ vựng · cách diễn đạt · ngữ cảnh; mỗi lỗi có **vị trí trong bài**, **bản sửa**, **lý do**. | P0 | SPEC §3.2 S11, §5.4 |
| FR-LG-13 | Hiển thị **bản chuẩn hóa** (native) + **phiên âm pinyin** (zh) + giải thích tiếng Việt cho từng thay đổi. | P0 | prototype S11 |
| FR-LG-14 | **Nút "Thêm vào ôn"** trên từ khoá bài viết → tạo `Card` FSRS cho từ đó (FR-LG-08 liên quan). | P1 | FR-LG-08 |
| FR-LG-15 | **AI-10 sinh 2 flashcard** từ lỗi vừa mắc → đẩy vào deck FSRS của ngôn ngữ, có thông báo lịch ôn kế tiếp. | P0 | SPEC §5.1 AI-10, §7 Phase 2 |
| FR-LG-16 | Từ khoá bài viết → nút **"Thêm vào ôn"** và **AI-10 sinh flashcard** là hai hành vi khác nhau: nút là 1 thẻ từ 1 từ khoá; AI-10 là 2 thẻ từ *lỗi* vừa mắc. | P1 | FR-LG-08 + AI-10 |

### 3.2b Chọn ngôn ngữ theo chế độ (Q2)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-CM-12 | Mọi màn hình luyện (S07, S08, S11) có **selector ngôn ngữ** `en` / `vi` / `zh`; đề bài, TTS, AI chấm và AI hội thoại đều theo ngôn ngữ đã chọn. | P1 | Q2 |
| FR-CM-13 | Khi chọn `vi`: AI **không** tính lỗi ngữ pháp tiếng Việt (bản ngữ) — chỉ chấm 4 tiêu chí còn lại, hiển thị ghi chú "Ngôn ngữ bản ngữ — bỏ qua chấm ngữ pháp". | P1 | Q2 · Q3 |

### 3.3 Kho bài luyện (FR-CM-08)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-CM-09 | Kho bài mẫu gồm **12 bài** theo trục level × ngôn ngữ (§6.8), lọc được theo level / ngôn ngữ / chủ đề. | P1 | SPEC §3.2 S07 |
| FR-CM-10 | Người dùng tạo prompt tự do: tiêu đề + nội dung đề + level + ngôn ngữ → lưu cục bộ, dùng lại được ở cả S07 và S08. | P1 | FR-CM-08 |
| FR-CM-11 | Bài tự tạo không đi qua AI sinh — chỉ là prompt do người dùng gõ. | P0 | R6 (AI không sinh nội dung nền) |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-CM-01 | **Không phụ thuộc ngoài (NFR-07):** ghi âm dùng `MediaRecorder`, STT/TTS dùng Web Speech API của trình duyệt. Không dịch vụ STT trả phí, không upload audio lên server. | Audit mạng: khi ghi âm không có request nào ngoài `localhost`; code không import SDK STT bên thứ ba |
| NFR-CM-02 | **Mobile-first 390px.** S07/S08/S11 dùng được ở 390px; nút chính (Chấm bằng AI / Gửi AI Chấm / Chấm & Phân tích) nằm trong vùng ngón cái. | Playwright viewport 390×844: không tràn ngang, nút chính reachable, transcript cuộn dọc |
| NFR-CM-03 | **A11y.** `aria-live="polite"` cho phản hồi AI và transcript; mọi icon-only button có `aria-label`; điểm rubric có text thay thế (không chỉ màu ▲/▼); focus ring `focus-visible:ring-2 focus-visible:ring-primary`. | axe scan không có lỗi critical; transcript đọc bằng screen reader có nhãn |
| NFR-CM-04 | **Local-first.** Bài viết, nháp, transcript, kho bài lưu trong SQLite. Chỉ nội dung người dùng **chủ động bấm chấm** mới được gửi lên API. | Không có request API khi người dùng chỉ gõ/save nháp |
| NFR-CM-05 | **Rubric cố định (P4).** `RUBRIC_COMMUNICATION` (5 tiêu chí) và `RUBRIC_LANGUAGE_ERRORS` (4 nhóm) là hằng số trong `src/lib/prompts.ts`; AI không được sinh tiêu chí mới. | Response AI có đúng 5 / đúng 4 nhóm; schema `safeParse` fail nếu lệch |
| NFR-CM-06 | **Tổng điểm luôn = trung bình các tiêu chí**, làm tròn 1 chữ số. | `computeTotal` unit test khớp tay với mọi bộ điểm |
| NFR-CM-07 | **Tính delta không làm hỏng dữ liệu cũ:** nếu lần trước thiếu 1 tiêu chí (do phiên bản rubric cũ), tiêu chí đó hiển thị "—" và **không** tính vào trung bình delta tổng. | Unit test rubric thiếu key → delta tổng tính trên tập tiêu chí có ở cả 2 lần |
| NFR-CM-08 | **Offline (FR-AI-06).** Không `ANTHROPIC_API_KEY` → ẩn nút AI ở cả 3 màn hình, hiện hướng dẫn thêm key; **không** giả lập phản hồi AI; các chức năng không-AI (soạn thảo, lưu nháp, kho bài, tạo Evidence thủ công) vẫn chạy. | E2E bỏ env key → UI hiện hướng dẫn, không có mô phỏng điểm |
| NFR-CM-09 | **Chi phí đo được.** Mọi call AI ghi `AiCall` (`feature` = `grading` \| `roleplay` \| `language_correct` \| `language_cards`) kèm token & `cacheRead`. | Bảng `AiCall` có dòng sau mỗi lần chấm |
| NFR-CM-10 | **Không vanity metric (P7).** Điểm chỉ hiện khi gắn được với kỹ năng cụ thể; nhãn "+15 XP" ở prototype là **giá trị hiển thị suy ra**, nguồn sự thật là `Evidence.rating`. | UI không hiển thị XP tổng trần trụi; `Evidence.rating` là số duy nhất quyết định tăng level |
| NFR-CM-11 | **Ngôn ngữ.** Giao diện tiếng Việt; nội dung học `zh-Hans` + `en-US`; đề `vi` dùng tiếng Việt; kiểm tra `lang` hợp lệ theo `UserProfile.learningLangs`. | Prompt AI-08 nhận đúng `lang`; response trả về đúng ngôn ngữ đề (xem edge case) |
| NFR-CM-12 | **Thời gian chấm.** Mục tiêu ≤ 3 giây cho bài ≤ 300 từ; UI hiển thị trạng thái streaming ngay sau khi bấm (không chờ trọn kết quả). | Log thời gian từ click → chunk đầu tiên; budget 3s |
| NFR-CM-13 | **Bàn phím.** `Ctrl+Enter` chấm (S07, S11), `Ctrl+Enter` gửi chấm (S08), `Ctrl+B/I` định dạng (S07). Chip phím tắt hiển thị bằng `font-label-sm`. | Playwright `keyboard.press("Control+Enter")` kích hoạt chấm |

## 5. Mô hình dữ liệu

> **Registry:** `.kiro/steering/data-model-registry.md` §3 — 7 model đề xuất của feature này:
> `SpeakPrompt` = **`M3`** · `SpeakAttempt` = **`M4`** · `RoleplayScenario` = **`M5`** ·
> `RoleplaySession` = **`M6`** · `RoleplayTurn` = **`M7`** · `LanguagePractice` = **`M8`** ·
> `PracticeCard` = **`M9`**.
> ⚠️ **Cả 7 chưa được duyệt** → mặc định implement theo **nhánh dự phòng** (bảng ở registry §3):
> kho đề/role-play là hằng số seed; lượt hội thoại gộp vào `Activity.content`; thẻ sinh từ bài viết
> tạo thẳng vào `Card` (`mode="produce"`, `due = now + 12h`). `tasks.md` phải có task dự phòng cho từng model.

Feature này **dùng lại** `Activity` + `Evidence` (P3) và `Card`/`Review` (FSRS) của schema gốc; **bổ sung** 5 model mới. Chi tiết DDL trong `design.md` §3.

### 5.1 Model dùng lại

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `Activity` | `domain` | String | `communication` (S07/S08) · `language` (S11) |
| `Activity` | `type` | String | `write` (S07) · `speak` (S08) · `roleplay` (S11 Tab 2) |
| `Activity` | `aiScore` | Float? | Tổng điểm rubric (S07/S08) hoặc điểm 0–10 chuẩn hoá (S11) |
| `Activity` | `minutes` | Int | Thời lượng thực tế (S08 = giây ghi âm → phút) |
| `Activity` | `content` | String? | Toàn bộ bài viết / transcript |
| `Evidence` | `rating` | Int | 1–4, suy ra từ tổng điểm (xem §5.4) |
| `Evidence` | `skillId` | String | Kỹ năng "Giao tiếp → Viết" / "Giao tiếp → Nói" / "Giao tiếp → Hội thoại" / "Tiếng Trung" / "Tiếng Anh" |
| `Card` | `lang`, `front`, `back`, `note`, `example`, `mode`, `cardState`, `due` | — | Thẻ sinh từ AI-10 hoặc từ nút "Thêm vào ôn" |

### 5.2 Model mới

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `SpeakPrompt` | `code` | String `@unique` | Mã bài: `EX-01`..`EX-12` cho bài mẫu; `CUS-xxxx` cho bài tự tạo |
| | `title` | String | Tiêu đề hiển thị trong kho |
| | `prompt` | String | Nội dung đề bài |
| | `level` | String | `A1`\|`A2`\|`B1`\|`B2`\|`C1` |
| | `lang` | String | `en`\|`vi`\|`zh` |
| | `mode` | String | `write`\|`speak`\|`both` |
| | `tags` | String (JSON) | Mảng chủ đề: `email`, `negotiation`, `incident`… |
| | `isUserMade` | Boolean | `true` = bài người dùng tự tạo |
| `SpeakAttempt` | `activityId` | String `@unique` | 1 attempt = 1 `Activity` |
| | `promptId` | String? | Có thể `null` (đề tự do, chưa lưu vào kho) |
| | `mode` | String | `write`\|`speak` |
| | `content` | String | Bài viết hoặc transcript đã chốt |
| | `rubric` | Json | `{ clarity: {score, comment, fix}, … }` — 5 tiêu chí |
| | `totalScore` | Float | Trung bình 5 tiêu chí |
| | `delta` | Json? | `{ total, criteria: {key: number} }` |
| | `speechMeta` | Json? | `{durationSec, wordsPerMinute, fillerWords[], pauses[], sampleRate}` |
| `RoleplayScenario` | `code` | String `@unique` | `SP-01`..`SP-15` |
| | `title`, `brief` | String | Tên + mô tả tình huống |
| | `hiddenGoal` | String? | **Mục tiêu ẩn** (FR-CM-06) — chỉ hiện sau khi kết thúc |
| | `lang`, `level`, `durationSec`, `tags` | — | Ngôn ngữ / level / khung giờ / chủ đề |
| `RoleplaySession` | `scenarioId`, `status`, `goalScore`, `goalNote`, `transcript` (Json), `activityId` | — | Phiên hội thoại AI |
| `RoleplayTurn` | `sessionId`, `index`, `speaker`, `text` | — | Lượt nói (`ai` \| `user`) |
| `LanguagePractice` | `activityId` `@unique`, `lang`, `level`, `prompt`, `input`, `corrected`, `errorGroups` (Json), `score` | — | 1 lần viết ở S11 Tab 1 |
| | `keywords` | Json | Mảng từ khoá bắt buộc (nút "Thêm vào ôn") |
| `PracticeCard` | `practiceId`, `cardId?`, `front`, `back`, `note`, `example` | — | Thẻ sinh từ lỗi (AI-10) trước khi/đã được đẩy vào `Card` |

### 5.3 Quan hệ & ràng buộc

```
SpeakPrompt 1 ──< SpeakAttempt >── 1 Activity 1 ──< Evidence >── 1 Skill
                     │
                     └── activity.domain = "communication"

RoleplayScenario 1 ──< RoleplaySession 1 ──< RoleplayTurn
                          │
                          └── activityId ──> Activity (domain="language"|"communication",
                                                    type="roleplay")

LanguagePractice 1 ──> Activity (domain="language", type="write")
          └──< PracticeCard >──? Card (deck FSRS ngôn ngữ)
```

Ràng buộc cứng:

1. `SpeakAttempt.activityId` là `@unique` → 1 bài luyện = 1 `Activity` = 1 `Evidence`.
2. `Activity.skillId` **không được null** với mọi bài luyện (FR-CM-07) — bài luyện không gắn kỹ năng thì không được tính vào tiến độ.
3. `RoleplayScenario.hiddenGoal` **không** được gửi cho người dùng trước khi phiên kết thúc (nếu không thì mục tiêu ẩn không còn ý nghĩa).
4. `Card.mode` của thẻ sinh từ S11 = `produce` (bắt người dùng tự nhớ/tự nói), không phải `recognize`.
5. `SpeakAttempt.rubric` bắt buộc có **đúng 5 key** của `RUBRIC_COMMUNICATION`; thiếu key → `safeParse` fail → không ghi `Activity`.

### 5.4 Quy tắc suy ra `Evidence.rating` từ điểm

| Tổng điểm (0–5) | `Evidence.rating` | Nhãn hiển thị |
|---|---|---|
| ≥ 4.0 | 4 | Đạt chuẩn |
| 3.0 – 3.9 | 3 | Khá |
| 2.0 – 2.9 | 2 | Yếu |
| < 2.0 | 1 | Rất yếu |

`rating ≥ 3` mới tính vào tăng level (`EVIDENCE_RATING_MIN = 3`, `EVIDENCE_THRESHOLD = 3`).

## 6. Giao diện & hành vi

### 6.1 Bố cục — S07 Luyện giao tiếp (Viết)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ [edit_note] FR-CM-01: GIAO TIẾP THỰC CHIẾN / Luyện Giao Tiếp (Viết) [S07 Workspace] │
│ Mô hình AI: Claude Opus 5 · Offline Vector Indexed            [Viết][Nói][Hội thoại AI]│
├────────────────────────────────────┬───────────────────────────────────────────────┤
│ CỘT TRÁI (xl:col-span-6)          │ CỘT PHẢI (xl:col-span-6)                    │
│ ┌────────────────────────────────┐ │ ┌───────────────────────────────────────────┐ │
│ │ psychology ĐỀ BÀI THỰC HÀNH   │ │ │  ◯ 3.8 / 5.0    B2 Ready                 │ │
│ │ translate Ngôn ngữ: English(US)│ │ │ │      ▲ +0.4 so với bài viết ngày 22/10    │ │
│ │ Viết email cho sếp xin 2 ngày │ │ │ │      Tiêu chuẩn: P4 Professional · 98.2%   │ │
│ │ nghỉ phép do việc gia đình…    │ │ │ └───────────────────────────────────────────┘ │
│ │ Trình độ CEFR: A1 A2 B1 B2✓ C1 │ │ │ 5 TIÊU CHÍ RUBRIC CHUẨN HÓA               │ │
│ │ Thời gian khuyến nghị: 8-12′   │ │ │ ● 1. Rõ ràng        4/5 (Tốt)   ✓           │ │
│ └────────────────────────────────┘ │ │   Nêu rõ lý do và thời gian nghỉ ngay dòng 1│
│ ┌────────────────────────────────┐ │ │ ● 2. Cấu trúc       3/5 (Khá)   info         │ │
│ │ B │ I │ ❝ │ • │ Markdown │ 142 từ│ │ │   Thiếu mốc ngày quay lại làm việc           │ │
│ ├────────────────────────────────┤ │ │ ● 3. Giọng văn      5/5 (Xuất sắc) ✓          │ │
│ │ Subject: Request for 2-day…    │ │ │ ● 4. Tự nhiên       3/5 (Khá)   tune         │ │
│ │ Dear Mr. Minh,                  │ │ │ ● 5. Ngữ pháp       4/5 (Tốt)   ✓            │ │
│ │ …                                │ │ └───────────────────────────────────────────┘ │
│ ├────────────────────────────────┤ │ ┌───────────────────────────────────────────┐ │
│ │ cloud_done Đã lưu nháp 10:42  │ │ │ auto_fix_high  1 ĐỀ XUẤT CẢI THIỆN TỪ AI   │ │
│ │ [save Lưu bản nháp] [bolt Chấm │ │ │ ✗ "I am writing to formally request 2 days…"  │ │
│ │   bằng AI (Claude Opus 5)]      │ │ │ ✓ "I would like to take 2 days of leave…"    │ │
│ └────────────────────────────────┘ │ │ → Lý do: giữ tính lịch thiệp, bớt sắc thái…  │ │
│ ┌────────────────────────────────┐ │ └───────────────────────────────────────────┘ │
│ │ library_books KHO ĐỀ LUYỆN NHANH│ │ ┌───────────────────────────────────────────┐ │
│ │ [12 đề mẫu]  Theo lộ trình…    │ │ │ account_tree XÁC THỰC BẰNG CHỨNG (Evidence) │ │
│ │ B2•Email #EX-01  Yêu cầu hoãn… │ │ │ Nút cây kỹ năng: Giao tiếp → Viết           │ │
│ │ C1•Đàm phán #EX-02  Hợp đồng API│ │ │ Rating: 4/4 (Đạt chuẩn) · #EV-2026-…      │ │
│ │ B1•Nội bộ #EX-03  Bảo trì hệ thống│ │ │ [Chỉnh sửa thêm] [verified Chấp nhận &      │ │
│ │ … (+9 thẻ, lọc level/ngôn ngữ)  │ │ │  Cập nhật Cây kỹ năng]                     │ │
│ └────────────────────────────────┘ │ └───────────────────────────────────────────┘ │
└────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 6.2 Bố cục — S08 Luyện giao tiếp (Nói)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ record_voice_over Giao tiếp / Luyện nói thực chiến [#SP-08]                      │
│ [psychology Claude Opus 5] [mic Web Speech API · 48kHz PCM] [● Độ trễ STT 45ms]    │
├──────────────────────────────────────────┬─────────────────────────────────────────┤
│ CỘT TRÁI (xl:col-span-7)                 │ CỘT PHẢI (xl:col-span-5)                │
│ ┌──────────────────────────────────────┐ │ ┌─────────────────────────────────────┐ │
│ │ [Thực chiến Pitching 60s] [B2/C1]   │ │ │  4.2 / 5.0   ▲ +0.3                │ │
│ │ Trình bày bản thảo (Pitching) giải   │ │ │  KẾT QUẢ THẨM ĐỊNH CLAUDE OPUS 5     │ │
│ │ pháp kiến trúc hệ thống trước hội   │ │ │ 1. Rõ ràng & Tốc độ nói  4.5/5.0     │ │
│ │ đồng kỹ thuật                        │ │ │ 2. Cấu trúc & Logic       4.0/5.0     │ │
│ │ Mục tiêu: …Idempotency… 60 giây     │ │ │ 3. Giọng văn & Sự tự tin 4.5/5.0     │ │
│ │ Giới hạn: 60 Giây                    │ │ │ 4. Tự nhiên & Ngữ điệu   3.8/5.0     │ │
│ └──────────────────────────────────────┘ │ │ 5. Phát âm kỹ thuật      4.2/5.0     │ │
│ ┌──────────────────────────────────────┐ │ ├─────────────────────────────────────┤ │
│ │ LIVE RECORDING — MediaRecorder 48kHz  │ │ │ equalizer FILLER WORDS: 1 lần (Xuất sắc)│ │
│ │          00:48 / 01:00              │ │ │ info Điểm ngắt nhịp khuyến nghị: giây 35│ │
│ │ ▁▃▅█▇▅▃▁▂▄▆█▇▅▃▁ (waveform)        │ │ │ tips_and_updates Sau khi nêu "20.000 TPS" │ │
│ │ INPUT: Built-in Mic Array · Peak -2.8│ │ │ → ngắt 0.8s trước khi công bố giải pháp │ │
│ │ [pause Tạm dừng] [refresh Thu lại từ  │ │ ├─────────────────────────────────────┤ │
│ │  đầu] [neurology Gửi AI Chấm & Phân  │ │ │ verified Chấp nhận & Ghi nhận 1 Evidence   │ │
│ │  tích âm vị  Ctrl+↵]                 │ │ │ Node: Kỹ năng Nói / Architecture Pitching│ │
│ └──────────────────────────────────────┘ │ │ Rating lưu: 4.2 / 5.0                   │ │
│ ┌──────────────────────────────────────┐ │ └─────────────────────────────────────┘ │
│ │ subtitles BẢN GHI THỜI GIAN THỰC     │ │                                           │
│ │ (Live STT Transcript)                │ │                                           │
│ │ "Kính thưa hội đồng, chúng tôi đề    │ │                                           │
│ │  xuất chuyển dịch dịch vụ thanh toán…"│ │                                           │
│ │ ⚠ uhm... (0.6s)   ⓘ từ vựng kỹ thuật │ │                                           │
│ │ 108 từ đã nhận diện                  │ │                                           │
│ └──────────────────────────────────────┘ │                                           │
├──────────────────────────────────────────┴─────────────────────────────────────────┤
│ category KHO TÌNH HUỐNG LUYỆN NÓI KỸ THUẬT (Role-play Drills)  [tune Bộ lọc]     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │#SP-01 60s    │ │#SP-03 60s    │ │#SP-05 90s    │ │#SP-09 60s    │ … 6 thẻ        │
│ │Pitching Kiến │ │Daily Standup │ │Incident Post-│ │Giải Thích Lỗi│               │
│ │Trúc Hệ Thống│ │Súc Tích 60s  │ │Mortem        │ │Kỹ Thuật Non- │               │
│ │Level C1 Tech │ │Level B1 Focus│ │Level B2 Exec │ │Tech · C1 Met │               │
│ │Đang luyện    │ │play Bắt đầu │ │play Bắt đầu │ │play Bắt đầu │               │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘               │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Bố cục — S11 Luyện ngoại ngữ chủ động

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ [Mô-đun AI-08 · S11 Active Drill] | ● FSRS Spaced Repetition v4 Sync               │
│ Luyện Ngoại Ngữ Chủ Động                                                  ┌─────┐ │
│ Khung phản xạ tạo sinh chủ động đa ngữ thức…                                │Mục… │ │
│                                                                            │2/3  │ │
│ ┌──────────────────────────────────────┐┌────────────────────────────────────┐│91.4%│ │
│ │ edit_note Tab 1: Luyện Viết & Sửa Lỗi││ forum Tab 2: Hội Thoại AI Role-Play│└─────┘ │
│ │ 4 Nhóm  [DANG MỞ]  │ LOCAL VOX       │└────────────────────────────────────┘ │
│ └──────────────────────────────────────┘                                           │
├─────────────────────────────────┬──────────────────────────────────────────────────┤
│ CỘT TRÁI (xl:col-span-5)       │ CỘT PHẢI (xl:col-span-7)                          │
│ ┌─────────────────────────────┐ │ ┌──────────────────────────────────────────────┐ │
│ │ psychology ĐỀ BÀI          │ │ │ verified Đánh Giá Sư Phạm Chuẩn Hoá  TỐT 8.8/10│ │
│ │ Chủ đề #ZH-042 · HSK 3+     │ │ │ Phát hiện 2 điểm cần cải tiến…  Latency 284ms │ │
│ │ Miêu tả ngày làm việc thực tế│ │ ├──────────────────────────────────────────────┤ │
│ │ bằng tiếng Trung             │ │ │ 1. Ngữ pháp (Grammar)   Cần sửa 1 vị trí      │ │
│ │ Từ khoá bắt buộc:           │ │ │    ✗ 七点去公司工作 → 我早上七点到公司上班      │ │
│ │ [今天][工作][去][喜欢]       │ │ │ 2. Từ vựng (Vocabulary)  Nâng cấp Collocation  │ │
│ │                            │ │ │    工作 lặp → 上班/下班 (Thay 去工作→去上班)   │ │
│ │ tips_and_updates Quy tắc    │ │ │ 3. Cách diễn đạt (Expression) Khử Việt-hóa     │ │
│ │ trật tự thời gian…          │ │ │    有很多任务 → 事情挺多的 / 工作节奏快          │ │
│ └─────────────────────────────┘ │ │ 4. Ngữ cảnh (Context)    Đạt chuẩn 95% ✓       │ │
│ ┌─────────────────────────────┐ │ ├──────────────────────────────────────────────┤ │
│ │ Khung nhập văn bản (IME)    │ │ │ compare_arrows ĐỐI CHIẾU TRỰC QUAN            │ │
│ │ 48 ký tự Hanzi · 3 câu       │ │ │ Bản gốc của bạn: …                          │ │
│ │ [今天我七点去公司工作。虽然…]  │ │ │ Bản chuẩn hóa tối ưu: [volume_up Phát âm mẫu]│ │
│ │ [restart_alt Xoá nhập lại]   │ │ │ + pinyin + 💡 Giải thích ngữ pháp              │ │
│ │ [progress_activity Chấm & Phân│ │ ├──────────────────────────────────────────────┤ │
│ │  tích 4 nhóm lỗi (Claude Opus│ │ │ psychology VÒNG LẶP LƯU GIỮ TRÍ NHỚ (AI-10)   │ │
│ │  5 streaming)]  Ctrl+Enter   │ │ │ [style Tạo 2 thẻ Flashcard mới Vào Deck FSRS]  │ │
│ └─────────────────────────────┘ │ │ [award_star Ghi nhận 1 Evidence +15 XP]        │ │
│                                  │ │ ✓ Đã thêm 2 thẻ — Lịch ôn kế tiếp: Sau 12 giờ  │ │
│                                  │ └──────────────────────────────────────────────┘ │
└─────────────────────────────────┴──────────────────────────────────────────────────┘
```

### 6.3b Chọn ngôn ngữ theo chế độ (Q2)

> Nguồn chân lý: `.kiro/steering/user-profile-decisions.md` §3.

| Màn hình | Selector | Giá trị | Ghi chú |
|---|---|---|---|
| S07 Viết | Chọn ngôn ngữ **đề bài** | `en` / `vi` / `zh` | Mặc định `en` |
| S08 Nói | Chọn ngôn ngữ **giọng nói** + TTS | `en-US` / `vi-VN` / `zh-CN` | Mặc định `en-US` |
| S11 Viết | Ngôn ngữ viết | `en` / `vi` / `zh` | Độc lập với tab Hội thoại |
| S11 Hội thoại | Ngôn ngữ hội thoại | `en` / `vi` / `zh` | AI trả lời bằng đúng ngôn ngữ đã chọn |
| S11 Tạo flashcard | Ngôn ngữ thẻ sinh | theo ngôn ngữ đang viết | Chỉ `en`/`zh` — `vi` không có deck SRS |

**Ràng buộc:**
- Chọn `vi` ⇒ AI **không** chấm ngữ pháp tiếng Việt như lỗi (bản ngữ, `viLevel = B2`); chỉ chấm **rõ ràng · cấu trúc · giọng văn · tự nhiên**.
- TTS `vi-VN` không có trên một số thiết bị → fallback hiện phụ đề (R5 tương ứng).
- Đổi ngôn ngữ ⇒ nạp lại kho đề mẫu tương ứng (12 bài mẫu chia theo ngôn ngữ).

### 6.4 Bảng thành phần

#### S07

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Mode switcher | 3 chip Viết / Nói / Hội thoại AI | active `bg-primary-container text-on-primary`, inactive `bg-surface-container-high text-on-surface-variant` | Điều hướng `/speak/write` · `/speak/talk` · `/language/practice?tab=roleplay` |
| Đề bài card | Tiêu đề đề + selector ngôn ngữ + CEFR | `bg-surface-container-low rounded-xl`; chip CEFR active `bg-primary-container text-on-primary` | Chọn CEFR đổi tên bài mẫu gợi ý + prompt gửi AI |
| Editor toolbar | `format_bold` · `format_italic` · `format_quote` · `format_list_bulleted` + đếm từ | `bg-surface-container`; icon 16px `text-on-surface-variant`; đếm từ `font-code-md text-primary` | `Ctrl+B/I`; đếm từ cập nhật realtime |
| Editor | `textarea` bài viết | `bg-surface-container-lowest/80 font-code-md text-on-surface` | Lưu nháp tự động (debounce 800ms) + nút `save` |
| Nút chấm | `bolt Chấm bằng AI (Claude Opus 5)` | `bg-primary text-on-primary font-label-md font-semibold` + glow `rgba(78,222,163,0.3)` | `Ctrl+Enter`; disabled khi đang stream |
| Kho đề luyện | Lưới 12 thẻ bài + bộ lọc | card `bg-surface-container hover:bg-surface-container-high rounded-lg`; chip level `text-primary`/`text-secondary`/`text-tertiary` | Click → nạp đề vào editor |
| Tổng điểm | Vòng tròn radial + nhãn + delta | ring `text-primary`, số `font-headline-lg text-on-surface`; delta `text-primary` (tăng) / `text-error` (giảm) | Vòng tròn = `total/5`; delta so lần trước |
| 5 tiêu chí rubric | 5 card, mỗi card 1 điểm + 1 nhận xét + 1 đề xuất | card `bg-surface-container rounded-lg`; chấm điểm `font-code-md`; icon `check_circle`/`info`/`tune` | Điểm 4–5 `text-primary`, 3 `text-tertiary`, ≤2 `text-error` |
| Đề xuất sửa | Bản gốc (gạch ngang) → bản đề xuất | gốc `text-error/90 line-through font-code-md`; mới `text-primary font-semibold font-code-md` | 1 đề xuất tiêu biểu + nút "Xem tất cả" |
| Evidence panel | Node kỹ năng + rating + nút commit | `bg-surface-container-low rounded-xl`; icon `account_tree text-primary` | `verified Chấp nhận & Cập nhật Cây kỹ năng` → tạo `Activity`+`Evidence` |

#### S08

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Challenge brief | Tên tình huống + target level + mục tiêu + giới hạn giây | `bg-surface-container-low rounded-xl`; chip `bg-tertiary-container/30 text-tertiary` | Đổi theo drill đang chọn |
| Recording cockpit | Timer `00:48 / 01:00`, waveform, peak dBFS, input source | `bg-surface-container rounded-xl`; timer `font-headline-lg font-code-md`; waveform `bg-surface-container-lowest` | Tự ngắt khi chạm giới hạn |
| Nút điều khiển | `pause Tạm dừng` · `refresh Thu lại từ đầu` | `bg-surface-container-high text-on-surface font-code-md` | Reset xoá blob + transcript |
| Nút chấm | `neurology Gửi AI Chấm & Phân tích âm vị` + chip `Ctrl + ↵` | `bg-primary text-on-primary font-code-md font-semibold` | Disable khi chưa có transcript |
| Live STT | Transcript cuộn + filler word + đếm từ | khối `bg-surface-container-lowest rounded-xl font-body-md`; interim `text-outline` → final `text-on-surface` | `aria-live="polite"`; filler `text-tertiary` |
| Bảng điểm rubric | 5 tiêu chí + tổng + delta | `bg-surface-container rounded-xl`; chip điểm `bg-secondary/10 text-secondary` | Cùng rubric như S07, thêm nhận xét từ điệu |
| Filler & nhịp thở | Số filler, điểm ngắt nhịp, khuyến nghị huấn luyện viên | `bg-surface-container-lowest rounded-xl`; khuyến nghị `tips_and_updates text-tertiary` | Tính từ `speechMeta` |
| Drill library | 6 thẻ tình huống | active `bg-surface-container-high`; card khác `bg-surface-container-low` | Click → nạp challenge brief mới |

#### S11

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Tab switcher | Tab 1 Viết · Tab 2 Hội thoại AI | container `bg-surface-container-lowest p-1 rounded-xl`; active `bg-surface-container-high text-primary`; badge `bg-primary/20 text-primary` | Đổi tab qua `?tab=write|roleplay` |
| Đề bài + từ khoá | Chủ đề, level HSK/CEFR, danh sách từ khoá bắt buộc | chip từ khoá `bg-surface-container-high text-on-surface` + nút `add_circle` | Click từ khoá → "Thêm vào ôn" (FR-LG-14) |
| Editor IME | `textarea` hỗ trợ IME (pinyin) | `bg-surface-container-lowest rounded-lg font-body-md` | Bộ đếm ký tự Hanzi + số câu |
| Nút chấm | `progress_activity Chấm & Phân tích 4 nhóm lỗi (Claude Opus 5 streaming)` | `bg-primary-container text-on-primary font-code-md` | `Ctrl+Enter`; streaming từng nhóm |
| 4 nhóm lỗi | Lưới 2×2, mỗi nhóm 1–5 lỗi | card `bg-surface-container-low rounded-xl`; badge nhóm `bg-secondary/10 text-secondary` | Nhóm không có lỗi → chip `Đạt chuẩn` |
| Đối chiếu | Bản gốc vs bản chuẩn hoá + pinyin + giải thích | gốc `bg-surface-container-lowest`; chuẩn `bg-surface-container-high`; nút `volume_up` | TTS đọc bản chuẩn hoá (`zh-CN`/`en-US`) |
| AI-10 panel | Sinh 2 thẻ + ghi Evidence | nút thẻ icon `style` trong `bg-tertiary/10 text-tertiary`; nút Evidence icon `award_star` trong `bg-primary/10 text-primary` | Sau khi sinh: toast `bg-primary/10 text-primary` |
| Role-play (Tab 2) | Vòng lượt AI/user, ô nhập, nút kết thúc | lượt AI `bg-surface-container-low`; lượt user `bg-surface-container-high` | AI trả lời streaming; mục tiêu ẩn chỉ hiện khi kết thúc |

### 6.5 Rubric 5 tiêu chí — `RUBRIC_COMMUNICATION` (P4)

| key | name | desc (định nghĩa tiêu chí) | Thang điểm | Mốc 5/5 | Mốc 0/5 |
|---|---|---|---|---|---|
| `clarity` | Rõ ràng | Người đọc hiểu ngay điều cần biết trong 1 câu đầu | 0–5 | Yêu cầu + thời gian nằm ở câu đầu, không phải đọc hết mới hiểu | Không ai đọc được mình muốn nói gì |
| `structure` | Cấu trúc | Có mở–thân–kết rõ ràng, điều quan trọng nhất đứng đầu | 0–5 | Mở–thân–kết tách bạch, điều quan trọng nhất đứng đầu | Nhảy lung tung, không có trình tự |
| `tone` | Giọng văn | Phù hợp với vai trò và mối quan hệ với người nhận | 0–5 | Đúng độ trang trọng/thân mật theo quan hệ với người nhận | Sai hoàn toàn đối tượng (ví dụ gửi sếp bằng giọng bạn) |
| `natural` | Tự nhiên | Cách diễn đạt tự nhiên, không dịch từng chữ | 0–5 | Dùng cụm tự nhiên của người bản xứ | Rõ ràng là dịch từng chữ từ tiếng Việt |
| `grammar` | Ngữ pháp | Cấu trúc câu và dấu câu đúng | 0–5 | Không lỗi ngữ pháp/dấu câu đáng kể | Sai ở mức khó hiểu |

**Thang 0–5 dùng chung (mốc trung gian):**

| Điểm | Nhãn | Ý nghĩa |
|---|---|---|
| 5 | Xuất sắc | Đạt mốc 5/5, không điểm yếu đáng kể |
| 4 | Tốt | Đạt phần lớn yêu cầu, lỗi nhỏ |
| 3 | Khá | Đạt yêu cầu chính, có 1 điểm cần cải thiện |
| 2 | Yếu | Đạt một phần, cần viết lại cấu trúc |
| 1 | Rất yếu | Có nỗ lực nhưng lệch tiêu chí |
| 0 | Chưa có | Không có nội dung để chấm / không thể hiện tiêu chí |

**Tổng điểm = trung bình 5 tiêu chí**, làm tròn 1 chữ số (ví dụ 4+3+5+3+4 = 19/5 = **3.8**).

### 6.6 Rubric 4 nhóm lỗi — `RUBRIC_LANGUAGE_ERRORS` (P4) + ví dụ lỗi thật

| key | name | Mô tả nhóm | Ví dụ lỗi thật (zh) | Ví dụ lỗi thật (en) |
|---|---|---|---|---|
| `grammar` | Ngữ pháp | Sai trật tự từ, thiếu mạo từ, chia động từ sai, sai thanh điệu | ✗ `今天我七点去公司工作` → ✓ `今天早上我七点到公司上班` (trạng từ thời gian phải đứng trước hành động) | ✗ `I am interesting in system design` → ✓ `I am interested in system design` (thiếu `d`) |
| `vocab` | Từ vựng | Dùng từ không tự nhiên, lặp từ, từ quá hàn lâm / từ sai ngành | ✗ `去工作` (dịch từng chữ) → ✓ `去上班` (cặp động từ bản xứ) | ✗ `I very like this architecture` → ✓ `I really like this architecture` (sau `very` cần tính từ, không dùng động từ) |
| `expression` | Cách diễn đạt | Cấu trúc đúng ngữ pháp nhưng nghe không tự nhiên (tư duy dịch từng chữ) | ✗ `虽然有很多任务` → ✓ `事情挺多的` / `工作节奏快` | ✗ `Yesterday I go to the office` → ✓ `I went to the office yesterday` (trật tự thời gian theo lịch sử) |
| `context` | Ngữ cảnh | Đúng ngữ pháp nhưng sai tình huống (lễ tế, vai trò, mức độ thân mật) | ✗ Chào khách lạ bằng `你身体好吗？` (hỏi thăm sức khoẻ là quen thuộc) → ✓ `你好，很高兴认识你！` | ✗ Trả lời sếp bằng `Whatever, I don't care.` → ✓ `Understood — I'll update you by EOD.` |

Mỗi lỗi trả về: **vị trí** (`original`), **bản sửa** (`corrected`), **lý do** (`reason`), **mức độ** (`severity`: `minor` \| `major`).

### 6.7 Bảng trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| **Chưa có key** | `!process.env.ANTHROPIC_API_KEY` | Ẩn nút chấm AI; hiện "Bật chấm AI bằng cách thêm API key trong Cài đặt"; soạn thảo/lưu nháp/kho bài vẫn chạy |
| **Chưa có key — Role-play** | Thiếu key, mở Tab 2 S11 | Ẩn ô nhập trả lời AI; hiện hướng dẫn thêm key |
| **Đang stream chấm** | Đã bấm chấm, chưa nhận đủ 5 tiêu chí | Nút chấm → spinner + "Đang phân tích Rubric…"; skeleton card cho tiêu chí chưa về; `aria-live="polite"` báo "AI đang chấm" |
| **Chấm xong** | Nhận đủ 5 tiêu chí + tổng + delta | Rubric panel đầy đủ, vòng tròn điểm, delta ▲/▼, nút commit Evidence sáng |
| **Lỗi API** | 429 / refusal / timeout / schema fail | Banner `bg-error/10 text-error` + "Thử lại"; ghi `AiCall{ok:false}`; **không** mất nội dung đã gõ |
| **Không có quyền mic** | `navigator.permissions` hoặc `getUserMedia` trả `NotAllowedError` | Khối recorder chuyển sang trạng thái lỗi, nút ghi tắt, hiện "Cho phép truy cập mic trong cài đặt trình duyệt"; nút gửi chấm ẩn |
| **Không có STT** | `window.SpeechRecognition \|\| window.webkitSpeechRecognition` undefined | Chuyển sang **chế độ nhập transcript tay** (textarea), vẫn chấm được bằng AI-04; hiện ghi chú "Trình duyệt không hỗ trợ STT — nhập transcript thủ công" |
| **Transcript rỗng** | `transcript.trim() === ""` khi bấm chấm | Chặn request, hiện "Chưa nhận được giọng nói — hãy thử ghi lại"; không gọi AI, không tạo Evidence |
| **Bài quá ngắn để chấm** | S07: < 20 từ · S11: < 5 ký tự Hanzi | Chặn request, hiện "Bài quá ngắn (cần ≥ 20 từ) để chấm có nghĩa"; đếm từ hiện `text-tertiary` |
| **Chưa có lần trước** | Không tìm thấy attempt trước | Delta = `null`; UI hiện "Chưa có lần trước để so sánh" thay vì `▲ 0.0` |
| **Đang ghi âm** | `MediaRecorder.state === "recording"` | Timer đếm, waveform chạy, nút `pause` active, nút chấm disable |
| **Đã tạm dừng** | `MediaRecorder.state === "paused"` | Nút đổi thành `play_arrow` "Tiếp tục"; timer dừng |
| **Hết giới hạn giây** | Đạt `durationSec` của drill | Tự dừng ghi, hiện "Đã đạt giới hạn 60 giây", nút chấm bật |
| **Mục tiêu ẩn đang ẩn** | Phiên role-play chưa kết thúc | Không hiện `hiddenGoal`; badge "Mục tiêu ẩn: đang ẩn" |
| **Đã tạo Evidence** | Bấm "Chấp nhận & Cập nhật Cây kỹ năng" | Nút đổi thành `done_all Đã nạp vào Cây kỹ năng` + `bg-primary`; bấm lại không tạo trùng |

### 6.8 Bảng 12 bài mẫu (FR-CM-09)

| # | Mã | Level | Ngôn ngữ | Chủ đề | Dạng bài | Gợi ý cấu trúc | Thời lượng |
|---|---|---|---|---|---|---|---|
| 1 | `EX-01` | B2 | en | Yêu cầu hoãn sprint deadline | Lập luận kỹ thuật | Mở–lý do–đề xuất–cam kết | 10′ |
| 2 | `EX-02` | C1 | en | Thương thảo hợp đồng API | SLA & chiết khấu | Cảm ơn–điều kiện–đề nghị–bước tiếp | 12′ |
| 3 | `EX-03` | B1 | en | Thông báo bảo trì hệ thống | Downtime 30 phút | Vấn đề–phạm vi–kế hoạch–đường dẫn | 8′ |
| 4 | `EX-04` | A1 | en | Viết email hỏi lịch học team | Hỏi lịch | Chào–câu hỏi–cảm ơn | 5′ |
| 5 | `EX-05` | A2 | en | Nhắn đồng nghiệp báo hỏi thăm | Nhắn tin nội bộ | Chào–cập nhật–câu hỏi | 6′ |
| 6 | `EX-06` | B1 | en | Báo cáo tiến độ tuần cho team lead | Báo cáo | Đã xong–đang làm–vướng–kế hoạch | 8′ |
| 7 | `EX-07` | B2 | en | Viết Post-mortem sự cố DB | Root cause analysis | Tóm tắt–timeline–nguyên nhân gốc–hành động | 12′ |
| 8 | `EX-08` | C1 | en | Từ chối đối tác lịch thiệp | Giữ mối quan hệ | Cảm ơn–lý do–đề xuất thay thế–mở cửa | 10′ |
| 9 | `EX-09` | A1 | vi | Nhắn hỗ trợ đồng nghiệp mới | Nhắn tin | Chào–giới thiệu–hỏi cần gì | 5′ |
| 10 | `EX-10` | A2 | vi | Xin phép hủy lịch hẹn | Nhắn tin lịch | Xin phép–lý do–đề xuất giờ khác | 6′ |
| 11 | `EX-11` | B1 | vi | Đề xuất lộ trình chuyển đổi hệ thống | Đề xuất | Vấn đề–đề xuất–lợi ích–rủi ro | 8′ |
| 12 | `EX-12` | B2 | vi | Thông báo tăng giá dịch vụ cho khách hàng | Thông báo | Thay đổi–lý do–mức tăng–điều khoản | 10′ |

Phân bổ: **en 8 bài (A1–C1) · vi 4 bài (A1–B2)**. Ngoài 12 bài mẫu, người dùng tạo bài tự do (mã `CUS-xxxx`, `isUserMade = true`) theo FR-CM-10.

### 6.9 Bảng 6 tình huống role-play (S08 kho drill + S11 tình huống AI)

| Mã | Tên | Thời lượng | Level | Ngôn ngữ | Mục tiêu ẩn (FR-CM-06) | Mô tả |
|---|---|---|---|---|---|---|
| `SP-01` | Pitching Kiến Trúc Hệ Thống | 60s | C1 | en | Thuyết phục Tech Lead & Principal Architect chấp nhận chuyển nền tảng dữ liệu lớn sang Event-Driven **không gián đoạn giao dịch** | Pitch giải pháp kiến trúc trước hội đồng kỹ thuật |
| `SP-03` | Daily Standup Súc Tích 60s | 60s | B1 | en | Không lan man, **nêu rõ blocker** trong 60 giây | Báo cáo việc hoàn thành, mục tiêu hôm nay, rủi ro cản trở |
| `SP-05` | Trình Bày Incident Post-Mortem | 90s | B2 | en | Phân tích root cause theo 5-Whys **không đổ lỗi ai** | Giải trình sự cố P0 |
| `SP-09` | Đàm Phán Scope & Deadline | 120s | B2 | en | **Từ chối** feature gấp bằng dữ liệu velocity thực tế + đề xuất phased rollout | Đàm phán phạm vi với Product Manager |
| `SP-12` | Giải Thích Lỗi Kỹ Thuật Cho Non-Tech | 60s | C1 | en | Giải thích deadlock DB bằng **phép ẩn dụ đời thường** để giám đốc kinh doanh hiểu rủi ro | Diễn giải lỗi kỹ thuật cho người không chuyên |
| `SP-15` | Bảo Vệ Quyết Định Refactor Codebase | 90s | B2 | en | Xin cấp **2 sprint tái cấu trúc** mô hình dữ liệu, nêu rõ nợ kỹ thuật | Bảo vệ quyết định tái cấu trúc trước ban giám đốc |

> `SP-01`..`SP-12` là **drill luyện nói 1 lượt** (S08: ghi âm → chấm). Cùng bộ tình huống này được dùng làm kịch bản cho **Hội thoại AI** (S11 Tab 2 / FR-CM-05) — ở đó AI đóng vai và chấm mức độ đạt mục tiêu ẩn.

### 6.10 Edge case

| Case | Xử lý |
|---|---|
| **Ghi âm bị từ chối quyền** | `getUserMedia` trả `NotAllowedError` → dừng trạng thái recording, hiện card lỗi "Không được cấp quyền mic — bật trong cài đặt trình duyệt rồi tải lại trang"; nút chấm ẩn; **không** gọi AI |
| **Web Speech API không hỗ trợ** | Không có `SpeechRecognition` → tự chuyển sang **chế độ nhập transcript tay** (textarea + nút "Chấm transcript này"); hiện ghi chú nhỏ; không crash |
| **STT trả transcript rỗng** (không nghe rõ / im lặng) | Chặn request chấm, hiện "Chưa nhận được giọng nói — hãy thử ghi lại"; nút "Nhập transcript tay" luôn sẵn dùng |
| **Bài quá ngắn để chấm** | S07 < 20 từ, S08 transcript < 15 từ, S11 < 5 ký tự Hanzi → chặn, hiện ngưỡng cụ thể, không gọi AI, không tạo Evidence |
| **So sánh delta khi chưa có lần trước** | `previous = null` → `delta = null`; UI hiện "Chưa có lần trước để so sánh"; **không** hiển thị `▲ 0.0` (tránh báo nhầm là không tiến) |
| **Lần trước thiếu 1 tiêu chí** (rubric cũ) | Tiêu chí đó hiển thị "—" + "không có dữ liệu"; delta tổng tính trên tập tiêu chí có ở **cả hai** lần |
| **Ngôn ngữ trả lời khác ngôn ngữ đề** | System prompt của AI-08 ràng buộc: "Trả lời **đúng ngôn ngữ đề** (`lang`), không trộn 2 ngôn ngữ"; nếu AI vi phạm 2 lượt liên tiếp → UI hiện cảnh báo "AI đang trả lời sai ngôn ngữ" kèm nút "Báo lỗi" ghi log cải thiện |
| **Người dùng đổi level giữa chừng** | Level hiện tại được gửi kèm mỗi lần chấm; bài đang so sánh phải cùng `level` — nếu khác level, delta hiện kèm cảnh báo "so sánh giữa 2 level khác nhau" thay vì ẩn |
| **Người dùng bấm "Chấm" 2 lần liên tiếp** | Nút bị disable khi đang stream; nếu gọi API trực tiếp, server trả 409 `already_grading` |
| **Nhấn commit Evidence 2 lần** | Idempotent theo `activityId` (`SpeakAttempt.activityId` `@unique`); lần 2 trả thông báo "Đã ghi nhận" chứ không tạo bằng chứng thứ 2 |
| **AI trả thiếu 1 tiêu chí** | `safeParse` fail → hiện "AI trả về thiếu tiêu chí — thử lại", không hiển thị tổng sai; không ghi `Activity` |
| **AI trả thêm tiêu chí ngoài rubric** | Schema cứng (`enum` key) → reject; hiển thị cảnh báo, không tự động "ép" tiêu chí |
| **Role-play mất kết nối giữa chừng** | Giữ các lượt đã nhận; nút "Tiếp tục" gửi lại từ lượt cuối; không tạo `Activity` cho phiên dang dở (chỉ tạo khi bấm "Kết thúc & chấm") |
| **Người dùng không nói hết giới hạn giây** | Nút chấm tự bật khi có transcript ≥ 1 câu, không bắt buộc đủ giới hạn |
| **Tạo flashcard nhưng thẻ trùng nội dung đã có** | Check trước theo `front`+`lang`; trùng → bỏ qua và báo "1 thẻ trùng đã có, không tạo lại" |
| **Đề bài ngôn ngữ `zh` nhưng user chưa học `zh`** | Ẩn bài `zh` trong kho theo `UserProfile.learningLangs` |
| **Mất mạng giữa lúc đang stream** | Giữ kết quả đã nhận, hiện banner "Kết nối bị gián đoạn — nhận đủ 5 tiêu chí rồi hãy chấm lại", nút "Thử lại" |

## 7. Hợp đồng API

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| POST | `/api/grade` | `{ mode: "write"\|"speak", promptId?, prompt, level, lang, content, transcript?, speechMeta? }` | **stream NDJSON**: `{type:"meta"}` → `{type:"criterion", data:{key,score,comment,fix}}` ×5 → `{type:"delta", data:{total,criteria}}` → `{type:"done", data:{total,activityId,evidence,attemptId}}` | `400` invalid · `422` too_short / empty_transcript · `409` already_grading · `503` no_api_key · `429` rate_limit · `502` upstream |
| POST | `/api/roleplay` | `{ scenarioId?, sessionId?, lang, level, transcript: [{speaker,text}], turnIndex }` | **stream NDJSON**: `{type:"turn", data:{index,role,text}}` → `{type:"goalScore", data:{score,note,evidence}}` → `{type:"done", data:{activityId,total}}` | `400` invalid · `404` scenario_not_found · `409` session_closed · `503` no_api_key · `429` · `502` |
| POST | `/api/language/correct` | `{ lang, level, prompt, input, keywords[] }` | **stream NDJSON**: `{type:"group", data:{key,items:[{original,corrected,reason,severity}]}}` ×4 → `{type:"corrected", data:{text,pinyin?}}` → `{type:"done", data:{score,practiceId}}` | `400` invalid · `422` too_short · `503` no_api_key · `429` · `502` |
| POST | `/api/language/cards` | `{ practiceId, lang, sourceText, maxCards?: 2 }` | `{ ok:true, data:{ cards:[{front,back,note,example,dueAt}], cardIds:[] } }` (không streaming) | `400` invalid · `404` practice_not_found · `503` no_api_key · `429` · `502` |
| GET | `/api/speak/prompts?level=&lang=&mode=&q=` | query | `{ ok:true, data:{ prompts:[{id,code,title,prompt,level,lang,mode,tags,isUserMade}] } }` | `400` invalid filter |
| POST | `/api/speak/prompts` | `{ title, prompt, level, lang, mode?, tags? }` | `{ ok:true, data:{ prompt:{ id, code:"CUS-xxxx", isUserMade:true } } }` | `400` invalid · `409` duplicate_title |
| GET | `/api/speak/history?limit=&mode=&promptId=` | query | `{ ok:true, data:{ attempts:[{id,title,mode,level,total,delta,createdAt,rubric}] } }` | `400` invalid limit |
| POST | `/api/speak/commit` | `{ attemptId, skillId }` | `{ ok:true, data:{ activityId, evidenceId, rating } }` — idempotent theo `activityId` | `404` attempt_not_found · `400` invalid body |

> Tất cả response lỗi theo chuẩn `{ ok:false, error:"<code>" }` (`.kiro/steering/tech.md` §5).

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

> **Trace với SPEC.md §8:** `AC-CM-1` ≡ **AC-6** (chấm điểm theo rubric) · `AC-CM-2` ≡ AC-6 (tổng = trung bình) ·
> `AC-CM-3` ≡ FR-CM-03 (delta) · `AC-CM-5` ≡ FR-CM-07 (Evidence) · `AC-CM-7` ≡ FR-CM-06 (mục tiêu ẩn).
> Nguyên văn **AC-6** của SPEC.md §8: *"Given bài viết giao tiếp, When AI chấm, Then trả về đúng 5 tiêu chí
> với điểm 0–5 và tổng điểm = trung bình; không có tiêu chí nào ngoài rubric."*

**AC-CM-1 — Rubric trả về đúng 5 tiêu chí** *(= **AC-6** của SPEC.md §8)*
- *Given* người dùng viết một email bằng tiếng Anh ở level B2, *When* bấm "Chấm bằng AI", *Then* kết quả trả về **đúng 5** tiêu chí `clarity` · `structure` · `tone` · `natural` · `grammar`, **không có** tiêu chí nào ngoài rubric (P4), mỗi tiêu chí có điểm nguyên trong `[0,5]`, **1 câu nhận xét** và **1 đề xuất sửa cụ thể**.
- *Given* AI trả về 6 tiêu chí hoặc thiếu 1 tiêu chí, *When* schema parse, *Then* hiện cảnh báo "AI trả về sai cấu trúc tiêu chí — thử lại", **không** hiển thị tổng điểm sai và **không** ghi `Activity`.

**AC-CM-2 — Tổng điểm = trung bình các tiêu chí**
- *Given* AI trả về `clarity=4, structure=3, tone=5, natural=3, grammar=4`, *When* tính tổng, *Then* tổng hiển thị **3.8/5** (= 19/5, làm tròn 1 chữ số) và vòng tròn điểm chiếm 76% vòng.

**AC-CM-3 — Delta so với lần trước của chính người dùng**
- *Given* người dùng đã chấm 1 bài cùng đề với tổng 3.4, *When* chấm lại bài mới có tổng 3.8, *Then* hiển thị delta tổng `▲ +0.4` và delta **từng tiêu chí** so với đúng lần ghi trước đó (không so với bài của người khác).
- *Given* chưa từng có lần nào trước, *When* mở màn hình, *Then* hiện "Chưa có lần trước để so sánh" và **không** hiển thị `▲ 0.0`.

**AC-CM-4 — Chấm nói dùng MediaRecorder + STT**
- *Given* người dùng cấp quyền mic, *When* ghi âm 30 giây và bấm "Gửi AI Chấm", *Then* transcript được tạo từ Web Speech API, AI-04 trả về **cùng 5 tiêu chí** như S07 **cộng** ghi chú từ điệu/độ rõ (số từ/phút, số filler, điểm ngắt nhịp), và tổng điểm được lưu vào `Activity.aiScore`.

**AC-CM-5 — Evidence được tạo cho mọi bài luyện**
- *Given* người dùng bấm "Chấp nhận & Cập nhật Cây kỹ năng" ở S07, *When* request thành công, *Then* tạo đúng 1 `Activity` (`domain="communication"`, `type="write"`, `skillId` = kỹ năng Viết) + 1 `Evidence` với `rating` suy ra từ tổng điểm, và `Skill.level` tăng đúng quy tắc `EVIDENCE_THRESHOLD`.

**AC-CM-6 — Kho bài mẫu + bài tự tạo**
- *Given* mở S07, *When* xem kho đề, *Then* hiển thị **12** bài mẫu với mã `EX-01`..`EX-12` đúng bảng §6.8, lọc được theo level và ngôn ngữ.
- *Given* người dùng tạo 1 prompt "Nhắn bạn hủy lịch họp", *When* lưu, *Then* prompt xuất hiện trong kho với `isUserMade=true`, mã `CUS-xxxx`, và dùng lại được ở S07 và S08.

**AC-CM-7 — Hội thoại AI có mục tiêu ẩn**
- *Given* người dùng chọn `SP-09` (mục tiêu ẩn: từ chối feature gấp bằng dữ liệu velocity + phased rollout), *When* bắt đầu hội thoại, *Then* `hiddenGoal` **không** hiển thị và **không** được gửi vào prompt của AI-08; *When* kết thúc phiên, *Then* AI trả `goalScore` 0–5 kèm trích dẫn bằng chứng từ lượt nói của người dùng.

**AC-CM-8 — AI trả lời đúng ngôn ngữ đề**
- *Given* đề bài `lang="zh"`, *When* AI-08 trả lời, *Then* nội dung trả về bằng Trung văn (kiểm tra bằng prompt ràng buộc + cờ `lang` trong response); *Given* AI trả lời lẫn tiếng Anh 2 lượt liên tiếp, *Then* UI hiện cảnh báo "AI đang trả lời sai ngôn ngữ" kèm nút "Báo lỗi".

**AC-CM-9 — Sửa lỗi 4 nhóm & sinh flashcard**
- *Given* người dùng viết bài Trung văn sai trật tự trạng từ thời gian và dùng `去工作` thay cho `去上班`, *When* bấm "Chấm & Phân tích 4 nhóm lỗi", *Then* lỗi được xếp vào **đúng nhóm** `grammar` và `vocab` (không trả nhóm nào ngoài 4 nhóm `RUBRIC_LANGUAGE_ERRORS`).
- *Given* đã có kết quả sửa lỗi, *When* bấm "Tạo 2 thẻ Flashcard mới", *Then* AI-10 sinh đúng 2 thẻ, 2 `Card` được tạo trong deck FSRS của ngôn ngữ với `mode="produce"`, và UI hiện lịch ôn kế tiếp.

**AC-CM-10 — "Thêm vào ôn" từ từ khoá bài viết**
- *Given* bài viết có từ khoá `工作`, *When* bấm "Thêm vào ôn" trên từ khoá đó, *Then* tạo 1 `Card` cho từ đó trong deck FSRS đúng ngôn ngữ, `due` = hôm nay, và bộ đếm "thẻ đã thêm" tăng 1.

**AC-CM-11 — Không có key → không giả lập AI**
- *Given* app không có `ANTHROPIC_API_KEY`, *When* mở cả 3 màn hình, *Then* nút chấm AI bị ẩn và hiện hướng dẫn thêm key; **không** có điểm số giả, **không** có request API, và các chức năng không-AI (soạn thảo, lưu nháp, tạo prompt, xem lịch sử) vẫn hoạt động.

**AC-CM-12 — Edge case không làm sập trang**
- *Given* quyền mic bị từ chối, *When* bấm ghi âm, *Then* hiện thông báo thân thiện + hướng dẫn cấp quyền, **không** crash.
- *Given* trình duyệt không có `SpeechRecognition`, *When* mở S08, *Then* tự chuyển sang nhập transcript tay và vẫn chấm được bằng AI-04.
- *Given* transcript rỗng, *When* bấm chấm, *Then* **không** gọi AI và hiện "Chưa nhận được giọng nói".
- *Given* bài < 20 từ, *When* bấm chấm, *Then* hiện ngưỡng tối thiểu và **không** gọi AI.

## 9. Rủi ro riêng của feature

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| CM-R1 | AI chấm không ổn định giữa 2 lần cùng 1 bài (sai số > 0.3) | Rubric cố định + structured output + lưu điểm từng tiêu chí kèm lý do; chấp nhận sai số ±0.3 (giống R9); delta hiển thị là *đối chiếu 2 lần chấm* chứ không phải thước đo chuẩn hoá |
| CM-R2 | STT Web Speech API cho kết quả kém với tiếng Việt | Luôn có đường nhập transcript tay; hiện cảnh báo khi transcript rỗng hoặc tỷ lệ ký tự thay thế cao |
| CM-R3 | Người dùng không tin điểm AI nếu không hiểu vì sao | Bắt buộc 1 câu nhận xét + 1 đề xuất sửa **có trích đoạn gốc** cho mỗi tiêu chí (FR-CM-02) |
| CM-R4 | Mục tiêu ẩn bị lộ (AI nhắc mục tiêu) | Tách `hiddenGoal` khỏi payload gửi AI-08; chỉ dùng nó ở bước chấm cuối; UI không hiện trước khi kết thúc phiên |
| CM-R5 | Tạo Evidence tự động làm "thắng level" dễ dàng | Chỉ `rating ≥ 3` mới tính tăng level (`EVIDENCE_RATING_MIN`); `rating` suy ra từ tổng điểm, không cho người dùng tự đặt |
| CM-R6 | Bài tự tạo chứa nội dung nhạy cảm bị gửi lên API khi chấm | Chỉ gửi khi người dùng **bấm chấm**; hiện rõ nội dung sẽ gửi; xem danh sách "đã gửi lên" ở S15 |
| CM-R7 | Sinh flashcard hàng loạt làm loãng deck FSRS | `maxCards = 2` mỗi lần; check trùng `front`+`lang`; thẻ mới `mode="produce"`, `due` = hôm nay + 12h |
| CM-R8 | Chi phí AI tăng vọt khi luyện nói nhiều (audio + transcript dài) | Gửi **transcript + `speechMeta` đã rút gọn**, không gửi file audio; cache rubric block; `effort: medium`; ghi `AiCall` để đo |
