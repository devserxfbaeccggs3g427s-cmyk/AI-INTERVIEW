---
inclusion: always
---

# Steering — Product (Daily Loop OS)

## 1. Sản phẩm là gì

Một ứng dụng web **single-user, local-first** giúp một người phát triển bản thân theo 4 mảng:
chuyên môn · giao tiếp · ngoại ngữ (Tiếng Trung + Tiếng Anh, level 0) · cá nhân.

Không phải 4 app. Đó là **4 nguồn dữ liệu đổ vào cùng một vòng lặp ngày**:

```
Học (Input) → Luyện (Practice) → Chấm (Feedback) → Ghi (Reflect) → Đo (Track)
   ↑                                                                        │
   └──────────────── Tuần sau AI điều chỉnh kế hoạch ◄───────────────────┘
```

**AI là người chấm và người phân tích — không phải chatbot.**

## 2. Nguyên tắc bất di bất dịch

| # | Nguyên tắc | Hệ quả bắt buộc trong code/UI |
|---|---|---|
| P1 | **Một màn hình quyết định hôm nay.** | Trang chủ = Daily Loop. Không dashboard tổng hợp nhiều tab. |
| P2 | **Ghi nhập dưới 10 giây.** | Quick-log 2 chạm; AI điền sẵn form; modal mở tức thì, không chờ AI. |
| P3 | **Tiến độ = bằng chứng, không phải checkbox.** | Mỗi hoạt động tạo `Evidence` gắn với một kỹ năng. Không có "% hoàn thành" tự khai. |
| P4 | **AI chấm theo rubric cố định.** | Mọi prompt chấm điểm kèm rubric định nghĩa sẵn trong system prompt. AI không tự bịa tiêu chí. |
| P5 | **Không thêm domain thứ 5.** | Domain đóng băng: `professional`, `communication`, `language`, `personal`. |
| P6 | **Local-first.** | SQLite trên máy. Nhật ký cá nhân không rời máy. Chỉ nội dung người dùng chủ động nhờ AI mới đi lên API. |
| P7 | **Không vanity metric.** | Cấm số liệu không dẫn tới hành động (vd "đã học 47 tiếng" không gắn kỹ năng nào). |

## 3. Người dùng & tình huống sử dụng

**Chủ sở hữu:** 1 người — **Java Backend Developer**. Đang làm việc, muốn nâng cao chuyên môn +
giao tiếp. Học **Tiếng Anh** (vài từ cơ bản, mục tiêu chính) và **Tiếng Trung** (từ số 0).
**Tiếng Việt** là bản ngữ — dùng để luyện nói/giao tiếp công sở.
**Không có dữ liệu có sẵn** — bắt đầu từ số 0. **Không có deadline** — AI đề xuất lộ trình.

> Nguồn chân lý cho 8 câu hỏi còn mở (SPEC.md §10): [`steering/user-profile-decisions.md`](user-profile-decisions.md)

## 4. Phạm vi

**Trong phạm vi (Phase 0 → 2)** — xem `.kiro/specs/*/tasks.md` cho chi tiết theo feature.

- Daily Loop 6 hành động/ngày · Cây kỹ năng 4 domain + bằng chứng · Quick-log · AI sinh kế hoạch (streaming)
- SRS (FSRS) cho zh + en level 0 · Chấm giao tiếp (viết/nói/role-play) · Nhật ký + AI phản hồi
- Đánh giá chính (mood/energy/sleep/focus) · Weekly Review · Báo cáo tiến bộ · Mock Interview · Bài kiểm tra ngoại ngữ

**Ngoài phạm vi (hiện tại)**

- Tài khoản nhiều người dùng / đồng bộ đám mây
- Mobile native app (PWA ở Phase 3)
- Tích hợp bên thứ ba (Notion, Google Calendar, Strava…)
- Gamification nặng (avatar, quà, cấp độ)
- Sức khỏe & thể chất chuyên sâu (chỉ 1 slot "chăm sóc bản thân")

## 5. Ràng buộc trải nghiệm

- **Mobile-first** — mọi màn hình dùng được ở 390px; thao tác chính nằm trong vùng ngón cái.
- **Giao diện tiếng Việt.** Nội dung học: `zh-Hans` + `en-US`.
- **Bottom nav chỉ 4 nút**: Hôm nay · Kỹ năng · Ôn tập · Nhật ký. Menu góc phải S01 chứa:
  Báo cáo tuần · Báo cáo tiến bộ · Mock Interview · Bài kiểm tra · Cài đặt.
- **Trạng thái rỗng luôn có CTA** — không bao giờ để trang trắng không lối ra.
- **Lỗi không được làm sập trang** — luôn có thông báo thân thiện + nút thử lại.

## 6. Rủi ro sản phẩm cần nhớ khi implement

| # | Rủi ro | Giảm thiển bắt buộc |
|---|---|---|
| R2 | Friction ghi nhập → bỏ app tuần 2 | Quick-log 2 chạm, AI điền sẵn form, offline-first. Đo: tỷ lệ ngày không ghi > 30% → ưu tiên giảm friction, **không** thêm tính năng. |
| R3 | AI chấm không đáng tin | Rubric cố định trong prompt, structured output, chỉ chấm theo tiêu chí có sẵn. |
| R6 | AI sinh nội dung level 0 sai chuẩn | Seed 140 thẻ biên tập tay. AI **không** sinh từ vựng nền — chỉ sinh cách hỏi. |
| R7 | Dữ liệu cá nhân rò rỉ | Local-first; danh sách "đã gửi lên" ở S15; không gửi khi người dùng không nhờ. |
| R8 | Câu hỏi mock interview chung chung | Bắt buộc truyền `focusSkills` + `jobTitle` + `seniority` vào prompt. |
| R9 | Điểm mock interview không ổn định | `temperature` mặc định không cao, rubric chi tiết, lưu điểm từng tiêu chí kèm lý do. Chấp nhận sai số ±0.3. |
| R10 | Bài kiểm tra bị lộ đề | Đề song song về độ khó cho `benchmark`; `topic` lấy item từ thẻ chưuộc đến hạn. |

## 7. Ràng buộc lịch trình

- **Ưu tiên cứng:** không bắt đầu Phase 1 trước khi Phase 0 dùng được hằng ngày 7 ngày liên tiếp.
  Nếu không dùng hằng ngày thì vấn đề là friction, không phải thiếu tính năng.
- Phase 1 chứa **Mock Interview** và **Bài kiểm tra ngoại ngữ** vì chúng tạo ra bằng chứng **đo được**.
