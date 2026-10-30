import { BioRhythmPanel } from "@/components/daily-loop/BioRhythmPanel";
import { CacheHitCard } from "@/components/daily-loop/CacheHitCard";
import { DailyLoopHeader } from "@/components/daily-loop/DailyLoopHeader";
import { FocusNodeCard } from "@/components/daily-loop/FocusNodeCard";
import { FsrsRetrievabilityCard } from "@/components/daily-loop/FsrsRetrievabilityCard";
import { PlanPreviewTrigger } from "@/components/daily-loop/PlanPreviewModal";
import { SlotCard } from "@/components/daily-loop/SlotCard";
import { WeekStreak } from "@/components/daily-loop/WeekStreak";
import { loadDailyLoopData } from "@/lib/daily-loop-data";
import { formatVnDateLong } from "@/lib/dates";
import { SLOT_COUNT, type PlanSlot } from "@/lib/types";

/**
 * S01 — Daily Loop `/` (tasks 4.1 · 4.10).
 *
 * Server Component: đọc dữ liệu thật từ Prisma rồi truyền xuống các
 * component client. Không dùng `useEffect` để tải dữ liệu (design.md §7.3:
 * ưu tiên server components + `router.refresh()` sau mutation).
 *
 * Layout 12 cột (design.md §4.1): trái `xl:col-span-8` (hạt nhân + nhịp tuần
 * + 6 slot), phải `xl:col-span-4` (sinh trắc + FSRS + cache).
 *
 * Vì sao không gọi `Card`/`Chip` trực tiếp ở đây: chúng gọi `cn()` — hàm nằm
 * trong module `"use client"` (`src/components/ui/Button.tsx`) → Server
 * Component không thể gọi (Next.js chặn). Mọi UI của S01 vì thế nằm trong các
 * component client ở `src/components/daily-loop/*`.
 */
export const dynamic = "force-dynamic";

export default async function DailyLoopPage() {
  const data = await loadDailyLoopData();
  const { slots, focus, week, fsrs, cache, bio } = data;

  return (
    <div className="flex flex-col gap-gutter-lg">
      <DailyLoopHeader
        eyebrow={<>DAILY LOOP OS / HÔM NAY</>}
        title="Vòng lặp hôm nay"
        description={`${formatVnDateLong()} — tối đa ${SLOT_COUNT} hành động nhỏ, ưu tiên một việc quan trọng nhất.`}
        actions={<PlanPreviewTrigger currentSlots={slotsToPlanSlots(slots)} />}
      />

      <div className="grid grid-cols-1 gap-gutter-md xl:grid-cols-12">
        {/* ───────── Cột trái (8/12) ───────── */}
        <div className="flex flex-col gap-gutter-md xl:col-span-8">
          {focus ? <FocusNodeCard focus={focus} /> : null}

          <WeekStreak days={week.days} streak={week.streak} />

          <section aria-label="Kế hoạch hôm nay" className="flex flex-col gap-gutter-md">
            <div className="flex flex-wrap items-center justify-between gap-gutter">
              <h2 className="font-headline-md text-on-surface">Kế hoạch hôm nay</h2>
              <span className="font-label-md text-on-surface-variant">
                {slots.filter((s) => s.done).length}/{slots.length} slot đã xong
              </span>
            </div>

            {slots.length === 0 ? (
              <EmptyPlan />
            ) : (
              slots.map((slot) => <SlotCard key={slot.slot} slot={slot} />)
            )}
          </section>
        </div>

        {/* ───────── Cột phải (4/12) ───────── */}
        <div className="flex flex-col gap-gutter-md xl:col-span-4">
          <BioRhythmPanel bio={bio} />
          <FsrsRetrievabilityCard stats={fsrs} />
          <CacheHitCard stats={cache} />
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state + CTA "Lập kế hoạch hôm nay" (task 4.10 / FR-DL-07).
 *
 * Thực tế `loadTodayPlan` đã tự sinh fallback khi chưa có kế hoạch, nên
 * nhánh này gần như không xảy ra — nhưng vẫn phải có để không bao giờ render
 * trang trống (AC-7 yêu cầu 6 slot; nếu DB lỗi thì ít nhất có CTA).
 */
function EmptyPlan() {
  return (
    <div className="flex flex-col items-center gap-gutter rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low p-gutter-lg text-center">
      <span className="material-symbols-outlined text-primary" style={{ fontSize: "2.5rem" }} aria-hidden>
        event_note
      </span>
      <div>
        <h3 className="font-headline-md text-on-surface">Chưa có kế hoạch hôm nay</h3>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Lập kế hoạch để có 6 hành động nhỏ — hoạt động offline bằng rule cục bộ,
          không cần API key.
        </p>
      </div>
      <a
        href="/plan"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary-container px-4 font-label-md font-semibold text-on-primary transition-all hover:brightness-105"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "1.125rem" }} aria-hidden>
          auto_awesome
        </span>
        Lập kế hoạch hôm nay
      </a>
    </div>
  );
}

/** Chuyển DTO slot → `PlanSlot` để `PlanPreviewModal` so sánh diff. */
function slotsToPlanSlots(
  slots: Array<{
    slot: number;
    domain: PlanSlot["domain"];
    action: string;
    detail: string | null;
    minutes: number;
    skillId: string | null;
    done: boolean;
  }>,
): PlanSlot[] {
  return slots.map((s) => ({
    slot: s.slot,
    domain: s.domain,
    action: s.action,
    detail: s.detail,
    minutes: s.minutes,
    skillId: s.skillId,
    done: s.done,
    source: "ai",
  }));
}
