# Ôn Ngoại Ngữ SRS / FSRS (Trung Tâm Ôn Tập + Phiên Ôn)

> **Màn hình:** S09 (`/language`), S10 (`/language/session`) · **Phase:** **1** (mâu thuẫn Phase ghi nhận ở §0.4)
> **Nguồn:** `system-design/SPEC.md` §2.3.1, §2.3.2, §3.2 (S09, S10), §4, §6, §8 (AC-4), §9 (R5, R6), Phụ lục B · prototype `system-design/s09_n_t_p_ngo_i_ng_srs_hub/`, `system-design/s10_n_t_p_ngo_i_ng_srs_fsrs/`
> **Phụ thuộc:** `daily-loop-core` (nền schema + `Activity`/`Evidence`), `skill-tree-evidence` (kỹ năng ngôn ngữ), `ai-foundation` (`src/lib/anthropic.ts`, cấu hình chung)

---

## 0. Ghi chú về Phase — mâu thuẫn nguồn tin

| Nguồn | Nội dung |
|---|---|
| `SPEC.md` §3.1 (bảng tổng quan) | S09, S10 → **Phase 0** |
| `SPEC.md` §3.2 (S09, S10) | mô tả màn hình, không nhắc Phase |
| `.kiro/steering/project.md` §3 (danh mục 21 màn hình) | S09, S10 → **Phase 0** |
| `SPEC.md` §7 (lộ trình) | "SRS zh/en (S09, S10) + seed 120 thẻ" nằm trong **Phase 1 — Luyện tập cốt lõi** |

**Mâu thuẫn:** cùng một SPEC vừa xếp S09/S10 ở Phase 0, vừa đặt chúng ở Phase 1.

**Quyết định của feature này: triển khai S09/S10 ở Phase 1.** Lý do:

1. `SPEC.md` §7 là mục "Lộ trình triển khai" — nơi duy nhất định nghĩa *thứ tự* và điều kiện vào mỗi phase. §3.1 chỉ ghi phase hiện tại của màn hình.
2. `product.md` §7 đặt **ưu tiên cứng**: *"Không bắt đầu Phase 1 trước khi Phase 0 dùng được hằng ngày 7 ngày liên tiếp."* Nếu coi S09/S10 là Phase 0 thì ràng buộc này bị vô hiệu hoá.
3. SRS là **ôn tập**, không phải **ghi nhận** — không tạo ra bằng chứng mới theo nghĩa P3 (mỗi lượt ôn chỉ cập nhật state FSRS của thẻ, không sinh `Evidence` kỹ năng mới).

**Hệ quả tách phase (giữ nguyên nguyên tắc ưu tiên cứng):**

| Hạng mục | Phase | Lý do |
|---|---|---|
| Schema `Card` / `Review` (+ `SrsSession`) | **0** | Nền tảng dữ liệu, `project.md` §7 yêu cầu seed 120 thẻ ngay từ Phase 0 |
| `src/lib/fsrs.ts` (wrapper thuật toán) | **0** | Thư viện thuần, không phụ thuộc UI |
| Seed 120 thẻ + 20 mẫu câu | **0** | Tĩnh, biên tập tay (R6) — không gọi AI |
| API `/api/srs/*`, `/api/language*` | **1** | Cần `Card`/`Review` có dữ liệu thật |
| UI S09 (`/language`), S10 (`/language/session`) | **1** | Theo `SPEC.md` §7 |

> **Điều kiện vào Phase 1 (Definition of Done):** người dùng đã dùng app hằng ngày 7 ngày liên tiếp ở Phase 0 (Daily Loop + Quick-log + Cây kỹ năng + Đánh giá chính + AI-01 + offline) → *tương lai sản phẩm, không phải tiêu chí nghiệm thu của feature này*.

---

## 1. Tổng quan

Feature này là **mô-đun ôn tập ngoại ngữ duy nhất** của Daily Loop OS: một trung tâm quản lý kho thẻ (S09) và một phiên ôn 1 thẻ 1 lượt (S10), phục vụ **hai ngôn ngữ song song — Tiếng Trung (zh-CN) và Tiếng Anh (en-US)** ở **level 0 (zero → A1)**.

Người dùng là một người Việt Nam học cả hai ngôn ngữ từ con số 0. Với bài toán này, "nhớ" không phải là đọc lại danh sách từ — đó là **nhớ đúng nhịp**: thẻ nào cần ôn hôm nay, thẻ nào đã thuộc, thẻ nào vừa trượt. Vì vậy toàn bộ feature bám theo **FSRS** (`ts-fsrs`) — thuật toán lịch ôn khoảng cách rời (Free Spaced Repetition Scheduler) — thay vì các heuristic đơn giản kiểu "càng xa lần ôn trước càng lâu".

Nguyên tắc áp dụng:

| Nguyên tắc | Áp dụng cụ thể trong feature |
|---|---|
| **P1** — một màn hình quyết định hôm nay | S09 **không** phải dashboard tổng hợp. Nó là **bảng điều khiển duy nhất** cho ôn tập: số đến hạn hôm nay → bấm vào phiên ôn. Không có tab thống kê song song. |
| **P3** — tiến độ = bằng chứng | Mọi số liệu S09 đều truy được về một `Card` cụ thể (S, D, reps, lapses, due). Không có "tổng số từ đã học" trần trụi mà không kèm trạng thái. |
| **P5** — không thêm domain thứ 5 | Chỉ `language`. Hai ngôn ngữ đóng băng: zh + en. |
| **P6** — local-first | Toàn bộ tính năng chạy offline. SQLite cục bộ, TTS dùng Web Speech API của trình duyệt. |
| **P7** — không vanity metric | "Retention 94.2%" chỉ được hiển thị khi gắn được với thẻ cụ thể hoặc với phiên ôn thật; streak tính theo **ngày có lượt ôn thật**, không phải ngày mở app. |

**Đặc điểm khác biệt quan trọng:** hai ngôn ngữ có **cơ chế nhận dạng khác nhau** ở level 0 (SPEC §2.3.1), nên S10 **không** dùng một layout chung:

- **Tiếng Trung:** pinyin luôn hiện (kèm hanzi tùy chọn bật/tắt) · người Việt chưa đọc được hanzi → nhận dạng qua **âm thanh** và **ngữ cảnh** · 4 thanh điệu được giới thiệu ở phần "gợi ý", không phải SRS.
- **Tiếng Anh:** người Việt đã đọc được chữ Latin nhưng chưa từng đọc câu tiếng Anh → cần **cửa sổ vào 2 tuần đầu** với **phiên âm gần đúng kiểu Việt** (`water` → "u-tờ-ờ"), sau đó tắt dần.

---

## 2. Bối cảnh & vấn đề

- **Không có lịch ôn → không có nhớ.** Danh sách 120 từ vựng trên giấy không biết thẻ nào đến hạn. Người học bỏ sót đúng những từ hay quên nhất (hiệu ứng quên giảm dần) và lãng phí thời gian ôn từ đã thuộc.
- **Chấm kiểu "Đúng/Sai" không đủ.** Cần 4 mức (Again / Hard / Good / Easy) để thuật toán phân biệt "quên hẳn" với "nhớ nhưng khó" — đây là thông tin mà thuật toán FSRS dùng để ước lượng độ bền bộ nhớ.
- **Hai ngôn ngữ dùng chung một "deck" là sai.** Người Việt học Trung và Anh theo hai đường khác nhau (pinyin vs phonics; hanzi vs Latin). Trộn lẫn sẽ phá hỏng cả hai đường. → **S09 có 2 deck riêng, streak riêng, tiến độ riêng.**
- **TTS là điểm chí mạng.** Không có giọng `zh-CN` trên một số thiết bị → nếu để trống, người học mất hoàn toàn khả năng nghe. → Cần fallback hiển thị pinyin + hanzi (R5).
- **Nội dung level 0 không được để AI sinh.** Từ vựng nền tảng sai 1 từ = sai cả nhóm từ sau đó. → Seed **120 thẻ biên tập tay**, AI không được sinh từ vựng nền (R6).

---

## 3. Yêu cầu chức năng

### 3.1 Mô hình thẻ & lịch ôn (FR-LG)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LG-01 | Mỗi thẻ có `lang` (zh/en), mặt trước, mặt sau, ghi chú, ví dụ câu, nhóm/chủ đề, `mode` (recognize/recall/produce) | P0 | FR-LG-01 |
| FR-LG-02 | Lịch ôn dùng **FSRS** (`ts-fsrs`), lưu state dạng **JSON** trong `Card.cardState` | P0 | FR-LG-02 |
| FR-LG-03 | 4 nút chấm **Again / Hard / Good / Easy**, mỗi nút hiện **gợi ý thời gian tới lượt ôn kế tiếp** đọc từ state FSRS | P0 | FR-LG-03 |
| FR-LG-04 | Phiên ôn: lấy **thẻ đến hạn trước**; hết thẻ đến hạn → lấy **thẻ mới từ nhóm chưa học**; tối đa **20 thẻ/phiên** | P0 | FR-LG-04 |
| FR-LG-05 | Level 0 — mặt trước: **pinyin (zh) hoặc từ (en) + nút nghe**; mặt sau: **hanzi + nghĩa + ví dụ + nút nghe** | P0 | FR-LG-05 |
| FR-LG-06 | Chế độ `produce`: hiện nghĩa, người dùng **gõ/nói** (STT `zh-CN`/`en-US`), app so khớp chuỗi và chấm fuzzy | P2 (**ngoài phạm vi feature này**) | FR-LG-06 |
| FR-LG-07 | Thẻ sai (rating 1) → tự sinh lại thẻ biến thể (ví dụ câu khác / điền vào chỗ trống) | P2 (**ngoài phạm vi**) | FR-LG-07 |
| FR-LG-08 | Từ khóa trong bài viết → nút "Thêm vào ôn" | P2 (**ngoài phạm vi**, Phase 2) | FR-LG-08 |
| FR-LG-09 | Tiến độ **mỗi ngôn ngữ**: số thẻ đã học / đang học / đã thuộc + **chuỗi ngày ôn riêng từng ngôn ngữ** | P0 | FR-LG-09 |
| FR-LG-10 | Seed **60 thẻ zh + 60 thẻ en + 10 mẫu câu mỗi ngôn ngữ** — **biên tập tay, KHÔNG AI sinh** (R6) | P0 | FR-LG-10 |

### 3.2 Trung tâm ôn tập — S09 (`/language`)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LG-S09-01 | 2 deck card (Tiếng Trung zh-CN / Tiếng Anh en-US), mỗi deck hiện 3 số: **đang học / đã thuộc / đến hạn** + **streak ngày ôn** của riêng ngôn ngữ đó | P0 | FR-LG-09 + prototype S09 |
| FR-LG-S09-02 | Khối CTA "Hôm nay cần xử lý": tổng số thẻ đến hạn **cả 2 ngôn ngữ** + nút "Bắt đầu phiên ôn tập hôm nay" | P0 | prototype S09 |
| FR-LG-S09-03 | Panel **"6 Nhóm Từ Vựng Cốt Lõi Level 0"**: mỗi nhóm hiện % thuộc, số thẻ, giá trị S trung bình, thanh tiến độ; nhóm có thẻ trượt gần đây được đánh dấu cảnh báo | P0 | prototype S09 + Phụ lục B |
| FR-LG-S09-04 | Bảng **"Kho Thẻ Từ Vựng & Chỉ Số FSRS"** — cột: `Mặt Trước (Target)` · `Mặt Sau (Nghĩa)` · `Stability (S)` · `Diff (D)` · `Reps` · `Lapses` · `Hạn ôn kế tiếp` | P0 | prototype S09 |
| FR-LG-S09-05 | Filter chips: **Tất cả / Đến hạn / Đang học / Đã thuộc / Trượt-Lapse** + ô tìm kiếm theo pinyin · hanzi · từ tiếng Anh · nghĩa tiếng Việt | P0 | prototype S09 |
| FR-LG-S09-06 | Phân trang danh sách thẻ (20 thẻ/trang) | P0 | prototype S09 |
| FR-LG-S09-07 | Nút **"Xuất Deck JSON"** — xuất toàn bộ thẻ + state FSRS + lịch sử review (NFR-08) | P1 | prototype S09 + NFR-08 |
| FR-LG-S09-08 | Nút **"Thêm thẻ thủ công"** — form nhập đủ trường FR-LG-01, validate trước khi ghi | P0 | prototype S09 |
| FR-LG-S09-09 | Panel **"Chỉ Số Ghi Nhớ FSRS"**: retention thực tế, tham số scheduler đang chạy (request retention · max interval · số tham số w · decay), đường cong phân rã R(t) | P1 | prototype S09 |
| FR-LG-S09-10 | Chọn deck (zh/en) → mở S10 với đúng `lang` | P0 | SPEC §3.2 S09 |

### 3.3 Phiên ôn — S10 (`/language/session`)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-LG-S10-01 | Header: badge ngôn ngữ + level, badge nhóm, badge trạng thái scheduler, **tiến trình dạng chấm tròn** (`3/12 thẻ`), **timer phiên**, nút tạm dừng | P0 | prototype S10 |
| FR-LG-S10-02 | Mặt trước hiện **đích + nút nghe** theo §4.2; nút **bật/tắt hanzi** (zh) hoặc **bật/tắt phiên âm Việt** (en) | P0 | FR-LG-05 + §2.3.1 + prototype S10 |
| FR-LG-S10-03 | Nút **"Gợi ý ngữ cảnh"** (phím `H`) — hiện gợi ý trước khi lật thẻ; không hiện đáp án | P0 | prototype S10 |
| FR-LG-S10-04 | Nút **"Lật thẻ xem đáp án"** (phím `Space`) — hiện mặt sau: **hanzi/từ + nghĩa + ví dụ câu + nút nghe** + ghi chú + badge độ ổn định FSRS (`S=…`) | P0 | FR-LG-05 + prototype S10 |
| FR-LG-S10-05 | Thanh **4 nút chấm FSRS**, mỗi nút hiện khoảng cách tới lượt ôn kế tiếp **đọc từ state FSRS** (server tính, client chỉ hiển thị) | P0 | FR-LG-03 + prototype S10 |
| FR-LG-S10-06 | Ghi `Review` + cập nhật `Card` (state, due, stability, difficulty, reps, lapses) **ngay khi bấm nút chấm** — mỗi lượt là 1 transaction | P0 | SPEC §3.2 S10 |
| FR-LG-S10-07 | Sidebar "Thống kê phiên": số **đã thuộc / đang học / đến hạn** + **Retention Rate** | P0 | prototype S10 |
| FR-LG-S10-08 | Panel "Phím tắt thao tác nhanh" + badge trạng thái Web Speech API của ngôn ngữ đang học | P0 | prototype S10 + NFR-07 |
| FR-LG-S10-09 | Hết thẻ → màn hình **"Đã ôn xong hôm nay"** + gợi ý ôn sớm hơn (SPEC §3.2 edge) | P0 | SPEC §3.2 S10 |
| FR-LG-S10-10 | Đóng phiên giữa chừng → giữ nguyên mọi lượt đã ôn; mở lại `/language/session` phải nối tiếp phiên đang dở | P0 | §6.4 edge case |

### 3.4 Thiết kế level 0 (chi tiết hoá SPEC §2.3.1)

#### 3.4.1 Tiếng Trung (zero → A1)

| Yếu tố | Xử lý ở level 0 trong feature này |
|---|---|
| Chữ viết | Mặt trước hiện **pinyin luôn** (có dấu thanh). **Hanzi là tuỳ chọn bật/tắt** (nút "Hiện chữ Hán Hanzi", mặc định tắt). Khi TTS không khả dụng → hanzi **bật cưỡng chế** (fallback R5). |
| 4 thanh điệu | Chỉ hiển thị trong **gợi ý** (chip thanh: `1` ˉ · `2` ˊ · `3` ˇ · `4` ˋ), **không** phải nội dung SRS, không phải câu hỏi ôn. |
| Hướng ôn 3 bước | **nghe → nhận dạng → sản sinh**. Bước 1 = nút nghe (TTS `zh-CN`). Bước 2 = chế độ `recognize` (mặc trước = pinyin → nhớ nghĩa). Bước 3 = chế độ `produce` → **Phase 2 (FR-LG-06, ngoài phạm vi)**. S10 ghi nhãn bước hiện tại để người học biết mình đang ở bước nào. |
| Từ vốn | **60 từ cốt lõi**, 6 nhóm × 10 từ (bảng §7.1). |
| Ngữ pháp | **10 mẫu câu** cơ bản (bảng §7.3) — dùng làm `example` của thẻ và làm pool cho bài luyện chủ động S11 (Phase 2). |
| Nghe | Web Speech API `zh-CN`, `rate 0.8` (chậm, người mới nghe). Không dùng dịch vụ trả phí (NFR-07). |

#### 3.4.2 Tiếng Anh (zero → A1)

| Yếu tố | Xử lý ở level 0 trong feature này |
|---|---|
| Chữ viết | Chỉ chữ cái Latin. **Phonics cơ bản** hiển thị trong gợi ý (mẫu 10 từ: nguyên âm `a/e/i/o/u`, nguyên âm dài, phụ âm ghép) — dạng nhãn tĩnh, không phải nội dung ôn. |
| Từ vốn | **60 từ cốt lõi**, 6 nhóm × 10 từ (bảng §7.2). |
| Ngữ pháp | **10 mẫu câu** (bảng §7.4). |
| Nghe | Web Speech API `en-US`, `rate 1.0`. |
| Cổng vào cho người Việt | Mỗi từ hiện **phiên âm gần đúng kiểu Việt** (`water` → "u-tờ-ờ") trong **2 tuần đầu kể từ lần ôn đầu tiên của thẻ**, sau đó **tắt dần** (mốc 14 ngày). Không có dữ liệu → hiện phiên âm cho tới khi thẻ được ôp lần đầu. |

> **Ghi chú data model:** `Card.hint` được dùng theo **ngôn ngữ khác nhau** — với `lang=en` là phiên âm kiểu Việt (tắt sau 14 ngày), với `lang=zh` là **gợi ý ngữ cảnh ngắn theo nhóm** (luôn bật). Comment trong `prisma/schema.prisma` phải ghi rõ điều này. Không thêm cột mới.

---

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-LG-01 | **Mobile-first** | S09, S10 dùng được ở 390px; 4 nút chấm xếp 2×2 ở `< 640px`, 4 cột ở `≥ 640px`; mọi nút chính nằm trong vùng ngón cái; bảng thẻ cuộn ngang (`overflow-x-auto`) không phá layout |
| NFR-LG-02 | **Tốc độ** | `/language` render server-side < 500ms (không gọi AI); `POST /api/srs/grade` < 100ms (1 transaction SQLite); phím `1`–`4` phản hồi tức thì (optimistic UI, reconcile sau) |
| NFR-LG-03 | **Offline** | Toàn bộ feature hoạt động khi mất mạng; ghi được `Review`/`Card` vào SQLite; **không** gọi API bên ngoài (không AI) |
| NFR-LG-04 | **Privacy** | Dữ liệu học chỉ nằm trong SQLite cục bộ; export JSON là file người dùng tự tải |
| NFR-LG-05 | **Ngôn ngữ** | Giao diện **tiếng Việt**; nội dung học `zh-Hans` + `en-US`; validate `lang` ∈ {zh, en} ở **mọi** biên API; `mode` ∈ {recognize, recall, produce} |
| NFR-LG-06 | **A11y** | Tương phản ≥ WCAG AA; điều hướng bàn phím đầy đủ; `aria-label` cho mọi icon-only button; `aria-keyshortcuts` khai báo `Space`, `R`, `H`, `1`–`4`; `aria-live="polite"` cho thông báo trạng thái phiên |
| NFR-LG-07 | **Không phụ thuộc ngoài** | TTS dùng `window.speechSynthesis` của trình duyệt; **không** dịch vụ phát âm trả phí; không CDN audio |
| NFR-LG-08 | **Dữ liệu** | Xuất JSON **self-contained**: đủ để dựng lại kho thẻ + state + lịch sử review |
| NFR-LG-09 | **An toàn key** | Feature này **không** dùng `ANTHROPIC_API_KEY` → không có rủi ro lộ key |
| NFR-LG-10 | **Không AI trong nội dung nền tảng** | Từ vựng, mẫu câu, ghi chú, phiên âm Việt **không** được sinh bởi model; tất cả nằm trong file seed tĩnh (R6) |
| NFR-LG-11 | **Không hardcode số liệu trong UI** | Mọi số S09/S10 đọc từ DB; prototype chỉ là tham chiếu bố cục |

---

## 5. Mô hình dữ liệu

Feature dùng 3 model: `Card`, `Review` (đã có trong SPEC §4) + **1 model bổ sung** `SrsSession` (xem §5.2).
> **Registry:** `.kiro/steering/data-model-registry.md` §3 — `SrsSession` = **`M1` (đề xuất, chờ duyệt)**,
> `LanguagePattern` = **`M2` (đề xuất, chờ duyệt)**.
> ⚠️ **Cả 2 đang ở trạng thái đề xuất — chưa phải quyết định.** Nếu chưa được duyệt:
> M1 → lưu queue phiên ôn vào `localStorage` + dùng `Card.reps`/`due`; M2 → hằng số trong
> `src/lib/seed/patterns.ts`. Task tương ứng trong `tasks.md` phải có nhánh dự phòng này.

### 5.1 `Card` — thẻ ôn (SPEC §4, không đổi cấu trúc)

| Model | Field | Kiểu | Ghi chú trong feature này |
|---|---|---|---|
| `Card` | `id` | String (cuid) | — |
| | `lang` | String | `zh` \| `en`. **Chỉ 2 giá trị** (P5) |
| | `front` | String | zh: pinyin có dấu thanh (`nǐ hǎo`) · en: từ Latin (`water`) |
| | `frontAlt` | String? | zh: hanzi (`你好`) · en: null (không dùng) |
| | `back` | String | nghĩa tiếng Việt (`Xin chào`) |
| | `note` | String? | **ghi chú** ngữ cảnh — hiển thị ở **mặt sau** |
| | `example` | String? | **ví dụ câu** — hiển thị ở mặt sau + nút nghe câu |
| | `examplePinyin` | String? | zh: pinyin của ví dụ câu (`Nǐ hǎo, hěn gāoxìng rènshi nǐ`) |
| | `hint` | String? | zh: gợi ý ngữ cảnh ngắn · en: **phiên âm kiểu Việt** (tắt sau 14 ngày) |
| | `group` | String? | nhóm chủ đề — **phải khớp** `LANG_GROUPS[lang][i].id` |
| | `mode` | String | `recognize` \| `recall` \| `produce`; seed Phase 1 dùng `recognize` cho 120 thẻ |
| | `cardState` | **Json** | **state FSRS** theo schema `FsrsCardState` (§5.3) |
| | `due` | DateTime | ngày hạn ôn (denormalized từ `cardState.due`) — phục vụ truy vấn |
| | `stability` | Float | S (denormalized) |
| | `difficulty` | Float | D (denormalized) |
| | `reps` | Int | số lượt ôn |
| | `lapses` | Int | số lần trượt (rating `Again` khi đã từng học) |
| | `createdAt` | DateTime | mốc bắt đầu "cửa sổ 2 tuần" của phiên âm Việt |
| | `reviews` | relation | 1-n → `Review` |
| | `@@index([lang, due])` | index | phục vụ truy vấn "thẻ đến hạn theo ngôn ngữ" |

### 5.2 `Review` & `SrsSession`

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `Review` | `id` | String | — |
| | `cardId` | String | FK → `Card`, `onDelete: Cascade` |
| | `rating` | Int | `1`=Again `2`=Hard `3`=Good `4`=Easy |
| | `state` | **Json** | snapshot state FSRS **sau** lượt ôn (audit + rebuild) |
| | `at` | DateTime | thời điểm ôn (chuẩn hoá ngày local khi tính streak) |
| `SrsSession` *(bổ sung)* | `id` | String | — |
| | `lang` | String | `zh` \| `en` — phiên **không** trộn 2 ngôn ngữ |
| | `cardIds` | Json | mảng id thẻ của phiên (snapshot thứ tự) — khóa queue |
| | `plannedCount` | Int | số thẻ dự kiến (≤ 20) |
| | `reviewedCount` | Int | số thẻ đã chấm trong phiên |
| | `status` | String | `active` \| `done` \| `abandoned` |
| | `startedAt` / `endedAt` | DateTime | timer phiên |

> **Vì sao cần `SrsSession`:** SPEC §4 đóng băng 19 model và không có bảng session cho SRS. Nhưng 3 yêu cầu bắt buộc không thể đạt được nếu không có: (1) **queue ổn định** trong phiên (thẻ đã lấy không bị đổi giữa chừng), (2) **khôi phục phiên dang dở** khi đóng tab (FR-LG-S10-10), (3) **đếm `3/12 thẻ`** khớp với những gì đã ôn. `SrsSession` là model **bổ sung, không sửa** 19 model hiện có. Được ghi vào SPEC §4 ở lần cập nhật tiếp theo.

### 5.3 Schema JSON của state FSRS (`Card.cardState`)

Lưu **nguyên state FSRS** dưới dạng JSON, có bọc version để migrate được:

```jsonc
{
  "version": 1,
  "due": "2026-10-31T00:00:00.000Z",
  "stability": 4.2,
  "difficulty": 6.1,
  "scheduledDays": 4,
  "learningSteps": 0,
  "reps": 3,
  "lapses": 0,
  "state": 2,              // 0=New 1=Learning 2=Review 3=Relearning
  "lastReview": "2026-10-27T02:14:00.000Z"
}
```

Quy tắc:

1. `Card.due` / `stability` / `difficulty` / `reps` / `lapses` là **denormalized** từ `cardState` — ghi cùng 1 transaction, luôn bằng nhau. Nếu lệch → coi `cardState` là nguồn sự thật và tự đồng bộ khi đọc.
2. `cardState` là **nguồn sự thật**; cột riêng chỉ phục vụ truy vấn/index.
3. `due` trong JSON lưu **ISO-8601 UTC**; so sánh ngày để tính streak dùng ngày **local** (chuyển qua `src/lib/dates.ts`).

### 5.4 Truy vấn chính

```sql
-- S09: số đếm theo trạng thái, mỗi ngôn ngữ
--   New        → reps = 0
--   Learning   → reps > 0 AND (cardState.state IN (1,3) OR stability < 21)
--   Mastered   → cardState.state = 2 AND stability >= 21
SELECT lang,
       COUNT(*)                                                   AS total,
       SUM(CASE WHEN reps = 0 THEN 1 ELSE 0 END)                 AS unseen,
       SUM(CASE WHEN reps > 0 AND (state IN (1,3) OR stability < 21) THEN 1 ELSE 0 END) AS learning,
       SUM(CASE WHEN state = 2 AND stability >= 21 THEN 1 ELSE 0 END) AS mastered,
       SUM(CASE WHEN due <= :now THEN 1 ELSE 0 END)              AS due
FROM Card
GROUP BY lang;

-- S09: streak ngày ôn riêng từng ngôn ngữ (ngày local)
SELECT c.lang, DATE(r.at, 'localtime') AS day, COUNT(*) AS reviews
FROM Review r JOIN Card c ON c.id = r.cardId
WHERE r.at >= :since
GROUP BY c.lang, day
ORDER BY day DESC;

-- S10 / FR-LG-04: queue phiên — thẻ đến hạn trước (sớm hạn nhất trước)
SELECT id FROM Card
WHERE lang = :lang AND due <= :now AND cardState.state != 0
ORDER BY due ASC, createdAt ASC
LIMIT :maxCards;

-- S10 / FR-LG-04: bổ sung thẻ mới từ nhóm chưa học (ít thẻ đã học nhất trước)
SELECT id FROM Card
WHERE lang = :lang AND reps = 0
ORDER BY (SELECT COUNT(*) FROM Card c2
          WHERE c2.lang = Card.lang AND c2.group = Card.group AND c2.reps > 0) ASC,
         createdAt ASC
LIMIT :remaining;

-- S09: bảng kho thẻ + filter
SELECT id, front, frontAlt, back, lang, group, stability, difficulty, reps, lapses, due
FROM Card
WHERE (:lang IS NULL OR lang = :lang)
  AND (:group IS NULL OR "group" = :group)
  AND (:status IS NULL
       OR (:status = 'due'      AND due <= :now)
       OR (:status = 'learning' AND reps > 0 AND (state IN (1,3) OR stability < 21))
       OR (:status = 'mastered' AND state = 2 AND stability >= 21)
       OR (:status = 'lapse'    AND lapses > 0))
  AND (:q IS NULL OR front LIKE :q OR frontAlt LIKE :q OR back LIKE :q)
ORDER BY due ASC
LIMIT :pageSize OFFSET :offset;
```

### 5.5 Ràng buộc & quan hệ

| Ràng buộc | Giá trị |
|---|---|
| `lang` | ∈ {`zh`, `en`} — validate Zod ở mọi route |
| `mode` | ∈ {`recognize`, `recall`, `produce`} |
| `group` | ∈ `LANG_GROUPS[lang].map(g => g.id)` (6 nhóm/ngôn ngữ) |
| Tổng thẻ seed | 60 zh + 60 en = **120** (FR-LG-10) |
| Tổng mẫu câu seed | 10 zh + 10 en = **20** |
| Số thẻ tối đa/phiên | **20** (`SRS_SESSION_MAX_CARDS`, `src/lib/config.ts`) |
| Ngưỡng "đã thuộc" | `stability >= 21` ngày (chuẩn FSRS mature) |
| Cửa sổ phiên âm Việt (en) | 14 ngày kể từ lượt ôn đầu tiên của thẻ |
| Streak | chuỗi ngày **local** liên tiếp có ≥ 1 `Review` của ngôn ngữ đó |

---

## 6. Giao diện & hành vi

### 6.1 Bố cục — S09 Trung Tâm Ôn Tập Ngoại Ngữ SRS (`/language`)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [FR-LG-01] / MÔ-ĐUN TRÍ NHỚ DÀI HẠN  ●  [Thuật toán: FSRS v4.5 (ts-fsrs)]       │
│ [SQLite Cục bộ (Offline)]                                     ⬇ Xuất Deck JSON   │
│                                                                    ＋ Thêm thẻ     │
│ Trung Tâm Ôn Tập Ngoại Ngữ SRS                                                     │
│ Quản lý chu kỳ phân rã r-memory và tối ưu khoảng cách ôn tập theo mô hình FSRS.    │
│ Cấp độ hiện tại: Level 0 (Zero → A1).                                           │
├───────────────────────┬───────────────────────┬──────────────────────────────────┤
│ [ZH] Tiếng Trung      │ [EN] Tiếng Anh        │ HÔM NAY CẦN XỬ LÝ               │
│      (zh-CN)          │      (en-US)          │ Ước tính ~6 phút                  │
│ Giản thể · Pinyin HSK1│ Oxford 3000 Core·A1-A2│ 21 thẻ FSRS đã chạm ngưỡng nhớ   │
│ 🔥 14 ngày            │ 🔥 11 ngày            │ hạn                               │
│ ┌────────┬────────┬───┐│ ┌────────┬────────┬──┐│ Hoàn tất sớm trước 23:59 để giữ  │
│ │Đang học│Đã thuộc│Đến││ │Đang học│Đã thuộc│Đế││ nhịp R=0.90 và tối đa hóa độ bền  │
│ │   24   │   18   │hạn││ │   31   │   22   │hạ││ bộ nhớ FSRS.                     │
│ │        │        │12 ││ │        │        │9 ││                                  │
│ └────────┴────────┴───┘│ └────────┴────────┴──┘│ ┌────────────────────────────┐  │
│ ⚠ Cần giải phóng hàng  │ ✓ Trạng thái ổn định   │ │ ▶ Bắt đầu phiên ôn tập hôm   │  │
│   đợi                  │ Tỷ lệ nạp 82%          │ │   nay (21 thẻ đến hạn)        │  │
│ Tỷ lệ nạp 75%          │                        │ │ └────────────────────────────┘  │
├───────────────────────┴───────────────────────┴──────────────────────────────────┤
│ ▣ 6 Nhóm Từ Vựng Cốt Lõi Level 0      [Phụ lục B · HSK1 / CEFR A1 Pre]          │
│ Đã mở khóa 6/6 cụm hạt nhân                                                   │
│ ┌ CỤM 01 ─────────────┐┌ CỤM 02 ─────────────┐┌ CỤM 03 (cảnh báo) ─────┐      │
│ │ ✓ 100% Thuộc        ││ ↗ 85% Thuộc          ││ ⚠ 60% Thuộc            │      │
│ │ Chào hỏi & Xã giao   ││ Người & Thân xã      ││ Đồ ăn & Đồ uống       │      │
│ │ 你好, 谢谢, 再见…    ││ 爸爸, 妈妈, 朋友…    ││ 茶, 米饭, 水…          │      │
│ │ 6/6 thẻ làm chủ  S=18.4d│ 12 thẻ · 2 đang củng cố  S=11.2d│ ● 2 thẻ sai gần  │
│ │ ████████████████ 100%│ ██████████████░░ 85% │ ██████████░░░░░░ 60%  │      │
│ └──────────────────────┘└─────────────────────┘└────────────────────────┘      │
│ ┌ CỤM 04 ─────────────┐┌ CỤM 05 ─────────────┐┌ CỤM 06 (mới mở khóa) ──┐      │
│ │ 40% Thuộc            ││ 30% Thuộc            ││ Mới mở khóa             │      │
│ │ Địa điểm & Phương hướng│ Thời gian & Lịch trình│ Động từ & Phó từ cốt lõi│     │
│ │ 家, 学校, 医院…       ││ 今天, 明天, 几点…    ││ 去, 吃, 看, 想…         │      │
│ │ 8 thẻ · 4 đến hạn S=4.8d│ 10 thẻ · Khởi tạo FSRS S=2.1d│ 14 thẻ · Chưa nạp SRS│ │
│ │ ████████░░░░░░░░ 40% │ ██████░░░░░░░░░░░ 30%│ █░░░░░░░░░░░░░░░ 8%  │      │
│ └──────────────────────┘└─────────────────────┘└────────────────────────┘      │
├─────────────────────────────────────────────┬────────────────────────────────────┤
│ Kho Thẻ Từ Vựng & Chỉ Số FSRS    [Tổng 55  │ ▣ Chỉ Số Ghi Nhớ FSRS   [Mục tiêu │
│ Tra cứu độ ổn định (S), độ khó (D), số vòng │   90%]                              │
│ lặp và lỗi nhớ                      thẻ đã  │ ┌────────────────────────────────┐ │
│ [🔍 Tìm theo Pinyin, Hanzi, Tiếng Anh, hoặc│ │ Tỷ lệ giữ lại thực tế   94.2%  │ │
│     Nghĩa tiếng Việt...]                 │ │                        ▲ +4.2%  │ │
│ [Tất cả][Đến hạn (21)][Đang học (55)]     │ │            psychology            │ │
│ [Đã thuộc (40)][Trượt/Lapse (2)]          │ └────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │ Đường cong phân rã R(t)              │
│ │Mặt Trước│Mặt Sau│S   │D  │Rep│L│Hạn │ │ (SVG: 4 nhịp + điểm hiện tại)      │
│ │ (Target) │(Nghĩa) │    │   │s  │ap│ôn  │ │ Lần 1 · Lần 2(+3d) · Lần 3(+8d)   │
│ ├──────────┼────────┼────┼───┼───┼──┼─────┤ │ Hiện tại (S=18d)                   │
│ │ ● 茶     │Trà, chè│1.4d│6.8│5  │2 │Hôm nay│ └────────────────────────────────┘ │
│ │   chá    │        │    │   │   │  │(error)│ Request Retention 0.90 · Max Interval│
│ │ ● 米饭   │Cơm    │2.0d│7.2│4  │1 │Hôm nay│ 365d · W-Vector 19-params · Decay │ │
│ │   mǐ fàn │        │    │   │   │  │      │ 0.5                                │
│ │ ● 你好   │Xin chào│24.5│2.1│8  │0 │18 ngày │                                 │
│ │   nǐ hǎo│        │ d  │   │   │  │ nữa  │ ▣ Khuyến nghị từ Daily Loop AI      │
│ │ ● 谢谢   │Cảm ơn  │19.2│2.4│7  │0 │14 ngày│ 2 thẻ Lapse ở cụm "Đồ ăn" (茶, 米饭)│
│ │   xiè xie│        │ d  │   │   │  │ nữa   │ → Mở bài luyện ngữ cảnh liên quan  │
│ │ ● 医院   │Bệnh viện│4.1│5.4│3 │0 │Hôm nay│                                 │
│ │   yī yuàn│        │ d  │   │   │  │(error)│                                 │
│ │ ● Tomorrow│Ngày mai│12.0│3.0│6│0 │8 ngày │                                 │
│ │   /təˈmɒr.əʊ/ ·en-US│ d │   │   │  │ nữa   │                                 │
│ └──────────┴────────┴────┴───┴───┴──┴─────┘                                 │
│ Hiển thị 6 / 55 thẻ …   [‹ Trước]  1 / 10  [Sau ›]                           │
└─────────────────────────────────────────────┴────────────────────────────────────┘
```

### 6.2 Bố cục — S10 Phiên ôn 1 thẻ (`/language/session`)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [translate Tiếng Trung (zh-CN) · Level 0] [Nhóm: Chào hỏi & Xã giao]            │
│ [● FSRS-v4 Active]                                                               │
│ ●●●○○○○○○○   3/12 thẻ                                [⏱ Thời lượng: 04:18] [⏸]  │
├─────────────────────────────────────────────────────────┬────────────────────────┤
│ ▣ memory  KÍCH HOẠT GỢI NHỚ (ACTIVE RECALL)            │ Thống kê phiến?  analytics│
│                                  [👁 Hiện chữ Hán Hanzi]│ Thống kê phiên          │
│                                                          │ ┌────────┬────────┬───┐ │
│            nǐ hǎo   🔊                                   │ │   18   │   24   │12 │ │
│            (你好)      ← hanzi chỉ hiện khi bật toggle  │ │Đã thuộc│Đang học│Đến│ │
│                                                          │ │        │        │hạn│ │
│  Nghĩa của từ này trong giao tiếp hàng ngày là gì?      │ └────────┴────────┴───┘ │
│  ┌ Gợi ý ngữ cảnh ──────────────────────────┐           │ Độ duy trì trí nhớ mục   │
│  │ 💡 Từ ghép gồm đại từ ngôi thứ hai (nǐ) và│           │ tiêu (Retention Rate)   │
│  │    tính từ mang nghĩa tốt lành (hǎo), thường│         │              91.4%      │
│  │    dùng khi vừa chạm mặt ai đó.              │         │ ~~~~sparkline~~~~        │
│  └───────────────────────────────────────────┘           │                        │
│                                                          │ ▣ Phím tắt thao tác nhanh│
│ [💡 Xem gợi ý ngữ cảnh]        [⇄ Lật thẻ xem đáp án (Space)]│ Lật thẻ    Space  │
├─────────────────────────────────────────────────────────┤ Nghe phát âm  R       │
│ Đáp án:  你好 · Xin chào        [Tính ổn định FSRS: S=4.2d]│ Đánh giá FSRS 1/2/3/4│
│ ┌ Mẫu câu thực tế ─────────────────────────┐           │ Gợi ý ngữ cảnh   H     │
│ │ MẪU CÂU THỰC TẾ                  [🔊 Nghe câu]│        │                        │
│ │ 你好，很高兴认识你。                       │           │ ▣ Web Speech API zh-CN ●│
│ │ Nǐ hǎo, hěn gāoxìng rènshi nǐ              │           │ Bộ phát âm giọng chuẩn │
│ │ Xin chào, rất vui được gặp bạn.             │           │ offline đã kích hoạt…   │
│ └────────────────────────────────────────────┘           │                        │
│ ⓘ Ghi chú ngữ cảnh: Cách chào cơ bản nhất, dùng mọi thời│                        │
│   điểm trong ngày cho bạn bè, đối tác hoặc người mới quen.│                     │
├─────────────────────────────────────────────────────────┤                        │
│ ĐÁNH GIÁ KHẢ NĂNG HỒI TƯỞNG (FSRS SCHEDULE)  [1][2][3][4]│                       │
│ ┌────────────┬────────────┬────────────┬────────────┐   │                        │
│ │ Again    1 │ Hard     2 │ Good     3 │ Easy     4 │   │                        │
│ │ Lặp lại    │ Ôn sau     │ Ôn sau     │ Ôn sau     │   │                        │
│ │ trong 1′   │ 10 phút   │ 4 ngày     │ 9 ngày     │   │                        │
│ └────────────┴────────────┴────────────┴────────────┘   │                        │
│  ↑ 4 nút: nền surface-container, hover đổi nền theo màu mức đánh giá            │
│    (error → tertiary → primary → secondary), khoảng cách đọc từ state FSRS     │
└─────────────────────────────────────────────────────────┴────────────────────────┘
```

> **Lưu ý về nhãn trên 4 nút:** prototype ghi cứng "1 phút / 10 phút / 4 ngày / 9 ngày". Trong bản cài đặt, **4 nhãn này luôn được tính từ `scheduler.repeat()`** theo state thật của thẻ (xem `design.md` §3.3). Giá trị prototype chỉ là ví dụ minh hoạ.

### 6.3 Bảng thành phần

#### S09

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header banner | chip `FR-LG-01`, chip "Mô-đun Trí nhớ Dài hạn", chip thuật toán, chip "SQLite Cục bộ (Offline)", tiêu đề | chip `font-label-sm text-label-sm px-2 py-0.5 rounded bg-primary/10 text-primary` · chip neutral `bg-surface-container text-on-surface-variant` · h1 `font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight` · mô tả `font-body-sm text-body-sm text-on-surface-variant` | Chip thuật toán hiện **version thật** từ `scheduler.definition.model.name` — không hardcode "v4.5" |
| Action cluster | "Xuất Deck JSON", "Thêm thẻ thủ công" | `px-3.5 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md` · icon 18px `text-primary` / `text-tertiary` | Xuất → tải file `srs-deck-{date}.json` · Thêm thẻ → mở modal form |
| Deck card (zh) | badge `ZH`, tên, mô tả, streak, 3 metric, cảnh báo/tỷ lệ nạp | card `rounded-xl bg-surface-container p-space-lg shadow-md` · badge `w-8 h-8 rounded-lg bg-primary/10 text-primary` · metric grid `grid-cols-3 gap-2 p-space-sm rounded-lg bg-surface-container-lowest/80` · label `font-label-sm text-outline` · số `font-headline-sm text-headline-sm font-semibold` | Click → lọc bảng thẻ theo `lang`, mở S10 khi bấm CTA con |
| Deck card (en) | như trên | badge `bg-secondary/10 text-secondary` · card `bg-surface-container-low` (mờ hơn deck đang chọn) | Cùng hành vi |
| Streak chip | 🔥 N ngày | `px-2 py-0.5 rounded bg-tertiary/10 text-tertiary font-bold` + icon 14px `local_fire_department` | Tính riêng theo `lang` |
| Metric "Đến hạn" | số + đơn vị | số `text-error`, đơn vị `text-label-sm text-error/80` | Nhấn → lọc "Đến hạn" |
| Hero CTA | "HÔM NAY CẦN XỬ LÝ", số thẻ, mô tả, nút lớn | nền `bg-gradient-to-br from-surface-container to-surface-container-high` · nhãn `bg-primary/20 text-primary uppercase` · nút `w-full py-3.5 rounded-lg bg-primary hover:brightness-105 active:scale-[0.98] text-on-primary font-headline-sm font-bold` + icon 24px `play_arrow` | Điều hướng `/language/session?lang=<đến hạn nhiều hơn>` |
| Nhóm từ vựng | 6 card nhóm | card `p-space-md rounded-xl bg-surface-container shadow-sm` · card cảnh báo `bg-surface-container-high` · chip `CỤM 0N` `bg-primary/10 text-primary` / `bg-tertiary/10 text-tertiary` / `bg-surface-container-highest text-on-surface-variant` / `bg-secondary-container/40 text-secondary` · thanh `h-1.5 bg-surface-container-lowest` fill `bg-primary` / `bg-tertiary` / `bg-primary-fixed-dim` / `bg-secondary` | Click → lọc bảng thẻ theo `group` |
| Bảng kho thẻ | 7 cột | container `overflow-x-auto rounded-lg bg-surface-container-lowest` · header `bg-surface-container-high/60 text-outline font-label-sm uppercase tracking-wider` · dòng `hover:bg-surface-container/60` · chấm trạng thái `w-2 h-2 rounded-full` (`bg-error` đến hạn / `bg-tertiary` sắp hạn / `bg-primary` ổn định / `bg-secondary` ngôn ngữ khác) · số FSRS `font-mono` + `tabular-nums` | Sort theo `due` |
| Badge hạn ôn | "Hôm nay" / "18 ngày nữa" | đến hạn `bg-error-container/40 text-error` · tương lai `font-label-sm text-outline` | Đến hạn = `due <= hôm nay` |
| Filter chips | 5 chip | active `bg-primary text-on-primary font-bold` · inactive `bg-surface-container text-on-surface-variant hover:text-on-surface` · chip Lapse `text-error hover:bg-error-container/30` | Client filter, không reload trang |
| Ô tìm kiếm | 1 input | `bg-surface-container-lowest text-on-surface font-body-md pl-10 pr-4 py-2 rounded-lg` + icon `search` `text-outline` | Debounce 250ms, query server-side |
| Phân trang | "‹ Trước" · "1 / 10" · "Sau ›" | `px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface` · số trang `text-on-surface font-bold` | 20 thẻ/trang |
| Panel chỉ số FSRS | retention, đường cong R(t), tham số | card `rounded-xl bg-surface-container p-space-lg shadow-sm` · số lớn `font-display text-[40px] text-primary font-bold` · đường SVG `text-primary` / `text-tertiary` (nhịp) / `text-outline/40` (Ebbinghaus) · ô tham số `p-2 rounded bg-surface-container-lowest` + số `font-mono` | Tham số đọc từ wrapper `fsrs.ts` (runtime) |
| Khuyến nghị | gợi ý thẻ trượt + link S07 | icon `lightbulb text-tertiary` · link `text-primary hover:underline` | Nội dung **rule-based** (không AI) — tính từ `lapses` |

#### S10

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header phiên | badge ngôn ngữ, badge nhóm, badge scheduler, chấm tròn tiến trình, timer, nút tạm dừng | badge ngôn ngữ `px-2.5 py-1 rounded bg-secondary-container/40 text-secondary font-label-sm uppercase tracking-wider` + icon `translate` · badge nhóm `bg-surface-container text-on-surface-variant` · badge FSRS `bg-primary/10 text-primary` + chấm `animate-pulse` · chấm tròn `text-primary` (đã ôn) / `text-surface-variant` (chưa) · timer `px-3 py-1.5 rounded-lg bg-surface-container` + icon `timer text-tertiary` · nút pause `p-2 rounded-lg bg-surface-container` icon 18px | Chấm tròn = `index/total`; timer đếm tăng mỗi giây |
| Flashcard | mặt trước + mặt sau | nền `bg-surface-container-low rounded-xl p-space-xl shadow-md min-h-[460px]` · glow `bg-secondary/5 blur-3xl` · nhãn bước `font-label-sm text-on-surface-variant uppercase tracking-wider` + icon `memory` · nút toggle hanzi `px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high` + icon `visibility` 14px | Mặt sau hiện sau khi lật (`animate-fadeIn`), nền `bg-surface-container-high/60 -mx-space-xl -mb-space-xl p-space-xl rounded-b-xl` |
| Mặt trước (zh) | pinyin + nút nghe + hanzi (tuỳ chọn) | pinyin `font-headline-lg text-headline-lg text-primary tracking-wide` · nút nghe `w-10 h-10 rounded-full bg-primary-container/20 text-primary hover:bg-primary-container hover:text-on-primary` icon `volume_up` 22px · hanzi `text-4xl text-on-surface font-semibold tracking-wider px-4 py-1.5 rounded-lg bg-surface-container` | Pinyin **luôn** hiện; hanzi theo toggle |
| Mặt trước (en) | từ + nút nghe + phiên âm Việt | từ `font-headline-lg text-headline-lg text-primary` · phiên âm `font-code-md text-code-md text-tertiary` | Phiên âm chỉ hiện trong 14 ngày đầu |
| Câu hỏi gợi nhớ | prompt ôn | `font-body-lg text-body-lg text-on-surface-variant max-w-md` | Bản dịch theo `lang` (zh/en) |
| Gợi ý ngữ cảnh | box gợi ý | `w-full max-w-lg p-space-md rounded-lg bg-surface-container` · nhãn `text-tertiary` + icon `lightbulb` · nội dung `font-body-sm text-body-sm text-on-surface-variant` | Toggle bằng nút hoặc phím `H`; **không** chứa đáp án |
| Mặt sau | hanzi/từ + nghĩa + badge S + ví dụ + ghi chú | hanzi `text-3xl font-bold text-on-surface` · nghĩa `font-headline-sm text-headline-sm text-primary font-medium` · badge `px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm` · ví dụ `p-space-md rounded-lg bg-surface-container` + label `text-outline uppercase tracking-wider` + nút nghe `text-on-surface-variant hover:text-primary` · pinyin ví dụ `font-code-md text-code-md text-on-surface-variant` · ghi chú icon `info text-tertiary` | Nút nghe đọc **ví dụ câu** (không đọc từ đơn) |
| Hành động (chưa lật) | "Xem gợi ý ngữ cảnh" + "Lật thẻ xem đáp án (Space)" | ghost `px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant` + icon `lightbulb text-tertiary` · primary `px-5 py-2.5 rounded-lg bg-primary-container text-on-primary font-headline-sm font-semibold hover:brightness-105 active:scale-95` + icon `flip` · kbd `px-1.5 py-0.5 rounded bg-on-primary/20 font-code-md` | `Space` lật thẻ |
| Thanh 4 nút chấm | Again/Hard/Good/Easy + khoảng cách | nền `p-space-md rounded-lg bg-surface-container hover:<màu>/30 active:scale-[0.98]` · nhãn `font-headline-sm text-headline-sm font-semibold` theo mức (`text-error` / `text-tertiary` / `text-primary` / `text-secondary`) · chip phím `text-xs px-1 rounded bg-<màu>/15 font-code-md` · khoảng cách `font-label-sm text-label-sm text-on-surface-variant group-hover:text-<màu>` | Click hoặc phím `1`–`4` → `POST /api/srs/grade` |
| Sidebar thống kê | 3 ô + retention | ô `p-space-sm rounded-lg bg-surface-container` + số `font-headline-md text-headline-md font-bold` (`text-primary` / `text-tertiary` / `text-error`) + nhãn `font-label-sm text-on-surface-variant` · sparkline SVG `text-primary` | Số liệu đọc từ API, không hardcode |
| Panel phím tắt | 4 dòng | container `bg-surface-container-low rounded-xl p-space-lg` · tiêu đề icon `keyboard text-secondary` · dòng `flex justify-between py-1 border-b border-surface-container-high/40` · kbd `px-2 py-0.5 rounded bg-surface-container text-on-surface font-code-md` | Nội dung khớp §6.6 |
| Badge Web Speech | trạng thái TTS | icon tròn `w-8 h-8 rounded-full bg-primary/10 text-primary` + icon `graphic_eq` · nhãn `font-label-md font-semibold text-on-surface` · chấm `w-2 h-2 rounded-full` (`bg-primary` khả dụng / `bg-tertiary` fallback / `bg-error` lỗi) | Cập nhật sau `voiceschanged` |

### 6.4 Trạng thái & edge case

#### 6.4.1 Trạng thái S09

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Chưa seed | `Card` = 0 | Banner "Chưa có thẻ nào — chạy seed 120 thẻ" + hướng dẫn `npx prisma db seed` |
| Deck rỗng 1 ngôn ngữ | `lang=zh` = 0 thẻ | Deck card zh hiện 0/0/0 + nhãn "Chưa bật"; bấm → CTA "Bật ngôn ngữ này" (toggle `UserProfile.learningLangs`) |
| Không có thẻ đến hạn | `due count = 0` cả 2 ngôn ngữ | Hero CTA đổi thành "Hôm nay không có thẻ đến hạn" + nút phụ "Ôn sớm 5 thẻ" (lấy thẻ gần hạn nhất) |
| Lọc không kết quả | filter + query không khớp | "Không có thẻ nào khớp bộ lọc" + nút "Xoá bộ lọc" |
| TTS không khả dụng (R5) | không có voice `zh-CN` | Chip badge đổi `bg-tertiary/10 text-tertiary` "Web Speech: fallback pinyin + hanzi"; thẻ zh **hiện hanzi bật cưỡng chế** |
| Lỗi API | 500 / SQLite locked | Banner `bg-error-container/30 text-error` + nút "Thử lại"; **không** xoá dữ liệu đã tải |

#### 6.4.2 Trạng thái S10

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Đang tải thẻ | `GET /api/srs/next` đang chạy | Skeleton flashcard (`animate-pulse bg-surface-container`) |
| Chưa lật thẻ | `flipped = false` | Mặt trước + 2 nút hành động; 4 nút chấm **ẩn** (chưa biết đáp án) |
| Đã lật thẻ | `flipped = true` | Mặt sau + 4 nút chấm hiện khoảng cách |
| Đang ghi | `POST /api/srs/grade` đang chạy | Thẻ mờ `opacity-40 scale-[0.99]`, nút chấm disable |
| Hết thẻ | `index >= total` | "Đã ôn xong hôm nay" + số liệu phiên + nút "Về trung tâm ôn tập" + gợi ý "Ôn sớm hơn 1 ngày sẽ giữ nhịp" |
| Hết thẻ nhưng còn thẻ mới | không còn đến hạn, vẫn còn thẻ chưa học | "Đã ôn hết thẻ đến hạn — có N thẻ mới, học tiếp?" → nút "Học thẻ mới" |
| Phiên bị tạm dừng | bấm ⏸ | Overlay `bg-surface-container/95` "Phiên đã tạm dừng" + nút "Tiếp tục" / "Kết thúc phiên" |
| TTS lỗi | `speechSynthesis.speak` không phát | Toast `aria-live="polite"` "Không phát được âm thanh" + nút "Thử lại" |

#### 6.4.3 Edge case bắt buộc

| Case | Xử lý |
|---|---|
| **Hết thẻ đến hạn** | FR-LG-04: lấy **thẻ mới từ nhóm chưa học**. Thứ tự ưu tiên nhóm: nhóm có **ít thẻ đã học nhất** trước, sau đó theo thứ tự nhóm cố định, sau đó theo `createdAt`. Nếu không còn thẻ mới → kết thúc phiên (xem trạng thái "Hết thẻ"). |
| **Thẻ mới từ nhóm chưa học** | Nhóm được coi là "chưa học" khi **chưa thẻ nào** trong nhóm có `reps > 0`. Vẫn phải giữ **tổng ≤ 20 thẻ/phiên** (`SRS_SESSION_MAX_CARDS`). |
| **TTS không hỗ trợ `zh-CN`** (R5) | Phát hiện: `speechSynthesis.getVoices()` không có voice `lang.startsWith('zh')` sau sự kiện `voiceschanged` (timeout 1500ms). Xử lý: (1) ẩn nút nghe, (2) badge chuyển sang "Web Speech: fallback pinyin + hanzi", (3) **bật cưỡng chế hanzi** trên thẻ zh, (4) thẻ en dùng phiên âm Việt làm kênh đọc thay thế. Không crash, không chặn ôn. |
| **Phiên đóng giữa chừng** | Mỗi lượt chấm đã ghi `Review` + cập nhật `Card` **ngay** (1 transaction). `SrsSession.status` giữ `active`. Mở lại `/language/session` → API phục hồi phiên `active` gần nhất theo `lang`, hiện đúng `index/total` và **thẻ đang dở** (chưa chấm) — không mất lượt đã ôn. |
| **Đảo ngôn ngữ giữa phiên** | Phiên **đơn ngôn ngữ**. Khi người dùng đổi `lang` (deck khác trên S09 hoặc tham số `?lang=`): (1) phiên hiện tại được đánh dấu `abandoned`, (2) phiên mới được tạo cho ngôn ngữ mới, (3) **không** trộn thẻ zh/en trong cùng một phiên, (4) thẻ đã ôn ở phiên cũ vẫn giữ nguyên state. Lượt ôn đã ghi không bị mất. |
| Chấm 2 lần cùng 1 thẻ | Server trả `409` nếu `Review` đã tồn tại cho `cardId` + `sessionId` trong 3 giây gần nhất → client disable nút trong lúc đang ghi, không double-write |
| Đồng hồ lệch | `due` lưu UTC, mọi so sánh "hôm nay" dùng ngày **local** qua `src/lib/dates.ts` |
| Thẻ bị xoá giữa phiên | `onDelete: Cascade` xoá `Review`; session đã lưu `cardIds` → bỏ qua id không tồn tại, không crash |
| Import deck JSON sai format | `400` + thông báo "File không đúng định dạng deck SRS" + giữ nguyên dữ liệu hiện có |
| Người dùng tắt app giữa lượt ôn | Không mất dữ liệu — lượt chưa chấm không tính, lượt đã chấm đã ghi |

### 6.5 Bản phân ngôn ngữ — mặt trước / mặt sau

| | zh (Tiếng Trung) | en (Tiếng Anh) |
|---|---|---|
| **Mặt trước** | pinyin có dấu thanh (`nǐ hǎo`) + nút nghe `zh-CN`; hanzi theo toggle (mặc định tắt) | từ Latin (`water`) + nút nghe `en-US`; phiên âm Việt trong 14 ngày đầu |
| **Câu hỏi gợi nhớ** | "Nghĩa của từ này trong giao tiếp hàng ngày là gì?" | "Nghĩa của từ này trong giao tiếp hàng ngày là gì?" (bản tiếng Anh cho `en`) |
| **Mặt sau** | hanzi (`你好`) + nghĩa tiếng Việt + ví dụ câu (hanzi + pinyin + dịch) + nút nghe câu | từ + nghĩa tiếng Việt + ví dụ câu (en + dịch) + nút nghe câu |
| **Gợi ý** | gợi ý ngữ cảnh theo nhóm + chip 4 thanh điệu | phiên âm Việt + nhãn phonics cơ bản |
| **Ghi chú** | `Card.note` (tiếng Việt) | `Card.note` (tiếng Việt) |

### 6.6 Bảng phím tắt (S10)

| Phím | Hành động | Điều kiện | `aria-keyshortcuts` |
|---|---|---|---|
| `Space` | Lật thẻ / ẩn mặt sau | không lật ↔ đã lật | `Space` |
| `R` | Nghe phát âm (từ ở mặt trước; câu ví dụ ở mặt sau) | luôn | `R` |
| `H` | Bật/tắt gợi ý ngữ cảnh | luôn | `H` |
| `1` | Chấm **Again** | chỉ khi đã lật thẻ | `1` |
| `2` | Chấm **Hard** | chỉ khi đã lật thẻ | `2` |
| `3` | Chấm **Good** | chỉ khi đã lật thẻ | `3` |
| `4` | Chấm **Easy** | chỉ khi đã lật thẻ | `4` |

> Phím **không** hoạt động khi focus đang ở `INPUT`/`TEXTAREA`/`SELECT` (ô tìm kiếm, form thêm thẻ) hoặc khi `contentEditable`. Trên mobile không có bàn phím → mọi hành động có nút tương ứng.

---

## 6.9 Trình độ thật & 3 ngôn ngữ (Q2 · Q3)

> Nguồn chân lý: `.kiro/steering/user-profile-decisions.md` §3–§4.

| Ngôn ngữ | Mức khởi đầu | Mức seed | Deck SRS | Ghi chú |
|---|---|---|---|---|
| **Tiếng Anh** | `zero` | **`A1`** | ✅ 60 thẻ A1 (rút gọn) + 60 thẻ A2 | Biết "vài từ cơ bản" — deck A1 nên bắt đầu từ pronouns, numbers 1–10, days, greetings, `I am / My name is / I like / I want` |
| **Tiếng Trung** | `zero` | **`zero`** | ✅ 60 thẻ zero + 60 thẻ A1 | Chưa biết gì → pinyin luôn, hanzi bật/tắt, 4 thanh điệu từ đầu |
| **Tiếng Việt** | — | **`B2`** (bản ngữ) | ❌ **không có deck** | Chỉ dùng ở module giao tiếp (S07/S08/S11) — luyện nói/ghi chép, không học thuộc |

**Hệ level thống nhất:** `zero · A1 · A2 · B1 · B2 · C1 · C2` (CEFR đầy đủ + cột HSK tương ứng cho tiếng Trung).
Bỏ khái niệm "thang 5 mức nội bộ".

**Ràng buộc:**
- Module SRS **chỉ hỗ trợ `en` + `zh`** — `vi` không có thẻ, không xuất hiện trong S09/S10.
- `UserProfile.viLevel` (mặc định `B2`) chỉ dùng để AI biết **không cần dạy ngữ pháp tiếng Việt**.
- Seed deck ghi `Card.group` = `"zero" | "A1" | "A2"` để lọc theo band khi sinh bài kiểm tra (FR-LT-01).

## 7. Nội dung seed (FR-LG-10) — biên tập tay, KHÔNG AI sinh

> Nguồn: `SPEC.md` Phụ lục B. Phụ lục B ghi rõ: *"Danh sách trên là bản khởi đầu để review, chưa phải bản cuối"*. Bảng dưới đây là **bản chốt của feature này** — mọi sai lệch so với Phụ lục B đều được ghi ở §7.5 và **cần người biết ngôn ngữ duyệt** trước khi seed (R6).

### 7.1 Tiếng Trung — 6 nhóm × 10 từ (60 thẻ)

#### Nhóm 1 — Chào hỏi & Xã giao (`greeting`)

| # | Hanzi | Pinyin | Nghĩa | Gợi ý |
|---|---|---|---|---|
| 1 | 你好 | nǐ hǎo | Xin chào | thanh 3 + 3 · dùng mọi thời điểm |
| 2 | 谢谢 | xièxie | Cảm ơn bạn | thanh 4 + 4 (giảm nhẹ) |
| 3 | 再见 | zàijiàn | Tạm biệt | thanh 4 + 4 |
| 4 | 对不起 | duìbuqǐ | Xin lỗi | thanh 4 + 3 + 3 |
| 5 | 没关系 | méiguānxi | Không sao, không có gì | thanh 2 + 1 + 1 |
| 6 | 请 | qǐng | Làm ơn | thanh 3 · dùng trước động từ |
| 7 | 早上好 | zǎoshanghǎo | Chào buổi sáng | thanh 3 + 3 |
| 8 | 晚上好 | wǎnshanghǎo | Chào buổi tối | thanh 3 + 3 |
| 9 | 你好吗 | nǐ hǎo ma | Bạn khỏe không | câu hỏi thân mật |
| 10 | 很高兴认识你 | hěn gāoxìng rènshi nǐ | Rất vui được gặp bạn | dùng khi gặp lần đầu |

#### Nhóm 2 — Người & Thân xã (`people`)

| # | Hanzi | Pinyin | Nghĩa | Gợi ý |
|---|---|---|---|---|
| 1 | 我 | wǒ | Tôi | đại từ ngôi thứ nhất |
| 2 | 你 | nǐ | Bạn | đại từ ngôi thứ hai |
| 3 | 他 | tā | Anh ấy | đại từ nam |
| 4 | 她 | tā | Cô ấy | đại từ nữ · **cùng pinyin, khác hanzi** |
| 5 | 我们 | wǒmen | Chúng tôi | số nhiều |
| 6 | 爸爸 | bàba | Bố | thanh 4 + 0 (nhẹ) |
| 7 | 妈妈 | māma | Mẹ | thanh 1 + 0 |
| 8 | 哥哥 | gēge | Anh trai | thanh 1 + 0 |
| 9 | 弟弟 | dìdi | Em trai | thanh 4 + 0 |
| 10 | 朋友 | péngyou | Bạn bè | thanh 2 + 3 |

#### Nhóm 3 — Đồ ăn & Đồ uống (`food`)

| # | Hanzi | Pinyin | Nghĩa | Gợi ý |
|---|---|---|---|---|
| 1 | 水 | shuǐ | Nước | thanh 3 |
| 2 | 茶 | chá | Trà, chè | thanh 2 · dễ nhầm với "chá" tiếng Việt |
| 3 | 米饭 | mǐfàn | Cơm (đã nấu chín) | thanh 3 + 4 |
| 4 | 面条 | miàntiáo | Mì (bột) | thanh 4 + 2 |
| 5 | 肉 | ròu | Thịt | thanh 4 |
| 6 | 鱼 | yú | Cá | thanh 2 |
| 7 | 菜 | cài | Rau, món ăn | thanh 4 |
| 8 | 苹果 | píngguǒ | Táo | thanh 2 + 3 |
| 9 | 牛奶 | niúnǎi | Sữa | thanh 2 + 3 |
| 10 | 好吃 | hǎochī | Ngon | thanh 3 + 1 |

#### Nhóm 4 — Địa điểm & Phương hướng (`place`)

| # | Hanzi | Pinyin | Nghĩa | Gợi ý |
|---|---|---|---|---|
| 1 | 家 | jiā | Nhà | thanh 1 |
| 2 | 学校 | xuéxiào | Trường học | thanh 2 + 4 |
| 3 | 公司 | gōngsī | Công ty | thanh 1 + 1 |
| 4 | 中国 | Zhōngguó | Trung Quốc | tên riêng · viết Hoa |
| 5 | 医院 | yīyuàn | Bệnh viện | thanh 1 + 4 |
| 6 | 商店 | shāngdiàn | Cửa hàng | thanh 1 + 4 |
| 7 | 车站 | chēzhàn | Nhà ga | thanh 1 + 4 |
| 8 | 房间 | fángjiān | Phòng | thanh 2 + 1 |
| 9 | 公园 | gōngyuán | Công viên | thanh 1 + 2 |
| 10 | 中国人 | Zhōngguó rén | Người Trung Quốc | thanh 1 + 2 + 2 |

#### Nhóm 5 — Thời gian & Lịch trình (`time`)

| # | Hanzi | Pinyin | Nghĩa | Gợi ý |
|---|---|---|---|---|
| 1 | 今天 | jīntiān | Hôm nay | thanh 1 + 1 |
| 2 | 明天 | míngtiān | Ngày mai | thanh 2 + 1 |
| 3 | 昨天 | zuótiān | Hôm qua | thanh 3 + 1 |
| 4 | 早上 | zǎoshang | Buổi sáng | thanh 3 + 3 |
| 5 | 中午 | zhōngwǔ | Buổi trưa | thanh 1 + 3 |
| 6 | 晚上 | wǎnshang | Buổi tối | thanh 3 + 3 |
| 7 | 现在 | xiànzài | Bây giờ | thanh 4 + 4 |
| 8 | 一点 | yī diǎn | Một giờ (1h) | thanh 1 + 3 · "một giờ" |
| 9 | 星期 | xīngqī | Tuần, thứ trong tuần | thanh 1 + 1 |
| 10 | 年 | nián | Năm | thanh 2 |

#### Nhóm 6 — Động từ & Phó từ cốt lõi (`verb`)

| # | Hanzi | Pinyin | Nghĩa | Gợi ý |
|---|---|---|---|---|
| 1 | 是 | shì | Là | thanh 4 · động từ "là" |
| 2 | 不 | bù | Không | thanh 4 · phủ định |
| 3 | 有 | yǒu | Có | thanh 3 |
| 4 | 吃 | chī | Ăn | thanh 1 |
| 5 | 喝 | hē | Uống | thanh 1 |
| 6 | 学 | xué | Học | thanh 2 |
| 7 | 工作 | gōngzuò | Làm việc | thanh 1 + 4 |
| 8 | 去 | qù | Đi | thanh 4 |
| 9 | 来 | lái | Tới | thanh 2 |
| 10 | 很 | hěn | Rất | thanh 3 · đứng trước tính từ |

### 7.2 Tiếng Anh — 6 nhóm × 10 từ (60 thẻ)

#### Nhóm 1 — Pronouns & cơ bản (`pronoun`)

| # | Từ | Nghĩa | Phiên âm kiểu Việt |
|---|---|---|---|
| 1 | I | Tôi | "ai" |
| 2 | you | Bạn | "yu" |
| 3 | he | Anh ấy | "hi" |
| 4 | she | Cô ấy | "shi" |
| 5 | we | Chúng tôi | "uy" |
| 6 | they | Họ | "đây" |
| 7 | my | Của tôi | "mai" |
| 8 | your | Của bạn | "yo" |
| 9 | this | Cái này | "đís" |
| 10 | that | Cái kia | "đát" |

#### Nhóm 2 — Numbers & family (`numbers`)

| # | Từ | Nghĩa | Phiên âm kiểu Việt |
|---|---|---|---|
| 1 | family | Gia đình | "pha-mi-li" |
| 2 | mother | Mẹ | "mờ-đờ" |
| 3 | father | Bố | "pha-đờ" |
| 4 | sister | Chị / em gái | "sis-tờ" |
| 5 | brother | Anh / em trai | "bru-đờ" |
| 6 | baby | Em bé | "bây-bi" |
| 7 | parents | Bố mẹ | "pe-rờn-ts" |
| 8 | one | Một | "u-ờn" |
| 9 | two | Hai | "tu" |
| 10 | three | Ba | "tri" |

#### Nhóm 3 — Food & drink (`food`)

| # | Từ | Nghĩa | Phiên âm kiểu Việt |
|---|---|---|---|
| 1 | water | Nước | "u-tờ-ờ" |
| 2 | tea | Trà | "ti" |
| 3 | coffee | Cà phê | "cờ-phì" |
| 4 | rice | Cơm | "rai" |
| 5 | bread | Bánh mì | "brét" |
| 6 | fish | Cá | "phích" |
| 7 | meat | Thịt | "mi-tơ" |
| 8 | apple | Táo | "áp-pồ" |
| 9 | milk | Sữa | "mít" |
| 10 | egg | Trứng | "éc" |

#### Nhóm 4 — Places (`place`)

| # | Từ | Nghĩa | Phiên âm kiểu Việt |
|---|---|---|---|
| 1 | home | Nhà | "hôm" |
| 2 | school | Trường học | "sku-tơ" |
| 3 | work | Công việc | "uốc" |
| 4 | hospital | Bệnh viện | "hồ-s-pít-tồ" |
| 5 | shop | Cửa hàng | "chóp" |
| 6 | station | Nhà ga | "stây-sồn" |
| 7 | park | Công viên | "pát" |
| 8 | city | Thành phố | "sít-ti" |
| 9 | country | Quốc gia | "cần-tri" |
| 10 | room | Phòng | "rum" |

#### Nhóm 5 — Time (`time`)

| # | Từ | Nghĩa | Phiên âm kiểu Việt |
|---|---|---|---|
| 1 | today | Hôm nay | "tồ-đây" |
| 2 | tomorrow | Ngày mai | "tờ-mờ-rờ" |
| 3 | yesterday | Hôm qua | "yết-tờ-đây" |
| 4 | morning | Buổi sáng | "mờ-ninh" |
| 5 | afternoon | Buổi chiều | "af-tờ-nuôn" |
| 6 | evening | Buổi tối | "i-vờ-ninh" |
| 7 | night | Ban đêm | "nai-tơ" |
| 8 | now | Bây giờ | "nau" |
| 9 | year | Năm | "yia" |
| 10 | week | Tuần | "uíc" |

#### Nhóm 6 — Verbs & adjectives (`verb`)

| # | Từ | Nghĩa | Phiên âm kiểu Việt |
|---|---|---|---|
| 1 | be | Là, làm | "bi" |
| 2 | have | Có | "hắv" |
| 3 | go | Đi | "gô" |
| 4 | do | Làm | "đu" |
| 5 | like | Thích | "lai-kờ" |
| 6 | want | Muốn | "uôn-tơ" |
| 7 | eat | Ăn | "ít" |
| 8 | drink | Uống | "drinh-kờ" |
| 9 | read | Đọc | "ri-tơ" |
| 10 | write | Viết | "phai-tơ" |

### 7.3 Mẫu câu tiếng Trung (10)

| # | Mẫu câu | Pinyin | Dịch | Dùng làm `example` cho thẻ |
|---|---|---|---|---|
| 1 | 你好，我是… | Nǐ hǎo, wǒ shì… | Xin chào, tôi là… | 你好 (g1-01) |
| 2 | 这是… | Zhè shì… | Đây là… | 这是 (g1-10) |
| 3 | 我要… | Wǒ yào… | Tôi muốn… | 我要 (g6-03) |
| 4 | 我喜欢… | Wǒ xǐhuan… | Tôi thích… | 我喜欢 (g6-10) |
| 5 | 我不会… | Wǒ bù huì… | Tôi không biết… | 我不会 (g6-02) |
| 6 | …在哪里？ | …zài nǎlǐ? | … ở đâu? | 家 (g4-01) |
| 7 | …多少钱？ | …duōshao qián? | … bao nhiêu tiền? | 商店 (g4-06) |
| 8 | 我想学中文 | Wǒ xiǎng xué Zhōngwén | Tôi muốn học tiếng Trung | 学 (g6-06) |
| 9 | 你会说中文吗？ | Nǐ huì shuō Zhōngwén ma? | Bạn nói tiếng Trung được không? | 中文 (g6-08) |
| 10 | 谢谢你。 | Xièxie nǐ. | Cảm ơn bạn. | 谢谢 (g1-02) |

### 7.4 Mẫu câu tiếng Anh (10)

| # | Mẫu câu | Dịch | Dùng làm `example` cho thẻ |
|---|---|---|---|
| 1 | I am… | Tôi là… | I (g1-01) |
| 2 | My name is… | Tên tôi là… | my (g1-07) |
| 3 | I have… | Tôi có… | have (g6-02) |
| 4 | I like… | Tôi thích… | like (g6-05) |
| 5 | I want… | Tôi muốn… | want (g6-06) |
| 6 | This is… | Đây là… | this (g1-09) |
| 7 | What is…? | … là gì? | what (g6-04) |
| 8 | How are you? | Bạn thế nào? | you (g1-02) |
| 9 | Nice to meet you. | Rất vui được gặp bạn. | family (g2-01) |
| 10 | Thank you. | Cảm ơn bạn. | mother (g2-02) |

> Mỗi thẻ **không thuộc** 10 mẫu câu nào vẫn phải có `example` — đó là **một câu do người biên tập viết tay**, là hiện thực của một trong 10 mẫu trên với từ đích thay vào chỗ `…`. Mỗi thẻ ghi kèm `patternId` (1–10) để kiểm chứng được.

### 7.5 Sai lệch so với Phụ lục B — cần người duyệt

| # | Sai lệch | Lý do | Đề xuất |
|---|---|---|---|
| D1 | Phụ lục B "Tiếng Anh · Numbers & family" liệt kê **18 mục** (`one–ten` + 7 từ gia đình) nhưng chỉ được 10 ô/nhóm | 6 nhóm × 10 từ = 60 thẻ/ngôn ngữ là ràng buộc cứng của FR-LG-10 | Giữ **7 từ gia đình** (đối xứng nhóm "Người & Thân xã" của zh) + **3 số** (one/two/three). Số 4–10 hoãn sang deck mở rộng level 1 |
| D2 | Phụ lục B "Tiếng Anh · Verbs & adjectives" liệt kê **15 mục** | Vượt 10 ô | Giữ **10 động từ cốt lõi** (be/have/go/do/like/want/eat/drink/read/write). 5 tính từ (good/big/small/new/happy) hoãn sang level 1 |
| D3 | SPEC §2.3.1 nhắc `numbers 1–20` và `colors`, nhưng Phụ lục B không có nhóm màu | Xung đột giữa mô tả §2.3.1 và bảng seed | Bổ sung `colors` (red/blue/green/yellow/black/white) + `numbers 4–10` + 5 tính từ vào **deck mở rộng level 1** (không thuộc 120 thẻ level 0) |
| D4 | Tên nhóm trong prototype khác Phụ lục B | Prototype là mức ưu tiên thấp nhất | Dùng **id chuẩn** theo Phụ lục B; nhãn hiển thị lấy theo prototype (`Chào hỏi & Xã giao`, `Người & Thân xã`, `Đồ ăn & Đồ uống`, `Địa điểm & Phương hướng`, `Thời gian & Lịch trình`, `Động từ & Phó từ cốt lõi`) |
| D5 | SPEC §2.3.1 liệt kê 10 mẫu câu zh khác Phụ lục B ở mục `你好 / 我是…` | Hai danh sách trong cùng SPEC | Dùng **Phụ lục B** (10 mẫu, nằm trong bảng seed) |
| D6 | Prototype ghi "FSRS v4.5", "19-params", "Decay 0.5" | Bản prototype là minh hoạ, không phải bản cài đặt | Panel hiển thị **tham số runtime thật** từ `src/lib/fsrs.ts` |

> **Điều kiện chốt:** trước khi chạy `prisma db seed`, một người biết tiếng Trung & tiếng Anh phải ký xác nhận D1–D3. Nếu không, seed vẫn chạy được nhưng nội dung sẽ là bản **tạm** — ghi chú này vào file seed.

---

## 8. Hợp đồng API

Quy ước chung (steering `tech.md` §5): mọi route trả `{ ok: true, data }` hoặc `{ ok: false, error: { code, message } }`, validate input bằng **Zod**.

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| GET | `/api/language` | query: `lang=all\|zh\|en` (tuỳ chọn) | `{ ok, data: { languages: [{ lang, label, level, unseen, learned, learning, mastered, due, newAvailable, streak, groups: [{ id, label, total, mastered, masteredPct, avgStability, due, lapses }] }], totals: { due, learning, mastered, unseen, cards } } }` | `500` lỗi DB → `{ ok:false, error:{ code:"DB_ERROR" } }` |
| GET | `/api/language/cards` | query: `lang`, `group`, `status=all\|due\|learning\|mastered\|lapse`, `q`, `page` (≥1), `pageSize` (≤100), `format=json` (xuất deck) | `{ ok, data: { cards: [{ id, lang, front, frontAlt, back, note, example, examplePinyin, hint, group, mode, stability, difficulty, reps, lapses, due, state, lastReviewAt }], total, page, pageSize, pages } }` · `format=json` → file JSON tải xuống | `400` `status`/`page`/`pageSize` không hợp lệ |
| POST | `/api/language/cards` | body: `{ lang, front, frontAlt?, back, note?, example?, examplePinyin?, hint?, group, mode }` | `{ ok, data: { card } }` | `400` Zod (thiếu `lang`/`front`/`back`/`group`/`mode`, `group` không thuộc nhóm của `lang`, `mode` không hợp lệ) · `409` trùng `(lang, front, group)` |
| GET | `/api/srs/next` | query: `lang` (bắt buộc), `sessionId` (tuỳ chọn) | `{ ok, data: { sessionId, card: { id, lang, front, frontAlt, back, note, example, examplePinyin, hint, group, mode, stability, difficulty, reps, lapses, due, state, showHanzi, showHint }, index, total, startedAt, preview: { again: { due, days, label }, hard: {…}, good: {…}, easy: {…} } } }` | `404` không còn thẻ nào để ôn → `{ code:"NO_CARD" }` · `400` thiếu `lang` |
| POST | `/api/srs/grade` | body: `{ cardId, rating: 1\|2\|3\|4, sessionId?, elapsedMs? }` | `{ ok, data: { card: { id, due, stability, difficulty, reps, lapses, state }, index, total, nextPreview, sessionCompleted } }` | `400` `rating` ngoài 1–4 / thiếu `cardId` · `404` thẻ không tồn tại · `409` thẻ vừa được chấm (chống double-write) |
| POST | `/api/srs/session` | body: `{ lang, maxCards? (≤20), forceNew? (bool) }` | `{ ok, data: { sessionId, lang, cardIds: string[], total, dueCount, newCount, startedAt, resumed: boolean } }` | `400` `lang` không hợp lệ hoặc `maxCards > 20` · `404` không có thẻ nào để học |

**Ghi chú hợp đồng**

1. `preview` trả **khoảng cách tới lượt ôn kế tiếp** đã định dạng sẵn (`label`) cho từng mức chấm — tính **server-side** bằng `scheduler.repeat()` trên state thật của thẻ. Client **không** tự tính lại (nguồn sự thật duy nhất).
2. `POST /api/srs/session` là nơi **duy nhất** quyết định thứ tự thẻ (thuật toán chọn thẻ, `design.md` §3.4) → queue ổn định trong suốt phiên.
3. `GET /api/srs/next` không tạo phiên mới nếu đang có `sessionId` hợp lệ → dùng để **khôi phục phiên dang dở**.
4. `POST /api/srs/grade` ghi `Review` + cập nhật `Card` + cập nhật `SrsSession` trong **1 transaction**; trả `409` nếu cùng `cardId` đã có `Review` trong 3 giây gần nhất.

---

## 9. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-LG-1 — AC-4 (bắt buộc): SRS đúng thuật toán**
- *Given* một thẻ **mới** (`state = New`), *When* chấm **"Good"**, *Then* `Card.cardState` mới **đúng bằng** kết quả `scheduler.next(state, now, Rating.Good)` của `ts-fsrs` (so sánh từng field `stability`, `difficulty`, `scheduledDays`, `state`, `due`), và `Card.due`/`stability`/`difficulty` khớp `cardState`.
- *Given* một thẻ **đã học** (`reps ≥ 1`), *When* chấm **"Again"**, *Then* `lapses` **tăng 1**, `due` = **hôm nay** (local) và thẻ **quay lại** trong hàng đợi đến hạn của phiên hiện tại.
- *Given* 4 nút chấm, *When* thẻ đang ở màn hình, *Then* nhãn khoảng cách dưới mỗi nút **bằng** `preview` do server trả về (tính từ `scheduler.repeat()`), **không** phải giá trị hardcode trong UI.

**AC-LG-2 — Thứ tự lấy thẻ: đến hạn trước, thẻ mới sau (FR-LG-04)**
- *Given* 12 thẻ đến hạn và 30 thẻ chưa học ở ngôn ngữ `zh`, *When* bắt đầu phiên ôn, *Then* 12 thẻ đầu tiên trong `cardIds` **đều là thẻ đến hạn** (sắp theo `due` tăng dần) và 8 thẻ tiếp theo lấy từ **nhóm chưa học**.

**AC-LG-3 — Tối đa 20 thẻ/phiên (FR-LG-04)**
- *Given* 40 thẻ đến hạn, *When* bắt đầu phiên ôn, *Then* `total` = **20**, `cardIds.length` = **20**, và `SrsSession.plannedCount` = 20. Trang S10 hiện `1/20 thẻ`.

**AC-LG-4 — Hết thẻ đến hạn → lấy thẻ mới từ nhóm chưa học (FR-LG-04)**
- *Given* **không còn** thẻ đến hạn nhưng còn thẻ chưa học ở nhóm "Chào hỏi & Xã giao", *When* mở `/language/session?lang=zh`, *Then* phiên được tạo với các thẻ **chưa học của nhóm chưa học** và `newCount` > 0.
- *Given* **không còn** thẻ đến hạn **và không còn** thẻ chưa học, *When* mở `/language/session?lang=zh`, *Then* hiện màn hình "Đã ôn xong hôm nay" + gợi ý ôn sớm hơn, **không** crash.

**AC-LG-5 — Mặt trước / mặt sau đúng level 0 (FR-LG-05)**
- *Given* thẻ `zh`, *When* ở mặt trước, *Then* hiện **pinyin** (`nǐ hǎo`) + **nút nghe**, **không** hiện hanzi khi toggle đang tắt; *When* bật toggle → hanzi (`你好`) hiện; *When* lật thẻ → hiện **hanzi + nghĩa + ví dụ câu + nút nghe**.
- *Given* thẻ `en`, *When* ở mặt trước trong 14 ngày đầu, *Then* hiện **từ** + **nút nghe** + **phiên âm kiểu Việt**; *When* lật thẻ → hiện **từ + nghĩa + ví dụ + nút nghe**.

**AC-LG-6 — Tiến độ & streak riêng từng ngôn ngữ (FR-LG-09)**
- *Given* `zh` có 24 thẻ đang học · 18 đã thuộc · 12 đến hạn và `en` có 31 · 22 · 9, *When* mở `/language`, *Then* deck zh hiện đúng 24/18/12 và deck en hiện đúng 31/22/9 — **không** lẫn số của hai ngôn ngữ.
- *Given* người dùng ôn `zh` 3 ngày liên tiếp và `en` 1 ngày, *When* mở `/language`, *Then* streak zh = **3**, streak en = **1** (tính theo ngày local có `Review` của đúng ngôn ngữ đó).

**AC-LG-7 — Seed 120 thẻ, biên tập tay (FR-LG-10, R6)**
- *Given* database rỗng, *When* chạy `npx prisma db seed`, *Then* có đúng **60 thẻ `zh` + 60 thẻ `en` = 120 thẻ**, mỗi ngôn ngữ **6 nhóm × 10 thẻ**, và **20 mẫu câu** (10 zh + 10 en); mọi thẻ có `mode = "recognize"`, `cardState.state = 0`, `due` = ngày seed.
- *Given* file seed, *When* kiểm tra mã nguồn, *Then* **không** có lời gọi Anthropic SDK / không có lời gọi mạng nào trong `prisma/seed.ts` và file seed tĩnh.

**AC-LG-8 — TTS fallback khi thiếu `zh-CN` (R5)**
- *Given* trình duyệt **không** có voice `zh-CN`, *When* mở S10 với thẻ `zh`, *Then* badge chuyển sang "Web Speech: fallback pinyin + hanzi", nút nghe bị ẩn, **hanzi hiện bật cưỡng chế**, và người dùng vẫn ôn được (chấm 4 nút vẫn hoạt động, `Review` vẫn được ghi).

**AC-LG-9 — Phiên đóng giữa chừng không mất dữ liệu**
- *Given* đã ôn 3 lượt trong phiên `zh`, *When* đóng tab / tải lại trang, *Then* `GET /api/srs/next` trả về **cùng `sessionId`**, `index` = 3, và thẻ tiếp theo là thẻ chưa chấm; `Review` cho 3 lượt đã ôn vẫn còn nguyên trong DB.

**AC-LG-10 — Đổi ngôn ngữ giữa phiên không trộn thẻ**
- *Given* đang ôn phiên `zh`, *When* mở `/language/session?lang=en`, *Then* phiên `zh` được đánh dấu `abandoned`, phiên `en` mới được tạo, và `cardIds` của phiên `en` **không chứa** id thẻ `zh`; các lượt đã ôn ở phiên `zh` vẫn giữ nguyên state.

**AC-LG-11 — Thêm thẻ thủ công**
- *Given* người dùng bấm "Thêm thẻ thủ công", *When* nhập `lang=zh`, `front="ni3 hao3"`, `back="Xin chào"`, `group="greeting"`, `mode="recognize"` và bấm lưu, *Then* thẻ được tạo với `cardState` = state New và xuất hiện trong bảng kho thẻ.
- *Given* nhập `group="not-a-group"` cho `lang=zh`, *When* bấm lưu, *Then* API trả `400` với thông báo tiếng Việt nêu rõ nhóm hợp lệ và **không** ghi gì vào DB.

**AC-LG-12 — Xuất/nhập deck JSON (NFR-08)**
- *Given* 120 thẻ + lịch sử review, *When* bấm "Xuất Deck JSON", *Then* file tải xuống chứa đủ 120 thẻ **kèm `cardState`** và mọi `Review`; file import lại vào database trống phải cho lại **cùng số thẻ, cùng `due`, cùng `stability`**.

**AC-LG-13 — Offline (NFR-03)**
- *Given* thiết bị **không có mạng** và **không** có `ANTHROPIC_API_KEY`, *When* mở `/language`, ôn 5 thẻ và bấm "Thêm thẻ thủ công", *Then* **mọi** thao tác thành công, dữ liệu ghi vào SQLite, và **không** có lời gọi mạng nào được thực hiện.

**AC-LG-14 — A11y & mobile**
- *Given* viewport 390px, *When* mở S10, *Then* 4 nút chấm xếp **2×2**, nút "Lật thẻ" nằm trong vùng ngón cái, không có cuộn ngang ngoài ý muốn; mọi icon-only button có `aria-label`; `Space`/`R`/`H`/`1`–`4` khai báo trong `aria-keyshortcuts`; khi focus ở ô tìm kiếm thì phím tắt **không** kích hoạt.

---

## 10. Rủi ro riêng của feature

| # | Rủi ro | Xác suất | Tác động | Giảm thiểu |
|---|---|---|---|---|
| R5 | TTS/STT Web Speech API **không hỗ trợ `zh-CN`** trên một số thiết bị | Trung bình | Trung bình | Dùng `speechSynthesis` với fallback danh sách giọng; nếu không có → chỉ dùng **pinyin + hán tự** (bật hanzi cưỡng chế) — xem AC-LG-8 |
| R6 | AI sinh nội dung level 0 sai chuẩn | Trung bình | Cao | Seed **120 thẻ biên tập tay**, file tĩnh, **không** gọi AI. AI chỉ sinh bài luyện (S11/Phase 2), không sinh từ vựng nền. Cần người biết ngôn ngữ ký duyệt D1–D3 (§7.5) |
| R7 | Dữ liệu học rò rỉ ra ngoài máy | Thấp | Cao | Local-first (P6): toàn bộ tính năng không gọi API ngoài; export JSON là hành động chủ động của người dùng |
| R11 | **Đổi tham số FSRS giữa chừng** làm sai lệch toàn bộ lịch đã lưu | Trung bình | Cao | Tham số **đóng băng** trong `src/lib/fsrs.ts` (`FSRS_CONFIG`), không cho UI sửa. `cardState.version` cho phép migrate khi nâng phiên bản `ts-fsrs` |
| R12 | Học thuộc bằng cách đoán từ đầu tiên (guess) → FSRS tăng S oan | Trung bình | Trung bình | Mặt trước chỉ hiện **đích**, không hiện nghĩa trước khi lật; nút "Gợi ý ngữ cảnh" **không** chứa đáp án; đếm `lapses` khi rating `Again` để phát hiện lệch |
| R13 | Người dùng **bỏ phiên** vì 20 thẻ quá nhiều cho phiên 10′ | Trung bình | Trung bình | Hero CTA hiện "Ước tính ~6 phút" (ước tính theo 20s/thẻ); cho phép `maxCards` < 20; timer hiển thị; đóng phiên giữ được tiến độ |
| R14 | Số liệu S09 lệch với DB vì denormalize (`due`/`S`/`D`) | Thấp | Cao | `cardState` là nguồn sự thật; cột riêng chỉ phục vụ truy vấn; unit test bắt buộc kiểm tra đồng bộ 2 chiều |
| R15 | Phiên âm kiểu Việt "sai" gây mất ký ức âm thanh | Trung bình | Thấp | Cửa sổ 14 ngày + tắt dần; nhãn ghi rõ "gần đúng"; sau khi tắt, thẻ chỉ còn pinyin/từ + TTS |

---

## 11. Ngoài phạm vi của feature này

| Hạng mục | Lý do | Khi nào |
|---|---|---|
| FR-LG-06 — chế độ `produce` (gõ/nói + chấm fuzzy) | P2 | Phase 3 (STT) — §7 SPEC |
| FR-LG-07 — thẻ biến thể khi trượt | P2 | Phase 2 |
| FR-LG-08 — "Thêm vào ôn" từ bài viết | P2 | Phase 2 |
| S11 — luyện ngoại ngữ chủ động (viết / hội thoại AI) | AI-08/AI-09 | Phase 2 |
| S19–S21 — bài kiểm tra ngoại ngữ (đẩy thẻ sai về ôn) | Phase 1 nhưng feature riêng | Feature `language-placement-test` |
| Thứ tự bội (stroke order) | §2.3.1: chưa làm ở giai đoạn 0 | Phase sau |
| Deck mở rộng level 1 (số 4–10, 5 tính từ, màu) | D3 (§7.5) | Khi nâng level |
