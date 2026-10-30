# Design — Ôn Ngoại Ngữ SRS / FSRS (S09, S10)

> Feature: `srs-language-review` · Màn hình: S09 `/language`, S10 `/language/session`
> Nguồn: `system-design/SPEC.md` §2.3, §3.2, §4 · `.kiro/specs/srs-language-review/spec.md`
> Tuân thủ: `.kiro/steering/tech.md`, `.kiro/steering/design-system.md`

---

## 1. Tổng quan kiến trúc

Feature này là một **mô-đun local-first, không AI**. Toàn bộ logic ôn tập nằm trong một thư viện thuần (`src/lib/fsrs.ts`) bao bọc `ts-fsrs`, một tầng truy vấn (`src/lib/srs.ts`) đọc/ghi SQLite qua Prisma, và hai màn hình Next.js 15 App Router: S09 là Server Component + các panel Client, S10 là Client Component vì dùng state, bàn phím và Web Speech API.

Ranh giới quan trọng: **thuật toán và dữ liệu luôn ở server**. Client chỉ hiển thị `preview` do server tính, không tự suy diễn khoảng cách ôn — nếu không, nhãn trên 4 nút sẽ lệch với state thật và AC-4 sẽ không kiểm được.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                                  │
│  ┌───────────────────────┐        ┌─────────────────────────────────────┐  │
│  │ S09 /language         │        │ S10 /language/session               │  │
│  │ Server Component      │        │ Client Component                   │  │
│  │  ├ LanguageHubStats   │        │  ├ FlashcardReview                 │  │
│  │  ├ DeckCard (link)    │        │  ├ FsrsGradeBar                    │  │
│  │  ├ GroupGrid (client) │        │  ├ SessionStatsSidebar             │  │
│  │  ├ CardTable (client) │        │  ├ SpeechButton / useSpeech        │  │
│  │  └ AddCardDialog      │        │  └ useKeyboardShortcuts            │  │
│  └───────────┬───────────┘        └──────────────┬──────────────────────┘  │
│              │ fetch                              │ fetch                  │
└──────────────┼───────────────────────────────────┼─────────────────────────┘
               │                                   │
               ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                      Next.js Route Handlers (src/app/api)                  │
│  /api/language   /api/language/cards   /api/srs/next   /api/srs/grade      │
│  /api/srs/session                        (Zod validate → { ok, data })      │
└──────────────┬───────────────────────────────────┬─────────────────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│ src/lib/srs.ts  (lớp nghiệp vụ)      │  │ src/lib/fsrs.ts (wrapper thuật toán)│
│  - listDueCards / pickNewCards        │  │  - FSRS_CONFIG (đóng băng)        │
│  - buildSession / gradeCard           │  │  - scheduler: FSRS                │
│  - getLanguageStats / getStreak       │  │  - previewIntervals / applyRating │
│  - serializeCardState / restoreState  │  │  - toCardState / fromCardState    │
└──────────────┬─────────────────────────┘  └──────────────┬───────────────────┘
               │                                           │
               ▼                                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     Prisma + SQLite (file:./dev.db)                        │
│  Card (120 seed)  Review  SrsSession  Skill  Activity  UserProfile          │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Kiến trúc

### 2.1 Sơ đồ luồng — phiên ôn (S10)

```
  Người dùng                    Client (S10)                        Server (Route)              SQLite
      │                             │                                   │                        │
      │ mở /language/session?lang=zh│                                   │                        │
      ├────────────────────────────►│ POST /api/srs/session {lang:zh}   │                        │
      │                             ├──────────────────────────────────►│ buildSession():          │
      │                             │                                   │  1) listDueCards(lang)   │
      │                             │                                   │  2) còn chỗ? → pickNewCards│
      │                             │                                   │  3) cap = min(20, total)  │
      │                             │                                   │  4) tạo SrsSession        │
      │                             │◄──────────────────────────────────┤ cardIds[] + total        │
      │                             │                                   ├───────────────────────►│ INSERT SrsSession
      │                             │                                   │                        │
      │                             │ GET /api/srs/next?sessionId=…    │                        │
      │                             ├──────────────────────────────────►│ đọc cardIds[index]      │
      │                             │                                   │ previewIntervals(state)  │
      │                             │◄──────────────────────────────────┤ card + preview 4 mức    │
      │                             │                                   │                        │
      │      ┌── hiện mặt trước: pinyin/từ + nút nghe + timer ────┐│                        │
      │      │  [H] gợi ý · [Space] lật thẻ                      ││                        │
      │      ▼                                                     ││                        │
      │ bấm "Good" (hoặc phím 3)                                  │                        │
      ├────────────────────────────►│ POST /api/srs/grade           │                        │
      │                             ├──────────────────────────────────►│ applyRating(cardState,3) │
      │                             │                                   │ BEGIN TX                  │
      │                             │                                   │  UPDATE Card (state,due,S,│
      │                             │                                   │   D,reps,lapses)         │
      │                             │                                   │  INSERT Review            │
      │                             │                                   │  UPDATE SrsSession        │
      │                             │                                   │ COMMIT                   │
      │                             │◄──────────────────────────────────┤ { card, index, nextPreview }
      │                             │ render thẻ kế tiếp (index+1)      │                        │
      │                             │                                   │                        │
      │ index == total → "Đã ôn xong hôm nay"                        │                        │
```

### 2.2 Phân tầng

| Tầng | Module | Trách nhiệm |
|---|---|---|
| **UI — S09** | `src/app/language/page.tsx` (Server) + `src/components/language/*.tsx` | Đọc stats server-side, render deck cards, panel nhóm, bảng thẻ; filter/pagination là Client |
| **UI — S10** | `src/app/language/session/page.tsx` (Client) | Vòng lặp 1 thẻ 1 lượt, phím tắt, timer, TTS, thanh 4 nút |
| **Route handlers** | `src/app/api/language/route.ts`, `src/app/api/language/cards/route.ts`, `src/app/api/srs/{next,grade,session}/route.ts` | Validate Zod, gọi lớp nghiệp vụ, map lỗi `{ ok:false, error }` |
| **Lớp nghiệp vụ** | `src/lib/srs.ts` | Truy vấn Card/Review/SrsSession, thuật toán chọn thẻ, tính streak, serialize state |
| **Wrapper thuật toán** | `src/lib/fsrs.ts` | Khởi tạo `scheduler` với tham số đóng băng, `repeat`/`next`, chuyển đổi state ↔ JSON |
| **Truy cập dữ liệu** | `src/lib/db.ts` (Prisma singleton) | Kết nối SQLite |
| **Seed** | `prisma/seed.ts` + `prisma/seed-data/{zh,en}.ts` | 120 thẻ + 20 mẫu câu, tĩnh, không gọi AI |

> **Ranh giới quan trọng:** `src/lib/fsrs.ts` **không** import Prisma. Nó là thư viện thuần, test được bằng Vitest không cần DB. Nhờ vậy AC-4 kiểm được trực tiếp: `expect(applyRating(newState, 3)).toEqual(scheduler.next(newState, now, Rating.Good).card)`.

### 2.3 Quyết định thiết kế

| # | Quyết định | Lý do | Hệ quả |
|---|---|---|---|
| D1 | `scheduler.repeat()` chạy **server-side** trong `GET /api/srs/next` | Khoảng cách hiển thị trên 4 nút phải bám state thật (AC-4); client không có `ts-fsrs` trong bundle | Mỗi lượt ôn gửi 1 request đọc thẻ; payload `preview` 4 mức (~200 byte) |
| D2 | `Card.cardState` (JSON) là **nguồn sự thật**; `due`/`stability`/`difficulty`/`reps`/`lapses` là **denormalized** | SPEC §4 yêu cầu state JSON nhưng index `@@index([lang, due])` cần cột scalar | Phải có test đồng bộ 2 chiều (R14) |
| D3 | Thêm model `SrsSession` (ngoài 19 model của SPEC §4) | Cần queue ổn định, khôi phục phiên dang dở, đếm `3/12 thẻ` | Cần cập nhật SPEC §4 ở lần cập nhật tiếp theo |
| D4 | Tham số FSRS **đóng băng** trong `FSRS_CONFIG`, không cho UI sửa | Đổi `request_retention` giữa chừng làm sai lệch toàn bộ lịch đã lưu (R11) | Chỉ đổi được qua migration + `cardState.version` |
| D5 | `enable_fuzz: false` | Interval phải **tiên đoán được** để test AC-4; fuzz ngẫu nhiên làm test bất định | Interval dài có thể lặp lại giữa 2 thẻ giống nhau — chấp nhận |
| D6 | `learning_steps: ['1m','10m']`, `relearning_steps: ['10m']` | Khớp nhãn prototype S10: Again = "Lặp lại trong 1 phút", Hard = "Ôn sau 10 phút" | Thẻ mới chấm Good → học bước 1 (10 phút), lần sau Good → Review |
| D7 | `request_retention: 0.9` | Khớp prototype S09 ("Mục tiêu 90%", "giữ nhịp R=0.90") | Load ôn cao hơn nhưng bền hơn |
| D8 | `maximum_interval: 365` ngày | Đủ cho level 0; tránh thẻ "biến mất" 10 năm | Số hiện trong panel "Maximum Interval: 365d" |
| D9 | `Card.hint` dùng **2 nghĩa khác nhau** theo `lang` (zh = gợi ý ngữ cảnh, en = phiên âm Việt) | Không thêm cột mới; SPEC §4 chỉ có `hint` | Comment trong schema phải ghi rõ |
| D10 | Phiên âm Việt (en) **tắt dần theo 14 ngày từ lượt ôn đầu tiên**, tính từ `Card.createdAt` | §2.3.1: "trong 2 tuần đầu, sau đó tắt dần"; `createdAt` là mốc ổn định nhất | Thẻ tạo từ lâu nhưng chưa ôn → hiện phiên âm (đúng tinh thần "cửa sổ vào") |
| D11 | TTS dùng `window.speechSynthesis`, không dịch vụ ngoài | NFR-07, P6 | Không có fallback server → phải có fallback UI (R5) |
| D12 | `state` trong `cardState` lưu **số** (`0..3`) | JSON không giữ enum → serialize sang số | `fsrs.ts` cung cấp `toCardState` / `fromCardState` để chỗ khác không tự quy định |
| D13 | `POST /api/srs/session` là nơi **duy nhất** quyết định thứ tự thẻ | Queue phải ổn định suốt phiên; nếu mỗi lượt query lại "đến hạn" thì thẻ vừa ôn có thể quay lại giữa chừng | Client giữ `cardIds` từ server, không tự sắp xếp |
| D14 | `enable_short_term: true` | Cần thẻ mới ôn lại trong ngày (bước 1m/10m) — đúng "học 3 bước" của level 0 | `Again` trên thẻ đã học → `lapses + 1`, quay về relearning 10 phút |
| D15 | Không dùng AI trong feature này | R6 + FR-LG-10 | Không có `AiCall`, không có prompt, không có cost |

---

## 3. Thành phần

### 3.1 `src/lib/fsrs.ts` — wrapper FSRS (thuật toán thuần)

**Route/đường dẫn:** `src/lib/fsrs.ts`
**Responsibilities:**
- Khởi tạo `scheduler` với tham số **đóng băng** cho toàn app.
- Cung cấp `previewIntervals()` để tính **4 mức chấm** (Again/Hard/Good/Easy) cho UI.
- Cung cấp `applyRating()` để áp dụng 1 lượt ôn, trả state mới.
- Chuyển đổi state FSRS ↔ JSON lưu trong `Card.cardState`.
- **Không** import Prisma, **không** import AI.

**Interfaces:**

```ts
// src/lib/fsrs.ts
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type FSRSParameters,
  type Grade,
  type RecordLog,
} from 'ts-fsrs';

/** Ngôn ngữ học được hỗ trợ (P5 — đóng băng 2 ngôn ngữ). */
export type Lang = 'zh' | 'en';

/** 4 mức chấm FSRS — khớp cột `Review.rating` trong SPEC §4. */
export type GradeRating = 1 | 2 | 3 | 4;

/** State FSRS lưu trong `Card.cardState` (JSON). Bọc version để migrate. */
export interface CardState {
  version: 1;
  due: string;          // ISO-8601 UTC
  stability: number;    // S — độ bền bộ nhớ (ngày)
  difficulty: number;   // D — độ khó (1..10)
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;        // 0=New 1=Learning 2=Review 3=Relearning
  lastReview: string | null; // ISO-8601 UTC
}

/** Một mức chấm kèm khoảng cách tới lượt ôn kế tiếp. */
export interface RatingPreview {
  rating: GradeRating;
  /** Khoảng cách tới lượt ôn kế tiếp, tính bằng phút. */
  intervalMinutes: number;
  /** Nhãn đã định dạng cho UI, ví dụ "Lặp lại trong 1 phút" / "Ôn sau 4 ngày". */
  label: string;
  /** ISO-8601 UTC — thời điểm đến hạn của thẻ nếu chấm mức này. */
  due: string;
  /** State FSRS sau khi chấm mức này. */
  card: CardState;
}

/**
 * Tham số FSRS — ĐÓNG BĂNG (R11).
 * Đổi giá trị ở đây = migration toàn bộ lịch đã lưu. Không cho UI sửa.
 */
export const FSRS_CONFIG: FSRSParameters = generatorParameters({
  request_retention: 0.9,        // D7 — khớp "Mục tiêu 90%" của prototype S09
  maximum_interval: 365,          // D8
  enable_fuzz: false,             // D5 — interval tiên đoán được cho test AC-4
  enable_short_term: true,        // D14
  learning_steps: ['1m', '10m'],  // D6 — khớp nhãn prototype S10
  relearning_steps: ['10m'],
});

/** Scheduler dùng chung — khởi tạo 1 lần, thuần, không state. */
export const scheduler = fsrs(FSRS_CONFIG);

/** Ngưỡng coi thẻ là "đã thuộc" (stable) — dùng cho số liệu S09. */
export const MASTERY_STABILITY_DAYS = 21;

/** Ngưỡng thẻ còn "đang học" (chưa mature). */
export const LEARNING_STABILITY_DAYS = 21;

/** Tạo state thẻ mới (chưa từng ôn) — dùng khi seed và khi thêm thẻ thủ công. */
export function createNewCardState(now: Date = new Date()): CardState;

/** Chuyển state FSRS nội bộ → JSON lưu DB. */
export function toCardState(card: FsrsCard): CardState;

/** Chuyển JSON lưu DB → state FSRS nội bộ (phục hồi scheduler). */
export function fromCardState(state: CardState): FsrsCard;

/**
 * Tính preview 4 mức chấm cho 1 thẻ.
 * @param cardState - state hiện tại của thẻ (đọc từ `Card.cardState`)
 * @param now - thời điểm hiện tại
 * @returns Record theo `GradeRating` → preview (thứ tự Again → Easy)
 */
export function previewIntervals(
  cardState: CardState,
  now: Date = new Date(),
): Record<GradeRating, RatingPreview>;

/**
 * Áp dụng 1 lượt ôn.
 * @returns state mới **đúng** như `scheduler.next(cardState, now, rating)`
 */
export function applyRating(
  cardState: CardState,
  rating: GradeRating,
  now: Date = new Date(),
): { card: CardState; log: ReviewLogSnapshot };

/**
 * Định dạng khoảng cách cho UI.
 * @param minutes - khoảng cách tới lượt ôn kế tiếp (phút)
 * @param rating - mức chấm; `1` (Again) dùng "Lặp lại trong…", các mức khác dùng "Ôn sau…"
 */
export function formatInterval(minutes: number, rating?: GradeRating): string;

/** Tỷ lệ giữ lại bộ nhớ tại thời điểm `now` (0..1) — cho panel chỉ số. */
export function retrievability(cardState: CardState, now: Date = new Date()): number;

/** Nguyên nhân dùng `Grade` của ts-fsrs: enum `Rating.Again|Hard|Good|Easy`. */
export function toTsfsrsGrade(rating: GradeRating): Grade;
```

**Cài đặt tham chiếu (trích từ `ts-fsrs` v5.x API):**

```ts
// src/lib/fsrs.ts — phần cài đặt chính
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type FSRSParameters,
  type Grade,
} from 'ts-fsrs';

export const FSRS_CONFIG: FSRSParameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

export const scheduler = fsrs(FSRS_CONFIG);

export function createNewCardState(now: Date = new Date()): CardState {
  return toCardState(createEmptyCard(now));
}

export function toCardState(card: FsrsCard): CardState {
  return {
    version: 1,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function fromCardState(state: CardState): FsrsCard {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    last_review: state.lastReview ? new Date(state.lastReview) : undefined,
  };
}

const GRADE_BY_RATING: Record<GradeRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

export function toTsfsrsGrade(rating: GradeRating): Grade {
  return GRADE_BY_RATING[rating];
}

export function previewIntervals(
  cardState: CardState,
  now: Date = new Date(),
): Record<GradeRating, RatingPreview> {
  const preview: Record<GradeRating, RatingPreview> = {} as Record<
    GradeRating,
    RatingPreview
  >;
  for (const rating of [1, 2, 3, 4] as GradeRating[]) {
    const { card, log } = scheduler.next(
      fromCardState(cardState),
      now,
      toTsfsrsGrade(rating),
    );
    const intervalMinutes = Math.max(
      0,
      Math.round((card.due.getTime() - now.getTime()) / 60_000),
    );
    preview[rating] = {
      rating,
      intervalMinutes,
      label: formatInterval(intervalMinutes, rating),
      due: card.due.toISOString(),
      card: toCardState(card),
    };
  }
  return preview;
}

export function applyRating(
  cardState: CardState,
  rating: GradeRating,
  now: Date = new Date(),
): { card: CardState; log: ReviewLogSnapshot } {
  const { card, log } = scheduler.next(
    fromCardState(cardState),
    now,
    toTsfsrsGrade(rating),
  );
  return { card: toCardState(card), log: toReviewLogSnapshot(log, now) };
}

export function formatInterval(minutes: number, rating?: GradeRating): string {
  const prefix = rating === 1 ? 'Lặp lại trong' : 'Ôn sau';
  if (minutes < 1) return 'Ngay bây giờ';
  if (minutes < 60) return `${prefix} ${minutes} phút`;
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `${prefix} ${hours} giờ`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `${prefix} ${days} ngày`;
}
```

> **`intervalMinutes` là nguồn sự thật của nhãn trên 4 nút.** `formatInterval` chỉ định dạng. UI **không** tự tính lại.

**Dependencies:** `ts-fsrs` (^5.4.2), không dependency khác.
**Edge cases:**
- `cardState.version` khác `1` → ném `FsrsStateVersionError`; lộ trình migrate: `migrateCardState(v)` trong file riêng.
- `cardState` hỏng (JSON không parse được) → `fromCardState` ném `FsrsStateCorruptError`; `src/lib/srs.ts` bắt và **tạo lại state New** cho thẻ đó + ghi log, không làm hỏng cả phiên.
- Thẻ `state = 0` (New) + chấm `Good` → `learning_steps` tăng, `due` = `now + 10m` (bước học 2) — đúng D6.

---

### 3.2 `src/lib/srs.ts` — lớp nghiệp vụ SRS

**Route/đường dẫn:** `src/lib/srs.ts`
**Responsibilities:**
- Truy vấn Card/Review/SrsSession.
- **Thuật toán chọn thẻ** (§3.4).
- Tính thống kê theo ngôn ngữ + streak.
- Ghi `Review` + cập nhật `Card` trong 1 transaction.

**Interfaces:**

```ts
// src/lib/srs.ts
import type { Lang, CardState, GradeRating } from './fsrs';

export interface SessionCard {
  id: string;
  lang: Lang;
  front: string;
  frontAlt: string | null;   // zh: hanzi
  back: string;
  note: string | null;
  example: string | null;
  examplePinyin: string | null;
  hint: string | null;        // zh: gợi ý ngữ cảnh · en: phiên âm kiểu Việt
  group: string;
  mode: 'recognize' | 'recall' | 'produce';
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  due: string;
  state: number;
  /** zh: có nên hiện hanzi không (toggle của người dùng + fallback R5). */
  showHanzi: boolean;
  /** en: có nên hiện phiên âm kiểu Việt không (cửa sổ 14 ngày). */
  showHint: boolean;
}

export interface SessionPayload {
  sessionId: string;
  card: SessionCard;
  index: number;
  total: number;
  startedAt: string;
  preview: Record<GradeRating, { due: string; intervalMinutes: number; label: string }>;
}

export interface LanguageStats {
  lang: Lang;
  label: string;          // "Tiếng Trung (zh-CN)" | "Tiếng Anh (en-US)"
  level: string;          // "Level 0"
  unseen: number;
  learning: number;
  mastered: number;
  due: number;
  newAvailable: number;
  streak: number;
  groups: GroupStats[];
}

export interface GroupStats {
  id: string;
  label: string;
  total: number;
  mastered: number;
  masteredPct: number;
  avgStability: number;
  due: number;
  lapses: number;
}

/** Lấy thẻ đến hạn theo ngôn ngữ, sắp hạn sớm nhất trước (FR-LG-04). */
export async function listDueCards(
  lang: Lang,
  now: Date,
  limit: number,
): Promise<CardRow[]>;

/**
 * Lấy thẻ MỚI từ nhóm chưa học.
 * Nhóm "chưa học" = nhóm chưa có thẻ nào `reps > 0`.
 * Ưu tiên nhóm có ít thẻ đã học nhất, sau đó theo thứ tự nhóm cố định, sau đó `createdAt`.
 */
export async function pickNewCards(
  lang: Lang,
  limit: number,
): Promise<CardRow[]>;

/** Tạo phiên ôn mới (FR-LG-04). Tự khôi phục phiên `active` nếu có. */
export async function buildSession(
  lang: Lang,
  opts: { maxCards?: number; forceNew?: boolean },
): Promise<{
  sessionId: string;
  cardIds: string[];
  total: number;
  dueCount: number;
  newCount: number;
  startedAt: string;
  resumed: boolean;
}>;

/** Lấy payload thẻ tiếp theo + preview 4 mức. */
export async function getNextCard(
  sessionId: string,
  index: number,
): Promise<SessionPayload | null>;

/** Ghi 1 lượt ôn: UPDATE Card + INSERT Review + UPDATE SrsSession trong 1 transaction. */
export async function gradeCard(
  params: { cardId: string; rating: GradeRating; sessionId?: string; now?: Date },
): Promise<{ card: CardState; index: number; total: number; sessionCompleted: boolean }>;

/** Thống kê theo ngôn ngữ + streak riêng (FR-LG-09). */
export async function getLanguageStats(
  lang?: Lang,
  now?: Date,
): Promise<{ languages: LanguageStats[]; totals: Totals }>;

/** Chuỗi ngày ôn liên tiếp (ngày local) của 1 ngôn ngữ. */
export async function getReviewStreak(lang: Lang, now?: Date): Promise<number>;

/** Xuất deck JSON (NFR-08) — self-contained. */
export async function exportDeck(format: 'json'): Promise<{
  version: 1;
  exportedAt: string;
  fsrsConfig: FSRSParameters;
  cards: Array<CardRow & { cardState: CardState }>;
  reviews: ReviewRow[];
}>;
```

---

### 3.3 `src/components/language/flashcard-review.tsx` — S10 flashcard

**Route/đường dẫn:** `src/app/language/session/page.tsx` → `src/components/language/flashcard-review.tsx`
**Responsibilities:**
- Render mặt trước / mặt sau theo `lang`.
- Điều khiển 4 nút chấm, gọi `POST /api/srs/grade`.
- Phím tắt `Space` / `R` / `H` / `1`–`4`.
- TTS qua `useSpeech()`.

**Interfaces:**

```tsx
// src/components/language/flashcard-review.tsx
'use client';

export interface FlashcardReviewProps {
  card: SessionCard;
  index: number;
  total: number;
  preview: Record<GradeRating, { due: string; intervalMinutes: number; label: string }>;
  showHanzi: boolean;          // toggle của người dùng (zh)
  showHint: boolean;           // phiên âm Việt / gợi ý (en)
  onToggleHanzi: () => void;
  onToggleHint: () => void;
  onGrade: (rating: GradeRating) => void;
  submitting: boolean;
  speechAvailable: boolean;
  /** true khi TTS zh-CN không có → bắt buộc hiện hanzi (R5). */
  forceHanzi: boolean;
}

export function FlashcardReview(props: FlashcardReviewProps): JSX.Element;
```

**Dependencies:** `useSpeech` (`src/components/language/use-speech.ts`), `src/lib/fsrs` (chỉ import **type**), `@/lib/types`.
**Edge cases:**
- Chấm khi `flipped === false` → bỏ qua (nút 4 mức chưa render).
- Đang ghi (`submitting`) → disable cả 4 nút + khoá phím số.
- Phím tắt không kích hoạt khi `document.activeElement` là `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`.

---

### 3.4 `src/components/language/fsrs-grade-bar.tsx` — thanh 4 nút chấm

**Route/đường dẫn:** `src/components/language/fsrs-grade-bar.tsx`

**Interfaces:**

```tsx
'use client';

export interface FsrsGradeBarProps {
  preview: Record<GradeRating, { due: string; intervalMinutes: number; label: string }>;
  onGrade: (rating: GradeRating) => void;
  disabled: boolean;
  /** Ẩn thanh cho tới khi thẻ được lật (không biết đáp án thì không chấm được). */
  visible: boolean;
}

export function FsrsGradeBar(props: FsrsGradeBarProps): JSX.Element;
```

**Hành vi hiển thị (bắt buộc):**
- Thứ tự & màu cố định: **Again** (`text-error`) → **Hard** (`text-tertiary`) → **Good** (`text-primary`) → **Easy** (`text-secondary`).
- Nhãn khoảng cách lấy **nguyên văn** từ `preview[rating].label` — không tự tính.
- Chip phím tắt: `1` `2` `3` `4` (`bg-<màu>/15`).

---

### 3.5 `src/components/language/use-speech.ts` — Web Speech API (TTS)

**Route/đường dẫn:** `src/components/language/use-speech.ts`
**Responsibilities:**
- Kiểm tra khả năng phát âm cho `zh-CN` / `en-US`.
- Phát âm từ, câu ví dụ.
- Báo trạng thái fallback (R5).

**Interfaces:**

```ts
// src/components/language/use-speech.ts
'use client';

export type SpeechLang = 'zh-CN' | 'en-US';

export type SpeechStatus =
  | 'checking'      // đang đợi `voiceschanged`
  | 'ready'         // có voice phù hợp
  | 'fallback';     // không có voice → dùng pinyin + hanzi (R5)

export interface UseSpeechResult {
  status: SpeechStatus;
  /** true nếu không có voice `zh-CN` → UI bật cưỡng chế hanzi. */
  shouldForceHanzi: boolean;
  speak: (text: string, lang: SpeechLang, opts?: { rate?: number }) => void;
  cancel: () => void;
  lastError: string | null;
}

export function useSpeech(lang: SpeechLang): UseSpeechResult;
```

**Cài đặt tham chiếu (Web Speech API — không dịch vụ ngoài, NFR-07):**

```ts
// src/components/language/use-speech.ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const VOICE_TIMEOUT_MS = 1500; // R5 — timeout nếu `voiceschanged` không bắn

export function useSpeech(lang: SpeechLang): UseSpeechResult {
  const [status, setStatus] = useState<SpeechStatus>('checking');
  const [lastError, setLastError] = useState<string | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setStatus('fallback');
      return;
    }

    const pick = (): SpeechSynthesisVoice[] => {
      const all = window.speechSynthesis.getVoices();
      voicesRef.current = all;
      const prefix = lang.split('-')[0]; // 'zh' | 'en'
      const exact = all.find((v) => v.lang.replace('_', '-') === lang);
      const loose = all.find((v) => v.lang.replace('_', '-').startsWith(prefix));
      setStatus(exact || loose ? 'ready' : 'fallback');
    };

    pick();                                   // có thể đã sẵn sàng
    const timer = window.setTimeout(pick, VOICE_TIMEOUT_MS);
    window.speechSynthesis.addEventListener('voiceschanged', pick);

    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', pick);
    };
  }, [lang]);

  const speak = useCallback(
    (text: string, voiceLang: SpeechLang, opts?: { rate?: number }) => {
      if (!('speechSynthesis' in window)) {
        setLastError('Trình duyệt không hỗ trợ phát âm');
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceLang;
      u.rate = opts?.rate ?? (voiceLang === 'zh-CN' ? 0.8 : 1.0);
      const match =
        voicesRef.current.find(
          (v) => v.lang.replace('_', '-') === voiceLang,
        ) ??
        voicesRef.current.find((v) =>
          v.lang.replace('_', '-').startsWith(voiceLang.split('-')[0]),
        );
      if (match) u.voice = match;
      u.onerror = (e) => setLastError(e.error === 'not-allowed' ? 'Bị trình duyệt chặn' : 'Không phát được âm thanh');
      window.speechSynthesis.speak(u);
    },
    [],
  );

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return {
    status,
    shouldForceHanzi: lang === 'zh-CN' && status === 'fallback',
    speak,
    cancel,
    lastError,
  };
}
```

**Quy tắc sử dụng trong S10:**

| Vị trí | Nội dung đọc | `lang` | `rate` |
|---|---|---|---|
| Mặt trước (nút nghe) | `card.frontAlt ?? card.front` — đọc **hanzi** nếu có, nếu không đọc pinyin (fallback R5) | `zh-CN` | 0.8 |
| Mặt trước (nút nghe, en) | `card.front` | `en-US` | 1.0 |
| Mặt sau (nút "Nghe câu") | `card.example` | `zh-CN` / `en-US` theo deck | 0.8 / 1.0 |

> **Fallback R5:** khi `shouldForceHanzi === true` → (1) ẩn nút nghe, (2) bật cưỡng chế hanzi, (3) badge hiển thị "Web Speech: fallback pinyin + hanzi". Không chặn ôn.

---

### 3.6 `src/components/language/use-keyboard-shortcuts.ts` — phím tắt S10

```ts
// src/components/language/use-keyboard-shortcuts.ts
'use client';

export interface ShortcutHandlers {
  onFlip: () => void;
  onSpeak: () => void;
  onHint: () => void;
  onGrade: (rating: GradeRating) => void;
}

export interface UseKeyboardShortcutsOptions {
  enabled: boolean;   // false khi chưa lật thẻ → khoá 1..4
  handlers: ShortcutHandlers;
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions): void;
```

**Bảng ánh xạ (khớp `spec.md` §6.6):**

| `event.code` / `event.key` | Handler | Điều kiện |
|---|---|---|
| `Space` | `onFlip` | `enabled` |
| `KeyR` | `onSpeak` | luôn |
| `KeyH` | `onHint` | luôn |
| `Digit1` / `Numpad1` | `onGrade(1)` | `enabled` (đã lật thẻ) |
| `Digit2` / `Numpad2` | `onGrade(2)` | `enabled` |
| `Digit3` / `Numpad3` | `onGrade(3)` | `enabled` |
| `Digit4` / `Numpad4` | `onGrade(4)` | `enabled` |

Bỏ qua khi:
```ts
const el = document.activeElement;
if (el instanceof HTMLElement) {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) {
    return;
  }
}
```

---

### 3.7 `src/app/language/page.tsx` — S09 (Server Component)

```tsx
// src/app/language/page.tsx
import { getLanguageStats } from '@/lib/srs';
import { LanguageHubHeader } from '@/components/language/language-hub-header';
import { DeckCard } from '@/components/language/deck-card';
import { GroupGrid } from '@/components/language/group-grid';
import { CardTable } from '@/components/language/card-table';
import { FsrsTelemetryPanel } from '@/components/language/fsrs-telemetry-panel';
import { SessionCta } from '@/components/language/session-cta';

export default async function LanguageHubPage() {
  const { languages, totals } = await getLanguageStats();

  return (
    <main className="p-margin-lg space-y-gutter-lg max-w-[1600px] mx-auto w-full">
      <LanguageHubHeader />
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg">
        {languages.map((lang) => (
          <DeckCard key={lang.lang} stats={lang} />
        ))}
        <SessionCta totals={totals} />
      </section>
      <GroupGrid groups={languages.flatMap((l) => l.groups)} />
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        <div className="xl:col-span-8">
          <CardTable />
        </div>
        <div className="xl:col-span-4">
          <FsrsTelemetryPanel />
        </div>
      </section>
    </main>
  );
}
```

**Interfaces của component con:**

```tsx
// src/components/language/deck-card.tsx
export interface DeckCardProps {
  stats: LanguageStats;
  selected?: boolean;
}

// src/components/language/card-table.tsx
export interface CardTableProps {
  initialCards?: CardListItem[];
  initialTotal?: number;
  initialPage?: number;
  pageSize?: number; // mặc định 20
}

// src/components/language/fsrs-telemetry-panel.tsx
export interface FsrsTelemetryPanelProps {
  retention: number;      // 0..1
  params: {
    requestRetention: number;
    maximumInterval: number;
    weightCount: number;
    decay: number;
    modelName: string;
  };
}
```

---

### 3.8 `src/app/language/session/page.tsx` — S10 (Client Component)

```tsx
// src/app/language/session/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSpeech, type SpeechLang } from '@/components/language/use-speech';
import { useKeyboardShortcuts } from '@/components/language/use-keyboard-shortcuts';
import { FlashcardReview } from '@/components/language/flashcard-review';
import { FsrsGradeBar } from '@/components/language/fsrs-grade-bar';
import { SessionStatsSidebar } from '@/components/language/session-stats-sidebar';

export interface SessionCardView {
  id: string;
  lang: 'zh' | 'en';
  front: string;
  frontAlt: string | null;
  back: string;
  note: string | null;
  example: string | null;
  examplePinyin: string | null;
  hint: string | null;
  group: string;
  mode: 'recognize' | 'recall' | 'produce';
  showHanzi: boolean;
  showHint: boolean;
}

export interface SessionView {
  sessionId: string;
  card: SessionCardView;
  index: number;
  total: number;
  startedAt: string;
  preview: Record<1 | 2 | 3 | 4, { due: string; intervalMinutes: number; label: string }>;
  stats: { mastered: number; learning: number; due: number; retention: number };
}

export default function SessionPage() {
  const searchParams = useSearchParams();
  const lang = (searchParams.get('lang') === 'en' ? 'en' : 'zh') as 'zh' | 'en';
  const speechLang: SpeechLang = lang === 'zh' ? 'zh-CN' : 'en-US';

  const [view, setView] = useState<SessionView | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showHanzi, setShowHanzi] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const speech = useSpeech(speechLang);

  // ... load session, poll next card, submit grade
  return (
    <main className="p-gutter-lg max-w-7xl mx-auto w-full space-y-gutter-lg">
      {/* header: badge ngôn ngữ · nhóm · FSRS · chấm tròn · timer · pause */}
      {/* grid 12: flashcard (col-span-8) + sidebar (col-span-4) */}
    </main>
  );
}
```

---

## 4. Luồng dữ liệu

### 4.1 Luồng chính

**Bước 1 — Mở S09 (`GET /api/language`)**

1. `src/lib/srs.ts::getLanguageStats()` chạy **3 query**:
   - `groupBy` số thẻ theo `lang` × trạng thái (`unseen` / `learning` / `mastered` / `due`).
   - `groupBy` theo `group` để tính `masteredPct`, `avgStability`, `due`, `lapses`.
   - Query `Review` 90 ngày gần nhất → tính streak theo ngày **local**, tách theo `lang`.
2. Trả `LanguageStats[]` + `totals`.
3. Server Component render; panel chỉ số FSRS đọc `FSRS_CONFIG` (server) → version thật, không hardcode "v4.5".

**Bước 2 — Bắt đầu phiên (`POST /api/srs/session`)**

1. Validate: `lang ∈ {zh, en}`, `maxCards ≤ SRS_SESSION_MAX_CARDS (20)`.
2. Nếu tồn tại `SrsSession` với `status = 'active'` cùng `lang` → **resume**: trả `resumed: true`, `cardIds` cũ.
3. Ngược lại → tạo queue:
   - `due = listDueCards(lang, now, limit)` — `WHERE due <= now AND cardState.state != 0`, `ORDER BY due ASC, createdAt ASC`.
   - `remaining = maxCards - due.length`.
   - Nếu `remaining > 0` → `pickNewCards(lang, remaining)`.
4. `SRS_SESSION_MAX_CARDS = 20` từ `src/lib/config.ts` là **trần cứng**.
5. Tạo `SrsSession { lang, cardIds, plannedCount, reviewedCount: 0, status: 'active' }`.

**Bước 3 — Lấy thẻ (`GET /api/srs/next?sessionId=…`)**

1. Đọc `SrsSession`, lấy `cardIds[index]`.
2. Đọc `Card` → `cardState`.
3. `previewIntervals(cardState, now)` → 4 mức chấm.
4. Tính `showHanzi` / `showHint`:
   - `showHanzi` (zh) = toggle người dùng **OR** `speech.shouldForceHanzi` (R5).
   - `showHint` (en) = `now - card.createdAt < 14 ngày` **OR** card chưa từng ôp (`reps === 0`).
   - `showHint` (zh) = `true` (gợi ý ngữ cảnh luôn sẵn có).
5. Trả `SessionPayload`.

**Bước 4 — Chấm (`POST /api/srs/grade`)**

```ts
// src/lib/srs.ts
export async function gradeCard(params: {
  cardId: string;
  rating: GradeRating;
  sessionId?: string;
  now?: Date;
}): Promise<{ card: CardState; index: number; total: number; sessionCompleted: boolean }> {
  const now = params.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const card = await tx.card.findUnique({ where: { id: params.cardId } });
    if (!card) throw new SrsError('CARD_NOT_FOUND', 404);

    // Chống double-write: cùng cardId trong 3 giây gần nhất
    const recent = await tx.review.findFirst({
      where: { cardId: params.cardId, at: { gte: new Date(now.getTime() - 3000) } },
    });
    if (recent) throw new SrsError('DUPLICATE_GRADE', 409);

    const current = card.cardState as unknown as CardState;
    const { card: nextState, log } = applyRating(current, params.rating, now);

    await tx.card.update({
      where: { id: card.id },
      data: {
        cardState: nextState as unknown as Prisma.InputJsonValue,
        due: new Date(nextState.due),
        stability: nextState.stability,
        difficulty: nextState.difficulty,
        reps: nextState.reps,
        lapses: nextState.lapses,
      },
    });

    await tx.review.create({
      data: {
        cardId: card.id,
        rating: params.rating,
        state: nextState as unknown as Prisma.InputJsonValue,
        at: now,
      },
    });

    let index = 0;
    let total = 0;
    let sessionCompleted = true;

    if (params.sessionId) {
      const session = await tx.srsSession.findUnique({
        where: { id: params.sessionId },
      });
      if (session) {
        const cardIds = session.cardIds as unknown as string[];
        index = cardIds.indexOf(card.id);
        total = cardIds.length;
        const reviewedCount = session.reviewedCount + 1;
        const done = reviewedCount >= total;
        await tx.srsSession.update({
          where: { id: session.id },
          data: {
            reviewedCount,
            status: done ? 'done' : 'active',
            endedAt: done ? now : null,
          },
        });
        sessionCompleted = done;
      }
    }

    return { card: nextState, index, total, sessionCompleted };
  });
}
```

**Bước 5 — Kết thúc phiên**

- `sessionCompleted === true` → UI hiện "Đã ôn xong hôm nay" + số liệu phiên + CTA về `/language`.
- Không ghi `Activity`/`Evidence`: một lượt ôn **không** tạo bằng chứng kỹ năng mới (P3) — `Evidence` chỉ gắn với hoạt động có sản phẩm (bài viết, bài kiểm tra).

### 4.2 Lưu trữ & truy vấn

**Cấu trúc `Card.cardState` (JSON lưu trong SQLite):**

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
  "state": 2,
  "lastReview": "2026-10-27T02:14:00.000Z"
}
```

**Quy tắc đồng bộ (R14):**

1. `cardState` là nguồn sự thật.
2. `due`/`stability`/`difficulty`/`reps`/`lapses` ở cột riêng = denormalized, ghi trong **cùng transaction** với `cardState`.
3. Test bắt buộc: `expect(card.due.toISOString()).toBe(card.cardState.due)` sau mỗi lượt ôn.
4. `cardState.state` lưu **số**; enum `State` của `ts-fsrs` (`New=0`, `Learning=1`, `Review=2`, `Relearning=3`).

**Truy vấn chính (Prisma):**

```ts
// src/lib/srs.ts
const DUE_WHERE = { due: { lte: now }, cardState: { not: Prisma.AnyNull } };

/** FR-LG-04 — thẻ đến hạn trước, sớm hạn nhất trước. */
export async function listDueCards(lang: Lang, now: Date, limit: number) {
  return prisma.card.findMany({
    where: { lang, due: { lte: now } },
    orderBy: [{ due: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });
}

/**
 * FR-LG-04 — hết thẻ đến hạn → thẻ MỚI từ nhóm chưa học.
 * Nhóm chưa học = nhóm chưa có thẻ nào reps > 0.
 */
export async function pickNewCards(lang: Lang, limit: number) {
  const groups = await prisma.card.groupBy({
    by: ['group'],
    where: { lang },
    _count: { _all: true },
  });

  const studiedCounts = await prisma.card.groupBy({
    by: ['group'],
    where: { lang, reps: { gt: 0 } },
    _count: { _all: true },
  });
  const studied = new Map(studiedCounts.map((g) => [g.group, g._count._all]));

  // Nhóm chưa học: studiedCount === 0 → ưu tiên nhóm có ít thẻ đã học nhất
  const unstudiedGroups = groups
    .filter((g) => (studied.get(g.group) ?? 0) === 0)
    .sort((a, b) => (a._count._all - b._count._all));

  if (unstudiedGroups.length === 0) return [];

  return prisma.card.findMany({
    where: {
      lang,
      reps: 0,
      group: { in: unstudiedGroups.map((g) => g.group) },
    },
    orderBy: [{ createdAt: 'asc' }],
    take: limit,
  });
}

/** FR-LG-09 — streak ngày ôn riêng từng ngôn ngữ (ngày local). */
export async function getReviewStreak(lang: Lang, now: Date = new Date()): Promise<number> {
  const rows = await prisma.review.findMany({
    where: { at: { gte: new Date(now.getTime() - 400 * 86_400_000) }, card: { lang } },
    select: { at: true },
    orderBy: { at: 'desc' },
  });

  const days = new Set(rows.map((r) => toLocalDateKey(r.at))); // 'yyyy-MM-dd'
  let streak = 0;
  const cursor = new Date(now);
  // Nếu hôm nay chưa ôn → bắt đầu từ hôm qua (streak chưa gãy ngay trong ngày)
  if (!days.has(toLocalDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(toLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
```

> `toLocalDateKey()` đặt trong `src/lib/dates.ts` theo steering `tech.md` §5 (mọi ngày chuẩn hoá, so sánh bằng chuỗi `yyyy-MM-dd`).

### 4.3 Cấu trúc seed — 120 thẻ

**File:**

```
prisma/
  seed.ts                  # entrypoint: xoá & nạp, gọi AI-10? KHÔNG
  seed-data/
    zh.ts                  # 60 thẻ + 10 mẫu câu tiếng Trung
    en.ts                  # 60 thẻ + 10 mẫu câu tiếng Anh
    groups.ts              # LANG_GROUPS: id + label + thứ tự cho 2 ngôn ngữ
```

**Kiểu dữ liệu seed (tĩnh, không gọi mạng):**

```ts
// prisma/seed-data/groups.ts
export const LANG_GROUPS = {
  zh: [
    { id: 'greeting', label: 'Chào hỏi & Xã giao', order: 1 },
    { id: 'people',   label: 'Người & Thân xã',    order: 2 },
    { id: 'food',     label: 'Đồ ăn & Đồ uống',   order: 3 },
    { id: 'place',    label: 'Địa điểm & Phương hướng', order: 4 },
    { id: 'time',     label: 'Thời gian & Lịch trình', order: 5 },
    { id: 'verb',     label: 'Động từ & Phó từ cốt lõi', order: 6 },
  ],
  en: [
    { id: 'pronoun', label: 'Pronouns & cơ bản',  order: 1 },
    { id: 'numbers', label: 'Numbers & family',   order: 2 },
    { id: 'food',    label: 'Food & drink',       order: 3 },
    { id: 'place',   label: 'Places',             order: 4 },
    { id: 'time',    label: 'Time',               order: 5 },
    { id: 'verb',    label: 'Verbs & adjectives', order: 6 },
  ],
} as const;

// prisma/seed-data/zh.ts
export interface ZhCardSeed {
  group: string;        // id nhóm
  front: string;        // pinyin có dấu thanh
  frontAlt: string;     // hanzi
  back: string;         // nghĩa tiếng Việt
  note: string;         // ghi chú ngữ cảnh
  hint: string;         // gợi ý ngữ cảnh ngắn (kèm chip 4 thanh điệu)
  example: string;      // ví dụ câu (hanzi)
  examplePinyin: string;// pinyin của ví dụ
  patternId: number;    // 1..10 → mẫu câu tương ứng
}

export const ZH_CARDS: ZhCardSeed[] = [
  {
    group: 'greeting',
    front: 'nǐ hǎo',
    frontAlt: '你好',
    back: 'Xin chào',
    note: 'Cách chào cơ bản nhất, dùng mọi thời điểm trong ngày cho bạn bè, đối tác hoặc người mới quen.',
    hint: 'Từ ghép gồm đại từ ngôi thứ hai (nǐ) và tính từ mang nghĩa tốt lành (hǎo).',
    example: '你好，很高兴认识你。',
    examplePinyin: 'Nǐ hǎo, hěn gāoxìng rènshi nǐ.',
    patternId: 1,
  },
  // … còn 59 thẻ
];

export const ZH_SENTENCE_PATTERNS = [
  { id: 1, zh: '你好，我是…', pinyin: 'Nǐ hǎo, wǒ shì…', vi: 'Xin chào, tôi là…' },
  { id: 2, zh: '这是…', pinyin: 'Zhè shì…', vi: 'Đây là…' },
  { id: 3, zh: '我要…', pinyin: 'Wǒ yào…', vi: 'Tôi muốn…' },
  { id: 4, zh: '我喜欢…', pinyin: 'Wǒ xǐhuan…', vi: 'Tôi thích…' },
  { id: 5, zh: '我不会…', pinyin: 'Wǒ bù huì…', vi: 'Tôi không biết…' },
  { id: 6, zh: '…在哪里？', pinyin: '…zài nǎlǐ?', vi: '… ở đâu?' },
  { id: 7, zh: '…多少钱？', pinyin: '…duōshao qián?', vi: '… bao nhiêu tiền?' },
  { id: 8, zh: '我想学中文', pinyin: 'Wǒ xiǎng xué Zhōngwén', vi: 'Tôi muốn học tiếng Trung' },
  { id: 9, zh: '你会说中文吗？', pinyin: 'Nǐ huì shuō Zhōngwén ma?', vi: 'Bạn nói tiếng Trung được không?' },
  { id: 10, zh: '谢谢你。', pinyin: 'Xièxie nǐ.', vi: 'Cảm ơn bạn.' },
];

// prisma/seed-data/en.ts
export interface EnCardSeed {
  group: string;
  front: string;   // từ Latin
  back: string;    // nghĩa tiếng Việt
  note: string;
  hint: string;    // phiên âm gần đúng kiểu Việt
  example: string;
  patternId: number;
}

export const EN_CARDS: EnCardSeed[] = [
  {
    group: 'food',
    front: 'water',
    back: 'Nước',
    note: 'Từ cốt lõi, xuất hiện ở cả bài nói và bài viết.',
    hint: 'u-tờ-ờ',
    example: 'I want water, please.',
    patternId: 5,
  },
  // … còn 59 thẻ
];

export const EN_SENTENCE_PATTERNS = [
  { id: 1, en: 'I am…', vi: 'Tôi là…' },
  { id: 2, en: 'My name is…', vi: 'Tên tôi là…' },
  { id: 3, en: 'I have…', vi: 'Tôi có…' },
  { id: 4, en: 'I like…', vi: 'Tôi thích…' },
  { id: 5, en: 'I want…', vi: 'Tôi muốn…' },
  { id: 6, en: 'This is…', vi: 'Đây là…' },
  { id: 7, en: 'What is…?', vi: '… là gì?' },
  { id: 8, en: 'How are you?', vi: 'Bạn thế nào?' },
  { id: 9, en: 'Nice to meet you.', vi: 'Rất vui được gặp bạn.' },
  { id: 10, en: 'Thank you.', vi: 'Cảm ơn bạn.' },
];
```

**Entry point seed (tĩnh — tuyệt đối không gọi AI):**

```ts
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { LANG_GROUPS } from './seed-data/groups';
import { ZH_CARDS, ZH_SENTENCE_PATTERNS } from './seed-data/zh';
import { EN_CARDS, EN_SENTENCE_PATTERNS } from './seed-data/en';
import { createNewCardState } from '../src/lib/fsrs';

const prisma = new PrismaClient();

async function main() {
  // 1. Xoá dữ liệu SRS cũ (giữ Skill/Activity)
  await prisma.review.deleteMany();
  await prisma.srsSession.deleteMany();
  await prisma.card.deleteMany();

  // 2. Nạp 120 thẻ — state New, due = hôm nay
  const now = new Date();
  const rows = [
    ...ZH_CARDS.map((c) => ({
      lang: 'zh',
      front: c.front,
      frontAlt: c.frontAlt,
      back: c.back,
      note: c.note,
      example: c.example,
      examplePinyin: c.examplePinyin,
      hint: c.hint,
      group: c.group,
      mode: 'recognize',
    })),
    ...EN_CARDS.map((c) => ({
      lang: 'en',
      front: c.front,
      frontAlt: null,
      back: c.back,
      note: c.note,
      example: c.example,
      examplePinyin: null,
      hint: c.hint,
      group: c.group,
      mode: 'recognize',
    })),
  ];

  for (const r of rows) {
    const cardState = createNewCardState(now);
    await prisma.card.create({
      data: {
        ...r,
        cardState: cardState as unknown as Prisma.InputJsonValue,
        due: new Date(cardState.due),
        stability: cardState.stability,
        difficulty: cardState.difficulty,
        reps: cardState.reps,
        lapses: cardState.lapses,
      },
    });
  }

  // 3. Mẫu câu — lưu vào bảng cấu hình tĩnh để S11 / bài kiểm tra dùng lại
  await prisma.languagePattern.deleteMany();
  await prisma.languagePattern.createMany({
    data: [
      ...ZH_SENTENCE_PATTERNS.map((p) => ({
        lang: 'zh', patternId: p.id, text: p.zh, translit: p.pinyin, meaning: p.vi,
      })),
      ...EN_SENTENCE_PATTERNS.map((p) => ({
        lang: 'en', patternId: p.id, text: p.en, translit: null, meaning: p.vi,
      })),
    ],
  });

  // 4. Tree skill + UserProfile (nếu chưa có)
  // ...
}
```

**Kiểm tra bắt buộc của seed (fail-fast, không seed thiếu/thừa):**

```ts
function assertSeedShape() {
  if (ZH_CARDS.length !== 60) throw new Error(`zh phải có 60 thẻ, thực tế ${ZH_CARDS.length}`);
  if (EN_CARDS.length !== 60) throw new Error(`en phải có 60 thẻ, thực tế ${EN_CARDS.length}`);
  if (ZH_SENTENCE_PATTERNS.length !== 10) throw new Error('zh phải có 10 mẫu câu');
  if (EN_SENTENCE_PATTERNS.length !== 10) throw new Error('en phải có 10 mẫu câu');

  for (const [lang, groups, cards] of [
    ['zh', LANG_GROUPS.zh, ZH_CARDS],
    ['en', LANG_GROUPS.en, EN_CARDS],
  ] as const) {
    for (const g of groups) {
      const n = cards.filter((c) => c.group === g.id).length;
      if (n !== 10) throw new Error(`${lang}/${g.id} phải có 10 thẻ, thực tế ${n}`);
    }
    const ids = new Set(groups.map((g) => g.id));
    for (const c of cards) {
      if (!ids.has(c.group as never)) throw new Error(`${lang}: group không hợp lệ ${c.group}`);
    }
  }
}
```

> **`languagePattern`:** bảng lưu 20 mẫu câu (10 zh + 10 en) để S11 (luyện chủ động) và S19–S21 (bài kiểm tra) dùng lại — tránh nhân bản nội dung. Cần thêm vào SPEC §4 cùng `SrsSession`.

### 4.4 Cấu trúc thư mục bổ sung

```
prisma/
  seed.ts
  seed-data/{groups,zh,en}.ts
src/
  app/
    language/page.tsx
    language/session/page.tsx
    api/
      language/route.ts
      language/cards/route.ts
      srs/next/route.ts
      srs/grade/route.ts
      srs/session/route.ts
  components/language/
    language-hub-header.tsx
    deck-card.tsx
    session-cta.tsx
    group-grid.tsx
    card-table.tsx
    add-card-dialog.tsx
    fsrs-telemetry-panel.tsx
    flashcard-review.tsx
    fsrs-grade-bar.tsx
    session-stats-sidebar.tsx
    use-speech.ts
    use-keyboard-shortcuts.ts
  lib/
    fsrs.ts
    srs.ts
```

---

## 5. Xử lý lỗi

| Tình huống | Phát hiện | Xử lý | Thông báo người dùng |
|---|---|---|---|
| `cardState` JSON hỏng | `JSON.parse` lỗi / `fromCardState` ném | Tạo lại state New cho thẻ đó, ghi log, tiếp tục phiên | Toast nhỏ "Một thẻ bị lỗi dữ liệu, đã khởi tạo lại" |
| `cardState.version` ≠ 1 | So sánh version | `migrateCardState()` hoặc ném `FsrsStateVersionError` → `500` có thông báo rõ | "Dữ liệu ôn được tạo bởi phiên bản khác — hãy chạy migration" |
| Thẻ bị xoá giữa phiên | `cardIds` chứa id không tồn tại | Bỏ qua id, lấy thẻ kế tiếp hợp lệ | Không hiện gì (âm thầm bỏ qua) |
| Chấm trùng (double-click / 2 tab) | `Review` cùng `cardId` trong 3s | Trả `409 DUPLICATE_GRADE` | "Thẻ này vừa được chấm" — UI giữ nguyên state |
| Không có thẻ để ôn | `listDueCards` + `pickNewCards` rỗng | `404 NO_CARD` | Màn hình "Đã ôn xong hôm nay" + gợi ý ôn sớm hơn |
| `lang` không hợp lệ | Zod | `400` | "Ngôn ngữ không hợp lệ (chỉ hỗ trợ zh, en)" |
| `group` không thuộc nhóm của `lang` | Zod refine theo `LANG_GROUPS` | `400` kèm danh sách nhóm hợp lệ | "Nhóm không hợp lệ với ngôn ngữ này" |
| Trùng thẻ `(lang, front, group)` | Unique composite | `409` | "Thẻ này đã tồn tại trong nhóm" |
| TTS không có voice `zh-CN` | `useSpeech` → `status === 'fallback'` | Ẩn nút nghe + bật cưỡng chế hanzi | Badge "Web Speech: fallback pinyin + hanzi" (không phải lỗi) |
| `speechSynthesis.speak` lỗi | `utterance.onerror` | Giữ nguyên UI, cho thử lại | Toast `aria-live="polite"` "Không phát được âm thanh" + nút "Thử lại" |
| SQLite bị khoá (dev, 2 process) | `PrismaClientKnownRequestError P1008/P2028` | Retry 3 lần, backoff 200ms | Banner "Đang lưu… thử lại" — không mất dữ liệu đã ôn |
| Lỗi mạng khi gọi API nội bộ | `fetch` reject | Hiện lại trạng thái trước, cho nút "Thử lại" | "Không lưu được lượt ôn — thử lại" |
| File import deck sai định dạng | Zod parse | `400` | "File không đúng định dạng deck SRS" — dữ liệu cũ giữ nguyên |
| API `/api/language` lỗi | Bắt exception ở Server Component | Render fallback từ query đơn giản + banner | "Không tải được chỉ số — hiển thị dữ liệu cơ bản" |

> **Nguyên tắc chung:** lỗi **không** làm sập trang (steering `product.md` §5). Mọi lỗi có thông báo tiếng Việt + nút thử lại.

---

## 6. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi |
|---|---|---|
| **Unit — `src/lib/fsrs.ts`** | Vitest | `applyRating` **khớp tuyệt đối** `scheduler.next(...)` cho cả 4 mức × 4 trạng thái (New/Learning/Review/Relearning); `previewIntervals` trả đủ 4 mức; `formatInterval` biên (0, 1, 59, 60, 1439, 1440, 10080); `toCardState`/`fromCardState` round-trip không mất field; `createNewCardState` có `state = 0` |
| **Unit — `src/lib/srs.ts`** | Vitest + SQLite test | `listDueCards` sắp `due` tăng dần; `pickNewCards` chỉ lấy thẻ `reps = 0` thuộc **nhóm chưa học** và ưu tiên nhóm ít thẻ đã học nhất; `buildSession` **không vượt 20**; `getReviewStreak` tính đúng chuỗi ngày local (kể cả case hôm nay chưa ôn → streak vẫn giữ từ hôm qua) |
| **Unit — thuật toán chọn thẻ** | Vitest | Ma trận: (0 đến hạn, 30 mới) → 20 thẻ mới; (12 đến hạn, 30 mới) → 12 đến hạn + 8 mới; (25 đến hạn) → 20 đến hạn; thẻ đến hạn cũ hơn đứng trước |
| **Integration — API routes** | Vitest + test DB | `GET /api/language` trả số khớp `COUNT(*)`; `POST /api/language/cards` validate Zod + `409` trùng; `GET /api/srs/next` trả `preview` đủ 4 mức; `POST /api/srs/grade` ghi đủ `Review` + update `Card` + đồng bộ `cardState` ↔ cột; `409` khi chấm trùng; `POST /api/srs/session` không vượt 20 |
| **Integration — resume & đổi ngôn ngữ** | Vitest + test DB | Đóng phiên giữa chừng → `GET /api/srs/next` trả **cùng `sessionId`** + `index` đúng; đổi `lang` → phiên cũ `abandoned`, phiên mới không chứa id thẻ ngôn ngữ cũ |
| **E2E — Playwright** | Playwright | AC-LG-1 → AC-LG-14: ôn 1 thẻ zh, chấm Good → nhãn khoảng cách khớp API; `Space` lật thẻ; `R` phát âm (mock `speechSynthesis`); `1`–`4` chấm; lọc chip đến hạn; thêm thẻ thủ công → thẻ xuất hiện trong bảng; export JSON → file tải xuống đúng 120 thẻ |
| **Offline** | Playwright (`context.setOffline(true)`) | Mở `/language`, ôn 5 thẻ, thêm thẻ → tất cả thành công; **không** có request ra ngoài (chặn & assert) |
| **TTS fallback (R5)** | Vitest + jsdom (mock `speechSynthesis`) | Không có voice `zh-CN` → `shouldForceHanzi === true`, UI hiện hanzi, 4 nút chấm vẫn hoạt động |
| **A11y & responsive** | Playwright + axe | 390px: 4 nút 2×2, không tràn ngang; mọi icon-only button có `aria-label`; `aria-keyshortcuts` đúng; focus không mất khi lật thẻ; tương phản ≥ AA |
| **Tiêu chí nghiệm thu** | Playwright | Chạy tuần tự AC-LG-1 → AC-LG-14 trên DB seed sạch; báo cáo pass/fail theo từng AC |

---

## 7. Rủi ro & đánh đổi kỹ thuật

| # | Rủi ro | Tác động | Giảm thiểu |
|---|---|---|---|
| T1 | **`ts-fsrs` nâng phiên bản** (5.x → 6.x) đổi cấu trúc `Card`/`state` → thẻ đã lưu không đọc được | Cao | Khoá version trong `package.json` (`"ts-fsrs": "5.4.2"` — không dấu `^`); `cardState.version` để migrate; CI chạy test đọc state cũ |
| T2 | **`enable_fuzz: true`** làm interval không tiên đoán → AC-4 không kiểm được | Cao | `enable_fuzz: false` (D5); nếu cần fuzz thì bật sau khi có snapshot test |
| T3 | Đổi `request_retention` giữa chừng → toàn bộ lịch đã lưu lệch | Cao | Tham số đóng băng `FSRS_CONFIG` (D4); đổi chỉ qua migration có `cardState.version` |
| T4 | Denormalize lệch giữa `cardState` và cột `due`/`S`/`D` | Cao | `cardState` là nguồn sự thật (D2); test đồng bộ 2 chiều sau **mỗi** lượt ôn; query luôn đọc `cardState` khi cần chính xác |
| T5 | SQLite ghi đồng thời từ 2 tab → `SQLITE_BUSY` | Trung bình | `PRAGMA journal_mode = WAL` trong `DATABASE_URL`/khởi tạo Prisma; retry 3 lần backoff; `409` chống double-write |
| T6 | `speechSynthesis` trên Safari/iOS cần **user gesture** trước khi phát âm | Trung bình | Nút nghe là gesture thật; `onerror` → toast + "Thử lại"; không auto-play |
| T7 | `getVoices()` trả `[]` trước khi `voiceschanged` bắn → false negative "không có voice" | Trung bình | Timeout 1500ms + listener `voiceschanged` (D-R5); đếm timeout từ lúc mount, không phải lúc bấm |
| T8 | Payload `preview` 4 mức gửi mỗi lượt → traffic thừa trên mobile | Thấp | Payload ~200 byte; server là local Next.js — không phải network internet; có thể gom sau |
| T9 | `SrsSession` là model **ngoài** 19 model trong SPEC §4 → lệch schema | Trung bình | Ghi rõ trong `spec.md` §5.2; cập nhật SPEC §4 ở lần sau; migration `prisma migrate dev` có ghi chú |
| T10 | `languagePattern` (20 mẫu câu) cũng là model mới → thêm bảng | Thấp | Gộp vào cùng migration; hoặc lưu mẫu câu trong file seed và import khi cần (nếu không muốn thêm bảng) |
| T11 | Component S10 là Client Component lớn → bundle nặng | Thấp | Không import `ts-fsrs` vào client (chỉ `import type`); phần còn lại là Server Component |
| T12 | Timer phiên chạy khi tab bị ẩn → sai số liệu thời lượng | Thấp | Dùng timestamp `startedAt` để tính lại thay vì đếm tick |
| T13 | Export deck JSON chứa `cardState` của phiên bản cũ → import vào app mới sai | Trung bình | `exportDeck` ghi kèm `fsrsConfig` + `cardState.version`; import validate & migrate |

---

## 8. AI layer

**Feature này KHÔNG dùng AI.** Đây là quyết định có chủ đích, không phải thiếu sót:

| Mục | Lý do |
|---|---|
| Không có model | FR-LG-10 + R6: nội dung level 0 phải **biên tập tay**, người biết ngôn ngữ duyệt. AI sinh từ vựng nền tảng = rủi ro sai chuẩn |
| Không có prompt | Không có tác vụ chấm/sinh nào cần AI |
| Không có caching | Không có call → không có `usage.cache_read_input_tokens` để kiểm |
| Không có structured output | Không có call |
| Fallback offline | **Không cần**: toàn bộ feature chạy offline 100% (NFR-03) |
| Không ghi `AiCall` | Feature này không sinh chi phí AI |

**AI chỉ được phép sinh *cách hỏi* và *bài luyện* (không phải từ vựng nền)** — thuộc feature khác:
- AI-08 (role-play) · AI-09 (sửa lỗi bài viết) → S07/S08/S11, Phase 2.
- AI-10 (sinh flashcard **từ bài viết của người dùng**) → `POST /api/language/cards` với `source: 'ai'`; **không** đụng tới 120 thẻ seed. Route `POST /api/language/cards` hiện chỉ nhận thẻ thủ công; AI-10 sẽ dùng route riêng hoặc thêm trường `source` ở feature sau.

---

## 9. Traceability

| Yêu cầu | Cài đặt ở đâu |
|---|---|
| FR-LG-01 | `prisma/schema.prisma` model `Card` · seed `prisma/seed-data/*.ts` |
| FR-LG-02 | `src/lib/fsrs.ts` (`scheduler`, `FSRS_CONFIG`) · `Card.cardState` JSON |
| FR-LG-03 | `src/lib/fsrs.ts::previewIntervals` · `src/components/language/fsrs-grade-bar.tsx` |
| FR-LG-04 | `src/lib/srs.ts::buildSession`, `listDueCards`, `pickNewCards` · `src/lib/config.ts::SRS_SESSION_MAX_CARDS` |
| FR-LG-05 | `src/components/language/flashcard-review.tsx` · `SessionCard.front/frontAlt/back/example` |
| FR-LG-09 | `src/lib/srs.ts::getLanguageStats`, `getReviewStreak` · `src/components/language/deck-card.tsx` |
| FR-LG-10 | `prisma/seed.ts` + `prisma/seed-data/{zh,en}.ts` (tĩnh) |
| NFR-05 | Zod refine `lang`/`mode`/`group` ở mọi route · nội dung `zh-Hans`/`en-US` |
| NFR-07 | `src/components/language/use-speech.ts` (Web Speech API, không dịch vụ ngoài) |
| AC-4 | `src/lib/fsrs.ts::applyRating` (test khớp `scheduler.next`) · `spec.md` §9 AC-LG-1 |
| R5 | `use-speech.ts` (`status: 'fallback'`, `shouldForceHanzi`) · AC-LG-8 |
| R6 | Seed tĩnh, không import Anthropic SDK · AC-LG-7 |
