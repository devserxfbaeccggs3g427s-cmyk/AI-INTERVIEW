# Design — Cây Kỹ Năng & Bằng Chứng

> Feature: `skill-tree-evidence` · Màn hình S03 (`/skills`), S04 (`/skills/[id]`) · Phase 0
> Nguồn: `.kiro/specs/skill-tree-evidence/spec.md`, `system-design/SPEC.md` §2.2, §4, §8 (AC-3)

## 1. Tổng quan kiến trúc

Đây là feature **read-mostly + 1 đường ghi duy nhất**. Toàn bộ số liệu là truy vấn SQLite thuần, không có AI, không có streaming. Cây 3 tầng được dựng **một lần** bằng `GROUP BY` (không N+1), mọi node đều mang sẵn `level` / `qualifiedCount` / `evidenceCount` / `avgRating` để UI không phải tự tính.

Điểm mấu chốt kiến trúc: `Skill.level` **không bao giờ** được ghi trực tiếp. Mọi thay đổi `Evidence` đi qua `recomputeSkillLevel()` trong cùng một transaction với `Evidence.create`, nên đọc `Skill.level` luôn nhất quán với dữ liệu bằng chứng (NFR-SK-09, AC-3).

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Server Component: src/app/skills/page.tsx  (S03)                          │
│   └── getSkillTree()  ──►  src/lib/skills.ts                              │
│         ├─ 1 query: Skill.findMany (include children 2 tầng)              │
│         ├─ 1 query: Evidence.groupBy(skillId)  → count/qualified/avg      │
│         ├─ 1 query: Activity.groupBy(skillId) → totalMinutes              │
│         ├─ 1 query: Evidence.findMany (recent 8, toàn hệ thống)           │
│         └─ buildTree() → SkillTreeNode[] (level đã tính sẵn)              │
│   └── <SkillTree tree={tree} focus={focus} />   ← Server, render tĩnh      │
│   └── <EvidenceFeed items={recent} />              ← Server                  │
│   └── <AddChildDialog />  ← Client (form tương tác)                        │
└────────────────────────────────────────────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┴───────────────────────────────┐
        │ Server Component: src/app/skills/[id]/page.tsx  (S04)          │
        │   └── getSkillDetail(id) ──► src/lib/skills.ts                │
        │         ├─ Skill.findUnique + ancestors (breadcrumb)          │
        │         ├─ Evidence.findMany (page) + Activity include        │
        │         ├─ Evidence.groupBy → qualifiedCount / avgRating      │
        │         ├─ Activity.aggregate → totalMinutes                  │
        │         ├─ levelTimeline() → level theo tuần                   │
        │         └─ computeNextLevel() → required / missing / checks    │
        │   └── <SkillDetail data={detail} />   ← Server                 │
        │   └── <EvidenceLog rows={rows} />      ← Server                 │
        │   └── <LogEvidenceButton skillId={id} /> ← Client (mở sheet)   │
└────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼  (đường ghi duy nhất)
┌────────────────────────────────────────────────────────────────────────────┐
│ POST /api/skills/[id]/evidence  ──► src/lib/skills.ts :: createEvidence()  │
│    prisma.$transaction(async tx => {                                      │
│      activity = tx.activity.create({...})                                │
│      evidence = tx.evidence.create({ activityId, skillId, rating })      │
│      recomputeSkillLevel(tx, skillId)   // level = MIN(5, FLOOR(q/3))   │
│      recomputeAncestors(tx, skillId)    // level tầng 1 = MAX hậu duệ    │
│    })                                                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

## 2. Kiến trúc

### 2.1 Sơ đồ luồng — S03 Cây kỹ năng

```
User mở /skills
   │
   ├─► getSkillTree()
   │     │
   │     ├─ [Q1] prisma.skill.findMany({
   │     │        where: { parentId: null },          // node tầng 1 = 4 domain
   │     │        include: {
   │     │          children: {
   │     │            orderBy: { position: "asc" },
   │     │            include: { children: { orderBy: { position: "asc" } } }, // tầng 3
   │     │          },
   │     │        },
   │     │        orderBy: { position: "asc" },
   │     │      })
   │     │
   │     ├─ [Q2] prisma.$queryRaw(`                          // 1 query cho TOÀN CÂY
   │     │        SELECT "skillId", COUNT(*),
   │     │               SUM(CASE WHEN "rating" >= 3 THEN 1 ELSE 0 END),
   │     │               AVG("rating")
   │     │        FROM "Evidence" GROUP BY "skillId"`)
   │     │   → countAll[skillId], countQualified[skillId], avgRating[skillId]
   │     │
   │     ├─ [Q3] prisma.activity.groupBy({ by: ["skillId"], _sum: { minutes: true } })
   │     │   → totalMinutes[skillId]
   │     │
   │     ├─ [Q5] prisma.evidence.findMany({
   │     │        orderBy: { createdAt: "desc" }, take: 8,
   │     │        include: { activity: { select: { title, type, skill: { select: { id, name } } } } },
   │     │      })
   │     │
   │     ├─ [Q6] prisma.userProfile.findFirst({ select: { focusSkillId: true } })
   │     │   → focusSkillId (dùng để set cờ isFocus cho node tương ứng)
   │     │
   │     └─ buildTree()  →  { nodes: SkillTreeNode[], totals, focusSkillId, recentEvidence }
   │
   ├─► render server-side (không chờ client JS)
   │
   └─► Client interactions:
          "+ Thêm mục con"  → POST /api/skills → router.refresh()
          "Đặt trọng tâm"  → POST /api/skills/focus → router.refresh()
          "Luyện tập đo lường ngay" → điều hướng /skills/{yếu nhất}
```

> **Không N+1:** Q2 + Q3 là 2 query `groupBy` cho toàn bộ cây; Q1 lấy cây bằng `include` lồng 2 tầng. Tổng 4–5 query cho cả trang (NFR-SK-04).

### 2.2 Sơ đồ luồng — S04 Chi tiết kỹ năng

```
User mở /skills/[id]
   │
   ├─► getSkillDetail(id)
   │     ├─ [Q1] prisma.skill.findUnique({ where: { id }, include: { parent, children } })
   │     ├─ [Q2] buildAncestorPath(id)     // breadcrumb: 3 cấp tối đa
   │     ├─ [Q3] prisma.evidence.findMany({
   │     │        where: { skillId: id },
   │     │        orderBy: { createdAt: "desc" },
   │     │        skip: (page-1)*limit, take: limit,
   │     │        include: { activity: { select: { title, content, type, minutes, createdAt } } },
   │     │      })
   │     ├─ [Q4] prisma.evidence.groupBy({ by: ["rating"], where: { skillId: id }, _count: { _all: true } })
   │     ├─ [Q5] prisma.activity.aggregate({ where: { evidences: { some: { skillId: id } } }, _sum: { minutes: true } })
   │     ├─ [Q6] levelTimeline(id)  → groupBy tuần (level tính lại theo mốc thời gian)
   │     ├─ [Q7] byType()           → groupBy Activity.type (chỉ loại có bằng chứng)
   │     └─ computeNextLevel()     → required / missing / 3 điều kiện
   │
   └─► render <SkillDetail> + <EvidenceLog> (server-side)
```

### 2.3 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| Route | `src/app/skills/page.tsx` | S03 — đọc query, gọi `getSkillTree()`, render server-side |
| Route | `src/app/skills/[id]/page.tsx` | S04 — đọc `params.id`, gọi `getSkillDetail()`, render server-side |
| UI | `src/components/skills/skill-tree.tsx` | Render cây 3 tầng + đường nối dashed (Server Component) |
| UI | `src/components/skills/skill-node.tsx` | Render 1 node (tầng 1 / 2 / 3) — thanh thang 0–5, badge, chip số bằng chứng |
| UI | `src/components/skills/level-scale.tsx` | Thanh segmented 0–5 dùng chung (tầng 1/2/3 khác kích thước) |
| UI | `src/components/skills/evidence-feed.tsx` | Panel "Bằng Chứng Gần Đây" (S03) |
| UI | `src/components/skills/skill-detail.tsx` | S04 — header, 4 metric tile, biểu đồ level theo tuần, phân bổ hoạt động, tiêu chuẩn thăng cấp |
| UI | `src/components/skills/evidence-log.tsx` | Bảng "Nhật ký bằng chứng (Evidence Log — P3)" — 6 cột |
| UI | `src/components/skills/add-child-dialog.tsx` | Client — form thêm mục con / đặt trọng tâm (POST + `router.refresh()`) |
| Nghiệp vụ | `src/lib/skills.ts` | `getSkillTree`, `getSkillDetail`, `createSkill`, `updateSkill`, `deleteSkill`, `createEvidence`, `recomputeSkillLevel`, `recomputeAncestors`, `computeNextLevel`, `levelTimeline` |
| Cấu hình | `src/lib/config.ts` | `SKILL_LEVEL_MAX`, `EVIDENCE_RATING_MIN`, `EVIDENCE_THRESHOLD`, `DOMAIN_KEYS` |
| API | `src/app/api/skills/route.ts` | GET (tree) · POST (tạo node) |
| API | `src/app/api/skills/[id]/route.ts` | GET (detail) · PATCH · DELETE |
| API | `src/app/api/skills/[id]/evidence/route.ts` | GET (phân trang) · POST (ghi bằng chứng — đường ghi duy nhất) |
| API | `src/app/api/skills/focus/route.ts` | POST — đặt/bỏ trọng tâm |

### 2.4 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D1 | `Skill.level` **không có API nào ghi trực tiếp**; chỉ `recomputeSkillLevel()` trong transaction mới được ghi | P3 + FR-SK-03: level là **hàm** của bằng chứng, không phải trạng thái tự do | Bỏ mọi "nút tăng level" trong UI; test K7 bảo đảm điều này |
| D2 | Công thức `level = MIN(5, FLOOR(qualified / threshold))` | Đơn giản, kiểm được, khớp AC-3 (2 BC rating 3 + 1 BC rating 4 → +1 level) | `EVIDENCE_THRESHOLD` đổi trong config → toàn bộ cây tính lại (script seed) |
| D3 | Đếm bằng chứng bằng **2 query `groupBy`** (tất cả + rating ≥ 3) thay vì 1 query per node | Tránh N+1; cây 3 tầng × nhiều node sẽ chậm | Cần index `Evidence.skillId` (đã có trong SPEC §4) |
| D4 | `Evidence.rating` là **Int 1–4** (schema) nhưng UI hiển thị `★ 4/4`; chỉ **điểm trung bình** mới là số thập phân | Không thể hiển thị `3.8/4.0` nếu rating là Int; trộn 2 thang gây hiểu nhầm | Badge dùng số nguyên; `avgRating` làm tròn 1 chữ số |
| D5 | Điểm trung bình 0–5 và điểm đánh giá 1–4 là **2 số liệu riêng biệt** | Prototype gộp 2 thang vào 1 ô → dễ đọc sai | Metric tile "Điểm trung bình" lấy từ `Activity.aiScore ?? Activity.quality`; nếu không có → "—" (R-SK-8) |
| D6 | Đường nối cây vẽ bằng **CSS pseudo-element `::before`/`::after`** với `border-dashed`, không dùng thư viện hay SVG phức tạp | Cần responsive 390px; SVG phải tính toạ độ theo layout → fragile | Connector đổi `border-primary` solid khi cha đạt `targetLevel` |
| D7 | `POST /api/skills/[id]/evidence` tạo `Activity` **và** `Evidence` trong 1 transaction | Đảm bảo không có "bằng chứng mồ côi"; `level` luôn khớp dữ liệu | Rollback được nếu `Evidence.create` lỗi (unique activityId+skillId) |
| D8 | Xoá node: con chuyển lên **ông bà** (`parentId = node.parentId`), không xoá con | Không mất dữ liệu người dùng; `onDelete: Cascade` chỉ áp cho `Evidence` của node bị xoá | Cần `recomputeAncestors` sau khi reparent |
| D9 | `focusSkillId` đặt trên `UserProfile` thay vì tạo model mới | Giữ đúng 19 model của SPEC §4; trọng tâm là 1 giá trị toàn cục ở Phase 0 | `onDelete: SetNull` khi xoá skill trọng tâm |
| D10 | S03/S04 **không gọi AI**; khối "Đề xuất bài tập" của prototype S04 bị loại bỏ khỏi scope | NFR-SK-01 + P6: app phải chạy đủ offline. AI suy ra "lỗ hổng phân tích được" là việc của feature AI khác | Panel AI của prototype không được implement ở feature này |
| D11 | Biểu đồ level theo tuần vẽ bằng **SVG tay** (polyline + polygon), không dùng thư viện chart | Design system yêu cầu màu token, không palette mặc định; chart nhỏ, dữ liệu ≤ 52 điểm | < 2 tuần có dữ liệu → hiện list thay vì chart rỗng |

## 3. Thành phần

### 3.1 `prisma/schema.prisma` — cây 3 tầng (self-relation)

```prisma
// ── Cây kỹ năng (self-relation 3 tầng) ────────────────────
model Skill {
  id          String   @id @default(cuid())
  name        String
  nameZh      String?          // tên tiếng Trung cho kỹ năng ngôn ngữ
  domain      String           // professional | communication | language | personal
  parentId    String?
  parent      Skill?    @relation("SkillTree", fields: [parentId], references: [id], onDelete: SetNull)
  children    Skill[]   @relation("SkillTree")
  level       Int      @default(0)     // 0..5, CHỈ tăng qua Evidence
  targetLevel Int      @default(3)     // 1..5, mốc tham chiếu
  position    Int      @default(0)
  createdAt   DateTime @default(now())
  activities  Activity[]
  evidences   Evidence[]

  @@index([parentId])
  @@index([domain])
}

// ── Trọng tâm hôm nay (1 giá trị toàn cục) ─────────────────
model UserProfile {
  id            String   @id @default(cuid())
  name          String?
  goals         String?
  aiTone        String   @default("direct")
  learningLangs String   @default("zh,en")
  zhLevel       String   @default("zero")
  enLevel       String   @default("zero")
  focusSkillId  String?
  focusSkill    Skill?   @relation(fields: [focusSkillId], references: [id], onDelete: SetNull)
  createdAt     DateTime @default(now())
}

// ── Bằng chứng (P3) ───────────────────────────────────────
model Evidence {
  id         String   @id @default(cuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  skillId    String
  skill      Skill    @relation(fields: [skillId], references: [id], onDelete: Cascade)
  rating     Int      // 1..4 chất lượng bằng chứng
  createdAt  DateTime @default(now())
  @@index([skillId])
  @@index([skillId, createdAt])
  @@unique([activityId, skillId])   // C6: 1 activity ↔ 1 evidence cho mỗi skill
}
```

> `onDelete: SetNull` trên `Skill.parent` = **node cha bị xoá → node con tự nối lên ông bà** (D8). `onDelete: Cascade` trên `Evidence.skill` = xoá node thì bằng chứng của node đó bị xoá (đúng SPEC §4).

**Quy ước tầng (dùng để validate):**

```ts
export type SkillDepth = 0 | 1 | 2;   // 0 = domain (tầng 1), 1 = kỹ năng, 2 = mục con
```

### 3.2 `src/lib/skills.ts` — lớp nghiệp vụ

**Responsibilities:**
- Dựng cây 3 tầng kèm số liệu đã tính sẵn.
- **Nguồn sự thật duy nhất** của công thức level.
- Ghi `Evidence` + tính lại level trong 1 transaction.
- Tính tiêu chuẩn thăng cấp (S04).

**Interfaces:**

```ts
// ── Kiểu dữ liệu ────────────────────────────────────────
export type DomainKey = "professional" | "communication" | "language" | "personal";

export interface SkillNodeDTO {
  id: string;
  name: string;
  nameZh: string | null;
  domain: DomainKey;
  parentId: string | null;
  depth: SkillDepth;                 // 0 | 1 | 2
  level: number;                     // 0..5 — đã tính sẵn
  targetLevel: number;               // 1..5
  position: number;
  evidenceCount: number;             // TỔNG số bằng chứng (kể cả rating < 3)
  qualifiedCount: number;            // số bằng chứng rating >= EVIDENCE_RATING_MIN
  avgRating: number | null;          // trung bình rating 1..4, 1 chữ số
  totalMinutes: number;              // tổng phút từ Activity có bằng chứng
  isFocus: boolean;                  // == trọng tâm hôm nay
  children: SkillNodeDTO[];
}

export interface RecentEvidenceDTO {
  evidenceId: string;
  hash: string;                      // 6 ký tự đầu của id, dạng "9a8f2"
  rating: number;                    // 1..4
  createdAt: string;                 // ISO
  timeLabel: string;                 // "Hôm nay, 14:20"
  activityTitle: string;
  activityType: string;              // study|write|speak|...
  skillId: string | null;
  skillName: string | null;
  isFocus: boolean;
}

export interface SkillTreeDTO {
  nodes: SkillNodeDTO[];             // 4 node tầng 1
  totals: {
    domainCount: number;
    evidenceCount: number;
    qualifiedCount: number;
    pendingSkills: number;           // node lá level = 0
  };
  focusSkillId: string | null;
  recentEvidence: RecentEvidenceDTO[];
}

// ── Chi tiết kỹ năng (S04) ──────────────────────────────
export interface SkillDetailDTO {
  skill: SkillNodeDTO & { description: string | null };
  path: Array<{ id: string; name: string; depth: SkillDepth }>;   // breadcrumb
  metrics: {
    level: number;
    targetLevel: number;
    evidenceCount: number;
    qualifiedCount: number;
    totalMinutes: number;
    avgRating: number | null;        // thang 1..4
    avgScore: number | null;         // thang 0..5 (Activity.aiScore ?? quality)
    sessionsCount: number;
  };
  levelTimeline: Array<{ week: string; level: number; qualified: number }>;
  byType: Array<{ type: string; count: number; avgRating: number }>;
  nextLevel: {
    currentLevel: number;
    required: number;
    current: number;
    missing: number;
    pct: number;                     // 0..100
    checks: Array<{
      id: "evidence_count" | "avg_rating" | "cadence";
      label: string;
      passed: boolean;
      detail: string;
    }>;
  };
  evidence: {
    items: EvidenceRowDTO[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface EvidenceRowDTO {
  evidenceId: string;
  hash: string;                      // "9a8f2"
  dateLabel: string;                 // "28/10/2026"
  type: string;                      // Activity.type
  title: string;
  content: string | null;            // nội dung chứng minh
  rating: number;                    // 1..4
  minutes: number;
}

// ── Hàm ──────────────────────────────────────────────────
export async function getSkillTree(opts?: {
  recentLimit?: number;              // mặc định 8
}): Promise<SkillTreeDTO>;

export async function getSkillDetail(
  skillId: string,
  opts?: { page?: number; limit?: number }
): Promise<SkillDetailDTO | null>;

export async function createSkill(input: {
  name: string;
  domain: DomainKey;
  parentId: string | null;
  targetLevel: number;
  kind: "domain" | "skill" | "child";
}): Promise<SkillNodeDTO>;

export async function updateSkill(
  skillId: string,
  patch: { name?: string; targetLevel?: number; parentId?: string }
): Promise<SkillNodeDTO>;

export async function deleteSkill(
  skillId: string,
  opts?: { cascade?: boolean }
): Promise<{ deletedId: string; reparentedChildren: string[] }>;

export async function createEvidence(input: {
  skillId: string;
  activityId?: string;               // nếu có → gắn vào Activity sẵn có
  title: string;
  type: string;
  minutes: number;
  rating: number;                    // 1..4
  content?: string | null;
  quality?: number | null;           // 1..5
}): Promise<{
  evidence: { id: string; rating: number; createdAt: string };
  activity: { id: string; title: string; type: string; minutes: number };
  skill: { id: string; level: number; qualifiedCount: number; levelUp: boolean; levelDown: boolean };
}>;

export async function setFocusSkill(skillId: string | null): Promise<string | null>;

/** NGUỒN SỰ THẬT DUY NHẤT của công thức level — KHÔNG gọi trực tiếp từ UI. */
export async function recomputeSkillLevel(
  tx: Prisma.TransactionClient,
  skillId: string
): Promise<{ level: number; qualifiedCount: number }>;

export function computeNextLevel(input: {
  level: number;
  qualifiedCount: number;
  evidenceCount: number;
  avgRating: number | null;
  lastEvidenceAt: Date | null;
  threshold: number;
}): SkillDetailDTO["nextLevel"];
```

**Dependencies:** `@prisma/client`, `src/lib/db.ts`, `src/lib/config.ts`, `src/lib/dates.ts`.

### 3.3 Truy vấn đếm Evidence (không N+1)

```ts
// Q2 — đếm bằng chứng cho TOÀN BỘ cây, 1 query duy nhất.
// Dùng $queryRaw vì Prisma `groupBy` không hỗ trợ vừa COUNT vừa SUM(điều kiện) vừa AVG
// trên cùng một field đã group (xem T2 trong §7).
const statRows = await prisma.$queryRaw<
  Array<{ skillId: string; countAll: number; countQualified: number; avgRating: number | null }>
>`
  SELECT
    "skillId",
    COUNT(*)                                                  AS "countAll",
    SUM(CASE WHEN "rating" >= ${EVIDENCE_RATING_MIN} THEN 1 ELSE 0 END) AS "countQualified",
    AVG("rating")                                             AS "avgRating"
  FROM "Evidence"
  GROUP BY "skillId";
`;

const statMap = new Map(statRows.map((r) => [r.skillId, r]));

// Q3 — tổng phút, chỉ tính Activity CÓ bằng chứng (P7)
const minutesRows = await prisma.activity.groupBy({
  by: ["skillId"],
  where: { skillId: { not: null } },
  _sum: { minutes: true },
});
const minutesMap = new Map(minutesRows.map((r) => [r.skillId!, r._sum.minutes ?? 0]));
```

```sql
-- SQL tương đương
SELECT "skillId",
       COUNT(*) AS "countAll",
       SUM(CASE WHEN "rating" >= 3 THEN 1 ELSE 0 END) AS "countQualified",
       AVG("rating") AS "avgRating"
FROM "Evidence" GROUP BY "skillId";

SELECT "skillId", SUM("minutes") FROM "Activity"
WHERE "skillId" IS NOT NULL GROUP BY "skillId";
```

> Điểm mấu chốt: `countQualified` được tính **bằng điều kiện `rating >= 3` ngay trong SQL** — không lấy từ `countAll` rồi lọc trong JS. Điều này giữ đúng ngữ nghĩa "bằng chứng đạt chuẩn" và tránh nhầm lẫn với `evidenceCount`. Toàn bộ SQL nằm **trong** `src/lib/skills.ts` — UI không biết SQL tồn tại.

### 3.4 Logic tính level (nguồn sự thật duy nhất)

```ts
// src/lib/config.ts
export const SKILL_LEVEL_MAX     = 5;
export const EVIDENCE_RATING_MIN = 3;   // chỉ rating >= 3 mới tính vào tăng level
export const EVIDENCE_THRESHOLD  = 3;   // số bằng chứng đạt chuẩn cho mỗi level
export const DOMAIN_KEYS = ["professional", "communication", "language", "personal"] as const;
```

```ts
// src/lib/skills.ts
export async function recomputeSkillLevel(
  tx: Prisma.TransactionClient,
  skillId: string
): Promise<{ level: number; qualifiedCount: number }> {
  const qualifiedCount = await tx.evidence.count({
    where: { skillId, rating: { gte: EVIDENCE_RATING_MIN } },
  });

  const level = Math.min(
    SKILL_LEVEL_MAX,
    Math.floor(qualifiedCount / EVIDENCE_THRESHOLD)
  );

  await tx.skill.update({ where: { id: skillId }, data: { level } });

  return { level, qualifiedCount };
}

/** Node tầng 1 (domain): level = MAX(level) của TOÀN BỘ hậu duệ (tầng 2 + tầng 3). */
export async function recomputeAncestors(
  tx: Prisma.TransactionClient,
  skillId: string
): Promise<void> {
  const node = await tx.skill.findUnique({
    where: { id: skillId },
    select: { parentId: true },
  });
  if (!node?.parentId) return;

  const parent = await tx.skill.findUnique({
    where: { id: node.parentId },
    select: { id: true, parentId: true },
  });
  if (!parent) return;

  // level của domain = MAX(level) của toàn bộ hậu duệ (tầng 2 + tầng 3),
  // lấy bằng include lồng 2 cấp vì cây chỉ cao 3 tầng.
  const children = await tx.skill.findMany({
    where: { parentId: parent.id },
    select: {
      level: true,
      children: { select: { level: true } },
    },
  });
  const maxDescendantLevel = Math.max(
    0,
    ...children.flatMap((c) => [c.level, ...c.children.map((g) => g.level)])
  );

  await tx.skill.update({
    where: { id: parent.id },
    data: { level: maxDescendantLevel },
  });

  // đệ quy lên ông bà (giữ đúng 3 tầng)
  await recomputeAncestors(tx, parent.id);
}
```

> `include` lồng 2 cấp là đủ vì cây chỉ cao 3 tầng (C1). Nếu sau này cho phép tầng 4, `recomputeAncestors` phải đổi sang truy vấn hậu duệ bằng CTE đệ quy.

**Bảng kiểm chứng công thức (unit test bắt buộc):**

| `qualifiedCount` | 0 | 1 | 2 | **3** | 4 | 5 | **6** | 9 | 12 | **15** | 99 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `level` | 0 | 0 | 0 | **1** | 1 | 1 | **2** | 3 | 4 | **5** | **5** |

**Ghi bằng chứng — đường ghi duy nhất (transaction):**

```ts
export async function createEvidence(input: {
  skillId: string;
  activityId?: string;
  title: string;
  type: string;
  minutes: number;
  rating: number;
  content?: string | null;
  quality?: number | null;
}) {
  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.findUnique({
      where: { id: input.skillId },
      select: { id: true, level: true },
    });
    if (!skill) throw new SkillNotFoundError(input.skillId);

    const activity = input.activityId
      ? await tx.activity.update({
          where: { id: input.activityId },
          data: {
            title: input.title,
            type: input.type,
            minutes: input.minutes,
            quality: input.quality ?? null,
          },
        })
      : await tx.activity.create({
          data: {
            skillId: input.skillId,
            domain: (await tx.skill.findUnique({
              where: { id: input.skillId },
              select: { domain: true },
            }))!.domain,
            type: input.type,
            title: input.title,
            content: input.content ?? null,
            minutes: input.minutes,
            quality: input.quality ?? null,
          },
        });

    const evidence = await tx.evidence.create({
      data: { activityId: activity.id, skillId: input.skillId, rating: input.rating },
    });

    const { level, qualifiedCount } = await recomputeSkillLevel(tx, input.skillId);
    await recomputeAncestors(tx, input.skillId);

    return {
      evidence: {
        id: evidence.id,
        rating: evidence.rating,
        createdAt: evidence.createdAt.toISOString(),
      },
      activity: {
        id: activity.id,
        title: activity.title,
        type: activity.type,
        minutes: activity.minutes,
      },
      skill: {
        id: input.skillId,
        level,
        qualifiedCount,
        levelUp: level > skill.level,
        levelDown: level < skill.level,
      },
    };
  });
}
```

### 3.5 Component `SkillTree` (S03)

**Route/đường dẫn:** `src/components/skills/skill-tree.tsx` (render từ `src/app/skills/page.tsx`)

**Responsibilities:**
- Render 4 khối domain (tầng 1) theo thứ tự cố định.
- Render node tầng 2 (kỹ năng) và node tầng 3 (mục con) với đường nối dashed.
- Truyền `level`, `evidenceCount`, `qualifiedCount` xuống `SkillNode` (không tự tính).

**Interfaces:**

```tsx
export interface SkillTreeProps {
  nodes: SkillNodeDTO[];             // 4 node tầng 1
  focusSkillId: string | null;
  onAddChild?: (parentId: string) => void;   // Client callback (form thêm mục con)
  onSetFocus?: (skillId: string) => void;
}

export default function SkillTree(props: SkillTreeProps): JSX.Element;
```

**Dependencies:** `skill-node.tsx`, `level-scale.tsx`.

**Edge cases:**
- `nodes = []` → empty state "Chưa có cây kỹ năng" + CTA tạo domain đầu tiên (không render khung rỗng).
- Domain không có con → khối domain vẫn hiện `level 0/5` + lời nhắc "Thêm kỹ năng cho domain này".
- Node tầng 3 có `children = []` → không render vùng lá trống; chỉ render nút "+ Thêm mục con" ở node tầng 2.

### 3.6 Component `SkillNode` (tầng 1 / 2 / 3)

**Route/đường dẫn:** `src/components/skills/skill-node.tsx`

**Responsibilities:**
- Render 1 node theo `depth` (0 = domain, 1 = kỹ năng, 2 = mục con).
- Thanh thang 0–5, chip số bằng chứng, badge trạng thái.
- Click node → `/skills/[id]`.

**Interfaces:**

```tsx
export interface SkillNodeProps {
  node: SkillNodeDTO;
  depth: SkillDepth;                 // 0 | 1 | 2
  isFocus: boolean;
  showAddChild?: boolean;            // chỉ depth === 1
}

export default function SkillNode(props: SkillNodeProps): JSX.Element;
```

**Nội dung theo tầng:**

| Tầng | Bố cục | Token chính |
|---|---|---|
| 0 — Domain | header: icon domain + "Domain n/4" + tên domain · bên phải: "Thang x/5" + số BC + thanh 5 ô | `section.bg-surface-container-low rounded-xl p-gutter-lg` · icon `w-10 h-10 rounded-lg bg-{domain}/10` · tên `font-headline-md text-on-surface font-bold` |
| 1 — Kỹ năng | header: icon + tên + chip số BC + thang nhỏ · bên dưới: lưới node tầng 3 + nút "+ Thêm mục con" | `div.bg-surface-container rounded-lg p-space-lg` · tên `font-headline-sm text-on-surface font-semibold` |
| 2 — Mục con | badge trạng thái · tên · số BC · thang 1 ô full-width | `div.bg-surface-container-high/80 rounded-lg p-space-md` |

**Badge trạng thái của node tầng 3:**

| Điều kiện | Badge | Token |
|---|---|---|
| `node.id === focusSkillId` | "● Trọng tâm hôm nay" | `rounded-full bg-tertiary/20 text-tertiary` + chấm `bg-tertiary animate-ping` |
| `node.evidenceCount === 0` | "Cần luyện tập" | `rounded bg-error-container/40 text-error` |
| `node.evidenceCount > 0 && node.qualifiedCount === 0` | "Chưa đạt chuẩn ≥3★" | `rounded bg-tertiary/10 text-tertiary` |
| `node.level >= node.targetLevel` | "Kiến trúc vững" | `rounded bg-surface-bright text-on-surface-variant` |

### 3.7 Render đường nối dashed (chi tiết kỹ thuật)

Đường nối được vẽ **bằng CSS border dashed** trên pseudo-element, không dùng SVG path (D6). Cấu trúc DOM:

```tsx
// Node tầng 2 nằm trong <ul role="tree"> , node tầng 3 nằm trong <ul> con
<ul role="tree" aria-label="Cây kỹ năng">
  <li role="treeitem" aria-expanded={true} aria-level={1}>
    {/* ── connector DỌC: từ domain xuống node tầng 2 ── */}
    <div className="relative pl-6 before:absolute before:left-0 before:top-0 before:h-6
                    before:w-px before:border-l-[1.5px] before:border-dashed
                    before:border-outline-variant" />
    {/* ── connector NGANG: từ node tầng 2 sang node tầng 3 ── */}
    <div className="relative pl-6 before:absolute before:left-0 before:top-1/2 before:w-4
                    before:border-t-[1.5px] before:border-dashed before:border-outline-variant" />
  </li>
</ul>
```

**Quy tắc Tailwind (không hardcode hex — dùng token):**

| Phần | Class | Token |
|---|---|---|
| Đường dọc | `before:border-l-[1.5px] before:border-dashed before:border-outline-variant` | `outline-variant` `#3c4a42` |
| Đường ngang | `before:border-t-[1.5px] before:border-dashed before:border-outline-variant` | `outline-variant` |
| Khi cha đạt `targetLevel` | `before:border-solid before:border-primary` | `primary` `#4edea3` |
| Độ dày | `1.5px` (đúng design-system §7.8) | — |

**Điều kiện đổi sang emerald solid:** `node.level >= node.targetLevel` — đúng như design-system §7.8 ("đổi sang emerald solid khi prerequisite hoàn tất").

**Responsive:** ở `< 768px`, cây xuống 1 cột và **ẩn** đường nối (`hidden md:block` trên pseudo-element) vì khi đã xếp dọc thì connector ngang vô nghĩa — nhưng vẫn giữ **indent** (`pl-6`) để thấy quan hệ cha–con.

### 3.8 Component `SkillDetail` (S04)

**Route/đường dẫn:** `src/components/skills/skill-detail.tsx`

**Responsibilities:**
- Header: breadcrumb, chip trạng thái, tên, mô tả.
- 4 metric tile: Cấp độ hiện tại · Bằng chứng · Thời gian tích lũy · Điểm trung bình.
- Biểu đồ level theo tuần (SVG tay).
- Phân bổ hoạt động theo loại.
- Khối "Tiêu chuẩn thăng cấp" (3 điều kiện).

**Interfaces:**

```tsx
export interface SkillDetailProps {
  detail: SkillDetailDTO;
  onLogEvidence?: () => void;        // Client callback → mở Quick-log
  onCreateSlot?: () => void;        // Client callback → tạo PlanItem ngày mai
}

export default function SkillDetail(props: SkillDetailProps): JSX.Element;
```

**Biểu đồ level theo tuần (SVG tay — D11):**

```tsx
export interface LevelTimelineChartProps {
  points: Array<{ week: string; level: number; qualified: number }>;
  thresholdLevel: number;           // level kế tiếp (đường ngưỡng)
  thresholdRequired: number;        // số BC cần để lên thresholdLevel
}

export default function LevelTimelineChart(props: LevelTimelineChartProps): JSX.Element;
```

- ViewBox `0 0 400 120`, `preserveAspectRatio="none"`.
- Lưới ngang: 3 đường `stroke="#262a34"` (token `surface-container-high`) `stroke-dasharray="3 3"` — dùng class `stroke-surface-container-high`.
- Đường ngưỡng: `stroke-tertiary` `stroke-dasharray="4 4"` `stroke-width="1.5"` + nhãn "Ngưỡng Cấp {n}".
- Vùng đầy: `<polygon fill="url(#gradient-area)">` với gradient `primary` 25% → 0%.
- Đường chính: `<polyline stroke="text-primary" stroke-width="2.5" stroke-linecap="round">`.
- Điểm dữ liệu: `<circle r="3.5">`, điểm cuối `r="4.5"` + `stroke="surface" stroke-width="2"`.
- `< 2` tuần có dữ liệu → **không** render chart; hiện danh sách dạng text.

### 3.9 Component `EvidenceLog` (bảng nhật ký bằng chứng)

**Route/đường dẫn:** `src/components/skills/evidence-log.tsx`

**Responsibilities:**
- Render bảng 6 cột theo đúng thứ tự prototype S04.
- Phân trang, lọc theo `ratingMin`.
- Mã băm SQLite 6 ký tự.

**Interfaces:**

```tsx
export interface EvidenceLogProps {
  items: EvidenceRowDTO[];
  total: number;
  page: number;
  limit: number;
  ratingMin?: number;                // 1..4, mặc định undefined = tất cả
}

export default function EvidenceLog(props: EvidenceLogProps): JSX.Element;
```

**Cấu trúc bảng (đúng thứ tự cột prototype S04):**

| # | `<th>` | Nội dung td | Token |
|---|---|---|---|
| 1 | Ngày | `dateLabel` (dd/MM/yyyy) | `font-code-md text-label-sm text-on-surface-variant whitespace-nowrap` |
| 2 | Loại hoạt động | chip theo `type` | `px-2 py-0.5 rounded font-label-sm` — màu theo domain (`bg-primary/10 text-primary`, `bg-secondary-container/40 text-secondary`, `bg-tertiary-container/30 text-tertiary`, `bg-surface-container-highest text-on-surface-variant`) |
| 3 | Tiêu đề hoạt động & Nội dung chứng minh | dòng 1 `title` (`font-body-md font-medium text-on-surface truncate`), dòng 2 `content` (`font-label-sm text-outline truncate`) | `max-w-md` |
| 4 | Đánh giá | chip `★ {rating}/4` | `rounded bg-surface-container font-code-md text-primary font-semibold` + icon `star` FILL 1 `text-tertiary` |
| 5 | SQLite State | `● HASH#{hash}` | `font-code-md text-primary` + chấm `w-1.5 h-1.5 rounded-full bg-primary` |
| 6 | Thao tác | nút icon `open_in_new` | `p-1 rounded hover:bg-surface-container text-on-surface-variant` + `aria-label="Xem chi tiết bản ghi"` |

**Sinh mã băm (FR-SK-12):**

```ts
// 6 ký tự đầu của cuid của Evidence — ổn định, không cần cột DB
export function evidenceHash(evidenceId: string): string {
  return evidenceId.slice(0, 6);
}
```

### 3.10 `LevelScale` — thanh thang 0–5 dùng chung

```tsx
export interface LevelScaleProps {
  level: number;                     // 0..5
  max?: number;                      // mặc định SKILL_LEVEL_MAX = 5
  size?: "sm" | "md" | "lg";         // tầng 3 | tầng 2 | tầng 1
  tone?: "primary" | "secondary" | "tertiary";   // theo màu domain
  label?: string;                    // ví dụ "Cấp 2 trên 5"
}

export default function LevelScale(props: LevelScaleProps): JSX.Element;
```

| size | Kích thước ô | Dùng cho |
|---|---|---|
| `sm` | `h-1 flex-1 rounded-xs` | Node tầng 3 |
| `md` | `w-4 h-1.5 rounded-xs` | Node tầng 2 |
| `lg` | `w-6 h-2 rounded-xs` | Node tầng 1 (domain) |

- Ô đã đạt: `bg-primary` (hoặc tone tương ứng) · Ô chưa đạt: `bg-surface-variant`.
- `role="img"` + `aria-label={label ?? \`Cấp ${level} trên ${max}\`}`.

### 3.11 API routes

#### `GET /api/skills` — cây 3 tầng

```ts
export async function GET(): Promise<Response> {
  const data = await getSkillTree();
  return Response.json({ ok: true, data });
}
```

#### `POST /api/skills` — tạo node

```ts
export const CreateSkillSchema = z.object({
  name: z.string().trim().min(2).max(80),
  domain: z.enum(["professional", "communication", "language", "personal"]),
  parentId: z.string().cuid().nullable().default(null),
  targetLevel: z.number().int().min(1).max(5).default(3),
  kind: z.enum(["domain", "skill", "child"]),
});

export async function POST(req: NextRequest): Promise<Response> {
  const parsed = CreateSkillSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const skill = await createSkill(parsed.data);
    return Response.json({ ok: true, data: { skill } }, { status: 201 });
  } catch (e) {
    if (e instanceof DepthExceededError) {
      return Response.json({ ok: false, error: "depth_exceeded" }, { status: 400 });
    }
    if (e instanceof DuplicateNameError) {
      return Response.json({ ok: false, error: "duplicate_name" }, { status: 409 });
    }
    if (e instanceof DomainRootExistsError) {
      return Response.json({ ok: false, error: "domain_root_exists" }, { status: 409 });
    }
    throw e;
  }
}
```

**Kiểm tra độ sâu (C1) trong `createSkill`:**

```ts
async function resolveDepth(tx: Prisma.TransactionClient, parentId: string | null): Promise<SkillDepth> {
  if (!parentId) return 0;
  const parent = await tx.skill.findUnique({
    where: { id: parentId },
    select: { parentId: true },
  });
  if (!parent) throw new SkillNotFoundError(parentId);
  const parentDepth = await resolveDepth(tx, parent.parentId);
  if (parentDepth >= 2) throw new DepthExceededError();
  return (parentDepth + 1) as SkillDepth;
}
```

#### `GET /api/skills/[id]` — chi tiết

```ts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const detail = await getSkillDetail(id, {
    page: Number(_req.nextUrl.searchParams.get("page") ?? 1),
    limit: Number(_req.nextUrl.searchParams.get("limit") ?? 20),
  });
  if (!detail) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, data: detail });
}
```

#### `POST /api/skills/[id]/evidence` — đường ghi bằng chứng duy nhất

```ts
export const CreateEvidenceSchema = z.object({
  activityId: z.string().cuid().optional(),
  title: z.string().trim().min(2).max(160),
  type: z.enum(["study", "write", "speak", "roleplay", "srs", "journal", "health", "custom"]),
  minutes: z.number().int().min(0).max(600),
  rating: z.number().int().min(1).max(4),
  content: z.string().max(2000).nullable().default(null),
  quality: z.number().int().min(1).max(5).nullable().default(null),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const parsed = CreateEvidenceSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await createEvidence({ skillId: id, ...parsed.data });
    return Response.json({ ok: true, data: result }, { status: 201 });
  } catch (e) {
    if (e instanceof SkillNotFoundError) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (e instanceof DuplicateEvidenceError) {
      return Response.json({ ok: false, error: "duplicate_evidence" }, { status: 409 });
    }
    throw e;
  }
}
```

#### `DELETE /api/skills/[id]` — xoá node (reparent con)

```ts
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const cascade = _req.nextUrl.searchParams.get("cascade") === "true";
  try {
    const result = await deleteSkill(id, { cascade });
    return Response.json({ ok: true, data: result });
  } catch (e) {
    if (e instanceof SkillNotFoundError) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (e instanceof SkillHasChildrenError) {
      return Response.json({ ok: false, error: "has_children" }, { status: 400 });
    }
    throw e;
  }
}
```

**Logic reparent (D8):**

```ts
export async function deleteSkill(
  skillId: string,
  opts?: { cascade?: boolean }
): Promise<{ deletedId: string; reparentedChildren: string[] }> {
  return prisma.$transaction(async (tx) => {
    const node = await tx.skill.findUnique({
      where: { id: skillId },
      select: { id: true, parentId: true, children: { select: { id: true } } },
    });
    if (!node) throw new SkillNotFoundError(skillId);

    // node cha bị xoá → con chuyển lên ông bà
    const reparented: string[] = [];
    if (node.children.length > 0) {
      if (!opts?.cascade) throw new SkillHasChildrenError(skillId);
      await tx.skill.updateMany({
        where: { parentId: skillId },
        data: { parentId: node.parentId },
      });
      reparented.push(...node.children.map((c) => c.id));
    }

    await tx.skill.delete({ where: { id: skillId } });   // Evidence cascade theo schema

    // tính lại level của các node còn lại trong nhánh bị ảnh hưởng
    if (node.parentId) await recomputeAncestors(tx, node.parentId);
    for (const childId of reparented) await recomputeAncestors(tx, childId);

    return { deletedId: skillId, reparentedChildren: reparented };
  });
}
```

## 4. Luồng dữ liệu

### 4.1 Luồng chính — dựng cây 3 tầng (S03)

1. `prisma.skill.findMany({ where: { parentId: null }, include: { children: { include: { children: true } } }, orderBy: { position: "asc" } })` → cây thô 3 tầng.
2. `prisma.$queryRaw` — 1 query group by `skillId` trả `COUNT(*)`, `SUM(rating >= 3)`, `AVG(rating)` → `countAllMap`, `countQualMap`, `avgRatingMap`.
3. `prisma.activity.groupBy({ by: ["skillId"], where: { skillId: { not: null } }, _sum: { minutes: true } })` → `minutesMap`.
4. `prisma.evidence.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { activity: { select: { title, type, skill: { select: { id, name } } } } } })` → feed gần đây.
5. `prisma.userProfile.findFirst({ select: { focusSkillId: true } })` → `focusSkillId`; node có `id === focusSkillId` được đánh dấu `isFocus = true`.
6. `buildTree()` gắn `evidenceCount` / `qualifiedCount` / `avgRating` / `totalMinutes` / `isFocus` vào từng node; tính `totals`.
7. Render server-side.

### 4.2 Luồng chính — chi tiết + biểu đồ (S04)

1. `prisma.skill.findUnique({ where: { id }, include: { parent: true, children: true } })`.
2. `buildAncestorPath(id)`: lặp `parentId` tối đa 3 vòng → mảng breadcrumb (root → node).
3. `prisma.evidence.findMany({ where: { skillId: id }, orderBy: { createdAt: "desc" }, skip, take, include: { activity: {...} } })` → dòng bảng.
4. `prisma.evidence.aggregate({ where: { skillId: id }, _count: { _all: true }, _avg: { rating: true }, _max: { createdAt: true } })` → `evidenceCount`, `avgRating`, `lastEvidenceAt`.
5. `prisma.evidence.count({ where: { skillId: id, rating: { gte: EVIDENCE_RATING_MIN } } })` → `qualifiedCount`.
6. `prisma.activity.aggregate({ where: { evidences: { some: { skillId: id } } }, _sum: { minutes: true }, _count: { _all: true } })` → `totalMinutes`, `sessionsCount`.
7. `levelTimeline(id)`: nhóm `Evidence.createdAt` theo tuần → tính `qualified` tích luỹ → `level = MIN(5, FLOOR(qualified/threshold))` cho từng tuần (tính lại từ đầu chu kỳ → biểu đồ phản ánh lịch sử thật, không phải chỉ level hiện tại).
8. `byType()`: `prisma.activity.groupBy({ by: ["type"], where: { evidences: { some: { skillId: id } } }, _count: { _all: true } })` + `AVG(rating)` theo type.
9. `computeNextLevel(...)` → `required`, `missing`, `pct`, 3 `checks`.

### 4.3 `computeNextLevel` — công thức tiêu chuẩn thăng cấp

```ts
export function computeNextLevel(input: {
  level: number;
  qualifiedCount: number;
  evidenceCount: number;
  avgRating: number | null;
  lastEvidenceAt: Date | null;
  threshold: number;
}): SkillDetailDTO["nextLevel"] {
  const currentLevel = input.level;
  const required = (currentLevel + 1) * input.threshold;
  const current = input.qualifiedCount;
  const missing = Math.max(0, required - current);
  const pct = required === 0 ? 100 : Math.min(100, Math.round((current / required) * 100));

  const cadenceOk =
    input.lastEvidenceAt !== null &&
    Date.now() - input.lastEvidenceAt.getTime() <= 14 * 24 * 60 * 60 * 1000;

  const checks = [
    {
      id: "evidence_count" as const,
      label: "Số bằng chứng đạt chuẩn (rating ≥ 3)",
      passed: current >= required,
      detail: `${current} / ${required} bằng chứng`,
    },
    {
      id: "avg_rating" as const,
      label: "Điểm đánh giá trung bình ≥ 3.5",
      passed: input.evidenceCount >= 3 && (input.avgRating ?? 0) >= 3.5,
      detail:
        input.evidenceCount < 3
          ? `Cần ít nhất 3 bằng chứng (hiện ${input.evidenceCount})`
          : `Hiện tại: ${input.avgRating?.toFixed(1) ?? "—"}/4.0`,
    },
    {
      id: "cadence" as const,
      label: "Nhịp duy trì — có bằng chứng trong 14 ngày gần nhất",
      passed: cadenceOk,
      detail: input.lastEvidenceAt
        ? `Bằng chứng gần nhất: ${formatViDate(input.lastEvidenceAt)}`
        : "Chưa có bằng chứng nào",
    },
  ];

  return { currentLevel, required, current, missing, pct, checks };
}
```

### 4.4 Lưu trữ & truy vấn — index cần có

| Query | Index |
|---|---|
| `Evidence.groupBy({ by: ["skillId"] })` | `@@index([skillId])` (đã có trong SPEC §4) |
| `Evidence.findMany({ where: { skillId, rating: { gte } }, orderBy: { createdAt: "desc" } })` | `@@index([skillId, createdAt])` (thêm trong feature này) |
| `Skill.findMany({ where: { parentId: null } })` + `children` | `@@index([parentId])` (thêm trong feature này) |
| `Skill.findMany({ where: { domain } })` | `@@index([domain])` (thêm trong feature này) |
| `Activity.groupBy({ by: ["skillId"] })` | `@@index([skillId])` trên `Activity` (thêm nếu chưa có) |

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| `id` không tồn tại | `getSkillDetail` → `null` | 404 + `notFound()` tiếng Việt | "Không tìm thấy kỹ năng này" + nút "Về Cây kỹ năng" |
| Body không hợp lệ (thiếu tên, `targetLevel` ngoài 1–5, `rating` ngoài 1–4) | `Zod.safeParse` fail | 400 `{ ok: false, error: "validation", details }` | Highlight ô lỗi, không submit |
| Thêm node tầng 4 | `DepthExceededError` | 400 `depth_exceeded` | "Cây kỹ năng chỉ có 3 tầng — không thể thêm mục con ở tầng này" |
| Tạo domain thứ 2 cùng `domain` | `DomainRootExistsError` | 409 `domain_root_exists` | "Domain này đã có node gốc" |
| Trùng tên trong cùng nhóm cha | `DuplicateNameError` | 409 `duplicate_name` | "Đã có mục cùng tên trong nhóm này" |
| Ghi bằng chứng trùng cặp (activityId, skillId) | `Prisma P2002` unique | 409 `duplicate_evidence` | "Hoạt động này đã được ghi nhận cho kỹ năng này" |
| Ghi bằng chứng lỗi DB (khóa file SQLite) | exception | 500, transaction rollback | "Không lưu được bằng chứng. Thử lại." + nút "Thử lại" |
| Xoá node có con mà `cascade=false` | `SkillHasChildrenError` | 400 `has_children` | "Mục này còn {n} mục con — xoá sẽ chuyển chúng lên cấp trên" |
| Xoá skill đang là trọng tâm | `onDelete: SetNull` | tự đặt `focusSkillId = null` | Banner "Đã bỏ trọng tâm vì kỹ năng bị xoá" |
| DB truy vấn lỗi | exception | 500 + log | "Không tải được cây kỹ năng. Tải lại trang." (không sập trang) |
| `router.refresh()` sau khi ghi bằng chứng lỗi | catch trong Client Component | giữ state form | Toast "Không lưu được — thử lại" |
| Thiếu `ANTHROPIC_API_KEY` | — | **không ảnh hưởng** | (feature không gọi AI) |

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | `recomputeSkillLevel`: bảng 0/1/2/3/4/5/6/9/12/15/99 → level đúng (AC-3) |
| Unit | Vitest | `computeNextLevel`: `required`, `missing`, `pct`, 3 `checks` — gồm case `evidenceCount < 3` (chưa đủ mẫu) |
| Unit | Vitest | `levelTimeline`: mốc thời gian → tuần đúng (múi giờ local) |
| Unit | Vitest | `evidenceHash`: 6 ký tự, ổn định |
| Unit | Vitest | `resolveDepth`: depth 0/1/2 OK, depth 3 → `DepthExceededError` |
| Unit | Vitest | `buildTree`: gắn đúng `evidenceCount`/`qualifiedCount`/`avgRating`/`totalMinutes` |
| Integration | Vitest + SQLite test DB | 2 BC rating 3 + 1 BC rating 4 → `level` 0→1 (AC-3) |
| Integration | Vitest | 3 BC rating 2 → `level` = 0, `evidenceCount` = 3, `qualifiedCount` = 0 (AC-SK-6) |
| Integration | Vitest | Tạo `Activity` không `skillId` → không sinh bằng chứng, `level` không đổi (K8) |
| Integration | Vitest | `POST evidence` trùng cặp → 409, `level` không đổi (K3) |
| Integration | Vitest | Xoá node cha → con lên ông bà, `Evidence` cascade, `level` tính lại (AC-SK-7) |
| Integration | Vitest | Xoá 1 bằng chứng → `qualifiedCount` giảm, `level` có thể giảm (K9) |
| Integration | Vitest | `GET /api/skills` với fixture 4 domain × 2 kỹ năng × 2 mục con → cây đúng 3 tầng (AC-SK-1) |
| Integration | Vitest | `Evidence` 500 bản ghi → query vẫn nhanh, không N+1 (đếm số query bằng counter) |
| E2E | Playwright | `/skills` render 4 domain + cây 3 tầng; click node tầng 3 → `/skills/[id]` đúng |
| E2E | Playwright | Bấm "+ Thêm mục con" → điền form → node mới xuất hiện dưới cha (AC-SK-2) |
| E2E | Playwright | Ghi bằng chứng rating 3 ×3 → thang đổi 0→1 ngay trên UI mà không reload (AC-3) |
| E2E | Playwright | `/skills/[id]` có bảng 6 cột đúng thứ tự + tổng thời gian khớp `SUM(minutes)` (AC-SK-4) |
| E2E | Playwright | `/skills` không có API key → mọi số liệu hiển thị (AC-SK-9) |
| E2E | Playwright | `/skills/xxx` không tồn tại → trang 404 tiếng Việt, không crash |
| A11y | axe | Cây dùng `role="tree"`/`treeitem` + `aria-level`; bảng `<table>` semantic; icon-only có `aria-label`; focus ring `focus-visible:ring-2 focus-visible:ring-primary` |
| Responsive | Playwright 390px | Cây 1 cột, indent giữ, bảng scroll ngang trong `overflow-x-auto`, không tràn viewport (AC-SK-10) |
| Nghiệm thu | — | Chạy lại AC-3, AC-SK-1..12; đánh dấu pass/fail |

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | `Skill.level` lệch với dữ liệu do ghi ngoài luồng (script import, sửa DB tay) | Cây hiển thị sai → mất niềm tin P3 | `recomputeSkillLevel()` là nguồn duy nhất; thêm script `npm run skills:recompute` gọi lại cho toàn bộ cây; `level` không có endpoint ghi trực tiếp |
| T2 | Cần cả `COUNT(*)`, `SUM(rating >= 3)` lẫn `AVG(rating)` theo `skillId` — Prisma `groupBy` không hỗ trợ vừa vậy | Tốn 2–3 round-trip; dễ lệch logic khi đổi schema | Dùng **1** `prisma.$queryRaw` group by trả cả 3 giá trị; SQL gói trong `src/lib/skills.ts` để UI không biết SQL tồn tại; thêm unit test chốt tên cột trả về |
| T3 | Tính `levelTimeline` bằng cách duyệt lịch sử `Evidence` | Số điểm chart lớn → render nặng | Chỉ 52 tuần gần nhất; tính bằng 1 `groupBy` theo tuần; `level` tính lại tích luỹ trong JS |
| T4 | Biểu đồ SVG tay vỡ khi số liệu thay đổi (0 điểm, 1 điểm, giá trị null) | Chart rỗng hoặc NaN | Guard `< 2` điểm → render list; chuẩn hoá `level` về `[0, max]` trước khi scale |
| T5 | Đường nối dashed bằng `::before` lệch khi node wrap nhiều dòng (tên dài) | Connector không chạm node | `min-w-0` + `truncate` cho tên node; connector neo theo **top** của node chứ không theo chiều cao text |
| T6 | `router.refresh()` sau mỗi thao tác ghi → tải lại cả trang | Cảm giác chậm trên máy yếu | Refresh chỉ trên Server Component data; form đóng trước khi refresh; dùng `revalidatePath` có giới hạn |
| T7 | `@@unique([activityId, skillId])` có thể xung đột với dữ liệu seed đã tồn tại | Migration lỗi | Migration phải **dedupe trước**: xoá bằng chứng trùng, giữ bản `createdAt` sớm nhất |
| T8 | `onDelete: SetNull` trên `Skill.parent` làm node con mất "tầng" (thành tầng 2) | Cây không còn đúng 3 tầng sau khi xoá cha | `deleteSkill` chuyển con lên **ông bà** (`parentId = node.parentId`) chứ không để null; `resolveDepth` validate lại khi tạo mới |
| T9 | Feature khác (daily-loop-core) cũng tạo `Evidence` → 2 nơi ghi, dễ lệch công thức | Level không nhất quán | `createEvidence()` trong `src/lib/skills.ts` là **hàm duy nhất** được phép ghi `Evidence`; daily-loop-core gọi hàm này, không tự `prisma.evidence.create` |
| T10 | `avgScore` (thang 0–5) và `avgRating` (thang 1–4) bị lẫn khi render | Người dùng đọc sai điểm | Tách 2 field trong DTO + tên metric rõ ràng ("Điểm trung bình 0–5" / "Điểm đánh giá TB 1–4"); không có nguồn → hiện "—" |
| T11 | Query `Evidence` theo `createdAt` mà thiếu index phức tạp | S04 load > 500ms khi nhiều bằng chứng | Thêm `@@index([skillId, createdAt])`; limit mặc định 20 dòng |
| T12 | Người dùng tạo hàng trăm node → cây rối | UX tệ | `position` để sắp xếp; giới hạn 1 domain root; chưa có chức năng reorder ở Phase 0 |
