# Daily Loop OS — Kiro Specs

> Ứng dụng web single-user, local-first giúp phát triển bản thân: chuyên môn · giao tiếp ·
> ngoại ngữ (Trung + Anh, level 0) · cá nhân. AI là **người chấm và người phân tích**, không phải chatbot.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Prisma + SQLite · Anthropic SDK
**Nguồn:** `system-design/SPEC.md` (1445 dòng) · `system-design/focus_flow/DESIGN.md` (222 dòng) · 21 prototype `system-design/s*/code.html` + `screen.png`

---

## 1. Steering (luôn được nạp)

| File | Nội dung |
|---|---|
| [`steering/product.md`](steering/product.md) | Định vị, 7 nguyên tắc P1–P7, 11 tình huống sử dụng, phạm vi, rủi ro sản phẩm |
| [`steering/tech.md`](steering/tech.md) | Stack, data model, AI layer (routing 16 mã, caching, structured output, rubric, error chain, offline), NFR |
| [`steering/design-system.md`](steering/design-system.md) | Bảng màu, typography, layout, elevation, shapes, component patterns, a11y, lint rules |
| [`steering/project.md`](steering/project.md) | Cấu trúc thư mục, danh mục 21 route, 6 slot cố định, hằng số config, quy ước đặt tên |
| [`steering/data-model-registry.md`](steering/data-model-registry.md) | **Nguồn chân lý cho mọi thay đổi schema** — 34 field đã chốt (C1–C34), 11 model đề xuất kèm nhánh dự phòng (M1–M11), 5 quy tắc hành vi (B1–B5), 8 ràng buộc liên feature |
| [`steering/user-profile-decisions.md`](steering/user-profile-decisions.md) | **8 câu hỏi SPEC §10 đã chốt** — hồ sơ Java Backend Developer, 3 ngôn ngữ, CEFR đầy đủ, lộ trình 3 giai đoạn, AI Interview Studio, mục tiêu sắp tới |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Format bắt buộc của `spec.md` / `design.md` / `tasks.md` |
| [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) | 6 điểm còn treo (Q1–Q4, Q6, Q7 — đã chốt theo mặc định); Q5 đã chốt |

## 1.1 Hồ sơ người dùng (đã chốt)

| | |
|---|---|
| Nghề | **Java Backend Developer** |
| Ngoại ngữ | **Tiếng Anh** (A1 — vài từ cơ bản) · **Tiếng Trung** (zero — chưa biết gì) · **Tiếng Việt** (B2 — bản ngữ, luyện nói) |
| Mục tiêu | Không deadline — AI đề xuất **lộ trình 3 giai đoạn** với tiêu chí hoàn thành đo được |
| Dữ liệu có sẵn | Không có — bắt đầu từ số 0 |
| Mock Interview | **AI Interview Studio** — 3 loại phiên, nhiều phiên, ≥3 gợi ý phiên cụ thể có `whyNow` |
| Chuẩn ngoại ngữ | **CEFR đầy đủ** `zero·A1·A2·B1·B2·C1·C2` + cột HSK tương ứng (tiếng Trung) |
| Kỳ thi | Chưa chốt → mô hình **Mục tiêu sắp tới** (`UpcomingGoal`), AI đề xuất ưu tiên theo `priority` |

Nguồn: [`steering/user-profile-decisions.md`](steering/user-profile-decisions.md)

## 1.2 Kiểm tra tự động

```bash
python3 .kiro/scripts/validate_specs.py
```

Validator kiểm tra: cấu trúc 3 file mỗi feature · heading bắt buộc · ASCII wireframe · ≥3 AC ·
≥15 task · **coverage 79 FR + 13 AC + 9 NFR + 21 màn hình** đối chiếu `system-design/SPEC.md` ·
**xung đột schema** (field mới bị 2 feature cùng đề xuất mà chưa chốt trong registry) ·
**model mới chưa đăng ký** trong registry · **thang level cũ còn sót** (bắt buộc dùng CEFR).

Trạng thái hiện tại: **PASS — 0 lỗi**.

## 2. Specs theo feature

12 feature · 21 màn hình · 9 nhóm yêu cầu chức năng · 19 model dữ liệu · 16 hàm AI · 13 tiêu chí nghiệm thu.

| Feature | Màn hình | Route | Phase | Spec |
|---|---|---|---|---|
| **`app-foundation`** | *(cross-cutting)* | — | **-1** | [spec](specs/app-foundation/spec.md) |
| `ai-foundation` | *(cross-cutting)* | — | 0 | [spec](specs/ai-foundation/spec.md) |
| `daily-loop-core` | S01 Daily Loop · S02 Sinh kế hoạch AI | `/` · `/plan` | 0 | [spec](specs/daily-loop-core/spec.md) |
| `skill-tree-evidence` | S03 Cây kỹ năng · S04 Chi tiết kỹ năng | `/skills` · `/skills/[id]` | 0 | [spec](specs/skill-tree-evidence/spec.md) |
| `quick-log` | S05 Quick-log + lịch sử | `/log` · `/log/history` | 0 | [spec](specs/quick-log/spec.md) |
| `personal-state-journal` | S06 Nhật ký · S12 Đánh giá chính | `/journal` · `/state` | 0 | [spec](specs/personal-state-journal/spec.md) |
| `srs-language-review` | S09 Ôn SRS · S10 Phiên ôn 1 thẻ | `/language` · `/language/session` | 1 | [spec](specs/srs-language-review/spec.md) |
| `settings-cost` | S15 Cài đặt & chi phí AI | `/settings` | 0 | [spec](specs/settings-cost/spec.md) |
| `communication-training` | S07 Viết · S08 Nói · S11 Luyện ngoại ngữ chủ động | `/speak/write` · `/speak/talk` · `/language/practice` | 1–2 | [spec](specs/communication-training/spec.md) |
| `mock-interview` | S16 Cấu hình · S17 Phiên · S18 Kết quả | `/interview/*` | 1 | [spec](specs/mock-interview/spec.md) |
| `language-test` | S19 Danh sách · S20 Làm bài · S21 Kết quả | `/test/*` | 1 | [spec](specs/language-test/spec.md) |
| `weekly-progress-report` | S13 Báo cáo tuần · S14 Báo cáo tiến bộ | `/review` · `/progress` | 1 | [spec](specs/weekly-progress-report/spec.md) |

## 3. Lộ trình triển khai

| Phase | Nội dung | Feature | Điều kiện hoàn thành |
|---|---|---|---|
| **-1 — Khung dự án** | Khởi tạo Next.js 15 + TS strict + Tailwind v4 token + `next/font` · Prisma 19 model + seed Java 52 node + 120 thẻ · layout shell + bottom nav 4 + menu 5 · script dev/test/CI | **`app-foundation`** | `npm install && npm run db:migrate && npm run db:seed && npm run dev` → trang chủ chạy · build + typecheck + lint + test đều exit 0 · `validate:specs` PASS |
| **0 — Hạt nhân** | Schema + seed · Daily Loop · Quick-log · Cây kỹ năng · Đánh giá chính · AI-01 sinh kế hoạch · offline mode · Cài đặt | `ai-foundation`, `daily-loop-core`, `skill-tree-evidence`, `quick-log`, `personal-state-journal`, `settings-cost` | Mở app thấy 6 hành động; đánh dấu xong tạo bằng chứng; cây kỹ năng cập nhật tiến độ; chạy được không API key |
| **1 — Luyện tập cốt lõi** | SRS zh/en + seed 120 thẻ · chấm giao tiếp viết · nhật ký + AI · **Mock Interview** · **Bài kiểm tra ngoại ngữ** · báo cáo tuần · báo cáo tiến bộ | `srs-language-review`, `communication-training` (S07/S08), `mock-interview`, `language-test`, `weekly-progress-report` | Ôn được 2 ngôn ngữ; viết bài nhận điểm rubric có delta; mock interview trả 3 mạnh/3 yếu; bài kiểm tra đẩy thẻ sai về ôn |
| **2 — Luyện chủ động** | Role-play AI · sửa lỗi 4 nhóm · sinh flashcard từ bài viết · phân tích tương quan chỉ số · AI-07 tự giảm tải · bài kiểm tra `from_content` | `communication-training` (S11) + mở rộng | Hội thoại AI có mục tiêu ẩn; bài viết sai được sửa đúng nhóm lỗi; app báo "khi ngủ <6h thì…" |
| **3 — Bổ sung** | PWA offline · chế độ `produce` với STT · xuất dữ liệu · nhiều ngôn ngữ · mock interview bằng giọng nói | — | Cài lên màn hình chính; đi bộ offline vẫn ghi được |

> **Ưu tiên cứng 1:** Không bắt đầu Phase 0 trước khi **Phase -1** xong (khung dự án phải chạy được).
> **Ưu tiên cứng 2:** Không bắt đầu Phase 1 trước khi Phase 0 dùng được hằng ngày 7 ngày liên tiếp.
> Nếu không dùng hằng ngày thì vấn đề là friction, không phải thiếu tính năng.

## 4. Bản đồ màn hình → feature

| ID | Màn hình | Feature | FR nhóm |
|---|---|---|---|
| S01 | Daily Loop | daily-loop-core | FR-DL |
| S02 | Sinh kế hoạch AI | daily-loop-core | FR-DL |
| S03 | Cây kỹ năng | skill-tree-evidence | FR-SK |
| S04 | Chi tiết kỹ năng | skill-tree-evidence | FR-SK |
| S05 | Quick-log | quick-log | FR-DL-04 |
| S06 | Nhật ký & phản hồi AI | personal-state-journal | FR-PS |
| S07 | Luyện giao tiếp — Viết | communication-training | FR-CM |
| S08 | Luyện giao tiếp — Nói | communication-training | FR-CM |
| S09 | Ôn ngoại ngữ (SRS) | srs-language-review | FR-LG |
| S10 | Phiên ôn 1 thẻ | srs-language-review | FR-LG |
| S11 | Luyện ngoại ngữ chủ động | communication-training | FR-CM / FR-LG |
| S12 | Đánh giá chính | personal-state-journal | FR-PS |
| S13 | Báo cáo tuần | weekly-progress-report | FR-WR |
| S14 | Báo cáo tiến bộ | weekly-progress-report | FR-PR |
| S15 | Cài đặt & chi phí | settings-cost | FR-AI |
| S16 | Mock Interview — cấu hình | mock-interview | FR-MI |
| S17 | Mock Interview — phiên | mock-interview | FR-MI |
| S18 | Mock Interview — kết quả | mock-interview | FR-MI |
| S19 | Bài kiểm tra — danh sách | language-test | FR-LT |
| S20 | Bài kiểm tra — làm bài | language-test | FR-LT |
| S21 | Bài kiểm tra — kết quả | language-test | FR-LT |

## 5. Luồng vòng lặp chính

```
Học (Input) → Luyện (Practice) → Chấm (Feedback) → Ghi (Reflect) → Đo (Track)
   ↑                                                                        │
   └──────────────── Tuần sau AI điều chỉnh kế hoạch ◄───────────────────┘

S01 Daily Loop ──► S05 Quick-log ──► S03/S04 Cây kỹ năng (bằng chứng)
   │                     │
   ├──► S10 SRS ─────────┤
   ├──► S07/S08 Luyện nói ──► Evidence
   ├──► S17 Mock Interview ──► Evidence + điểm rubric
   └──► S20 Bài kiểm tra ──► S21 (đẩy thẻ sai về ôn)
                                    │
   S06 Nhật ký ──► S12 Đánh giá chính ──► S13 Báo cáo tuần ──► kế hoạch tuần tới ──► S01
                                    └──► S14 Báo cáo tiến bộ
```

## 6. Cách dùng

1. Đọc `steering/*.md` — luôn áp dụng cho mọi thay đổi.
2. Mở `specs/<feature>/spec.md` → hiểu yêu cầu + AC.
3. Đọc `specs/<feature>/design.md` → thiết kế chi tiết, signature, luồng dữ liệu.
4. Làm theo `specs/<feature>/tasks.md` — tick `- [ ]` khi xong.
5. Nghiệm thu theo AC trong `spec.md`.

**Thứ tự ưu tiên khi có xung đột:**
`spec feature` > `steering` > `system-design/SPEC.md` > `prototype code.html`
