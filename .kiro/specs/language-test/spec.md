# Bài kiểm tra ngoại ngữ

> **Màn hình:** S19 (`/test`), S20 (`/test/session`), S21 (`/test/[id]`) · **Phase:** 1
> **Nguồn:** `system-design/SPEC.md` §2.9 (FR-LT-01..12), §3.2 (S19, S20, S21), §4 (`TestSession`, `TestItem`), §5.1 (AI-14, AI-15, AI-16), §5.4 (`RUBRIC_LANGUAGE_ERRORS`), §8 (AC-11, AC-12), §10 (Q7, Q8) · prototype `system-design/s19_.../`, `system-design/s20_.../`, `system-design/s21_.../`
> **Phụ thuộc:** `app-foundation`, `ai-foundation`, `srs-language-review` (phải xong trước)

## 1. Tổng quan

Bài kiểm tra ngoại ngữ là **công cụ đo**, không phải một màn hình luyện thêm. Ba màn hình S19 → S20 → S21 tạo thành một vòng khép kín:

| Màn hình | Câu hỏi người dùng trả lời | Bản chất |
|---|---|---|
| **S19 — Danh sách bài kiểm tra** | *"Tôi giỏi tới đâu, nên làm bài nào hôm nay?"* | Chọn loại đề + xem tiến bộ |
| **S20 — Làm bài** | *"Tôi thực sự nhớ được bao nhiêu?"* | Trả lời từng câu, chấm ngay |
| **S21 — Kết quả** | *"Tôi yếu ở đâu, làm gì tiếp theo?"* | Phân tích + **đẩy thẻ sai về ôn hôm nay** |

**Điểm mấu chốt (SPEC §2.9):** điểm kiểm tra phải **chảy ngược về SRS**. Bài kiểm tra không phải màn hình tách rời — nó là cách phát hiện từ nào còn yếu, và SRS tự đưa những từ đó về đến hạn sớm. Mỗi câu sai có `cardId` → áp FSRS rating `Again` → `due = hôm nay`, `stability` giảm, `lapses` tăng. Người dùng thấy ngay "3 thẻ này bị đẩy về ôn sớm" và bấm "Ôn ngay" để mở S10.

Nguyên tắc áp dụng:

- **P3 — Tiến độ = bằng chứng.** Mỗi bài kiểm tra tạo `Activity` (domain `language`, type `test`) + `Evidence` cho skill ngôn ngữ tương ứng (FR-LT-11). Không có "% hoàn thành" tự khai.
- **P4 — AI chấm theo rubric cố định.** Câu `writing`/`translation` chỉ được chấm theo đúng 4 nhóm lỗi `RUBRIC_LANGUAGE_ERRORS` (ngữ pháp · từ vựng · cách diễn đạt · ngữ cảnh). AI không tự bịa tiêu chí.
- **P6 — Local-first.** Đề thi sinh bằng AI nhưng **từ vựng nền tảng luôn lấy từ thẻ của chính người dùng + ngân hàng seed biên tập tay** (FR-LT-10, SPEC §2.9.3). Không có API key → app không crash, hiện hướng dẫn.
- **P7 — Không vanity metric.** Mọi số liệu (điểm, level, tỷ lệ đúng theo dạng) đều truy được về một câu hỏi cụ thể; không hiện "đã học 47 từ" trần trụi.

Feature này giữ **P5** (chỉ domain `language`) và **P1** (mỗi màn hình trả lời đúng một câu hỏi).

## 2. Bối cảnh & vấn đề

- Người dùng học 2 ngôn ngữ từ con số 0 nhưng **không biết mình đang ở đâu** — SRS cho biết từ nào đến hạn, không cho biết năng lực tổng thể (U10 trong `product.md` §3).
- Ôn SRS một mình dễ **ảo giác tiến bộ**: nhớ được từ trên thẻ ≠ dùng được trong câu. Cần đo bằng bài kiểm tra có phân dạng kỹ năng (nghe / ngữ pháp / viết / dịch).
- Bài kiểm tra làm **rời rạc** sẽ vô nghĩa: 2 lần thi không cùng độ khó thì không so sánh được (FR-LT-12, rủi ro R10).
- Điểm sai thu được rồi **bị vứt đi** → lãng phí. Bài kiểm tra phải tự đẩy thẻ sai về ôn hôm nay (FR-LT-06).
- Đo bằng từ vựng **không thuộc sở hữu của người dùng** thì đo trí nhớ tình cờ, không đo tiến bộ thật (FR-LT-10).

## 3. Yêu cầu chức năng

### 3.1 Bốn loại bài kiểm tra (FR-LT-01, SPEC §2.9.1)

| Mã | Tên UI | Mục đích | Số câu | Timer | Phân bố `itemTypes` (chuẩn) |
|---|---|---|---|---|---|
| `placement` | Bài Kiểm Tra Định Vị (Placement Test) | Xác định level khởi đầu thật; set `zhLevel`/`enLevel` + gợi ý nhóm từ bắt đầu | **25** | Không | `mc_vocab` 8 · `mc_grammar` 7 · `cloze` 5 · `listening` 5 |
| `topic` | Bài Kiểm Tra Theo Chủ Đề (Topic Mastery) | Luyện/skim 1 chủ đề cụ thể ("ẩm thực", "đi làm") | **20** | Không | `mc_vocab` 6 · `mc_grammar` 6 · `cloze` 4 · `translation` 2 · `writing` 2 |
| `benchmark` | Bài Kiểm Tra Chuẩn (Benchmark Test) | Đo tiến bộ định kỳ (2–4 tuần/lần), so sánh được giữa các lần | **40** | Có — **30:00** | `mc_vocab` 10 · `mc_grammar` 8 · `cloze` 6 · `listening` 8 · `translation` 4 · `writing` 4 |
| `from_content` | Kiểm Tra Từ Nội Dung Thực Tế | Dán bài báo/đoạn sách → câu hỏi đọc hiểu + chấm tóm tắt bằng tiếng đích | **10** | Có — **15:00** | `mc_vocab` 3 · `mc_grammar` 2 · `cloze` 2 · `listening` 2 · `writing` 1 (tóm tắt) |

- Quy mô lấy từ hằng `TEST_COUNTS` trong `.kiro/steering/project.md` §5: `placement 25 · topic 20 · benchmark 40 · from_content 10`.
- Phân bố `itemTypes` ở trên là **chuẩn**; người dùng có thể đổi tỉ lệ dạng câu khi tạo đề (S19), nhưng **tổng số câu không đổi**.
- `from_content` = 10 câu **gồm cả** 1 câu `writing` tóm tắt. (Prototype S19 hiển thị "10 câu trắc nghiệm + 1 bài tóm tắt" — đây là diễn giải trực quan, tổng chuẩn theo SPEC là 10 câu: 9 câu trắc nghiệm + 1 câu tự luận.)

### 3.2 Sinh đề & dạng câu (FR-LT-01, FR-LT-02)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LT-01 | Blueprint `{ lang, level, topic, itemTypes[], count }` → AI (AI-14) sinh **đúng số câu** và **đúng phân bố dạng** theo blueprint. | P0 | FR-LT-01 |
| FR-LT-02 | 6 dạng câu: `mc_vocab` · `mc_grammar` · `cloze` · `listening` · `writing` · `translation` (chi tiết ở §3.3). | P0 | FR-LT-02 |
| FR-LT-10 | Item từ vựng lấy từ **thẻ của chính người dùng** (ưu tiên thẻ yếu: `lapses` cao, `difficulty` cao) + ngân hàng seed cho level đó; **AI không sinh từ mới** — AI chỉ sinh *cách hỏi*. | P0 | FR-LT-10, §2.9.3 |
| FR-LT-12 | Đề thi cho cùng 1 `topic` phải **song song về độ khó** (parallel form) để điểm các lần so sánh được. | P1 | FR-LT-12, R10 |

### 3.3 Bảng 6 dạng câu hỏi (FR-LT-02)

| `itemType` | Mô tả | Cách trả lời | Cách chấm | Timer áp dụng | Gắn thẻ SRS? |
|---|---|---|---|---|---|
| `mc_vocab` | Nghe (hoặc đọc) 1 từ → chọn nghĩa đúng. 4 lựa chọn, 3 đáp án nhiễu cùng nhóm/level. | Chọn 1 (A–D) hoặc phím `1`–`4` | **Tự động** — so khớp chuỗi chuẩn hoá | Được dùng trong đề có timer | Có (thẻ của từ đó) |
| `mc_grammar` | Chọn từ/trạng từ đúng để hoàn thành câu (điền trợ từ, kết hợp từ). 4 lựa chọn. | Chọn 1 (A–D) | **Tự động** | Được dùng trong đề có timer | Có (thẻ từ vựng trong câu) nếu có |
| `cloze` | Điền từ vào chỗ trống trong câu (chữ trắng `___`). | Gõ từ vào ô nhập | **Tự động** — so khớp chuẩn hoá (bỏ khoảng trắng, không phân biệt hoa/thường, chấp nhận biến thể pinyin/tra) | Được dùng trong đề có timer | Có (thẻ từ cần điền) |
| `listening` | Nghe một đoạn ngắn (TTS `zh-CN`/`en-US`) → trả lời câu hỏi nghe hiểu. | Chọn 1 (A–D) hoặc gõ đáp án | **Tự động** | Được dùng trong đề có timer | Có (thẻ chứa từ khóa của đoạn) |
| `writing` | Tự luận ngắn (viết câu/đoạn bằng tiếng đích). | Textarea | **AI (AI-15)** theo 4 nhóm lỗi, thang 0–10 mỗi nhóm | Được dùng trong đề có timer | Có (các từ trọng tâm được yêu cầu dùng) |
| `translation` | Dịch 1 câu/1 từ sang tiếng đích. | Textarea | **AI (AI-15)** theo 4 nhóm lỗi, thang 0–10 mỗi nhóm | Được dùng trong đề có timer | Có (thẻ từ cần dịch) |

> `writing`/`translation` **không** bao giờ dùng cho `placement` (định vị không có timer, cần đo nhanh) — chỉ `topic`, `benchmark`, `from_content`.

### 3.4 Làm bài & chấm điểm (FR-LT-03, FR-LT-04)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LT-03 | Timer đếm ngược cho `benchmark` (30:00) và `from_content` (15:00); **lưu thời gian trả lời từng câu** (`TestItem.seconds`). | P1 | FR-LT-03 |
| FR-LT-04 | `mc_*`/`cloze`/`listening` chấm tự động **ngay khi trả lời**; `writing`/`translation` chấm bằng AI (AI-15) theo **đúng 4 nhóm lỗi** `RUBRIC_LANGUAGE_ERRORS`. | P0 | FR-LT-04 |
| FR-LT-15 | **Lưu từng câu ngay khi trả lời** — đóng tab giữa chừng không mất dữ liệu; quay lại `/test/session` khôi phục đúng phiên đang dở. | P0 | SPEC §3.2 S20 ("Lưu") |
| FR-LT-16 | Cho phép **quay lại câu đã trả lời để sửa**; trả lời sau ghi đè trả lời trước, điểm tính theo lần trả lời cuối. | P0 | SPEC §3.2 S20 ("Điều hướng") |
| FR-LT-17 | Đánh dấu cờ (`F`) câu bỏ qua / xem lại; câu có cờ **không** bị đẩy thẻ về ôn (không phải bằng chứng người dùng quên) và được ưu tiên hiển thị ở S21. | P1 | prototype S20 (`flag`) |

> FR-LT-15..17 là **yêu cầu bổ sung** do SPEC §2.9 chưa đánh số, nhưng được hành xử trong §3.2 (S20) và prototype S20. Nguồn: `system-design/SPEC.md` §3.2 S20 (mục "Lưu", "Điều hướng") + `system-design/s20_.../code.html` (`flag-btn`).

### 3.5 Kết quả & vòng lặp SRS (FR-LT-05, FR-LT-06, FR-LT-11)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LT-05 | Kết quả gồm: tổng điểm, phân tách theo `itemType`, ước lượng level (AI-16), danh sách câu sai kèm giải thích sư phạm. | P0 | FR-LT-05 |
| FR-LT-06 | **Feedback loop SRS**: mỗi câu sai có `cardId` → `due = hôm nay`, `stability` giảm, `lapses` tăng (tương đương FSRS rating `Again`). Người dùng thấy "3 thẻ này bị đẩy về ôn sớm" + nút "Ôn ngay" mở S10 đúng các thẻ đó. | P0 | FR-LT-06, AC-11 |
| FR-LT-11 | Mọi bài kiểm tra tạo `Activity` (domain `language`, type `test`) + `Evidence` cho skill ngôn ngữ tương ứng. | P0 | FR-LT-11 |
| FR-LT-08 | `benchmark` định kỳ → biểu đồ level theo thời gian trên S19, song song với tiến bộ SRS. | P1 | FR-LT-08 |

### 3.6 Định vị & nội dung thực tế (FR-LT-07, FR-LT-09)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LT-07 | `placement` → set `UserProfile.zhLevel`/`enLevel`, gợi ý **bắt đầu từ nhóm từ nào** + **bài tập đầu tiên** (link mở S10 với nhóm từ tương ứng). | P0 | FR-LT-07 |
| FR-LT-09 | `from_content`: dán văn bản → AI sinh câu đọc hiểu + chấm phần tóm tắt bằng **tiếng đích**. | P2 | FR-LT-09 |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-LT-01 | Mobile-first | Cả 3 màn hình dùng được ở 390px; ma trận câu hỏi (S20) scroll ngang, thao tác chính nằm trong vùng ngón cái. |
| NFR-LT-02 | Offline-safe | Thiếu `ANTHROPIC_API_KEY` → S19/S20/S21 vẫn mở được, hiển thị số liệu thật; nút sinh đề AI bị ẩn kèm hướng dẫn thêm key. Không giả lập kết quả AI. |
| NFR-LT-03 | Không mất dữ liệu | Mỗi lần trả lời ghi 1 lần xuống SQLite; đóng tab giữa bài → mở lại vẫn còn đáp án đã trả lời. |
| NFR-LT-04 | A11y | Option dạng `role="radio"` + `aria-checked`; timer có `aria-live="polite"`; mọi icon-only button có `aria-label`; phím tắt có `aria-keyshortcuts`. |
| NFR-LT-05 | Ngôn ngữ | Giao diện tiếng Việt; nội dung học `zh-Hans` + `en-US`; TTS dùng `speechSynthesis` với `lang` theo `lang` của đề. |
| NFR-LT-06 | Không hardcode số liệu | Điểm, level, tỷ lệ đúng, số thẻ bị đẩy về ôn đều query từ DB — không có số bịa trong UI. |
| NFR-LT-07 | Prompt caching | AI-14/AI-15 dùng system prompt cố định + `cache_control`; nội dung biến động nằm trong `messages`; `AiCall.cacheRead > 0` ở call thứ 2. |
| NFR-LT-08 | Chi phí đo được | AI-14/15/16 ghi `AiCall { feature: "language_test" }` (tokens + cache + cost). |
| NFR-LT-09 | Token design | Không hardcode hex trong component; chỉ dùng token trong `.kiro/steering/design-system.md`. |

## 5. Mô hình dữ liệu

> **Registry:** `.kiro/steering/data-model-registry.md` — 12 field mới: `TestSession.status` = **`C17`** ·
> `TestSession.formSignature` = **`C18`** · `TestSession.levelSource` = **`C19`** · `TestSession.sourceText` = **`C20`** ·
> `TestSession.startedAt` = **`C21`** · `TestSession.endedAt` = **`C22`** · `TestItem.explanation` = **`C23`** ·
> `TestItem.flagged` = **`C24`** · `TestItem.rubric` = **`C25`** · `TestItem.scored` = **`C26`** ·
> `Review.source` = **`C27`**. Tất cả nullable/có mặc định ⇒ **không phá model cũ**.
> **Mới:** `TestSession.standard` = **`C33`** (chuẩn `cefr`/`hsk`/`vendor` của đề này — Q7) — để so sánh giữa các lần.
> Thang level: CEFR đầy đủ `zero·A1·A2·B1·B2·C1·C2` + cột HSK tương ứng cho tiếng Trung
> (nguồn: `.kiro/steering/user-profile-decisions.md` §4.1, §7).
> ⚠️ `Activity.type` phải nhận giá trị `test` (SPEC §4 chưa liệt kê) — enum validate ở task §0.1.14.

Feature dùng 2 model có sẵn trong SPEC §4 (`TestSession`, `TestItem`) và **mở rộng thêm** một số field (delta so với SPEC §4, được đánh dấu ⚠).

### 5.1 `TestSession`

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `TestSession` | `id` | String @id cuid | Khóa chính; hiển thị dạng `TEST-{yyyyMMdd}-{LANG}-{seq}`. |
| | `lang` | String | `zh` \| `en`. |
| | `testType` | String | `placement` \| `topic` \| `benchmark` \| `from_content`. |
| | `topic` | String? | Nhóm chủ đề (chỉ `topic`), ví dụ `Đồ ăn`. |
| | `level` | String? | Level ước lượng **sau** bài: `zero`\|`A1`\|`A2`\|`B1`\|`B2`\|`C1`. |
| | `score` | Float? | Tổng điểm đã quy đổi về thang điểm câu (số câu đúng ở dạng objective + điểm quy đổi của dạng tự luận). |
| | `maxScore` | Float? | Tổng điểm tối đa của đề (= `count`). |
| | `durationSec` | Int? | Tổng thời gian làm bài (giây). |
| | `blueprint` | Json? | `{ itemTypes[], count, formSignature, difficultyBands, sourceText?, cardIds[] }` — xem §5.3. |
| | `createdAt` | DateTime | Mốc thời gian bắt đầu. |
| | ⚠ `status` | String @default("active") | `active` \| `done` \| `abandoned` \| `expired`. `expired` = hết giờ timer. |
| | ⚠ `formSignature` | String? | Hash của `(itemTypes + difficultyBands)` — cơ sở kiểm chứng parallel form (FR-LT-12). |
| ⚠ `levelSource` | String @default("local") | `ai` \| `local` — level trên S21 đến từ AI-16 hay từ bộ ước lượng cục bộ. |
| | ⚠ `sourceText` | String? | Văn bản người dùng dán cho `from_content`. |
| | ⚠ `startedAt` | DateTime @default(now()) | Tách khỏi `createdAt` để đo thời gian làm bài. |
| | ⚠ `endedAt` | DateTime? | |

### 5.2 `TestItem`

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `TestItem` | `id` | String @id cuid | |
| | `testId` | String | FK → `TestSession`, `onDelete: Cascade`. |
| | `index` | Int | Thứ tự hiển thị, bắt đầu từ 0 (UI hiện `index + 1`). |
| | `itemType` | String | `mc_vocab`\|`mc_grammar`\|`cloze`\|`listening`\|`writing`\|`translation`. |
| | `prompt` | String | Nội dung câu hỏi (bao gồm chỗ trống `___` cho `cloze`). |
| | `audioText` | String? | Text để TTS đọc cho `listening` / `mc_vocab` nghe. |
| | `options` | Json? | `string[]` — 4 lựa chọn cho dạng `mc_*`/`listening`. |
| | `answer` | String? | Đáp án đúng (objective). Với `writing`/`translation` = đáp án mẫu tham chiếu. |
| | `userAnswer` | String? | Câu trả lời của người dùng. |
| | `isCorrect` | Boolean? | `null` = chưa chấm / bỏ trống; `false` = sai hoặc bỏ trống; `true` = đúng. |
| | `cardId` | String? | Thẻ SRS liên quan → **cơ sở đẩy thẻ về ôn**. `null` = câu không gắn thẻ nào. |
| | `skillName` | String? | Tên kỹ năng ngôn ngữ (để gắn `Evidence`). |
| | `errorGroups` | Json? | `writing`/`translation`: `{ grammar:[], vocab:[], expression:[], context:[] }`. |
| | `notes` | String? | Giải thích sư phạm cho câu sai. |
| | `seconds` | Int? | Thời gian người dùng dành cho câu này (FR-LT-03). |
| | ⚠ `explanation` | String? | Giải thích ngắn **cho câu đúng** (hoặc khi AI không kịp chấm). |
| | ⚠ `flagged` | Boolean @default(false) | Đánh dấu cờ (FR-LT-17). |
| | ⚠ `rubric` | Json? | Điểm 4 nhóm lỗi của câu tự luận: `{ grammar: n, vocab: n, expression: n, context: n }`. |
| | ⚠ `scored` | Boolean @default(false) | Đã chấm xong (dạng tự luận chờ AI → `false`). |

### 5.3 Cấu trúc `blueprint` (Json)

```jsonc
{
  "itemTypes": ["mc_vocab", "mc_grammar", "cloze", "listening"],   // phân bố dạng
  "count": 25,
  "difficultyBands": { "mc_vocab": 1, "mc_grammar": 1, "cloze": 1, "listening": 1 }, // band 1..3
  "formSignature": "b1f4c2e0",       // hash(itemTypes + difficultyBands) — parallel form
  "cardIds": ["c_1", "c_7"],          // thẻ dùng cho đề này
  "seedBankUsed": 12,                 // số item lấy từ ngân hàng seed
  "userCardUsed": 13,                 // số item lấy từ thẻ người dùng
  "sourceText": null,                 // chỉ from_content
  "level": "A1",
  "excludeSessionIds": ["ts_prev"]    // các phiên bị loại khỏi kho đề (parallel form)
}
```

### 5.4 Quan hệ & ràng buộc

| Quan hệ | Ràng buộc |
|---|---|
| `TestSession.items` | 1–N, cascade delete. `count` trong blueprint = số item thực tế sau khi AI-14 sửa lỗi thiếu. |
| `TestItem.cardId` → `Card.id` | **Không** khai báo FK cứng (SPEC §4 chỉ khai `cardId String?`) — thẻ có thể bị xoá; khi đọc phải `include: null` và bỏ qua. |
| `TestSession.activity` | 1–1, tạo khi nộp bài (FR-LT-11). |
| `UserProfile.zhLevel`/`enLevel` | Chỉ `placement` được ghi đè; các loại khác **không** đổi level hồ sơ (chỉ lưu `TestSession.level`). |
| `Review.source` | ⚠ Mở rộng thêm field `source String @default("srs")` (`srs` \| `test`) để phân biệt lượt ôn SRS và lượt do bài kiểm tra đẩy thẻ về ôn. |

### 5.5 Mô hình liên quan (chỉ đọc/ghi, không đổi schema)

| Model | Field | Dùng để làm gì |
|---|---|---|
| `Card` | `lapses`, `difficulty`, `stability`, `due`, `cardState`, `group`, `lang` | Chọn item (thẻ yếu trước), áp FSRS `Again` khi câu sai. |
| `UserProfile` | `zhLevel`, `enLevel` | Đặt level sau placement; đọc level để chọn ngân hàng seed + band độ khó. |
| `Activity` | `domain="language"`, `type="test"`, `minutes`, `aiScore`, `skillId` | Ghi bằng chứng (FR-LT-11). ⚠ `Activity.type` cần nhận giá trị `test` (SPEC §4 mới liệt kê `study\|write\|speak\|roleplay\|srs\|journal\|health\|custom`). |
| `Evidence` | `skillId`, `rating` | Bằng chứng cho skill ngôn ngữ. |
| `AiCall` | `feature="language_test"` | Ghi log chi phí AI-14/15/16. |

## 6. Giao diện & hành vi

### 6.1 Bố cục — S19 Danh sách bài kiểm tra (`/test`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [FR-LT-01 → FR-LT-12] · HỆ THỐNG ĐÁNH GIÁ NĂNG LỰC & ĐO LƯỜNG ĐỊNH KỲ       │
│                                        sync_saved_locally FSRS v4.5 · đồng bộ  │
├────────────────────────────────────────────────────────────────────────────┤
│ Trung Tâm Khảo Thí & Đánh Giá Năng Lực                                     │
│ Khung chuẩn hoá kiểm định đa chiều: Xác lập vị trí xuất phát, kiểm soát độ │
│ suy giảm trí nhớ FSRS, và tạo bài tập đọc hiểu tức thời.                   │
│ [● Tiếng Trung (HSK / Zero → A1)]  [translate Tiếng Anh (CEFR / Zero → A1)]  │
├────────────────────────────────────────────────────────────────────────────┤
│ analytics Level Ước Lượng Hiện Tại [A1 Foundation] · Điểm chuẩn gần nhất:    │
│              27/40 (Tuần 43)                    ⚠ 3 thẻ sai từ kỳ thi trước │
│              Chỉ số từ Benchmark 29/10/2026 · độ tin cậy 94.2%  đã đẩy về  │
├────────────────────────────────────────────────────────────────────────────┤
│ rule_settings Các Chế Độ Khảo Thí Chuẩn Hóa              4 HÌNH THỨC SẴN SÀNG│
│ ┌────────────────────────────┐ ┌────────────────────────────┐              │
│ │ ID: placement  [Đầu vào]  │ │ ID: topic      [Chuyên đề] │              │
│ │ Bài Kiểm Tra Định Vị       │ │ Bài Kiểm Tra Theo Chủ Đề   │              │
│ │ (Placement Test)           │ │ (Topic Mastery)            │              │
│ │ ⏱ Không timer              │ │ quiz 20 câu / đề           │              │
│ │ QUY MÔ 25 Câu │ ĐỘ PHỦ ... │ │ DANH SÁCH CHỦ ĐỀ KHẢO SÁT: │              │
│ │ TARGET DECK 60 Từ lõi      │ │ ● Chào hỏi & Giao tiếp 85% │              │
│ │ ✓ Đã hoàn thành 1 lần ...  │ │ ● Ẩm thực & Đồ ăn     90% │              │
│ │ [Bắt đầu bài định vị lại →]│ │ ● Địa điểm & Phương hướng Mới│           │
│ └────────────────────────────┘ └────────────────────────────┘              │
│ ┌────────────────────────────────────┐ ┌──────────────────────────────┐     │
│ │ ▬▬ TRỌNG TÂM ĐỊNH KỲ · benchmark  │ │ ID: from_content [AI Engine] │     │
│ │ Bài Kiểm Tra Chuẩn (Benchmark)    │ │ Kiểm Tra Từ Nội Dung Thực Tế│     │
│ │ ⏳ Timer: 30:00                    │ │ timer 15:00                  │     │
│ │ Đề song song về độ khó (Parallel  │ │ 9 câu trắc nghiệm đọc hiểu    │     │
│ │ Form Architecture)                │ │ 1 bài tóm tắt tự luận (= 10) │     │
│ │ KẾT QUẢ GẦN NHẤT 27/40 (67.5%)   │ │ (Rubric chấm 4 nhóm lỗi)     │     │
│ │ FEEDBACK LOOP FSRS v4.5: câu sai  │ │ [auto_awesome nhập văn bản]  │     │
│ │ → giảm Stability, lịch ôn 24h    │ │ [+ Tạo đề từ tài liệu mới]   │     │
│ │ ✓ Đề Tuần 44 đã biên dịch (40 câu)│ └──────────────────────────────┘     │
│ │ [▶ Bắt đầu Đề Chuẩn Tuần 44 (40 câu) →]                                  │
│ └────────────────────────────────────┘                                     │
├────────────────────────────────────────────────────────────────────────────┤
│ monitoring Thống Kê Năng Lực & Phân Tích Tiến Độ Khảo Thí     CYCLE W40-W43│
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐│
│ │ Tiến Độ Benchmark    │ │ Tỷ Lệ Đúng Theo 6    │ │ 5 Từ Sai Nhiều Nhất  ││
│ │ +15.5% / 4 tuần      │ │ Kỹ Năng    N=160 CÂU │ │ 认识 rènshi  Sai 4x   ││
│ │ ▂▃▅▆  T40 T41 T42 T43│ │ mc_vocab      80% ▓▓▓│ │ 前面 qiánmian Sai 3x  ││
│ │ Ngưỡng đỗ A1: 60.0%  │ │ mc_grammar    70% ▓▓▓│ │ 高兴 gāoxìng  Sai 3x  ││
│ └──────────────────────┘ │ cloze         65% ▓▓ │ │ 时候 shíhou   Sai 2x  ││
│                          │ listening     62% ▓▓ │ │ 漂亮 piàoliang Sai 2x  ││
│                          │ translation   50% ▓  │ │ ⚠ Đã gắn cờ khẩn cấp  ││
│                          │ writing       43% ▓  │ └──────────────────────┘│
│                          └──────────────────────┘                          │
├────────────────────────────────────────────────────────────────────────────┤
│ science KỶ LUẬT ĐÁNH GIÁ KHÔNG THIÊN VỊ                                   │
│ Tái cấu trúc ngữ cảnh để người học chỉ vượt qua khi hình thành phản xạ.   │
└────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Bố cục — S20 Làm bài kiểm tra (`/test/session`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [assignment_turned_in] [HSK 1 · CEFR A1] [Tuần 44] ● SQLite Sync Active   │
│ Đề Thi Benchmark Chuẩn Tuần 44 — Tiếng Trung HSK1 / CEFR A1                 │
│                          ⏳ 22:15 / Tổng 30:00   [⏸ Tạm dừng] [✓ Nộp bài sớm]│
│ Tiến độ: Câu 7 / 40 (17.5%)   6 đã làm · 1 đang làm · 33 chưa trả lời       │
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├─────────────────────────────────────────────┬──────────────────────────────┤
│ [Câu 07] [mc_grammar — Điền trợ từ]        │ grid_view Ma trận câu hỏi    │
│              HSK 1 Core Vocabulary          │ [40 Câu]                    │
│ [volume_up Nghe phát âm (zh-CN)]            │ ■ Đã làm ■ Hiện tại ■ Cờ ■Trống│
│ ┌─────────────────────────────────────────┐ │  01 02 03 04 05 06 07 08   │
│ │ help_center Chọn từ thích hợp điền vào  │ │  09 10 11 12 13 14 15 16   │
│ │ chỗ trống để hoàn thành câu hợp ngữ pháp│ │  17 18 19 20 21 22 23 24   │
│ │ 请选择正确的词填空: 我昨天去商店买了两个___ │ │  25 26 27 28 29 30 31 32   │
│ │ (Qǐng xuǎnzé zhèngquè de cí tiánkòng:…) │ │  33 34 35 36 37 38 39 40   │
│ │ Dịch nghĩa: Hôm qua tôi đi cửa hàng…  │ │  (08,15 có góc đỏ = gắn cờ) │
│ └─────────────────────────────────────────┘ │ ─────────────────────────────│
│ LỰA CHỌN CÂU TRẢ LỜI (Click hoặc phím 1-4 / A-D)│ sync_saved_locally         │
│ ┌─ A ─────────────┐ ┌─ B ─────────────┐   │ Quy tắc FSRS SRS Tự động   │
│ │ ✓ 苹果 píngguǒ  │ │ ○ 喝 hē · Uống  │   │ ✓ câu sai → trích xẻ thẻ   │
│ └─────────────────┘ └─────────────────┘   │ ✓ kích hoạt ôn tại S10     │
│ ┌─ C ─────────────┐ ┌─ D ─────────────┐   │ ✓ cập nhật cây kỹ năng S03  │
│ │ ○ 本 běn · Cuốn │ │ ○ 星期 xīngqī   │   │ Chu kỳ FSRS v4.5 / Offline │
│ └─────────────────┘ └─────────────────┘   │ ─────────────────────────────│
│ [verified Đã lưu vào SQLite lúc 10:42:08 (Zero Data Loss)] [Offline Safe]│
│ [← Câu trước [P]] [⚑ Bỏ qua / Đánh dấu [F]] [Câu tiếp theo [Ctrl+Enter] →]│
│ ┌─────────────────────────────────────────┐ │ Phím tắt nhanh bàn phím      │
│ │ Độ ổn định dự phóng: 78% S             │ │ Chọn A-D  [1-4]  Tiếp [Ctrl+Enter]│
│ │ 18s/câu · Chu kỳ HSK-A1 tuần 44        │ │ Cờ [F]  Nghe [Space]         │
│ │ neurology Trọng số thích ứng FSRS w_4  │ │                              │
│ └─────────────────────────────────────────┘ │                              │
└─────────────────────────────────────────────┴──────────────────────────────┘
```

### 6.3 Bố cục — S21 Kết quả bài kiểm tra (`/test/[id]`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [verified Tự động ghi nhận hệ thống] · TEST-20261029-ZH-01 · FSRS v4.5     │
│ Đã đồng bộ 1 Activity (Language Test) vào Daily Loop và cập nhật Evidence  │
├──────────────────────────────────────────────────┬─────────────────────────┤
│ [HSK1 · A1 Foundation] [Đề chuẩn định kỳ] 29/10 │ Phân bổ năng lực       │
│ Kết quả kiểm tra năng lực Tiếng Trung             │ (Radar Profile)        │
│ Đánh giá chu kỳ tuần theo thuật toán CEFR & HSK   │      Từ vựng 80%       │
│ ┌────────────────┬────────────┬──────────────┐   │   Ngữ pháp 70%         │
│ │ fact_check     │ timer      │ psychology   │   │  Nghe hiểu 62%         │
│ │ ĐIỂM TỔNG      │ THỜI LƯỢNG │ ĐÁNH GIÁ CEFR│   │  Viết 43%              │
│ │ 27  / 40       │ 22:14      │ A1  Vững vàng│   │  Phản xạ               │
│ │ 67.5% ▲ +2 câu  │ Hạn 30:00  │ Bottleneck:  │   │ cognition Khuyến nghị:  │
│ └────────────────┴────────────┴──────────────┘   │ Tập trung Viết & Cú pháp│
│ ✓ Độ tin cậy 94.2% · Dung sai FSRS ±1.8 ngày     │                         │
├──────────────────────────────────────────────────┴─────────────────────────┤
│ [sync_problem FR-LT-06 Closed Loop] [FSRS Memory Trigger]                 │
│ 3 thẻ từ vựng bị sai đã được tự động đẩy về ôn tập hôm nay              │
│ FSRS v4.5 hạ Stability (S) và cộng dồn Lapses (+1)                        │
│ [ Ôn ngay 3 thẻ này trong SRS (S10) → ]                                  │
│ ┌─ 苹果 píngguǒ ─────────┐ ┌─ 喝 hē ──────────┐ ┌─ 星期五 xīngqīwǔ ─┐│
│ │ Nghĩa chuẩn: Quả táo  │ │ Trong câu: 我喜欢喝 │ │ Nghĩa: Thứ Sáu     ││
│ │ ✗ Bạn đã chọn "Quả chuối"│ ✗ Nhầm 喝 và 吃    │ │ ✗ Nhầm sang Thứ Năm ││
│ │ R: 28% · Ôn: Ngay bây giờ│ R: 19% · Ôn: Ngay │ │ R: 34% · Ôn: Ngay  ││
│ └────────────────────────┘ └───────────────────┘ └────────────────────┘│
├────────────────────────────────────────────────────────────────────────────┤
│ Thống kê chi tiết theo dạng câu (itemType)     ■Tốt ■Đạt ■Cần cải thiện  │
│ ┌ mc_vocab ───────┐ ┌ mc_grammar ─────┐ ┌ listening ──────┐ ┌ writing ───┐│
│ │ Từ vựng         │ │ Ngữ pháp        │ │ Nghe hiểu       │ │ Tự luận/Viết││
│ │ 12 / 15   80%   │ │ 7 / 10     70%  │ │ 5 / 8      62%  │ │ 3 / 7  43%  ││
│ │ ▓▓▓▓▓▓▓▓░░      │ │ ▓▓▓▓▓▓░░░░      │ │ ▓▓▓▓▓░░░░░      │ │ ▓▓▓▓░░░░░░  ││
│ │ Đúng 12 · Sai 3  │ │ Đúng 7 · Sai 3  │ │ Đúng 5 · Sai 3  │ │ Sai 4 (AI)  ││
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ └────────────┘│
│ analytics Chấm điểm Tự luận AI (4 Nhóm lỗi sư phạm)                       │
│ ┌ Ngữ pháp 4/10 ────┐ ┌ Từ vựng 6/10 ───┐ ┌ Diễn đạt 7/10 ┐ ┌ Ngữ cảnh 8/10┐│
│ │ Sai trật từ thời gian│ │ Sai nét chữ 喝, 院│ │ Đúng trọng tâm │ │ Đúng đại từ  ││
│ └────────────────────┘ └──────────────────┘ └──────────────┘ └─────────────┘│
│ Phân tích sai sót & Lời giải chi tiết        [Chỉ xem câu Viết (4)]        │
│ (13 câu chưa chính xác)                      [Chỉ xem Từ vựng (3)]        │
│ ┌ Câu 04 · mc_vocab ─────────── [volume_up Nghe lại âm thanh chuẩn] ┐      │
│ │ Hình ảnh này tương ứng với từ vựng nào?  [Hình quả táo đỏ]      │      │
│ │ A.香蕉  ✗B.香蕉  ✓C.苹果  D.西瓜                                 │      │
│ │ school Giải thích sư phạm: 苹果 = Quả táo; bạn chọn nhầm 香蕉.  │      │
│ │ Từ này đã được gán thẻ nhắc ôn tập lại vào tối nay.             │      │
│ └────────────────────────────────────────────────────────────────────┘      │
│ ┌ Câu 34 · writing (AI Chấm điểm) · Điểm câu: 1.5 / 5.0 ──────────────┐   │
│ │ Đề bài: "Viết câu trả lời hoàn chỉnh bằng chữ Hán: Bạn đi đâu …"  │   │
│ │ person Câu của bạn: 我去学校明天上午。 (Word order error)          │   │
│ │ check_circle Cấu trúc mẫu: 我明天上午去学校。 (S + Time + V + Place) │   │
│ │ smart_toy AI phản hồi: tiếng Hán không đặt trạng ngữ thời gian…   │   │
│ └────────────────────────────────────────────────────────────────────┘      │
├────────────────────────────────────────────────────────────────────────────┤
│ [terminal] Tiếp tục Daily Loop hôm nay                                      │
│            Bạn còn 1 bài tập đọc và phiên ôn tập flashcards trước khi xong.  │
│            [query_stats Xem Báo Cáo Tuần (S13)] [school Bắt đầu ôn FSRS ngay]│
└────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Bảng thành phần

#### S19

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Trace badge | `FR-LT-01 → FR-LT-12` | `bg-surface-container-high text-primary font-label-sm uppercase tracking-widest` | Tĩnh, không tương tác |
| Sync chip | FSRS đã đồng bộ HH:mm | `bg-surface-container-low text-on-surface-variant font-label-sm` + icon `sync_saved_locally` `text-primary` | Dữ liệu thật từ `Card` (`max(due)`) |
| H1 | "Trung Tâm Khảo Thí & Đánh Giá Năng Lực" | `font-headline-lg font-bold text-on-surface tracking-tight` | — |
| Toggle ngôn ngữ | zh / en | Active: `bg-primary-container text-on-primary`; Idle: `text-on-surface-variant hover:text-on-surface`; nền `bg-surface-container-lowest rounded-lg p-1` | Đổi `lang` → reload query `?lang=` |
| Level banner | Level ước lượng + điểm chuẩn gần nhất | `bg-surface-container-low rounded-xl p-space-md`; chip level `bg-primary-container text-on-primary` | Dữ liệu từ `UserProfile` + `TestSession` benchmark gần nhất |
| SRS warning pill | "N thẻ sai từ kỳ thi trước đã tự động đẩy về SRS hôm nay" | `bg-error-container/30 text-error rounded-lg font-label-sm` | Chỉ hiện khi N > 0 |
| Card placement | `rounded-xl bg-surface-container p-gutter shadow-sm`; id `font-code-md text-primary`; chip "Đầu vào" `bg-surface-container-highest text-on-surface-variant` | — | Hover `hover:bg-surface-container-high` |
| Card topic | Danh sách chủ đề + tỷ lệ đạt | Mục đã đạt: `bg-primary/10 text-primary`; mới: `bg-surface-container-high text-on-surface-variant` | Click mục → tạo đề `topic` cho nhóm đó |
| Card benchmark (hero) | `bg-surface-container-high p-gutter-lg shadow-xl` + stripe `bg-gradient-to-r from-primary via-primary-fixed to-secondary` | Badge `bg-primary-container text-on-primary`; số điểm `font-headline-md text-primary` | CTA `bg-primary text-on-primary font-bold shadow-lg shadow-primary/20` |
| Card from_content | `bg-surface-container p-gutter`; badge `bg-secondary-container/40 text-secondary` | CTA `bg-secondary-container text-on-secondary-container` | Mở sheet dán văn bản → `POST /api/test/generate` |
| Panel tiến bộ benchmark | Bar theo kỳ thi | Bar `bg-surface-container-highest`, fill `bg-primary`; kỳ hiện tại có glow `shadow-[0_0_12px_rgba(78,222,163,0.35)]` | FR-LT-08 — biểu đồ level theo thời gian |
| Panel 6 kỹ năng | 6 dạng câu + % | Fill `bg-primary` (≥75%), `bg-secondary` (60–74%), `bg-tertiary` (<60%) | Dữ liệu từ tất cả `TestItem` đã chấm |
| Panel 5 từ sai nhiều nhất | Từ + số lần sai | Chip `bg-error-container/40 text-error`; từ `font-headline-sm text-on-surface` + pinyin `font-label-sm text-outline` | Từ `Card` có `lapses` cao nhất |
| Banner kỷ luật | "Kỷ Luật Đánh Giá Không Thiên Vị" | `bg-surface-container p-gutter`, nhãn `text-primary uppercase tracking-widest` | Tĩnh |

#### S20

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header chip | level + tuần + sync | `bg-primary/10 text-primary` / `bg-surface-container text-on-surface-variant` | — |
| H1 đề | "Đề Thi Benchmark Chuẩn Tuần 44 — …" | `font-headline-sm font-semibold text-on-surface truncate` | — |
| Timer | Đếm ngược `mm:ss` | `font-code-md font-semibold text-on-surface` trong `bg-surface-container-lowest rounded-lg shadow-inner`; icon `timer text-tertiary` | `aria-live="polite"`; đổi `text-error` khi < 60s |
| Nút tạm dừng | `pause` | `bg-surface-container-high hover:bg-surface-variant text-on-surface` | Đổi icon `play_arrow` + nhãn "Tiếp tục"; timer dừng |
| Nút nộp sớm | `fact_check` | `bg-primary-container text-on-primary font-semibold` | Mở confirm → `POST /api/test/submit` |
| Progress rail | Segmented theo số câu | Track `bg-surface-container-lowest`; đã làm `bg-primary`; đang làm `bg-tertiary animate-pulse`; chưa làm `bg-surface-container-high` | Tỉ lệ `flex-[n]` theo số câu |
| Chip câu | "Câu 07" | `bg-secondary-container/40 text-secondary font-label-md font-semibold` | — |
| Chip dạng câu | `mc_grammar — …` | `bg-surface-container-high text-on-surface-variant font-label-sm` | — |
| Nút nghe | `volume_up` | `bg-surface-container-high hover:bg-surface-variant text-primary` | `speechSynthesis` với `lang` theo đề; phím `Space` |
| Khối prompt | Câu hỏi + pinyin + dịch nghĩa | `bg-surface-container p-space-lg rounded-xl`; prompt `font-headline-md text-on-surface`; chỗ trống `bg-surface-container-lowest text-primary font-code-md underline decoration-dashed underline-offset-8` | — |
| Option | 4 lựa chọn | Chọn: `bg-surface-container-high` + badge `bg-primary-container text-on-primary` + `check_circle text-primary`; chưa chọn: `bg-surface-container` + badge `bg-surface-container-highest text-on-surface-variant` | `role="radio"`, `aria-checked`; phím `1`–`4` |
| Banner lưu | "Đã lưu vào SQLite lúc HH:mm:ss (Zero Data Loss)" | `bg-surface-container-lowest text-primary font-label-sm` | Cập nhật sau mỗi `POST /api/test/answer` |
| Nút trước/sau/cờ | `arrow_back` / `flag` / `arrow_forward` | Trước: `bg-surface-container hover:bg-surface-container-high`; Cờ: `bg-tertiary-container/20 text-tertiary`; Sau: `bg-primary text-on-primary` | Phím `P`, `F`, `Ctrl+Enter` |
| Ma trận câu hỏi | Lưới 8 cột | Đã làm `bg-primary-container text-on-primary`; hiện tại `bg-tertiary text-on-tertiary animate-pulse`; gắn cờ `bg-tertiary-container text-on-tertiary` + chấm đỏ `bg-error`; trống `bg-surface-container-high text-on-surface-variant` | Click → nhảy tới câu; `aspect-square` |
| Panel quy tắc FSRS | Giải thích feedback loop | `bg-surface-container-low rounded-xl`, icon `sync_saved_locally text-secondary` | Tĩnh, dẫn link S10 |
| Hướng dẫn phím tắt | 4 cặp | Key `font-code-md bg-surface-container-high rounded` | Tĩnh |
| Panel dự phóng | "Độ ổn định dự phóng: 78% S" | `font-headline-sm text-on-surface`; chip `bg-secondary-container/20 text-secondary` | Tính từ `TestItem.seconds` |

#### S21

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Banner ghi nhận | "Đã đồng bộ 1 Activity + Evidence" | `bg-surface-container-low rounded-xl`; icon `verified text-primary` trong `bg-primary/10` | Dữ liệu thật từ `Activity`/`Evidence` |
| Tiêu đề | "Kết quả kiểm tra năng lực Tiếng Trung" | `font-headline-lg font-bold text-on-surface tracking-tight` | — |
| Bento điểm tổng | Điểm / % / delta | Nền `bg-surface-container-low rounded-lg`; số `font-display text-display font-bold text-on-surface`; delta `text-primary` | Delta so với benchmark gần nhất |
| Bento thời lượng | Thời gian + hạn ngạch | `font-headline-lg font-bold text-on-surface`; phụ `text-on-surface-variant` | `durationSec` thật |
| Bento level | Level CEFR/HSK + bottleneck | Level `font-headline-lg font-bold text-secondary`; chip `bg-secondary/10 text-secondary` | Kết quả AI-16 (đã clamp theo band code tính) |
| Radar năng lực | 5–6 trục | Nền `fill-surface-container-low stroke-outline-variant/30`; vùng đạt `fill rgba(78,222,163,0.2) stroke #4edea3`; node `text-primary` / `text-tertiary` / `text-error` | Suy ra từ % theo `itemType` |
| Panel FR-LT-06 | "N thẻ từ vựng bị sai đã được tự động đẩy về ôn tập hôm nay" | `bg-surface-container-high rounded-xl p-gutter shadow-xl`; badge `bg-primary-container text-on-primary`; glow `bg-primary-container/15` | N = số thẻ thật bị đẩy về ôn |
| Card thẻ bị đẩy | Từ + pinyin + nghĩa + lỗi + retrievability | `bg-surface-container-low rounded-lg`; từ `font-display text-[2rem] font-bold`; pinyin `font-code-md text-primary`; lapse `bg-error/15 text-error` | Click → mở S10 đúng thẻ đó |
| Ô dạng câu | 4–6 ô, mỗi ô 1 `itemType` | `bg-surface-container rounded-xl`; tag `bg-surface-container-highest font-code-md`; trạng thái `bg-primary/10` / `bg-tertiary/10` / `bg-error/15`; bar fill theo ngưỡng 75/60 | Ngưỡng: ≥75% Tốt · 60–74% Đạt · <60% Cần cải thiện |
| Panel rubric AI | 4 nhóm lỗi, 0–10 | `bg-surface-container-low rounded-xl`; mỗi nhóm `bg-surface-container rounded-lg`; điểm `font-code-md` (error/tertiary/primary theo ngưỡng) | Đúng 4 nhóm `RUBRIC_LANGUAGE_ERRORS` |
| Danh sách câu sai | Từng câu + đáp án + giải thích | `bg-surface-container rounded-xl p-gutter`; badge sai `bg-error/15 text-error`; đáp án đúng `bg-primary/10 text-primary`; đáp án sai `bg-error/10 text-error` | Bộ lọc "Chỉ xem câu Viết / Từ vựng" |
| Nút "Nghe lại âm thanh chuẩn" | TTS lại `audioText` | `bg-surface-container-high hover:bg-surface-container-highest text-primary` | `aria-label` bắt buộc |
| Dock hành động | Tiếp tục Daily Loop | `bg-surface-container-low rounded-xl p-gutter`; CTA `bg-primary-container text-on-primary` | Link S13 / S10 |

### 6.5 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| S19 — chưa làm placement | Chưa có `TestSession` loại `placement` cho `lang` | Card placement hiện "Chưa làm · Xác định level khởi đầu thật" + CTA "Bắt đầu" |
| S19 — chưa có benchmark nào | Chưa có `TestSession` loại `benchmark` | Panel tiến bộ hiện "Chưa có kỳ thi chuẩn nào — hãy làm đề đầu tiên" + CTA |
| S19 — không có API key | `!process.env.ANTHROPIC_API_KEY` | Nút sinh đề AI ẩn, hiện "Bật sinh đề AI bằng cách thêm API key trong Cài đặt"; các đề đã lưu vẫn xem được |
| S19 — thiếu thẻ trong ngân hàng | Không có `Card` cho `lang`/`topic` và ngân hàng seed cũng rỗng | Cảnh báo "Chưa có thẻ nào cho chủ đề này — hãy thêm thẻ ở Ôn tập ngoại ngữ" (CTA → S09) |
| S20 — đang tải đề | Đang gọi AI-14 | Skeleton khối câu hỏi + "Đang soạn đề… (có thể mất 10–20 giây)" |
| S20 — AI-14 lỗi | 429 / refusal / timeout | Thông báo ngắn + nút "Thử lại"; **không** tạo phiên rỗng |
| S20 — câu tự luận chờ chấm | `writing`/`translation` vừa nộp | Chip trên câu: "AI đang chấm…" với `aria-live`; nút "Câu tiếp theo" vẫn bật |
| S20 — timer sắp hết | Còn ≤ 60s | Đồng hồ `text-error` + pulse; banner "Còn 1 phút" |
| S20 — hết giờ | Đếm ngược = 0 | Tự nộp bài → `status = "expired"` → chuyển S21; câu chưa trả lời = bỏ trống |
| S20 — đóng tab giữa bài | Quay lại `/test/session` | Khôi phục đúng `TestSession` có `status="active"`, đáp án đã trả lời vẫn còn |
| S21 — không có câu sai | 0 câu sai | Khối "Phân tích sai sót" hiện "Không có câu sai — đạt 100%" |
| S21 — 0 thẻ bị đẩy về ôn | Không câu sai nào có `cardId` | Hiện đúng "0 thẻ bị đẩy về ôn sớm" — **không crash, không giả lập số liệu** (AC-11) |
| S21 — chưa có bài trước để so sánh | Chưa có `TestSession` benchmark cùng `lang` | Ẩn dòng "So với lần trước", hiện "Chưa có kỳ thi trước để so sánh" |
| S21 — đề không song song với kỳ trước | `formSignature` khác `formSignature` của kỳ trước | Ẩn dòng delta, hiện "Đề không cùng độ khó với kỳ trước — không tính delta" (FR-LT-12) |
| S21 — thiếu API key (AI-16) | `!ANTHROPIC_API_KEY` | Level hiển thị bằng **bộ ước lượng cục bộ** (rule theo band điểm) kèm nhãn "Ước lượng cục bộ"; khối rubric AI hiện "Cần API key để chấm câu tự luận" |
| S21 — AI-15 lỗi | Lỗi chấm câu tự luận | Câu đó hiện "Chưa chấm được — thử lại"; điểm tổng **không** tính câu đó (hiển thị "chấm 39/40 câu") |

### 6.6 Edge case

| Case | Xử lý |
|---|---|
| **Đề hết hạn (timer)** | Đếm ngược = 0 → tự gọi `POST /api/test/submit` với `reason: "timeout"`; `TestSession.status = "expired"`; câu chưa trả lời được đánh dấu `isCorrect = false`, `scored = true` nhưng **không** đẩy thẻ về ôn (không có bằng chứng người dùng quên — chỉ không trả lời). S21 hiện "Hết thời gian — đã nộp tự động". |
| **Quay lại câu đã trả lời để sửa** | Cho phép. Trả lời mới **ghi đè** `userAnswer` + `isCorrect` + `seconds` của câu đó (1 bản ghi/câu, không nhân bản). Điểm tổng tính lại từ các item hiện tại. Nếu câu đã có thẻ và lần đầu sai → thẻ **chỉ** bị đẩy về ôn khi nộp bài; sửa lại đúng thì câu đó không đẩy thẻ. |
| **Câu không gắn thẻ nào** | `cardId = null` (câu ngữ pháp tổng quát, câu không có từ nền) → không có hành động SRS nào. S21 hiện "0 thẻ bị đẩy về ôn sớm" nếu tất cả câu sai đều thuộc nhóm này. **Không** giả lập số liệu, **không** crash. |
| **Thiếu thẻ trong ngân hàng** | Cấp 1: lấy từ `Card` của user (theo `lang` + `group`). Cấp 2: lấy từ ngân hàng seed cho level. Cấp 3 (hết cả hai): dạng câu không cần thẻ (`mc_grammar` tổng quát) vẫn sinh được bằng AI; `mc_vocab`/`cloze`/`listening`/`translation`/`writing` gắn thẻ bắt buộc → **giảm số câu của dạng đó và bù sang dạng không cần thẻ**, hiển thị cảnh báo "Ngân hàng thẻ còn thiếu — đề được cân bằng lại còn N câu". Tuyệt đối không để AI bịa từ mới (FR-LT-10, R6). |
| **Câu bị gắn cờ (bỏ qua)** | Câu có `flagged = true` → **không** đẩy thẻ về ôn (đây là câu người dùng chủ động bỏ qua, không phải bằng chứng quên). Nếu người dùng vẫn trả lời câu đó thì đáp án vẫn được tính vào điểm. Câu chưa trả lời + có cờ → tính là bỏ trống. |
| **Đề benchmark lặp lại** | Khi tạo đề `benchmark`/`topic`, loại các `cardId` đã dùng trong **3 phiên gần nhất** cùng `lang`. Nếu không đủ thẻ để đủ số câu → dùng lại thẻ cũ nhưng đánh dấu `blueprint.reused = true`; S21 hiện cảnh báo "Đề lặp một phần — độ tin cậy so sánh giảm" và **không** tính delta so với kỳ trước. |
| **Placement chạy lại** | Cho phép chạy lại (không khóa). Khi nộp, `UserProfile.zhLevel`/`enLevel` được **ghi đè** bằng level mới và hiển thị hộp thoại xác nhận trước khi ghi: "Đổi level từ A1 → A2? Toàn bộ lộ trình ôn sẽ dùng level mới." Phiên cũ **không bị xoá** (vẫn xem lại được ở S21). Nếu level mới **thấp hơn** level cũ → cảnh báo thêm "Sẽ có 12 thẻ bị đưa về hàng đợi ôn lại". |
| **AI trả số câu sai** | AI-14 trả về ≠ `count` hoặc sai tỷ lệ dạng → **không** nhận bản ghi đó. Bù bằng: (a) các item dạng không cần thẻ sinh bằng rule cục bộ, hoặc (b) yêu cầu AI sinh bổ sung tối đa 2 lần; nếu vẫn thiếu → tạo đề với số câu thực tế và hiển thị cảnh báo "Đề có N/25 câu do AI không sinh đủ — phần còn thiếu đã bỏ qua". Tuyệt đối **không** tự nhân bản item để đủ số. |
| **Người dùng đóng tab giữa bài** | Mỗi lần trả lời ghi ngay 1 lần xuống SQLite (`POST /api/test/answer`) — mở lại `/test/session` sẽ tìm `TestSession` có `status="active"` của `lang` và khôi phục đúng vị trí câu + đáp án đã trả lời. Chỉ khi người dùng bấm "Nộp bài" mới tạo `Activity`/`Evidence` và áp FSRS. Nếu người dùng bỏ hẳn (không quay lại), phiên giữ `status="active"` và tự đánh dấu `abandoned` sau 24h (cron dọn dẹp) — **không** tự nộp bài để tránh bằng chứng giả. |
| Người dùng nộp bài khi chưa trả lời câu nào | Cho phép nộp → tất cả câu là "bỏ trống", điểm 0, S21 hiện "Bạn chưa trả lời câu nào" + CTA "Ôn ngay" (nhưng 0 thẻ bị đẩy về ôn vì không có câu sai). |
| Ghi đè `POST /api/test/answer` do double-click | Idempotent theo `(testId, index)` — upsert, không tạo bản ghi trùng. |
| Câu `cloze` người dùng gõ sai dấu / hoa thường | Chuẩn hoá trước khi so khớp: bỏ khoảng trắng, `toLowerCase()`, bỏ dấu câu cuối, chấp nhận khớp `pinyin` nếu thẻ có `frontAlt`. |
| Câu `listening` trình duyệt không có giọng `zh-CN` | Nút nghe hiện "Giọng zh-CN không khả dụng — dùng pinyin + hán tự" (R5); câu vẫn làm được bằng mắt đọc pinyin. |
| `from_content` dán văn bản quá dài | Giới hạn 8.000 ký tự; vượt → cắt bằng thông báo "Đã lấy 8.000 ký tự đầu tiên". Văn bản rỗng → 400, không gọi AI. |
| Hai tab mở cùng `/test/session` | Mỗi tab ghi theo `(testId, index)` → không xung đột dữ liệu; nhưng chỉ 1 phiên `active` cho mỗi `lang` → tab thứ 2 được chuyển hướng sang bản tổng kết của phiên đang chạy. |
| Người dùng xoá thẻ sau khi bài kiểm tra | `TestItem.cardId` trỏ tới thẻ đã xoá → S21 bỏ qua thẻ đó khi tính "thẻ bị đẩy về ôn" (không crash, không giả lập số liệu). |

## 7. Hợp đồng API

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| GET | `/api/test?lang=zh` | `lang`, `type?` | `{ profile:{level, seedAvailable}, placements:[], topics:[{group, rate, count}], benchmarks:[{id,label,score,maxScore,date,level}], benchmarkTrend:[{label,rate}], byItemType:[{itemType,correct,total,rate}], topWrongWords:[{cardId,front,frontAlt,back,wrongCount}], pushedCards:{count,ids}, hasApiKey }` | `400` lang không hợp lệ |
| POST | `/api/test/generate` | `{ lang, testType, topic?, level?, itemTypes?, count?, sourceText? }` | `{ testId, count, blueprint, formSignature, warnings:[], items:[{index,itemType,prompt,audioText,options,answer,cardId,skillName}] }` | `400` input sai schema · `409` đã có phiên `active` cùng lang · `429` rate limit · `503` no_api_key · `502` AI lỗi |
| POST | `/api/test/answer` | `{ testId, index, userAnswer, seconds?, flagged? }` | `{ saved:true, index, isCorrect:boolean\|null, correctAnswer?:string, explanation?:string, elapsedTotal }` | `400` index ngoài phạm vi · `404` không tìm thấy phiên/câu · `409` phiên đã nộp |
| POST | `/api/test/grade-open` | `{ testId, index }` | `{ index, rubric:{grammar,vocab,expression,context}, score, errors:{grammar:[],vocab:[],expression:[],context:[]}, feedback, correctedAnswer }` | `404` · `409` đã chấm · `429` · `503` no_api_key · `502` AI lỗi |
| POST | `/api/test/level` | `{ testId }` | `{ level, levelLabel, cefr, hsk, confidence, bottleneck, reason, source:"ai"\|"local" }` | `404` · `503` no_api_key (fallback `source:"local"`) · `502` |
| POST | `/api/test/submit` | `{ testId, reason?: "manual"\|"timeout" }` | `{ testId, score, maxScore, correct, total, durationSec, byItemType:[...], pushedCards:[{cardId,front,frontAlt,back,due,lapses,stability,retrievability,reason}], activityId, evidenceId, level }` | `404` · `409` phiên đã nộp · `500` lỗi transaction |
| GET | `/api/test/[id]` | — | `{ session:{id,lang,testType,topic,status,score,maxScore,durationSec,level,createdAt}, items:[...], byItemType:[...], pushedCards:[...], comparison:{prevScore,prevMaxScore,deltaCorrect,prevDate} \| null, suggestedGroup, levelSource, activityId, evidenceId }` | `404` không tìm thấy phiên |

> Mọi route trả `{ ok: true, data }` hoặc `{ ok: false, error }` (theo `.kiro/steering/tech.md` §5). `GET /api/test/[id]` là route động — Next.js App Router: `src/app/api/test/[id]/route.ts`.

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-11 — Bài kiểm tra đẩy thẻ về ôn** *(bắt buộc)*
- *Given* bài kiểm tra có 5 câu sai và mỗi câu sai gắn với 1 `cardId` khác nhau, *When* xem kết quả ở S21, *Then* đúng 5 thẻ đó có `due = hôm nay` (00:00 local), `lapses` tăng 1, `stability` giảm, và nút "Ôn ngay" mở S10 với đúng 5 thẻ đó.
- *Given* bài kiểm tra có 5 câu sai nhưng **không câu nào gắn thẻ**, *When* xem kết quả, *Then* hiện "0 thẻ bị đẩy về ôn" — **không crash, không giả lập số liệu**, và không có thẻ nào bị thay đổi `due`/`lapses`.
- *Given* 1 câu sai gắn thẻ nhưng người dùng quay lại sửa thành đúng trước khi nộp, *When* nộp bài, *Then* thẻ đó **không** bị đẩy về ôn.

**AC-12 — Câu tự luận chấm đúng 4 nhóm lỗi** *(bắt buộc)*
- *Given* một câu `writing` bị sai, *When* AI-15 chấm, *Then* lỗi được phân loại vào **đúng 1 trong 4 nhóm** (ngữ pháp / từ vựng / cách diễn đạt / ngữ cảnh), và **không** có nhóm nào ngoài 4 nhóm `RUBRIC_LANGUAGE_ERRORS`.
- *Given* kết quả chấm trả về có nhóm lạ (ví dụ `"pronunciation"`) hoặc thiếu nhóm, *When* parse, *Then* schema fail → câu đó hiển thị "Chưa chấm được — thử lại", **không** ghi nhóm lạ vào `TestItem.errorGroups` và **không** tính vào điểm tổng.

**AC-LT-1 — Blueprint sinh đúng số câu & đúng phân bố**
- *Given* blueprint `{ lang:"zh", level:"A1", itemTypes:["mc_vocab","mc_grammar","cloze","listening"], count:25 }`, *When* gọi `POST /api/test/generate`, *Then* `TestSession` có **đúng 25** `TestItem` và số item theo từng dạng khớp tỉ lệ blueprint (8/7/5/5); `blueprint.count` = 25.

**AC-LT-2 — Chấm objective ngay + AI chấm tự luận**
- *Given* câu `mc_vocab` đã chọn đáp án, *When* gọi `POST /api/test/answer`, *Then* response có `isCorrect` tính ngay và `TestItem.isCorrect` được ghi xuống DB.
- *Given* câu `writing` đã nộp, *When* gọi `POST /api/test/grade-open`, *Then* trả về **4** điểm rubric 0–10 (ngữ pháp, từ vựng, cách diễn đạt, ngữ cảnh) và lưu vào `TestItem.rubric` + `errorGroups`.

**AC-LT-3 — Timer & thời gian từng câu**
- *Given* đề `benchmark` (30:00) đang chạy, *When* hết thời gian, *Then* phiên tự nộp (`status="expired"`), sang S21, và `TestItem.seconds` của các câu đã làm được lưu đúng.

**AC-LT-4 — Kết quả phân tách theo dạng & ước lượng level**
- *Given* một phiên 40 câu đã nộp, *When* mở S21, *Then* khối "Thống kê chi tiết theo dạng câu" có tổng số câu của các dạng **bằng 40** và mỗi dạng khớp `COUNT` thực tế trong DB; level hiển thị kèm "bottleneck" là dạng có tỷ lệ đúng thấp nhất.

**AC-LT-5 — Placement set level + gợi ý nhóm từ**
- *Given* người dùng mới (`zhLevel="zero"`), *When* hoàn thành placement và xem S21, *Then* `UserProfile.zhLevel` được set theo level ước lượng, S21 hiện gợi ý **nhóm từ nào** nên bắt đầu và **bài tập đầu tiên** (CTA mở S10 với nhóm từ đó).

**AC-LT-6 — Đề song song về độ khó (FR-LT-12)**
- *Given* 2 phiên `benchmark` cùng `lang` tạo ở 2 thời điểm khác nhau, *When* so sánh, *Then* cả hai có **cùng `formSignature`** (cùng phân bố dạng + cùng band độ khó) và **không dùng chung `cardId`** với 3 phiên gần nhất.

**AC-LT-7 — Không mất dữ liệu khi đóng tab**
- *Given* người dùng đã trả lời 6/40 câu rồi đóng tab, *When* mở lại `/test/session`, *Then* phiên `active` được khôi phục với đúng 6 đáp án đã lưu và con trỏ ở câu 7.

**AC-LT-8 — Bằng chứng P3 (FR-LT-11)**
- *Given* một phiên đã nộp, *When* kiểm tra DB, *Then* tồn tại đúng 1 `Activity` với `domain="language"`, `type="test"` và ≥1 `Evidence` gắn với skill ngôn ngữ tương ứng.

**AC-LT-9 — `from_content` (FR-LT-09)**
- *Given* người dùng dán một đoạn văn bản tiếng Trung, *When* tạo đề `from_content`, *Then* AI sinh 10 câu (9 trắc nghiệm đọc hiểu + 1 câu tóm tắt) và câu tóm tắt được chấm bằng AI-15 theo 4 nhóm lỗi.

**AC-LT-10 — Offline không crash (NFR-LT-02)**
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở `/test`, `/test/session` và `/test/[id]`, *Then* trang vẫn render với số liệu thật từ DB; nút sinh đề AI hiện hướng dẫn thêm key; **không** có số liệu AI giả lập.

## 9. Rủi ro riêng của feature

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| LT-R1 | **Rò rỉ đề** — người dùng làm lại `benchmark` và nhớ đáp án → số liệu tiến bộ giả (R10) | FR-LT-12: parallel form (cùng `formSignature`, khác `cardId`), loại thẻ đã dùng trong 3 phiên gần nhất; đề lặp một phần → cảnh báo + không tính delta. |
| LT-R2 | **AI sinh từ vựng nền** → sai chuẩn level 0 (R6) | FR-LT-10: AI chỉ sinh *cách hỏi*; mọi từ đích phải đến từ `Card` (user) hoặc ngân hàng seed; thiếu thẻ → cân bằng lại đề, không bịa từ. |
| LT-R3 | **Điểm không so sánh được** giữa các lần do AI sinh mỗi lần khác nhau | Lưu `formSignature` + `difficultyBands` trong blueprint; đề cùng signature mới được so sánh; UI hiện cảnh báo khi signature lệch. |
| LT-R4 | **FSRS state bị hỏng** khi ép rating `Again` cho câu sai nhiều lần trong một phiên | Mỗi thẻ chỉ bị áp `Again` **một lần** mỗi phiên (dedupe theo `cardId`); `Review.source="test"` để truy vết. |
| LT-R5 | **Chi phí AI tăng** vì sinh đề 40 câu mỗi 2 tuần | AI-14 chỉ gọi 1 lần/đề; cache system prompt; `AiCall` theo dõi; có thể tái dùng đề cũ nếu người dùng "Ôn lại đề này" (không gọi AI lần 2). |
| LT-R6 | **Ước lượng level bị AI bịa số** | Code tính band điểm theo `itemType` là nguồn số; AI-16 chỉ chọn trong enum `zero..C1` và giải thích; kết quả AI lệch >1 bậc bị **clamp** về band code tính; không có API key → dùng bộ ước lượng cục bộ và ghi rõ `source:"local"`. |
| LT-R7 | **Đóng tab mất dữ liệu** (nguy cơ lớn nhất của một bài 40 câu) | Ghi từng câu ngay (`POST /api/test/answer`); khôi phục phiên `active`; banner "Đã lưu vào SQLite lúc HH:mm:ss". |
| LT-R8 | **Điểm tự luận không ổn định** giữa 2 lần chấm (R9) | `effort: medium` cố định, temperature mặc định, rubric 4 nhóm cố định, lưu điểm từng nhóm kèm lý do để người dùng tự phản biện; chấp nhận sai số ±0.3. |
| LT-R9 | **Thẻ bị đẩy về ôn sai** (đẩy cả câu bỏ trống) | Chỉ câu **đã trả lời sai** mới đẩy thẻ; câu bỏ trống/bỏ qua có cờ không đẩy thẻ. |
| LT-R10 | **TTS không đọc được `zh-CN`** trên một số thiết bị (R5) | Nút nghe có fallback "dùng pinyin + hán tự"; câu `listening` vẫn làm được bằng mắt đọc pinyin kèm nghĩa. |
