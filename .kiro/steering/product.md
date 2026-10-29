---
inclusion: always
---

# Product — Daily Loop OS

## Purpose

Daily Loop OS là một ứng dụng web **local-first**, **single-user**, giúp một người phát triển bản thân theo 4 mảng song song:
kỹ năng chuyên môn, giao tiếp, ngoại ngữ (Tiếng Trung / Tiếng Anh từ level 0), và theo dõi cá nhân.

AI **không phải chatbot** — AI là **người chấm điểm** và **người phân tích**, theo rubric cố định.

## Vòng lặp cốt lõi

```
Học (Input) → Luyện (Practice) → Chấm (Feedback) → Ghi (Reflect) → Đo (Track)
   ↑                                                                        │
   └──────────────── Tuần sau AI điều chỉnh kế hoạch ◄───────────────────┘
```

4 domain **không phải 4 app riêng** — chúng là 4 nguồn dữ liệu đổ vào cùng một vòng lặp ngày.

## Nguyên tắc bất di bất dịch

| # | Nguyên tắc | Hệ quả thiết kế |
|---|---|---|
| P1 | Một màn hình quyết định hôm nay | Trang chủ = Daily Loop (S01). Không có dashboard tổng hợp nhiều tab. |
| P2 | Ghi nhập dưới 10 giây | Quick-log 2 chạm; AI điền sẵn form; mục tiêu ≤10s đo được. |
| P3 | Tiến độ = bằng chứng, không phải checkbox | Mỗi hoạt động tạo `Evidence` gắn với một kỹ năng. Không có "% hoàn thành" tự khai. |
| P4 | AI chấm theo rubric cố định | Mọi prompt chấm điểm kèm rubric định nghĩa sẵn trong system prompt. AI không tự bịa tiêu chí. |
| P5 | Không thêm domain thứ 5 | Phạm vi domain đóng băng: professional, communication, language, personal. |
| P6 | Local-first | SQLite trên máy. Dữ liệu cá nhân không rời máy trừ khi người dùng chủ động nhờ AI. |
| P7 | Không có vanity metric | Cấm số liệu không dẫn tới hành động (vd "đã học 47 tiếng" không gắn kỹ năng nào). |

## Người dùng

Chủ sở hữu: 1 người, đang làm việc, học 2 ngôn ngữ từ con số 0 (Tiếng Trung, Tiếng Anh), muốn nâng cao kỹ năng chuyên môn + giao tiếp.
Giao diện 100% tiếng Việt.

## Bối cảnh AI (quan trọng — đọc trước khi thiết kế)

Thiết kế 21 màn hình Stitch thể hiện một **AI router hybrid**, KHÔNG phải Anthropic-only:

- **Local (Ollama)** — badge cố định trên header mọi màn hình: `AI Offline / Local (Ollama)`.
  Model local được nhắc tới: `Ollama Qwen-2.5 7B`, `Local Llama-3.3 + Opus`, `Qwen2.5-Coder-7B-Instruct (Local)`.
  Dùng cho: phân loại nhanh, autofill quick-log, sửa lỗi ngữ pháp, tổng hợp thống kê. Chi phí 0 token.
- **Cloud (Anthropic)** — `Claude Opus 5` cho chấm điểm rubric, sinh kế hoạch, mock interview, báo cáo cuối phiên.
  `Claude Haiku 4.5` cho phân loại/extract. `Claude 3.5 Sonnet / Opus Fallback` là hàng dự phòng.
- **Prompt caching** — badge `Prompt Cache Engine: ACTIVE`, `Cache Hit Rate 91.4%` trong S15. Đây là yêu cầu kiểm chứng được, không phải tối ưu sau.

App **chạy được hoàn toàn khi không có key nào** (chế độ offline) — thiếu key thì dùng local model hoặc rule cục bộ, **không bao giờ giả lập phản hồi AI**.

## Vòng đóng bắt buộc

Hai vòng đóng làm nên giá trị của app — nếu cắt một trong hai, app chỉ còn là tracker:

1. **FR-LT-06 (Bài kiểm tra → SRS)**: câu sai trong bài kiểm tra ngoại ngữ → thẻ SRS bị đẩy về `due = hôm nay`, `lapses` tăng → S10 ôn ngay.
2. **FR-MI-08 (Mock interview → Evidence)**: phiên mock interview → `Evidence` cho kỹ năng trọng tâm nhất → S03 cây kỹ năng tăng level → đề xuất luyện tiếp quay lại S01.

## Phạm vi

**Trong phạm vi (Phase 0 → 2)**: Daily Loop 6 hành động/ngày · cây kỹ năng 4 domain + bằng chứng · quick-log · AI sinh kế hoạch · SRS (FSRS) zh+en level 0 · luyện giao tiếp (viết/nói) · nhật ký + AI phản hồi · đánh giá chính · weekly review · mock interview · bài kiểm tra ngoại ngữ · báo cáo tiến bộ · cài đặt & chi phí AI.

**Ngoài phạm vi**: multi-user / cloud sync · mobile native (PWA ở Phase 3) · tích hợp bên thứ ba · gamification nặng · sức khỏe chuyên sâu.

## Ưu tiên cứng

Không bắt đầu Phase 1 trước khi Phase 0 dùng được **hằng ngày trong 7 ngày liên tiếp**.
Nếu không dùng hằng ngày → vấn đề là **friction**, không phải thiếu tính năng. Sửa friction, đừng thêm tính năng.
