---
inclusion: always
---

# Steering — Project Conventions (Daily Loop OS)

## 1. Nguồn chân lý

| Nhu cầu | Đọc file |
|---|---|
| Yêu cầu chức năng, data model, AI routing, tiêu chí nghiệm thu | `system-design/SPEC.md` (1445 dòng) |
| Token thiết kế | `system-design/focus_flow/DESIGN.md` + `.kiro/steering/design-system.md` |
| Giao diện tham chiếu màn hình | `system-design/s*/code.html` + `system-design/s*/screen.png` |
| Yêu cầu chi tiết từng màn hình | `.kiro/specs/<feature>/spec.md` |

Khi có xung đột: **spec feature > steering > SPEC.md > prototype HTML**.

## 2. Cấu trúc thư mục dự kiến

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
      log/autofill/route.ts           # AI-02
      grade/route.ts                  # AI-03/04
      journal/feedback/route.ts       # AI-05
      journal/classify/route.ts       # AI-06
      review/weekly/route.ts          # AI-07
      roleplay/route.ts               # AI-08
      language/correct/route.ts       # AI-09
      language/cards/route.ts         # AI-10
      interview/start/route.ts        # AI-11
      interview/turn/route.ts         # AI-12
      interview/report/route.ts       # AI-13
      test/generate/route.ts          # AI-14
      test/grade-open/route.ts        # AI-15
      test/level/route.ts             # AI-16
      srs/next/route.ts
      srs/grade/route.ts
      settings/key/route.ts
  components/
    daily-loop/  quick-log/  skills/  journal/  language/  charts/  ui/
    interview/   test/        rubric/  speech/
  lib/
    db.ts             # Prisma client singleton
    anthropic.ts      # client + wrapper ghi log AiCall
    prompts.ts        # system prompt + rubric hằng số
    fsrs.ts           # wrapper ts-fsrs
    plan.ts           # bộ sinh rule cục bộ (fallback offline)
    skills.ts         # chọn kỹ năng yếu nhất (cho mock interview)
    dates.ts
    types.ts
```

## 3. Danh mục route (21 màn hình)

| ID | Tên | Route | Phase |
|---|---|---|---|
| S01 | Daily Loop | `/` | 0 |
| S02 | Sinh kế hoạch AI | `/plan` | 0 |
| S03 | Cây kỹ năng | `/skills` | 0 |
| S04 | Chi tiết kỹ năng | `/skills/[id]` | 0 |
| S05 | Quick-log | `/log` (sheet) + `/log/history` | 0 |
| S06 | Nhật ký & phản hồi AI | `/journal` | 0 |
| S07 | Luyện giao tiếp — Viết | `/speak/write` | 1 |
| S08 | Luyện giao tiếp — Nói | `/speak/talk` | 1 |
| S09 | Ôn ngoại ngữ (SRS) | `/language` | 0 |
| S10 | Chi tiết thẻ ôn | `/language/session` | 0 |
| S11 | Luyện ngoại ngữ chủ động | `/language/practice` | 2 |
| S12 | Đánh giá chính | `/state` | 0 |
| S13 | Báo cáo tuần | `/review` | 1 |
| S14 | Báo cáo tiến bộ | `/progress` | 1 |
| S15 | Cài đặt | `/settings` | 0 |
| S16 | Mock Interview — cấu hình | `/interview/setup` | 1 |
| S17 | Mock Interview — phiên | `/interview/session` | 1 |
| S18 | Mock Interview — kết quả | `/interview/[id]` | 1 |
| S19 | Bài kiểm tra ngoại ngữ | `/test` | 1 |
| S20 | Làm bài kiểm tra | `/test/session` | 1 |
| S21 | Kết quả bài kiểm tra | `/test/[id]` | 1 |

## 4. Định dạng 6 slot cố định (AI chỉ điền nội dung, không đổi cấu trúc)

| Slot | Domain | Nội dung | Thời lượng |
|---|---|---|---|
| 1 (0) | `professional` | Học kỹ năng chuyên môn | 25–45′ |
| 2 (1) | `communication` | Luyện giao tiếp | 15–30′ |
| 3 (2) | `language` | Ôn ngoại ngữ (SRS) | 10–20′ |
| 4 (3) | `language` | Luyện ngoại ngữ chủ động (viết/hội thoại) | 15–25′ |
| 5 (4) | `personal` | Nhật ký / suy nghĩ | 5–10′ |
| 6 (5) | `personal` | Chăm sóc thể chất & tinh thần | 15–30′ |

## 5. Hằng số cấu hình (đặt trong `src/lib/config.ts`)

| Hằng | Giá trị | Ghi chú |
|---|---|---|
| `SLOT_COUNT` | 6 | AI không được sinh khác. |
| `SKILL_LEVEL_MAX` | 5 | Thang 0–5. |
| `EVIDENCE_RATING_MIN` | 3 | `rating ≥ 3` mới tính vào tăng level. |
| `EVIDENCE_THRESHOLD` | 3 | Số bằng chứng `rating ≥ 3` cần để tăng 1 level. |
| `QUICK_LOG_MAX_SECONDS` | 10 | AC-2. |
| `DAILY_STATE_MAX_SECONDS` | 15 | AC cho S12. |
| `SRS_SESSION_MAX_CARDS` | 20 | FR-LG-04. |
| `INTERVIEW_QUESTION_COUNTS` | `[5, 8, 12]` | FR-MI-12. |
| `TEST_COUNTS` | placement 25 · topic 20 · benchmark 40 · from_content 10 | FR-LT-01. |
| `WEEKLY_REVIEW_DAY` | Chủ nhật 20:00 | FR-WR-01. |
| `PLAN_FALLBACK_SOURCE` | `"fallback"` | Ghi vào `PlanItem.source`. |

## 6. Quy ước tên

- Component: `PascalCase` — `DailyLoopPlan`, `QuickLogSheet`, `SkillTree`, `RubricPanel`, `FlashcardReview`.
- File component: `kebab-case.tsx` — `daily-loop-plan.tsx`.
- Route API: `<domain>/<action>` — `/api/plan/generate`.
- Biến DB: `camelCase`; hằng số: `SCREAMING_SNAKE_CASE`.
- Hàm DB: verb + noun — `getTodayPlan`, `createEvidence`, `listDueCards`.

## 7. Ràng buộc seed

- **120 thẻ** (60 zh + 60 en) biên tập tay, 6 nhóm × 10 từ mỗi ngôn ngữ.
- **10 mẫu câu** mỗi ngôn ngữ.
- Cây kỹ năng seed theo **hồ sơ người dùng** — Java Backend Developer. Xem
  `.kiro/steering/user-profile-decisions.md` §2 (8 nhánh chuyên môn) + §3 (ngôn ngữ) + §4 (trình độ seed).
- Seed phải là **file tĩnh** (không gọi AI) — nội dung level 0 cần người biết ngôn ngữ duyệt (R6).
