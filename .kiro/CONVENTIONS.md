# Quy ước đầu ra `.kiro/specs/<feature>/`

Mỗi feature có **3 file**: `spec.md`, `design.md`, `tasks.md`.
Tên feature: `kebab-case`, mô tả ngắn (vd `daily-loop-core`, `mock-interview`).

Bắt buộc đọc trước khi viết:
1. `.kiro/steering/product.md`
2. `.kiro/steering/tech.md`
3. `.kiro/steering/design-system.md`
4. `.kiro/steering/project.md`
5. `system-design/SPEC.md` (phần liên quan)
6. `system-design/s<NN>_<slug>/code.html` + `screen.png` (prototype của màn hình trong feature)
7. `system-design/focus_flow/DESIGN.md`

---

## 1. `spec.md` — format bắt buộc

```markdown
# <Tên Feature>

> **Màn hình:** S01, S05 · **Route:** `/`, `/log` · **Phase:** 0
> **Nguồn:** system-design/SPEC.md §2.1 · prototype `system-design/s01_.../`

## 1. Tổng quan

<Mô tả 1–3 đoạn: feature này giải quyết vấn đề gì, ai dùng, thuộc nguyên tắc P1–P7 nào.>

## 2. Bối cảnh & vấn đề

<2–4 bullet, dẫn từ vấn đề thật trong SPEC.md §0.1>

## 3. Yêu cầu chức năng

### 3.1 <Nhóm yêu cầu>
| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-XX-01 | ... | P0 | FR-DL-01 |

### 3.2 ...

## 4. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí kiểm tra |
|---|---|---|
| NFR-XX-01 | ... | ... |

## 5. Mô hình dữ liệu

| Model | Field | Kiểu | Ghi chú |
|---|---|---|---|

<Thêm phần "Quan hệ & ràng buộc" nếu cần.>

## 6. Giao diện & hành vi

### 6.1 Bố cục
<ASCII wireframe — bắt buộc, lấy cấu trúc thật từ prototype>

### 6.2 Bảng thành phần
| Vùng | Nội dung | Token design | Hành vi |
|---|---|---|---|

### 6.3 Trạng thái
| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|

### 6.4 Edge case
| Case | Xử lý |
|---|---|

## 6. Hợp đồng API
| Method | Route | Input | Output | Lỗi |
|---|---|---|---|---|

## 7. Tiêu chí nghiệm thu (Acceptance Criteria)

**AC-X — <tên>**
- *Given* ..., *When* ..., *Then* ...

## 8. Rủi ro riêng của feature
| # | Rủi ro | Giảm thiểu |
|---|---|---|
```

**Quy tắc:**
- Mỗi FR phải **traceable** về SPEC.md (giữ nguyên số hiệu FR-xx-yy của SPEC.md).
- Mỗi AC phải kiểm được (Given/When/Then), nêu rõ hành vi quan sát được.
- ASCII wireframe **bắt buộc** cho mọi màn hình — lấy layout thật từ prototype.
- Bảng thành phần phải ghi rõ **token design** (`bg-surface-container`, `text-secondary`…) — không mô tả mơ hồ.

---

## 2. `design.md` — format bắt buộc

```markdown
# Design — <Tên Feature>

## 1. Tổng quan kiến trúc
<1 đoạn + sơ đồ ASCII>

## 2. Kiến trúc
### 2.1 Sơ đồ luồng
<ASCII flow diagram>
### 2.2 Phân tầng
| Tầng | Module | Trách nhiệm |
|---|---|---|
### 2.3 Quyết định thiết kế
| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|

## 3. Thành phần
### 3.1 <Tên Component>
**Route/đường dẫn:** `src/...`
**Responsibilities:**
- ...
**Interfaces:**
```ts
// props / signature thật
```
**Dependencies:** ...
**Edge cases:** ...

### 3.2 ...

## 4. Luồng dữ liệu
### 4.1 Luồng chính
<numbered steps>
### 4.2 Lưu trữ & truy vấn
<SQL / Prisma query thật>

## 5. Xử lý lỗi
| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|

## 6. Chiến lược kiểm thử
| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | ... |
| Integration | Vitest + test DB | ... |
| E2E | Playwright | ... |
| Tiêu chí nghiệm thu | ... | ... |

## 7. Rủi ro & đánh đổi kỹ thuật
| # | Rủi ro | Tác động | Giảm thiểu |
```

**Quy tắc:**
- Phải có **signature TypeScript thật** cho mỗi component/hàm chính — không mô tả bằng lời.
- Phải nêu **AI layer** nếu feature có gọi AI: model, prompt shape, caching, structured output, fallback offline.
- Phải nêu **rủi ro kỹ thuật** riêng (không lặp lại steering).

---

## 3. `tasks.md` — format bắt buộc

```markdown
# Tasks — <Tên Feature>

> Phase: 0 · Phụ thuộc: `<feature khác>` (nếu có)
> Lưu ý: tuân thủ `.kiro/steering/tech.md` + `design-system.md`.

## 0. Nền tảng dữ liệu
- [ ] 1. Mô hình Prisma
  - [ ] 1.1 Thêm model `X` vào `prisma/schema.prisma` với field …
  - [ ] 1.2 Thêm index/unique …
  - [ ] 1.3 Chạy `npx prisma migrate dev`
  - [ ] 1.4 Viết seed cho …
- [ ] 2. Lớp nghiệp vụ
  - [ ] 2.1 Tạo `src/lib/x.ts` với `getX()`, `createX()`
  - [ ] 2.2 Unit test cho …

## 1. API
- [ ] 3. `POST /api/x`
  - [ ] 3.1 Validate body bằng Zod
  - [ ] 3.2 Handler …
  - [ ] 3.3 Error mapping …
  - [ ] 3.4 Test …

## 2. UI
- [ ] 4. Component `src/components/x/y.tsx`
  - [ ] 4.1 …
  - [ ] 4.2 Loading skeleton
  - [ ] 4.3 Empty state
  - [ ] 4.4 Error state

## 3. AI (nếu có)
- [ ] 5. Prompt + schema
  - [ ] 5.1 Thêm rubric hằng số vào `src/lib/prompts.ts`
  - [ ] 5.2 Thêm Zod schema
  - [ ] 5.3 Prompt caching: system prompt cố định + `cache_control`
  - [ ] 5.4 Fallback offline

## 4. Kiểm thử & nghiệm thu
- [ ] 6. Unit test
- [ ] 7. Integration test
- [ ] 8. E2E theo AC
- [ ] 9. Kiểm tra a11y + responsive 390px
- [ ] 10. Kiểm tra offline mode (không API key)
```

**Quy tắc:**
- Mỗi task là **1 hành động cụ thể, có thể kiểm chứng** — không "viết code cho X".
- Task phải có `- [ ]` (chưa làm) — sẵn sàng để tick.
- Mỗi nhóm task kết thúc bằng task kiểm thử tương ứng.
- Số task nhỏ hơn 1 dòng → phải tách.

---

## 4. Giọng văn

- Tiếng Việt, từ ngữ kỹ thuật chính xác, không dùng từ hoa mỹ.
- Không lặp lại nội dung steering — steering là nguồn chân lý, spec chỉ chi tiết hoá feature.
- Mọi con số, ID, route, tên field phải khớp với `system-design/SPEC.md` và prototype.
