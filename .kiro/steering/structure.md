---
inclusion: always
---

# Structure — Daily Loop OS

## Cây thư mục dự kiến

```
prisma/
  schema.prisma
  seed.ts                  # 120 thẻ zh/en (60+60) + 10 mẫu câu/ngôn ngữ + cây kỹ năng + profile
src/
  app/
    layout.tsx             # AppShell: sidebar + header + <main>
    globals.css            # token Tailwind v4 + @theme
    page.tsx               # S01 Daily Loop
    plan/page.tsx          # S02
    skills/page.tsx        # S03
    skills/[id]/page.tsx   # S04
    log/page.tsx           # S05 (sheet) — mở bằng query param
    log/history/page.tsx
    journal/page.tsx       # S06
    speak/write/page.tsx   # S07
    speak/talk/page.tsx    # S08
    language/page.tsx      # S09
    language/session/page.tsx  # S10
    language/practice/page.tsx # S11
    state/page.tsx         # S12
    review/page.tsx        # S13
    progress/page.tsx      # S14
    settings/page.tsx      # S15
    interview/setup/page.tsx # S16
    interview/session/page.tsx # S17
    interview/[id]/page.tsx  # S18
    test/page.tsx          # S19
    test/session/page.tsx  # S20
    test/[id]/page.tsx     # S21
    api/
      plan/generate/       # AI-01
      log/                 # quick-log save
      log/autofill/        # AI-02 (local)
      grade/               # AI-03/04
      journal/feedback/    # AI-05
      journal/classify/    # AI-06 (local)
      review/weekly/       # AI-07
      roleplay/            # AI-08
      language/correct/    # AI-09 (local)
      language/cards/      # AI-10
      interview/start/     # AI-11
      interview/turn/      # AI-12
      interview/report/    # AI-13
      test/generate/       # AI-14
      test/grade-open/     # AI-15
      test/level/          # AI-16
      srs/next/  srs/grade/
      settings/key/
  components/
    shell/          # Sidebar, Topbar, DbStatus
    daily-loop/     # S01: PlanCard, FocusBanner, CheckinPanel, FsrsWidget
    quick-log/      # S05: Step1Picker, Step2AiParse
    skills/         # S03/S04: SkillTree, SkillNode, EvidenceTable
    journal/        # S06
    speak/          # S07/S08
    language/       # S09-S11: Srshub, ReviewCard, AiFeedback
    interview/      # S16-S18
    test/           # S19-S21
    rubric/         # RubricScore, RubricBar, DeltaBadge
    charts/         # RadarChart, BarChart, Heatmap, RetentionCurve
    ui/             # Button, Card, Chip, StatTile, ProgressBar, Modal, Toast
  lib/
    db.ts           # Prisma client singleton
    ai/
      router.ts     # provider routing (local | anthropic)
      anthropic.ts  # SDK wrapper + AiCall logging
      ollama.ts     # Ollama HTTP client
      streaming.ts  # SSE helper
    prompts.ts      # system prompt + task prompts
    rubrics.ts      # 4 rubric hằng số (communication/technical/behavioral/language-errors)
    fsrs.ts         # ts-fsrs wrapper
    plan.ts         # bộ sinh rule cục bộ (fallback offline)
    skills.ts       # chọn kỹ năng yếu nhất
    nav.ts          # NAV_ITEMS dùng chung (single source of truth)
    dates.ts  types.ts
```

## Quy tắc tổ chức

- **Route = màn hình.** Mỗi `s<NN>` trong 21 màn hình Stitch tương ứng đúng 1 route ở trên.
- **Server Component mặc định**, chỉ mark `"use client"` cho phần tương tác (nút bấm, sheet, form, chart động).
- **Component theo domain**, không theo screen: `components/language/` dùng bởi S09, S10, S11.
- **`lib/rubrics.ts` là nguồn duy nhất** cho mọi rubric. UI đọc từ đây, không hardcode tên tiêu chí.
- **`lib/nav.ts` là nguồn duy nhất** cho sidebar. Không copy-paste nav giữa các màn hình (bài học từ lỗi #3 trong `tech.md`).
- Route handler chỉ nhận request, gọi `lib/ai/router.ts`, ghi log `AiCall`, trả response. **Không chứa logic nghiệp vụ trong route handler.**

## Tham chiếu thiết kế

```
stitch_daily_loop_os/
  focus_flow/DESIGN.md            # design system chuẩn (màu + typography + spacing)
  s01_.../s21_.../
    code.html                     # bản tham chiếu (Tailwind CDN, không phải production code)
    screen.png                    # ảnh render — dùng để so khớp pixel khi implement
```

Khi implement 1 màn hình: mở `code.html` **và** `screen.png` của màn hình đó, dựng lại bằng React + Tailwind token chuẩn.
`SPEC.md` ở gốc repo là tài liệu đặc tả chi tiết (data model, AI routing, rủi ro) — đọc kèm.

## Quy ước đặt tên

- File component: `PascalCase.tsx` — `PlanCard.tsx`, `RubricBar.tsx`
- File hook/util: `camelCase.ts` — `usePlanItems.ts`, `formatMinutes.ts`
- Hằng số rubric/domain: `SCREAMING_SNAKE_CASE` trong `rubrics.ts`
- Route handler API: `kebab-case` — `/api/interview/turn`
- Model Prisma: `PascalCase` — `PlanItem`, `Evidence`, `InterviewTurn`
