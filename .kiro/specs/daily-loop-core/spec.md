# Daily Loop & Sinh Kế Hoạch AI

> **Màn hình:** S01 (`/`), S02 (`/plan`) · **Phase:** 0
> **Nguồn:** system-design/SPEC.md §0.1–§0.3, §2.1 (FR-DL-01..08), §3.2 (S01, S02), §4 (`PlanItem`/`Activity`/`Evidence`/`Skill`), §5.1 (AI-01), §5.2–§5.6, §8 (AC-1, AC-7) · prototype `system-design/s01_daily_loop_h_m_nay/`, `system-design/s02_sinh_k_ho_ch_ai_k_ho_ch_ng_y/`
> **Phụ thuộc:** `app-foundation`, `ai-foundation` (phải xong trước)
> **Ranh giới sở hữu:** feature này **sở hữu** model `PlanItem`, `src/lib/db.ts`, `src/lib/dates.ts`, `src/lib/config.ts`, `src/lib/plan.ts` (bộ sinh offline), `src/lib/daily-loop.ts`, toàn bộ route `/api/plan/**`, và UI S01 + S02. Feature `ai-foundation` **sử dụng** `src/lib/plan.ts` và `src/lib/db.ts` từ đây.

## 1. Tổng quan

`daily-loop-core` là **hạt nhân** của Daily Loop OS: hai màn hình quyết định ngày hôm nay của người dùng.

- **S01 — Daily Loop (`/`)** là trang chủ duy nhất của app (P1). Người dùng mở app lúc 7h sáng và phải thấy ngay 6 hành động nhỏ đã sẵn sàng, không phải phải suy nghĩ. Trang này vừa là **bảng điều khiển** (mục tiêu hạt nhân, sinh trắc, streak, năng lượng tuần, FSRS) vừa là **bảng hành động** (6 slot, đánh dấu xong, mở màn hình đích của từng slot).
- **S02 — Sinh kế hoạch AI (`/plan`)** là nơi người dùng **xem trước, sửa, kéo đổi và duyệt** 6 hành động do AI đề xuất, trước khi chúng trở thành kế hoạch chính thức của ngày.

Hai màn hình dùng chung **một cấu trúc dữ liệu duy nhất**: `PlanItem` (SPEC §4). Không có "kế hoạch nháp" riêng — bản nháp của S02 nằm trong state của client cho tới khi người dùng bấm *Duyệt & Áp dụng*, rồi mới ghi vào SQLite.

Feature thực hiện 4 nguyên tắc bất di bất dịch:

- **P1 — Một màn hình quyết định hôm nay.** S01 là trang chủ, không có dashboard nhiều tab; S02 là màn hình phụ để *duyệt kế hoạch*, không phải nơi sinh hoạt động.
- **P2 — Ghi nhập dưới 10 giây.** Nút *"+ Ghi nhanh (≤10s)"* và nút *Hoàn thành* trên từng slot mở Quick-log ngay lập tức (không chờ AI); AI chỉ điền sẵn phần còn lại sau đó.
- **P3 — Tiến độ = bằng chứng, không phải checkbox.** Bấm "Xong" trên slot **không** tăng `level` của kỹ năng; nó tạo `Activity` + `Evidence`. `level` chỉ tăng qua ngưỡng bằng chứng (thuộc feature `skill-tree-evidence`).
- **P6 — Local-first.** Không có `ANTHROPIC_API_KEY` thì vẫn lập được kế hoạch 6 slot bằng bộ sinh rule cục bộ (`src/lib/plan.ts`), `PlanItem.source = "fallback"`; **không** giả lập phản hồi AI.

Nguyên tắc P5 (đóng băng 4 domain) và P7 (không vanity metric) được ép ở tầng dữ liệu: `PlanItem.domain` chỉ nhận 4 giá trị, và mọi chỉ số trên S01 đều truy được về một kỹ năng hoặc một hành động cụ thể.

## 2. Bối cảnh & vấn đề

- **SPEC §0.1 — "ChatGPT (AI): không biết bạn đã làm gì, không có lịch sử, không đo được".** Nếu AI chỉ nhận prompt rời rạc thì nó sinh ra 6 gợi ý chung chung mỗi ngày. Muốn AI sinh kế hoạch *có nghĩa*, nó phải thấy: cây kỹ năng hiện tại, bằng chứng đã tích lũy, chỉ số sinh trắc hôm nay, 7 ngày gần nhất, và những slot hôm nay đã xong. Đó là lý do kế hoạch phải nằm trong DB từ đầu, không nằm trong cuộc trò chuyện.
- **SPEC §0.1 — "Habitica/Streaks: đếm số ngày, không tạo ra năng lực".** Vì vậy streak ở đây **không** phải số ngày mở app: nó là số ngày liên tiếp có **hành động thật** (`Activity`), và luôn đi kèm "năng lượng tuần" 0–100% để người dùng thấy chất lượng chứ không chỉ số đếm.
- **SPEC §2.1 — định dạng 6 slot cố định.** Nếu AI được tự chọn số slot hoặc domain, app biến thành "todo list AI" và mất đúng thứ làm nó hữu ích: 6 việc nhỏ, đúng 4 trục, hôm nay. AI chỉ được **điền nội dung**, không được **đổi cấu trúc**.
- **SPEC §0.1 — "Lỗi không được làm sập trang" (steering product §5).** Một lần gọi AI lỗi 429/refusal không được khiến người dùng mất kế hoạch hôm nay → luôn có đường lùi cục bộ.
- **R2 — friction ghi nhập → bỏ app tuần 2.** Mỗi hành động thêm trên S01 phải là 1–2 chạm; sinh lại kế hoạch là 1 chạm; duyệt kế hoạch là 1 chạm (hoặc `Ctrl+Enter`).

## 3. Yêu cầu chức năng

### 3.1 Daily Loop — S01 (FR-DL)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-DL-01 | Trang chủ hiển thị tối đa **6 hành động nhỏ** cho ngày hiện tại, đúng thứ tự, gắn nhãn domain. | P0 | FR-DL-01 |
| FR-DL-02 | Mỗi hành động có: nhãn domain, tiêu đề hành động, mô tả ngắn (≤120 ký tự), thời lượng dự kiến, kỹ năng liên quan (nếu có). | P0 | FR-DL-02 |
| FR-DL-03 | Bấm "Xong" trên 1 hành động → tự tạo `Activity` + `Evidence` (nếu gắn kỹ năng) + đánh dấu `PlanItem.done = true`. | P0 | FR-DL-03 |
| FR-DL-04 | Nút "Hoàn thành nhanh" mở Quick-log: chỉ cần chọn domain + gõ 3–5 ký tự mô tả, AI tự điền phần còn lại (kỹ năng, thời lượng, mức độ khó). | P0 | FR-DL-04 |
| FR-DL-05 | Hiển thị chuỗi ngày liên tiếp (streak) và "năng lượng tuần" (0–100%) tính từ tỷ lệ hoàn thành 7 ngày gần nhất. | P0 | FR-DL-05 |
| FR-DL-06 | Nút "Lập lại kế hoạch hôm nay" → gọi AI sinh lại 6 hành động, giữ nguyên các hành động đã xong. | P1 | FR-DL-06 |
| FR-DL-07 | Nếu chưa có kế hoạch trong ngày → hiển thị CTA "Lập kế hoạch hôm nay" (gọi AI) kèm fallback cục bộ khi không có API key. | P0 | FR-DL-07 |
| FR-DL-08 | Ngày mới không tự xóa kế hoạch cũ; lịch sử theo ngày, có thể xem lại bất kỳ ngày nào. | P1 | FR-DL-08 |

**FR-DL-04 — ranh giới với feature Quick-log.** Feature này **không** implement sheet Quick-log đầy đủ (thuộc feature `quick-log`). Ở đây chỉ mô tả phần thuộc S01:

| Phần | Thuộc feature này | Thuộc feature `quick-log` |
|---|---|---|
| Nút mở | ✅ "+ Ghi nhanh (≤10s)", nút *Hoàn thành* trên card slot, phím `Ctrl/Cmd + K` | — |
| Hợp đồng mở sheet | ✅ `openQuickLog(context)` — context gồm `{ date, slot?, domain? }` | Nhận context, dựng sheet |
| Sheet 2 bước (chọn domain + gõ mô tả) | — | ✅ |
| AI-02 autofill (domain/skill/minutes/difficulty) | Hợp đồng đầu vào/ra của `POST /api/log/autofill` | ✅ gọi + hiển thị |
| Ghi `Activity` + `Evidence` từ Quick-log | — | ✅ |
| `PlanItem.done = true` khi Quick-log gắn với 1 slot | ✅ (`POST /api/plan/[date]/complete` được gọi lại sau khi Quick-log lưu) | ✅ trigger |

### 3.2 Định dạng 6 slot cố định (AI chỉ điền nội dung)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-DL-SLOT-01 | Mọi kế hoạch ngày gồm **đúng 6 slot**, đánh số `slot` 0..5, theo thứ tự cố định. | P0 | SPEC §2.1, FR-AI-14 |
| FR-DL-SLOT-02 | Domain của mỗi slot **cố định theo vị trí**: `0=professional`, `1=communication`, `2=language`, `3=language`, `4=personal`, `5=personal`. AI không đổi được; server từ chối payload có domain lệch. | P0 | SPEC §2.1, P5 |
| FR-DL-SLOT-03 | Mỗi slot có **nội dung hành động** theo khung: slot 0 học chuyên môn (25–45′), slot 1 luyện giao tiếp (15–30′), slot 2 ôn ngoại ngữ SRS (10–20′), slot 3 luyện ngoại ngữ chủ động (15–25′), slot 4 nhật ký (5–10′), slot 5 chăm sóc thể chất & tinh thần (15–30′). | P0 | SPEC §2.1 |
| FR-DL-SLOT-04 | Tổng thời lượng cam kết trong ngày hiển thị được và nằm trong khoảng **90–150 phút**; khi người dùng sửa inline thời lượng, tổng được cân bằng lại và hiện cảnh báo nếu vượt khoảng. | P1 | prototype S02 ("Tổng lượng cam kết: 120 phút (Chuẩn P1)") |
| FR-DL-SLOT-05 | Bộ sinh offline (`src/lib/plan.ts`) phải ra **đúng 6 slot**, cùng domain theo vị trí, `source = "fallback"`, tiêu đề lấy từ tên kỹ năng. | P0 | FR-AI-19, AC-7 |

**Bảng định dạng slot (nguồn sự thật — dùng bởi schema Zod, fallback và UI):**

| Slot | Domain | Nội dung (kind) | Thời lượng | Nhãn UI (prototype) |
|---|---|---|---|---|
| 0 | `professional` | Học kỹ năng chuyên môn | 25–45′ | "Slot 1 · Chuyên môn" |
| 1 | `communication` | Luyện giao tiếp | 15–30′ | "Slot 2 · Giao tiếp" |
| 2 | `language` | Ôn ngoại ngữ (SRS) | 10–20′ | "Slot 3 · Ngoại ngữ (SRS)" |
| 3 | `language` | Luyện ngoại ngữ chủ động (viết/hội thoại) | 15–25′ | "Slot 4 · Ngoại ngữ" |
| 4 | `personal` | Nhật ký / suy nghĩ | 5–10′ | "Slot 5 · Cá nhân" |
| 5 | `personal` | Chăm sóc thể chất & tinh thần | 15–30′ | "Slot 6 · Thể chất & Hồi phục" |

### 3.3 Sinh lại kế hoạch, CTA & lịch sử (FR-DL-05..08)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-DL-05a | **Streak** = số ngày liên tiếp có ít nhất 1 `Activity`. Ngày hôm nay chưa có hành động thì streak vẫn đếm từ hôm trước (không reset giữa ngày). | P0 | FR-DL-05 |
| FR-DL-05b | **Năng lượng tuần** (0–100%) = `round(100 × Σ slot đã xong / Σ slot có kế hoạch)` trong 7 ngày gần nhất (kể cả hôm nay). Ngày không có kế hoạch **không** tính vào mẫu số. | P0 | FR-DL-05 |
| FR-DL-06a | "Lập lại kế hoạch hôm nay" chỉ sinh lại **nội dung của các slot chưa xong**; slot `done = true` giữ nguyên `action`/`detail`/`minutes`/`skillId`/`domain`. | P0 | FR-DL-06, SPEC S02 "Giữ nguyên" |
| FR-DL-06b | Khi sinh lại, các slot đã xong được gửi cho AI dưới dạng **ràng buộc cố định** (không được đề xuất lại), và server ghi đè kết quả AI cho các slot đó. | P1 | FR-DL-06, FR-AI-09 |
| FR-DL-07a | Ngày chưa có `PlanItem` nào → S01 hiện empty state có CTA **"Lập kế hoạch hôm nay"** (mở S02 hoặc gọi thẳng AI-01). | P0 | FR-DL-07, AC-1 |
| FR-DL-07b | Không có `ANTHROPIC_API_KEY` → CTA vẫn hoạt động, sinh kế hoạch bằng bộ sinh rule cục bộ, `source = "fallback"`, UI hiện banner "Đang dùng kế hoạch offline". | P0 | FR-DL-07, AC-7, SPEC S01 "Trạng thái lỗi" |
| FR-DL-07c | AI lỗi (429 / refusal / timeout / mất mạng) → S01 **không** trắng: hiện kế hoạch fallback cục bộ + banner "Đang dùng kế hoạch offline" + nút "Thử lại". | P0 | FR-DL-07, SPEC S01 "Trạng thái lỗi", FR-AI-05 |
| FR-DL-08a | `PlanItem` của ngày cũ **không bị xóa** khi sang ngày mới; không có logic "reset kế hoạch hôm nay". | P1 | FR-DL-08 |
| FR-DL-08b | Có màn hình/đường dẫn xem lại kế hoạch theo ngày: `GET /api/plan/[date]` + bộ chọn ngày trên S01 (7 ngày gần nhất). | P1 | FR-DL-08 |

### 3.4 AI-01 — Sinh kế hoạch ngày

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-DL-AI-01 | AI-01 dùng model **`claude-opus-5`**, `effort = medium`, **streaming**, output có cấu trúc đúng 6 slot (`output_config.format` + Zod schema). | P0 | SPEC §5.1, FR-AI-03, FR-AI-04 |
| FR-DL-AI-02 | Lời gọi AI-01 dùng **prompt caching**: system prompt cố định (`PLAN_SYSTEM_V1` + `PLAN_SLOT_CONTRACT_V1` có `cache_control: ephemeral`) là prefix; **toàn bộ** dữ liệu biến động (ngày, cây kỹ năng, bằng chứng, sinh trắc, slot đã xong) nằm trong `messages`. | P0 | FR-AI-01, SPEC §5.2 |
| FR-DL-AI-03 | Stream được đóng gói thành **SSE** với các event: `slot` (từng slot khi có nội dung), `usage` (token + chi phí), `done` (kế hoạch đã validate), `error` (mã lỗi + thông báo tiếng Việt). | P0 | FR-AI-02, SPEC S02 "hiển thị từng slot khi text về" |
| FR-DL-AI-04 | Payload cuối cùng phải khớp `PlanSchema` (6 slot, domain đúng vị trí, `minutes` trong khoảng của slot, `detail` ≤120 ký tự). Payload sai cấu trúc → **không** ghi DB, trả lỗi có nút thử lại. | P0 | FR-AI-04, FR-DL-02 |
| FR-DL-AI-05 | Mọi lời gọi AI-01 (thành công/thất bại) đều được wrapper của `ai-foundation` ghi 1 dòng `AiCall { feature: "daily_plan", model, tokens, cacheRead, cacheWrite, estimatedCost, ok, error }`. | P1 | FR-AI-07 |
| FR-DL-AI-06 | `stop_reason === "refusal"` được kiểm **trước** khi đọc `content`; refusal → `AiRefusalError` → UI hiện thông báo thân thiện, trang không crash. | P0 | FR-AI-05, AC-8 |
| FR-DL-AI-07 | AI-01 **không** sinh nội dung ngoài phạm vi: mỗi slot phải gắn được với 1 kỹ năng trong cây (hoặc `null` cho slot `personal`) và nằm trong khoảng thời lượng của slot. | P0 | R6, FR-DL-02 |

### 3.5 S02 — Duyệt & chỉnh kế hoạch

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-DL-02a | S02 hiển thị **6 slot** dạng card: nhãn `SLOT 0x`, chip domain, thời lượng, tiêu đề, mô tả, kỹ năng gắn, và nút hành động theo loại slot (ôn / luyện / nhật ký / sửa). | P0 | SPEC S02, FR-DL-01 |
| FR-DL-02b | Người dùng **sửa inline** được: tiêu đề, mô tả, thời lượng, kỹ năng gắn. Thay đổi nằm trong bản nháp client cho tới khi duyệt. | P0 | SPEC S02 "Chỉnh sửa" |
| FR-DL-02c | Người dùng **kéo đổi thứ tự ưu tiên** được; server chỉ nhận hoán đổi giữa hai slot **cùng domain**, và tập domain của cả ngày phải giữ nguyên (1 professional · 1 communication · 2 language · 2 personal). | P1 | SPEC S02 "kéo đổi thứ tự slot", P5 |
| FR-DL-02d | Nút **"Duyệt & Áp dụng Kế hoạch"** (phím `Ctrl/Cmd + Enter`) ghi 6 `PlanItem` cho ngày đích trong 1 transaction; bấm lần 2 không nhân bản bản ghi. | P0 | SPEC S02, FR-DL-07 |
| FR-DL-02e | Nút **"Sinh lại toàn bộ (AI)"** gọi lại AI-01 (giữ slot đã xong) và **"Khôi phục Offline Fallback"** sinh lại bằng bộ sinh rule cục bộ (`source = "fallback"`). | P1 | prototype S02 |
| FR-DL-02f | S02 hiển thị khối **"Ràng Buộc Sinh Học"** (mood/energy/sleep + đường cong năng lượng), **"Trọng Tâm Bứt Phá"** (kỹ năng ít bằng chứng nhất) và **"Chi Phí Phiên Sinh"** (input cached / output / latency / ước tính USD) — dữ liệu thật, không hardcode. | P1 | prototype S02, FR-AI-07 |

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-DL-01 | Mobile-first *(SPEC NFR-01)* | S01 và S02 dùng được ở 390px: lưới 12 cột → 1 cột dọc; nút hành động chính full-width, nằm trong vùng ngón cái; không tràn ngang. |
| NFR-DL-02 | Tốc độ *(SPEC NFR-02)* | `/` render server-side < 500ms. Mở sheet Quick-log tức thì, không chờ AI. Stream AI-01 hiển thị slot đầu tiên ≤ 1.5s sau khi bắt đầu. |
| NFR-DL-03 | Offline *(SPEC NFR-03)* | Mọi tính năng không-AI (đánh dấu xong, sửa slot, duyệt kế hoạch, xem lịch sử) chạy được khi mất mạng; ghi được vào SQLite. |
| NFR-DL-04 | Privacy *(SPEC NFR-04)* | Chỉ gửi lên API dữ liệu **cần thiết** để sinh kế hoạch (kỹ năng, bằng chứng, sinh trắc, slot đã xong). Nội dung nhật ký cá nhân và `ANTHROPIC_API_KEY` không bao giờ nằm trong request AI-01. |
| NFR-DL-05 | Ngôn ngữ *(SPEC NFR-05)* | Giao diện tiếng Việt; mọi nhãn domain/hành động hiển thị bằng tiếng Việt, không dùng tên field thô (`professional`) cho người dùng. Nội dung học của slot ngoại ngữ giữ nguyên `zh-Hans` / `en-US` theo `UserProfile.learningLangs`; kỹ năng ngôn ngữ hiển thị `Skill.nameZh` khi có. |
| NFR-DL-06 | A11y *(SPEC NFR-06)* | Tương phản ≥ WCAG AA; mọi icon-only button có `aria-label`; tiến trình stream AI dùng `aria-live="polite"`; điều hướng bằng bàn phím (kích hoạt slot bằng `Enter`, `Ctrl+Enter` duyệt kế hoạch); focus ring `focus-visible:ring-2 focus-visible:ring-primary`. |
| NFR-DL-07 | Token design *(design-system.md §10)* | Chỉ dùng token trong `.kiro/steering/design-system.md` (`bg-surface-container`, `text-secondary`, `bg-primary-container`…). Không hardcode hex trong component; không dùng `rounded-2xl`/`rounded-3xl`/`shadow-xl`. |
| NFR-DL-08 | Idempotency | `POST /api/plan/[date]/complete` và `PATCH /api/plan/items` là idempotent theo ngày: bấm "Xong" 2 lần không tạo 2 `Activity`; duyệt kế hoạch 2 lần không nhân bản `PlanItem`. |
| NFR-DL-09 | Không vanity metric | Mọi số trên S01 gắn được với skill/activity cụ thể: "Bằng chứng xác thực" = số `Evidence` của kỹ năng trọng tâm, "Thời gian tích lũy" = tổng `minutes` của `Activity` có `skillId` — **không** hiển thị "tổng giờ học" trần trụi. |

## 5. Mô hình dữ liệu

> Feature này **không thêm model Prisma mới** — dùng đúng các model trong SPEC §4. Trường thêm mới (nếu có) phải được đề xuất ở feature khác, không tự ý thêm ở đây.

### 4.9 Lộ trình 3 giai đoạn — thay cho mục tiêu cứng (Q4)

> Nguồn chân lý: `.kiro/steering/user-profile-decisions.md` §5.
> Người dùng **không có deadline**. Thay vào đó, AI đề xuất lộ trình 3 giai đoạn, mỗi giai đoạn có
> **tiêu chí hoàn thành đo được** từ `Evidence`/`Activity` thật ⇒ không vanity metric (P7).

```
Giai đoạn 1 — Nền tảng
   Điều kiện đạt: ≥ 20 Evidence ở domain professional
   Tiêu chí: viết được 1 REST service Spring Boot + 1 query JPA không N+1

Giai đoạn 2 — Vững chắc
   Điều kiện đạt: giai đoạn 1 đạt + mock interview ≥ 3.5/5
   Tiêu chí: giải thích được GC, connection pool, và 1 đánh đổi system design

Giai đoạn 3 — Mở rộng
   Điều kiện đạt: giai đoạn 2 đạt
   Tiêu chí: thiết kế 1 hệ thống đặt vé (10 triệu người dùng đỉnh cao)
```

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-DL-09 | Hệ thống xác định **giai đoạn hiện tại** = giai đoạn đầu tiên chưa đạt điều kiện; hiển thị trên top strip S01 (tên giai đoạn + tiêu chí đang theo đuổi). | P1 | Q4 |
| FR-DL-10 | AI-01 nhận thêm `currentStage` + `stageCriteria` + `recentVelocity` (evidence/ngày) vào prompt; AI **không** hỏi deadline. | P1 | Q4 |
| FR-DL-11 | Khi tốc độ tăng → AI đề xuất giai đoạn tiếp theo. Khi trượt ≥2 ngày → **giảm tải** (FR-WR-05). | P1 | Q4 · FR-WR-05 |

**Hành vi khi không có dữ liệu velocity:** dùng mặc định 1 Evidence/ngày cho tới khi có ≥7 ngày dữ liệu.

### 5.1 `PlanItem` (SPEC §4) — bảng trung tâm của feature

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `PlanItem` | `id` | `String @id @default(cuid())` | Khóa chính. |
| | `date` | `DateTime` | Chuẩn hoá **00:00 local**; so sánh ngày bằng chuỗi `yyyy-MM-dd` (`src/lib/dates.ts`). |
| | `slot` | `Int` | `0..5`. Vị trí trong ngày. Với kế hoạch đã kéo đổi, `slot` là **thứ tự ưu tiên mới**, `domain` đi theo item. |
| | `domain` | `String` | Chỉ 4 giá trị: `professional` \| `communication` \| `language` \| `personal` (P5). |
| | `action` | `String` | Tiêu đề hành động. |
| | `detail` | `String?` | Mô tả ≤120 ký tự (FR-DL-02). |
| | `minutes` | `Int @default(15)` | Thời lượng dự kiến, phải nằm trong khoảng của slot. |
| | `skillId` | `String?` | Kỹ năng liên quan (FK logic tới `Skill.id`). |
| | `done` | `Boolean @default(false)` | Đánh dấu hoàn thành; nguồn sự thật cho streak & năng lượng tuần. |
| | `source` | `String @default("ai")` | `ai` \| `manual` \| `fallback`. `fallback` = sinh bằng rule cục bộ (**không** gắn nhãn AI trên UI). |
| | `createdAt` | `DateTime @default(now())` | `@@index([date])` theo SPEC §4. |

### 5.2 `Activity` (SPEC §4) — bằng chứng hoạt động

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `Activity` | `id` | `String @id @default(cuid())` | |
| | `skillId` | `String?` | Null ⇒ hoạt động **không** gắn kỹ năng ⇒ không tạo `Evidence`, không tính vào thời gian thực chiến (P7). |
| | `domain` | `String` | 4 domain đóng băng. |
| | `type` | `String` | `study\|write\|speak\|roleplay\|srs\|journal\|health\|custom` — kế hoạch sinh thẳng `type` theo kind của slot. |
| | `minutes` | `Int` | Lấy từ `PlanItem.minutes` khi bấm "Xong". |
| | `title` | `String` | Copy `PlanItem.action`. |
| | `content` | `String?` | Copy `PlanItem.detail`. |
| | `quality` | `Int?` | Tự đánh giá 1–5 (người dùng chọn trong sheet). |
| | `aiScore` | `Float?` | Để trống ở feature này (chấm điểm thuộc feature khác). |
| | `createdAt` | `DateTime @default(now())` | Nguồn tính streak. |

### 5.3 `Evidence` (SPEC §4) — tiến độ = bằng chứng

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `Evidence` | `id` | `String @id @default(cuid())` | |
| | `activityId` | `String` | FK `Activity.id`, `onDelete: Cascade`. |
| | `skillId` | `String` | FK `Skill.id`, `onDelete: Cascade`, `@@index([skillId])`. |
| | `rating` | `Int` | 1–4. Chỉ `rating ≥ 3` mới tính vào tăng `level` (ngưỡng ở `skill-tree-evidence`). |
| | `createdAt` | `DateTime @default(now())` | |

### 5.4 `Skill` (SPEC §4) — nguồn cho AI-01 và cho ô "Trọng Tâm Bứt Phá"

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `Skill` | `id` | `String @id @default(cuid())` | |
| | `name` | `String` | Tên dùng làm tiêu đề slot khi fallback. |
| | `nameZh` | `String?` | Tên tiếng Trung cho skill ngôn ngữ. |
| | `domain` | `String` | 4 domain đóng băng. |
| | `parentId` | `String?` | Cây 3 tầng (Domain → Skill → Mục con). |
| | `level` | `Int @default(0)` | 0–5, **chỉ** tăng qua `Evidence` (P3). |
| | `targetLevel` | `Int @default(3)` | |
| | `position` | `Int @default(0)` | |

### 5.5 `DailyState` (SPEC §4) — ràng buộc sinh học

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|
| `DailyState` | `date` | `DateTime @unique` | 1 bản ghi/ngày. |
| | `mood` | `Int?` | 1–5 → "Tâm trạng". |
| | `energy` | `Int?` | 1–5 → "Năng lượng". |
| | `sleep` | `Float?` | Giờ ngủ → "Giấc ngủ". |
| | `focus` | `Int?` | 1–5 → "Độ tập trung". |

### 5.6 Quan hệ & ràng buộc

- `PlanItem.date` — ngày (không phải mốc thời gian). Mọi query theo ngày dùng `startOfDay(date)`/`endOfDay(date)` từ `src/lib/dates.ts`; **không** so sánh `DateTime` thô.
- `PlanItem` **không** có FK cứng tới `Skill` (theo SPEC §4) → khi skill bị xoá, slot vẫn tồn tại nhưng `skillId` trỏ tới id không còn; UI phải bỏ qua skill không tồn tại, không crash.
- **Bất biến domain của ngày:** tập `{professional: 1, communication: 1, language: 2, personal: 2}`. Server kiểm tra bất biến này khi ghi kế hoạch (AI-01, `PATCH /api/plan/items`).
- **Bất biến slot đã xong:** `PlanItem.done = true` ⇒ nội dung của nó là bất biến cho tới khi người dùng tự bỏ đánh dấu. AI và fallback không bao giờ ghi đè.
- Mỗi ngày có **tối đa 6** `PlanItem` (một row cho mỗi `slot` 0..5) — ràng buộc do logic ứng dụng đảm bảo (SPEC §4 không có unique constraint trên `(date, slot)`).

## 6. Giao diện & hành vi

### 6.1 Bố cục — S01 Daily Loop (`/`)

Nguồn: `system-design/s01_daily_loop_h_m_nay/code.html` — lưới 12 cột, bento 8 + 4 ở trên, lưới 8 + 4 ở dưới.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│DAILY LOOP OS  ·  Thứ Tư 29/10/2026        🔥 12   ⚡ 78%   ⋮ (menu góc phải)                                                   │
│[MỤC TIÊU HẠT NHÂN] ● Đang kích hoạt                                     │   [🫀] Sinh trắc & Nhịp độ (15s)         [Đã đồng bộ]│
│Phân tích yêu cầu  /  Software Architecture                              │                                                      │
│                                                                         │   ┌ Tâm trạng ────┬ Năng lượng ┐                     │
│[🧠 Lập lại kế hoạch hôm nay (AI)]   [+ Ghi nhanh (≤10s)]                │   │ 4 / 5         │ 4 / 5      │                     │
│                                                                         │   ├───────────────┼────────────┤                     │
│┌ Cột mốc hiện tại ┬ Bằng chứng ┬ Thời gian ┬ Trạng thái AI ┐            │   │ Độ tập trung  │ Giấc ngủ   │                     │
││ Bậc 2/5 (T:3/5)  │ 7 minh chứng│ 1.5 giờ   │ Cached local │            │   │ 5 / 5         │ 7.5 h      │                     │
│└──────────────────┴────────────┴───────────┴──────────────┘             │   └───────────────┴────────────┘                     │
│                                                                         │                                                      │
│Tiến trình hoàn thiện tiêu chí Level 3              68%                  │   [FSRS Deck Queue] 21 thẻ cần giải phóng   [21 DUE] │
│██████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                │                                                      │
│                                                                                                                                │
│6 Hành động nhỏ hôm nay               [2 / 6 Đã xong]                    │   [FSRS] Retrievability                [v4.5 Local]  │
│P1 Protocol: Tập trung đơn nhiệm, dứt điểm theo slot                     │                                                      │
│                                                                         │   Khả năng ghi nhớ (Retention): 89.4%                │
│┃ SLOT 1 · CHUYÊN MÔN · 35 phút                                          │   ████████████████████░░░░░░░░░░░                    │
│┃   [Bằng chứng +1 · Đánh giá: 4/5]                                      │   Ổn định TB: 14.2 ngày  ·  Khó TB: 4.8/10           │
│┃   Phân tích yêu cầu - Viết 5 use case cho hệ thống đặt vé              │                                                      │
│┃   Tệp đính kèm: booking-system-usecases.md                             │   [Đường cong suy giảm trí nhớ 7 ngày — SVG]         │
│┃                              [Xem lại]                                 │   T2  T3  [HÔM NAY]  T5  T6  T7  CN                  │
│                                                                         │                                                      │
│┃ SLOT 2 · GIAO TIẾP · 20 phút                                           │   [ Mở kho dữ liệu 1.480 thẻ ]                       │
│┃   [AI rubric: 4.2 / 5.0]                                               │                                                      │
│┃   Trình bày bản thảo - Nói 60 giây tóm tắt kiến trúc dự án             │                                                      │
│┃                              [Phân tích âm]                            │   [🧠] Hệ thống trợ lý      [Cache Hit 92%]          │
│                                                                         │   "Hôm nay bạn có 2 buổi tập trung cao độ…"          │
│▌ SLOT 3 · NGOẠI NGỮ (SRS) · 15 phút · Tiếng Trung HSK 4  ← ưu tiên      │   [✓] Mô hình phân loại ý thức: Active               │
│▌   Ôn 15 từ · Tiếng Trung                                               │                                                      │
│▌   ● 12 thẻ đến hạn FSRS    ● 3 thẻ mới (pinyin + hanzi)                │                                                      │
│▌                              [Bắt đầu ôn →]                            │   Nhịp tuần & Streak                  [12 ngày]      │
│                                                                         │   T2   T3   T4   T5   T6   T7   CN                   │
│┃ SLOT 4 · NGOẠI NGỮ · 20 phút · Tiếng Anh Kỹ thuật                      │   [✓]  [✓]  [2/6] [ ]  [ ]  [ ]  [ ]                 │
│┃   Luyện nói · Tiếng Anh                                                │   (ô hôm nay: bg-tertiary, animate-pulse)            │
│┃   Tình huống: Giới thiệu bản thân & kinh nghiệm lập trình              │                                                      │
│┃                              [Luyện tập 🎤]                            │                                                      │
│                                                                         │                                                      │
│┃ SLOT 5 · CÁ NHÂN · 10 phút · Dự kiến 21:30                             │                                                      │
│┃   Nhật ký tối — 3 câu hỏi gợi ý mở từ AI đã sinh                       │                                                      │
│┃                              [Viết nhật ký ✎]                          │                                                      │
│                                                                         │                                                      │
│┃ SLOT 6 · THỂ CHẤT & HỒI PHỤC · 20 phút                                 │                                                      │
│┃   Đi bộ & thở — 20 phút vận động ngoài trời không điện thoại           │                                                      │
│┃                              [☑ Hoàn thành]                            │                                                      │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Sheet Quick-log** (mở từ *"+ Ghi nhanh"*, *Hoàn thành*, `Ctrl/Cmd+K`):

```
┌────────────────────────────────────────────────────────────┐
│⚡ Ghi nhanh hạt nhân (≤10 giây)                        ✕   │
│                                                            │
│NỘI DUNG HÀNH ĐỘNG HOẶC BẰNG CHỨNG                          │
│[ Ví dụ: /skill Đọc 10 trang Clean Architecture            ]│
│                                                            │
│Cú pháp nhanh:   /skill   /review   /evidence   /mood       │
│                                                            │
│                                    [Hủy]   [Lưu ngay ⏎]    │
└────────────────────────────────────────────────────────────┘
```

**Modal "Cân chỉnh lại hôm nay"** (mở từ *"Lập lại kế hoạch hôm nay (AI)"*):

```
┌────────────────────────────────────────────────────────────────┐
│🧠 Cân chỉnh lại hôm nay                               ✕        │
│                                                                │
│AI sẽ căn cứ vào mức năng lượng (78%), 2 nhiệm vụ đã chốt, và 21│
│thẻ FSRS quá hạn để sắp xếp lại thứ tự ưu tiên các slot còn lại.│
│                                                                │
│┌──────────────────────────────────────────┐                    │
││Gợi ý phân bổ lại:                        │                    │
││• 15:30 - Slot 3: SRS Tiếng Trung (15′)   │                    │
││• 17:00 - Slot 6: Đi bộ 20′ (chuyển sớm)  │                    │
││• 19:30 - Slot 4: Tiếng Anh Speaking (20′)│                    │
││• 21:30 - Slot 5: Nhật ký tối (10′)       │                    │
│└──────────────────────────────────────────┘                    │
│                                                                │
│                    [Giữ nguyên]   [Áp dụng lịch trình mới]     │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Bố cục — S02 Sinh kế hoạch AI (`/plan`)

Nguồn: `system-design/s02_sinh_k_ho_ch_ai_k_ho_ch_ng_y/code.html` — header panel + directive banner + lưới 8 + 4.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│DAILY LOOP OS / KẾ HOẠCH NGÀY   ● AI-01 STREAMING ENGINE                                                                                              │
│Thiết Lập Kế Hoạch 6 Slot Hôm Nay (29/10/2026)                                                                                                        │
│[🧠 Mô hình: Claude Opus 5  ·  Prompt Caching 92% Active]   ⚡ Tổng lượng cam kết: 120 phút (Chuẩn P1)                                                │
│                                                                                                                                                      │
│[⟳ Sinh lại toàn bộ (AI)]   [🕘 Khôi phục Offline Fallback]   [✓ Duyệt & Áp dụng Kế hoạch  ⟨Ctrl + Enter⟩]                                            │
│                                                                                                                                                      │
│🛠 Nguyên tắc P1 & Định dạng 6 slot cố định: AI chỉ điền nội dung & tối ưu thời lượng dựa trên Cây kỹ                                                  │
│   năng và sinh trắc học, không thay đổi cấu trúc 4 trục thực thi (Chuyên môn · Giao tiếp · Ngoại ngữ ·                                               │
│   Cá nhân).                                                  STABLE_SLOTS_V1.1                                                                       │
│                                                                                                                                                      │
│6 Khối Thời Gian Tối Ưu            [6 / 6 Active]                                │   🫀 Ràng Buộc Sinh Học              [Biometric Fit: TỐI ƯU]       │
│⠿ Kéo icon để xếp lại thứ tự ưu tiên                                             │                                                                    │
│                                                                                 │   ┌ Tâm trạng ┬ Năng lượng ┬ Giấc ngủ ┐                            │
│┌ SLOT 01 [Chuyên môn] · 35 phút [Tập trung: Cao] ─────────────────────┐         │   │    4/5    │     4/5    │   7.5h    │                           │
││ ⠿  [✎ Sửa inline] [🌳 Đổi kỹ năng]                                  │          │   └───────────┴────────────┴───────────┘                           │
││    Phân tích yêu cầu - Viết 5 use case cho hệ thống đặt vé máy bay    │        │                                                                    │
││    Xác định edge cases về rollback transaction, deadlock…              │       │   [Biểu đồ dự phóng năng lượng — SVG]                              │
││    ─────────────────────────────────────────────────────────────────  │        │   06:00   09:00 (Slot 1 & 2)   14:00   19:00   23:00               │
││    Gắn Cây kỹ năng: [System Design → Phân tích yêu cầu]              │         │   Peak: 08:30 - 11:30                                              │
││                          ● Sẵn sàng thực hiện ngay                   │         │                                                                    │
│└───────────────────────────────────────────────────────────────────────┘        │   [✓] Slot 1 (Phân tích use case) đã được xếp tự động vào đỉnh năng│
│                                                                                 │       lượng cao nhất của não bộ hôm nay.                           │
│┌ SLOT 02 [Giao tiếp] · 20 phút [Tập trung: Trung bình] ───────────────┐         │                                                                    │
││ ⠿  [✎ Sửa inline] [🌳 Đổi kỹ năng]                                  │          │   🎯 Trọng Tâm Bứt Phá                    [Priority Gap]           │
││    Trình bày bản thảo - Nói 60 giây tóm tắt kiến trúc dự án          │         │                                                                    │
││    ─────────────────────────────────────────────────────────────────  │        │   Lựa chọn giải pháp kỹ thuật     [0 bằng chứng]                   │
││    Gắn Cây kỹ năng: [Giao tiếp → Nói / Pitching]                      │        │   Nút kỹ năng này là điểm nghẽn của nhánh System Design.           │
││                          🎤 Web Speech API & AI Rubric chấm điểm       │       │   AI đã lồng ghép yêu cầu này vào Slot 1 & Slot 2 để kích          │
│└───────────────────────────────────────────────────────────────────────┘        │   hoạt bằng chứng thực thi đầu tiên.                               │
│                                                                                 │   Tiến độ nhánh: 42%              [+1 bằng chứng khi xong Slot 1]  │
│┌ SLOT 03 [Ngoại ngữ SRS] · 15 phút [FSRS v4.5 Active] ─────────────────┐        │   ███████████████░░░░░░░░░░░░░░░░░░░                               │
││ ⠿                                            [📇 Mở phiên ôn ngay]    │        │                                                                    │
││    Ôn 15 từ vựng Tiếng Trung HSK 4 (chu kỳ lặp lại tối ưu)           │         │   Mục tiêu ngày: Mở khóa Milestone 3                               │
││    12 thẻ đến hạn / 3 thẻ mới / Ổn định ghi nhớ dự kiến: 94%         │         │   Cần tích lũy tối thiểu 60 phút Deep Work                         │
││    ─────────────────────────────────────────────────────────────────  │        │                                                                    │
││    Gắn Cây kỹ năng: [Tiếng Trung → Từ vựng (HSK 4)]                   │        │   🧾 Chi Phí Phiên Sinh                  [~$0.0032]                │
││                          ⏱ Ước lượng: 60s/thẻ                         │        │                                                                    │
│└───────────────────────────────────────────────────────────────────────┘        │   Input Tokens (Cached)       1.420 tkns (92%)                     │
│                                                                                 │   Output Tokens (Streaming)       480 tkns                         │
│┌ SLOT 04 [Ngoại ngữ chủ động] · 20 phút [AI Shadowing] ───────────────┐         │   Thời gian sinh (Latency)         840ms                           │
││ ⠿  [✎ Sửa inline] [🌳 Đổi kỹ năng]                                  │          │   ────────────────────────────────────────────                     │
││    Luyện nói Tiếng Anh kỹ thuật - Giới thiệu bản thân & kinh nghiệm   │        │   Offline Generator               [ ●────○ ]                       │
││    ─────────────────────────────────────────────────────────────────  │        │   Dùng bộ sinh rule cục bộ · 0 token                               │
││    Gắn Cây kỹ năng: [Tiếng Anh → Phản xạ Mock Interview]              │        │                                                                    │
││                          ✨ Đề xuất: STAR method                       │       │   ✓ Local-First Vault Synced                                       │
│└───────────────────────────────────────────────────────────────────────┘        │   Tất cả dữ liệu kế hoạch lưu vào SQLite cục bộ                    │
│                                                                                 │                                                                    │
│┌ SLOT 05 [Cá nhân] · 10 phút [Evening Reflection] ─────────────────────┐        │                                                                    │
││ ⠿  [✎ Sửa inline]                                                  │           │                                                                    │
││    Nhật ký tối & Tự vấn sâu (3 Prompt trích xuất)                    │         │                                                                    │
││    1. Đâu là khoảnh khắc bạn bị xao nhãng nhiều nhất hôm nay?          │       │                                                                    │
││    2. Slot phân tích hệ thống vé máy bay đã đạt chuẩn P1 chưa?       │         │                                                                    │
││    3. Mức năng lượng phản ánh chất lượng bữa ăn hay giấc ngủ?         │        │                                                                    │
││    ─────────────────────────────────────────────────────────────────  │        │                                                                    │
││    Gắn Cây kỹ năng: [Tự nhận thức & Meta-cognition]                  │         │                                                                    │
│└───────────────────────────────────────────────────────────────────────┘        │                                                                    │
│                                                                                 │                                                                    │
│┌ SLOT 06 [Cá nhân · Thể chất & Hồi phục] · 20 phút [Bảo vệ giấc ngủ] ┐          │                                                                    │
││ ⠿  [✎ Sửa inline]                                                  │           │                                                                    │
││    Đi bộ ngoài trời & Thả lỏng tầm nhìn xa (Panoramic gaze)           │        │                                                                    │
││    ─────────────────────────────────────────────────────────────────  │        │                                                                    │
││    Gắn Cây kỹ năng: [Hồi phục thần kinh & Thể chất]                   │        │                                                                    │
││                          😴 Tăng 18% khả năng đi vào giấc ngủ sâu      │       │                                                                    │
│└───────────────────────────────────────────────────────────────────────┘        │                                                                    │
│                                                                                 │                                                                    │
│ℹ Muốn thay đổi thời lượng slot? Nhấp Sửa inline hoặc kéo slider thời            │                                                                    │
│  lượng. Tổng cam kết tự động cân bằng theo quy tắc P1.   [🔒 Khóa cố định 6 slot]   │                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Bảng thành phần

#### S01

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Top bar | Ngày (Thứ Tư 29/10), streak 🔥, năng lượng tuần ⚡, menu ⋮ | nền `bg-surface-dim`; số liệu `font-code-md text-primary` | Menu mở: Báo cáo tuần · Báo cáo tiến bộ · Mock Interview · Bài kiểm tra · Cài đặt |
| Bento trái (8 cột) | "Mục tiêu hạt nhân hôm nay" + skill trọng tâm | `bg-surface-container rounded-xl p-space-lg shadow-md`; chip `bg-primary/10 text-primary`; h1 `font-headline-lg text-on-surface`; glow `bg-primary/5 blur-3xl` | Click tên skill → `/skills/[id]` |
| Nút AI | "Lập lại kế hoạch hôm nay (AI)" | `bg-surface-container-high text-secondary` + icon `neurology` | Mở modal "Cân chỉnh lại hôm nay" → gọi AI-01 giữ slot đã xong |
| Nút ghi nhanh | "+ Ghi nhanh (≤10s)" | `bg-primary-container text-on-primary font-label-md font-semibold` + `hover:brightness-105 active:scale-[0.98]` + icon `bolt` | Mở sheet Quick-log ngay (không chờ AI) |
| 4 metric tile | Cột mốc hiện tại · Bằng chứng xác thực · Thời gian tích lũy · Trạng thái AI Engine | label `font-label-sm text-outline uppercase tracking-wider`; số `font-headline-sm`; giá trị `text-primary` / `text-tertiary` / `text-secondary` | Số liệu thật từ `Skill` + `Evidence` + `Activity`; "AI Engine" = `offline_bolt` "Cached local" khi offline |
| Segmented progress | Tiến trình hoàn thiện tiêu chí Level 3 + % | track `bg-surface-container-highest`; đoạn đạt `bg-primary rounded-sm`; đoạn chưa `bg-surface-variant` | % = (số `Evidence` rating ≥3 của skill / ngưỡng) |
| Bento phải (4 cột) | Sinh trắc & Nhịp độ (15s) | `bg-surface-container-low rounded-xl p-space-lg shadow-md`; tile `bg-surface-container p-space-sm rounded-lg` | Đọc `DailyState` hôm nay; thiếu → "—"; chip trạng thái `bg-surface-container text-tertiary` |
| FSRS queue pill | "FSRS Deck Queue · 21 thẻ cần giải phóng hôm nay" | `bg-surface-container`; badge `bg-tertiary-container/30 text-tertiary font-code-md` | Link → `/language` |
| Header danh sách slot | "6 Hành động nhỏ hôm nay" + chip "2 / 6 Đã xong" | `font-headline-md text-on-surface`; chip `bg-surface-container-high text-primary rounded-full` | Chip số đếm `done / 6` |
| Card slot — done | Icon ✓ tròn, tiêu đề gạch ngang, chip bằng chứng | nền `bg-surface-container rounded-xl p-space-md shadow-sm`; gạch trái `w-1 bg-primary`; icon tròn `bg-primary/20 text-primary`; tiêu đề `line-through decoration-outline/60 text-outline` | Nút phụ "Xem lại" (`bg-surface-container-low text-on-surface-variant`) |
| Card slot — ưu tiên (có việc quá hạn) | Slot 3 (FSRS đến hạn) nổi bật | nền `bg-surface-container-high rounded-xl shadow-md`; gạch trái `w-1.5 bg-tertiary`; nút `bg-tertiary text-on-tertiary` | Nút chính theo kind: "Bắt đầu ôn" / "Luyện tập" / "Viết nhật ký" / "Hoàn thành" |
| Card slot — thường | Slot 4, 5, 6 | nền `bg-surface-container`; gạch trái `w-1 bg-outline-variant`; badge số `bg-surface-container-highest text-on-surface-variant` | Nút ghost `bg-surface-container-highest text-on-surface hover:bg-surface-variant` |
| Chip domain | "Slot 1 · Chuyên môn" | `bg-surface-container-highest` + màu domain: professional `text-secondary`, communication `text-tertiary`, language `text-primary`, personal `text-tertiary-fixed-dim` | Nhãn tiếng Việt, không dùng tên field thô |
| Sidebar FSRS | Retention, độ ổn định, độ khó, đường cong 7 ngày | `bg-surface-container rounded-xl p-space-lg shadow-md`; số `font-code-md text-primary`; track `bg-surface-container-highest` | Số liệu thật từ `Card` (feature SRS) — nếu chưa có module thì ẩn khối |
| Sidebar "Hệ thống trợ lý" | Gợi ý AI + cache hit | `bg-surface-container-low rounded-xl p-space-md`; badge `bg-secondary-container/30 text-secondary font-code-md` | Hiển thị `cache_read_input_tokens` thật của lần sinh gần nhất |
| Sidebar "Nhịp tuần & Streak" | Lưới 7 ngày + 🔥 | `bg-surface-container rounded-xl p-space-md`; ô đạt `bg-primary`; ô hôm nay `bg-tertiary animate-pulse`; ô trống `bg-surface-container-highest` | Dữ liệu thật từ `PlanItem` 7 ngày |
| Banner offline | "Đang dùng kế hoạch offline" | `bg-tertiary-container/20 text-tertiary` + icon `offline_bolt` | Hiện khi `PlanItem.source = "fallback"` hoặc AI lỗi |

#### S02

| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|
| Header panel | Breadcrumb + H1 + model + tổng cam kết | `bg-surface-container-low rounded-xl p-gutter-lg shadow-xl`; badge `bg-primary/10 text-primary`; chip engine `bg-surface-container-high text-secondary font-code-md` | Ngày lấy từ query `?date=`; mặc định hôm nay |
| Nhóm nút | Sinh lại toàn bộ (AI) · Khôi phục Offline Fallback · Duyệt & Áp dụng | Ghost: `bg-surface-container hover:bg-surface-container-high text-on-surface-variant`; Primary: `bg-primary-container text-on-primary` + glow `shadow-[0_0_20px_rgba(16,185,129,0.35)]` | Hotkey chip `bg-on-primary-container text-primary-fixed font-label-sm` |
| Directive banner | Nguyên tắc P1 + 6 slot cố định | `bg-surface-container-high/60 backdrop-blur-md rounded-xl p-space-md`; mã `font-code-md text-outline` | Tĩnh, không tương tác |
| Card slot | SLOT 0x, chip domain, phút, chip tập trung, tiêu đề, mô tả, skill | `bg-surface-container-low hover:bg-surface-container rounded-xl p-space-md shadow-md`; nhãn `bg-surface-container-highest font-code-md`; chip domain `rounded-full` | Card nền sáng dần khi slot đến từ stream |
| Nút trong card | Sửa inline · Đổi kỹ năng · Mở phiên ôn ngay | `bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm` + icon | Sửa inline mở form tại chỗ (không rời card) |
| Handle kéo | Icon `drag_indicator` | `text-outline hover:text-on-surface cursor-grab` + `aria-label` | Chỉ kéo được trong cùng domain; cập nhật thứ tự ưu tiên |
| Bảng điều khiển slot | Trạng thái stream: skeleton / đang sinh / xong | skeleton `bg-surface-container-highest animate-pulse` | `aria-live="polite"` |
| Khối "Ràng Buộc Sinh Học" | mood/energy/sleep + đường cong năng lượng | `bg-surface-container-low rounded-xl p-gutter-md shadow-lg`; icon `bg-primary/10 text-primary` | Số liệu `DailyState` hôm nay; "—" nếu thiếu |
| Khối "Trọng Tâm Bứt Phá" | Skill ít bằng chứng nhất + progress nhánh | `bg-surface-container-low rounded-xl p-gutter-md shadow-lg`; badge `bg-error-container/40 text-error`; progress `bg-primary` | Số `Evidence` thật; % = level/targetLevel |
| Khối "Chi Phí Phiên Sinh" | Input cached · Output · Latency · USD + toggle offline | `bg-surface-container-low rounded-xl p-gutter-md shadow-lg`; số `font-code-md`; toggle `peer-checked:bg-primary-container` | Đọc từ `AiCall` mới nhất (`feature = "daily_plan"`) |
| Quick-add note | Hướng dẫn sửa thời lượng + nút "Khóa cố định 6 slot" | `bg-surface-container-lowest/80 rounded-xl p-space-md`; nút `bg-surface-container text-on-surface` | Khóa = khôi phục thứ tự domain chuẩn |

### 6.4 Trạng thái

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| **Chưa có plan** | 0 `PlanItem` cho hôm nay | S01: empty state "Chưa có kế hoạch hôm nay" + CTA **"Lập kế hoạch hôm nay"** (primary) + gợi ý "mất khoảng 10 giây"; S02: skeleton 6 slot + nút "Sinh lại toàn bộ (AI)". Không lỗi. |
| **Đang sinh streaming** | AI-01 đang stream | S02: 6 card skeleton (`animate-pulse`); slot đến trước được điền dần; header hiện "AI-01 STREAMING ENGINE" + spinner; nút duyệt bị disable. S01: banner "AI đang lập kế hoạch…" (nếu trigger từ S01). |
| **Sinh xong** | Nhận đủ 6 slot + `done` event | 6 card đầy đủ; tổng cam kết cập nhật; nút "Duyệt & Áp dụng Kế hoạch" enable; badge chi phí hiện số thật. |
| **Lỗi** | `AiRateLimitError` / `AiRefusalError` / `AiTimeoutError` / `AiConnectionError` / `AiSchemaError` | S02: banner lỗi (`bg-error-container/40 text-error`) + nút **"Thử lại"**; bản nháp cũ **giữ nguyên**. S01: hiện kế hoạch fallback + banner "Đang dùng kế hoạch offline" + "Thử lại". Trang không crash. |
| **Offline fallback** | Không có `ANTHROPIC_API_KEY`, hoặc user bấm "Khôi phục Offline Fallback" | 6 slot từ `src/lib/plan.ts`; `PlanItem.source = "fallback"`; badge `Cached local` (icon `offline_bolt`); banner "Đang dùng kế hoạch offline — thêm API key để AI tối ưu thời lượng"; **không** gắn nhãn "AI" cho kế hoạch này. |
| **Slot đã done** | `PlanItem.done = true` | Card S01: icon ✓, tiêu đề gạch ngang, chip "Bằng chứng +1 · Đánh giá: 4/5" hoặc "AI rubric: 4.2/5.0", nút phụ "Xem lại". S02: card bị khoá (không sửa được), badge `Đã hoàn thành`. Khi sinh lại: card giữ nguyên, không bị AI ghi đè. |
| **Lịch sử theo ngày** | Xem ngày ≠ hôm nay | S01: hiện kế hoạch của ngày đó ở chế độ chỉ đọc; các nút hành động bị disable; badge "Chế độ xem lại". |
| **Chưa có sinh trắc hôm nay** | Chưa có `DailyState` | Các ô mood/energy/focus/sleep hiện "—"; AI vẫn sinh được (coi như trung bình 3/5); khối ràng buộc hiện "Chưa có dữ liệu sinh trắc hôm nay". |

### 6.5 Edge case

| Case | Xử lý |
|---|---|
| **AI trả về sai số slot** (≠6, trùng `slot`, thiếu `slot`) | Zod schema `.length(6)` + `refine` (slot 0..5 đúng một lần) → parse fail → `AiSchemaError` → **không** ghi DB, hiện lỗi + "Thử lại". S01 dùng kế hoạch fallback. |
| **AI trả về domain lệch vị trí** (ví dụ slot 2 = `professional`) | Schema `refine` theo `SLOT_DOMAINS` → parse fail → `AiSchemaError`, không ghi. Nếu chỉ lệch *sau khi* người dùng kéo đổi thứ tự ưu tiên thì đó là hành vi hợp lệ (domain đi theo item) — server chỉ kiểm **tập domain**, không kiểm domain theo vị trí sau khi đã kéo. |
| **AI trả về `minutes` ngoài khoảng của slot** | Schema `superRefine` giới hạn theo khoảng slot → parse fail → `AiSchemaError`. Nếu chỉ lệch nhẹ do người dùng sửa inline, `PATCH /api/plan/items` clamp về khoảng hợp lệ và trả cảnh báo. |
| **Slot đã done khi sinh lại** | Server tách `done` / `open`: slot `done` giữ nguyên 100% (`action`, `detail`, `minutes`, `skillId`, `domain`, vị trí); slot `open` lấy nội dung mới. AI nhận danh sách slot đã xong như **ràng buộc** và được server ghi đè kết quả cho các slot đó (double-guard). |
| **Người dùng kéo đổi slot khác domain** | UI chặn (không cho thả) + toast "Chỉ đổi thứ tự được trong cùng trục". Server cũng từ chối payload vi phạm bất biến tập domain → `400 { code: "invalid_domain_mix" }`. |
| **Duyệt kế hoạch 2 lần** | `PATCH /api/plan/items` + `POST /api/plan/[date]/apply` chạy trong `prisma.$transaction`: xoá `PlanItem` của ngày đích **chỉ khi `done = false`**, giữ nguyên các row `done = true` → không nhân bản, không mất bằng chứng. |
| **Bấm "Xong" 2 lần trên cùng slot** | `POST /api/plan/[date]/complete` kiểm tra `PlanItem.done` trước; đã done → trả `{ ok: true, data: { alreadyDone: true } }`, không tạo `Activity`/`Evidence` thứ 2. |
| **Ngày mới mở app** | Không xoá gì. `PlanItem` của ngày hôm qua vẫn còn; ngày hôm nay chưa có plan → empty state + CTA. Lịch sử 7 ngày vẫn xem được. |
| **Skill bị xoá giữa ngày** | `PlanItem.skillId` trỏ tới id không còn → UI bỏ qua chip kỹ năng, hiện "—"; không crash; không tự xoá slot. |
| **Không có `Activity` nào (mới dùng app)** | Streak = 0, năng lượng tuần = 0%; widget hiện "Chưa có dữ liệu tuần" thay vì số 0 gây hiểu nhầm là đã làm 0 việc. |
| **Ngày đang xem ≠ hôm nay, bấm "Xong"** | Nút hành động bị disable, hiện "Chỉ đánh dấu được cho hôm nay" — tránh ghi `Activity` sai ngày. |
| **Điều hướng S01 ↔ S02** | S01 → S02: CTA "Lập kế hoạch hôm nay" và nút "Lập lại kế hoạch hôm nay (AI)" mang theo ngày (`/plan?date=yyyy-MM-dd`). S02 → S01: sau khi duyệt → `router.push("/")` + `router.refresh()` để S01 đọc kế hoạch mới. Với ngày ≠ hôm nay, quay lại `/` (không giữ ngày), vì S01 mặc định là hôm nay. |
| **AI lỗi sau khi đã stream được 3 slot** | Giữ 3 slot đã nhận ở bản nháp client, hiện "Kết nối bị ngắt giữa chừng" + "Thử lại"; **không** ghi DB dở dang. |
| **Người dùng sửa inline rồi bấm "Sinh lại toàn bộ"** | Bản nháp sửa tay bị thay bằng nội dung AI mới (trừ slot đã done). Có hộp thoại xác nhận nếu có chỉnh sửa chưa duyệt. |

## 7. Hợp đồng API

> Quy ước chung (steering tech §5): validate bằng Zod; trả `{ ok, data }` hoặc `{ ok: false, error }`; route dạng `src/app/api/<domain>/<action>/route.ts`.

| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|
| GET | `/api/plan?date=yyyy-MM-dd` | query `date` (mặc định hôm nay) | `{ ok: true, data: { date, items: PlanItemDTO[], doneCount, totalCount, source } }` | `400 invalid_date` |
| GET | `/api/plan/[date]` | path `date` | `{ ok: true, data: { date, items, doneCount, totalCount, source } }` | `400 invalid_date` |
| POST | `/api/plan/generate` | body `{ date?: string, mode?: "generate" \| "regenerate" \| "fallback" }` | **SSE stream** `text/event-stream`: `slot` · `usage` · `done` · `error` | `400 invalid_date` · `502` (mã lỗi typed trong event `error`) |
| PATCH | `/api/plan/items` | body `{ date, items: [{ slot, domain, action, detail, minutes, skillId }], apply?: boolean }` | `{ ok: true, data: { updated, keptDone, totalMinutes } }` | `400 invalid_slot` · `400 invalid_domain_mix` · `400 minutes_out_of_range` |
| POST | `/api/plan/[date]/complete` | body `{ slot, quality?: 1..5, minutes?, note? }` | `{ ok: true, data: { activityId, evidenceId \| null, planItem, alreadyDone } }` | `404 plan_item_not_found` · `400 invalid_slot` |
| POST | `/api/plan/[date]/apply` | body `{ items: PlanItemDTO[] }` | `{ ok: true, data: { applied, keptDone } }` | `400 invalid_domain_mix` · `400 invalid_slot` |

**Định dạng event SSE của `POST /api/plan/generate`:**

```
event: slot
data: {"slot":0,"domain":"professional","action":"Phân tích yêu cầu - Viết 5 use case …","detail":"…","minutes":35,"skillId":"clx…","skillName":"Phân tích yêu cầu"}

event: usage
data: {"inputTokens":120,"outputTokens":80,"cacheRead":1420,"cacheWrite":0,"estimatedCost":0.00042,"latencyMs":840}

event: done
data: {"source":"ai","items":[ …6 phần tử… ],"keptDone":2}

event: error
data: {"code":"rate_limited","message":"Đang bị giới hạn tốc độ, thử lại sau 12s."}
```

**Hợp đồng với feature khác:**

| Hàm | Module | Input | Output |
|---|---|---|---|
| `openQuickLog(ctx)` | `src/components/quick-log/open-quick-log.ts` (feature `quick-log`) | `{ date: string; slot?: number; domain?: Domain }` | mở sheet Quick-log |
| `completePlanItem(...)` | `src/lib/daily-loop.ts` | `{ date, slot, quality?, minutes?, note? }` | `{ activity, evidence, planItem, alreadyDone }` |
| `getPlanForDate(date)` | `src/lib/daily-loop.ts` | `Date` | `{ items, doneCount, totalCount }` |
| `computeStreak(today)` | `src/lib/daily-loop.ts` | `Date` | `number` |
| `computeWeeklyEnergy(today)` | `src/lib/daily-loop.ts` | `Date` | `{ pct, doneSlots, totalSlots, daysWithPlan }` |
| `mergeRegeneratedPlan(existing, incoming)` | `src/lib/daily-loop.ts` | `PlanItem[]`, `PlanSlotDTO[]` | `PlanItemDTO[]` (giữ slot `done`) |
| `generateFallbackPlan(skills, opts?)` | `src/lib/plan.ts` | `SkillForPlan[]`, `{ date? }` | `FallbackPlanItem[]` (6 phần tử, `source: "fallback"`) |

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-1 — Daily Loop** (nguồn: SPEC §8)

- *Given* hôm nay chưa có kế hoạch, *When* mở `/`, *Then* hiện CTA **"Lập kế hoạch hôm nay"** và **không** có lỗi (không màn trắng, không lỗi console).
- *Given* đã có kế hoạch, *When* bấm "Xong" ở slot 1, *Then* slot chuyển sang trạng thái hoàn thành (gạch ngang + chip bằng chứng), `Activity` **và** `Evidence` được tạo, và streak tăng nếu đây là hoạt động đầu tiên trong ngày.
- *Given* hôm nay có kế hoạch với 2 slot đã xong, *When* mở `/`, *Then* chip đếm hiện "2 / 6 Đã xong" và 2 card đầu có trạng thái hoàn thành, 4 card còn lại hiện nút hành động.
- *Given* slot đã xong được gắn `skillId`, *When* bấm "Xong", *Then* tạo đúng 1 `Evidence` với `rating` mặc định 3; `Skill.level` **không** đổi ngay (P3 — level chỉ tăng qua ngưỡng bằng chứng).

**AC-DL-2 — Định dạng 6 slot cố định**

- *Given* kế hoạch bất kỳ trong DB, *When* đọc `PlanItem` của ngày đó, *Then* có **đúng 6** row với `slot` = 0..5, và tập domain = {professional: 1, communication: 1, language: 2, personal: 2}.
- *Given* payload AI trả 5 slot, *When* parse bằng `PlanSchema`, *Then* parse **fail** → không ghi DB, UI hiện lỗi + nút "Thử lại".
- *Given* payload AI trả 6 slot nhưng domain của slot 2 là `professional`, *When* parse, *Then* parse **fail** (`invalid_domain_mix`) → không ghi DB.
- *Given* không có `ANTHROPIC_API_KEY`, *When* sinh kế hoạch offline, *Then* vẫn ra **đúng 6** slot đúng domain theo vị trí và mọi row có `source = "fallback"`.

**AC-DL-3 — Sinh lại giữ slot đã xong (FR-DL-06)**

- *Given* hôm nay slot 1 và slot 2 đã `done = true`, *When* bấm "Lập lại kế hoạch hôm nay (AI)", *Then* nội dung `action`/`detail`/`minutes`/`skillId` của slot 1 và 2 **không đổi**, `done` vẫn `true`, còn slot 3–6 có nội dung mới.
- *Given* cùng trạng thái đó, *When* kiểm tra request gửi lên Anthropic, *Then* các slot đã xong được nêu rõ là **ràng buộc không được đề xuất lại**, và server ghi đè kết quả AI cho các slot đó.

**AC-DL-4 — Năng lượng tuần & streak (FR-DL-05)**

- *Given* 7 ngày gần nhất có 42 slot kế hoạch, 33 slot `done = true`, *When* mở `/`, *Then* "năng lượng tuần" hiện `79%` (33/42 → 78.6 → làm tròn 79) và khớp đúng query.
- *Given* hôm nay chưa có `Activity` nhưng 3 ngày trước có, *When* mở `/`, *Then* streak hiện `3` (không reset vì hôm nay chưa qua) và ô hôm nay trong lưới 7 ngày hiện trạng thái "đang diễn ra" chứ không phải "chưa làm".

**AC-DL-5 — Offline (AC-7)**

- *Given* không có `ANTHROPIC_API_KEY`, *When* mở app và bấm "Lập kế hoạch hôm nay", *Then* vẫn sinh được 6 hành động từ rule cục bộ và ghi được vào DB.
- *Given* không có `ANTHROPIC_API_KEY`, *When* mở `/plan`, *Then* nút "Sinh lại toàn bộ (AI)" hiện trạng thái unavailable và nút "Khôi phục Offline Fallback" hoạt động; banner giải thích lý do.

**AC-DL-6 — Lỗi AI không làm sập trang (AC-8)**

- *Given* API trả `stop_reason: "refusal"`, *When* app gọi AI-01, *Then* hiện thông báo lỗi thân thiện, ghi log `AiCall{ok:false}`, trang không crash; S01 vẫn hiện kế hoạch (fallback) kèm banner "Đang dùng kế hoạch offline".
- *Given* API lỗi 429, *When* S02 stream, *Then* event `error` mang `code = "rate_limited"` và UI hiện nút "Thử lại"; bản nháp cũ **không** bị mất.

**AC-DL-7 — Duyệt kế hoạch (S02)**

- *Given* đã sửa inline 1 slot rồi bấm "Duyệt & Áp dụng Kế hoạch", *When* hoàn tất, *Then* DB có **6** `PlanItem` cho ngày đó với nội dung đã sửa, và bấm lại lần 2 vẫn là **6** row (không nhân bản).
- *Given* có 2 slot đã `done` trước khi duyệt, *When* duyệt kế hoạch mới, *Then* 2 row `done` đó **được giữ nguyên** (không bị xoá, không bị ghi đè nội dung).

**AC-DL-8 — Lịch sử theo ngày (FR-DL-08)**

- *Given* hôm qua có kế hoạch 6 slot và hôm nay chưa có, *When* mở `/` và chọn hôm qua trong bộ chọn ngày, *Then* hiện đúng 6 slot của hôm qua ở chế độ chỉ đọc; các `PlanItem` của hôm qua **không** bị xoá khi ngày đổi.
- *Given* đang xem lịch sử ngày khác, *When* bấm "Xong", *Then* nút bị disable và hiện "Chỉ đánh dấu được cho hôm nay".

**AC-DL-9 — Điều hướng S01 ↔ S02**

- *Given* hôm nay chưa có kế hoạch, *When* bấm CTA "Lập kế hoạch hôm nay" trên S01, *Then* điều hướng tới `/plan?date=<hôm nay>` và S02 tự bắt đầu sinh kế hoạch.
- *Given* vừa duyệt kế hoạch trên S02, *When* quay lại `/`, *Then* S01 hiển thị đúng kế hoạch vừa duyệt (không phải bản cũ).

**AC-DL-10 — Prompt caching của AI-01 (AC-5)**

- *Given* 2 lần gọi AI-01 liên tiếp cùng system prompt, *When* đọc `usage.cache_read_input_tokens` của lần thứ 2, *Then* > 0; nếu = 0 → phải sửa (silent invalidator).
- *Given* system prompt của AI-01 được build, *When* quét nội dung, *Then* **không** chứa ngày, tên skill, chỉ số sinh trắc, `aiTone` hay bất kỳ dữ liệu biến động nào — toàn bộ nằm trong `messages`.

## 9. Rủi ro riêng của feature

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R-DL-1 | **AI sinh 6 việc chung chung mỗi ngày** → app trở thành todo list, mất giá trị "biết bạn đã làm gì". | Prompt AI-01 **bắt buộc** nhận: cây kỹ năng + `level` + số `Evidence`, `DailyState` hôm nay, 7 ngày gần nhất, slot đã xong. Thiếu dữ liệu → AI phải nói rõ trong `detail` vì sao chọn nội dung đó (có thể kiểm bằng review thủ công 1 tuần). |
| R-DL-2 | **AI đổi cấu trúc 6 slot** (bỏ slot 2, đổi domain) → phá vỡ P1/P5 và làm hỏng UI 1-1. | Schema `PlanSchema` ràng buộc `.length(6)` + `refine` domain theo vị trí + `superRefine` khoảng `minutes`; server **luôn** kiểm bất biến tập domain trước khi ghi. |
| R-DL-3 | **Sinh lại làm mất tiến độ trong ngày** (AI ghi đè slot đã xong → mất bằng chứng → streak sai). | Tách `done`/`open` ở server; slot `done` bất biến; AI nhận slot đã xong như ràng buộc **và** server ghi đè kết quả AI (double-guard). Test bắt buộc (AC-DL-3). |
| R-DL-4 | **Vanity metric** — "2 / 6 Đã xong" và "năng lượng tuần 79%" dễ trở thành đếm số. | Mọi số đều gắn với skill/activity cụ thể (NFR-DL-09); widget tuần hiển thị số slot xong trên tổng số slot có kế hoạch để người dùng thấy mẫu số. |
| R-DL-5 | **Đánh dấu "Xong" tạo bằng chứng rỗng** (bấm nhầm) → `Skill.level` tăng oan. | `Evidence.rating` mặc định 3 và chỉ tăng `level` khi đủ ngưỡng bằng chứng (P3); có đường bỏ đánh dấu; xoá `Activity` kèm `Evidence` (cascade). |
| R-DL-6 | **Streaming bị ngắt giữa chừng** để lại dữ liệu dở dang trong DB. | Chỉ ghi `PlanItem` sau khi nhận event `done` và parse thành công; khi ngắt → `AiCall{ok:false, error:"stream_interrupted"}`, **không** ghi dữ liệu nghiệp vụ (R-A10 của `ai-foundation`). |
| R-DL-7 | **Chi phí AI-01 tăng** vì sinh lại kế hoạch nhiều lần trong ngày. | Cache prefix (system prompt cố định), `effort: medium` cố định, payload ngắn (~600 output token). Không cho sinh lại tự động nhiều lần; mỗi lần sinh lại là 1 thao tác tường minh của người dùng. |
| R-DL-8 | **Xoá nhầm kế hoạch cũ khi sang ngày** → mất lịch sử. | **Không** có logic xoá theo ngày. Mọi thao tác ghi đều giới hạn trong `date` mục tiêu; transaction duyệt chỉ xoá row `done = false` của đúng ngày đó. |
| R-DL-9 | **Ràng buộc domain của slot kéo theo vị trí** khi người dùng kéo đổi → dữ liệu mâu thuẫn (slot 2 mang domain `personal`). | Mô hình: `slot` = **thứ tự ưu tiên**, `domain` = **thuộc tính của item**. Bất biến được kiểm là **tập domain trong ngày** (1/1/2/2), không phải domain theo vị trí sau khi kéo. UI chặn kéo chéo domain để tránh rối. |
| R-DL-10 | **Trạng thái nháp S02 mất khi reload** → người dùng mất chỉnh sửa chưa duyệt. | Bản nháp được lưu `localStorage` theo ngày (cùng cách S13 của `weekly-progress-report` giữ bản nháp), và có nút "Khôi phục Offline Fallback" để dựng lại nhanh từ rule cục bộ. |
