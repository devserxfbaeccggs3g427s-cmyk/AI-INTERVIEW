"use client";

import { Badge, ProgressBar, Stat } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import type { BioRhythmDTO } from "@/lib/daily-loop-types";

/**
 * `BioRhythmPanel` — "Sinh trắc & Nhịp độ" + hàng đợi FSRS (task 4.9).
 *
 * Task này chỉ **hiển thị**: mood / energy / focus / sleep đọc từ `DailyState`
 * hôm nay; số thẻ đến hạn đọc từ `Card.due <= now`. Sửa chỉ số là việc của
 * S12 (`/state`) — không ghi ở đây.
 *
 * Xem design.md §4.1.
 */
export function BioRhythmPanel({ bio }: { bio: BioRhythmDTO }) {
  return (
    <Card className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-center justify-between gap-gutter">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-tertiary" aria-hidden>
            monitor_heart
          </span>
          <h3 className="font-headline-md text-on-surface">Sinh trắc &amp; Nhịp độ</h3>
        </div>
        <Badge tone="outline">Hôm nay</Badge>
      </div>

      {/* 4 chỉ số sinh trắc — 1..5, `null` = chưa đánh giá */}
      <div className="grid grid-cols-2 gap-gutter">
        <Scale label="Tâm trạng" icon="sentiment_satisfied" value={bio.mood} />
        <Scale label="Năng lượng" icon="bolt" value={bio.energy} />
        <Scale label="Tập trung" icon="center_focus_strong" value={bio.focus} />
        <div className="min-w-0">
          <Stat
            label="Giấc ngủ"
            value={bio.sleep === null ? "—" : `${bio.sleep} giờ`}
            hint={bio.sleep === null ? "chưa ghi nhận" : "đêm qua"}
            icon="bedtime"
          />
        </div>
      </div>

      {/* Hàng đợi FSRS — số thẻ đến hạn hôm nay */}
      <div className="flex items-center justify-between gap-gutter rounded-lg bg-surface-container-low px-space-md py-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-secondary" aria-hidden>
            style
          </span>
          <div>
            <div className="font-label-sm uppercase tracking-widest text-outline">
              Hàng đợi ôn tập
            </div>
            <div className="text-body-sm text-on-surface-variant">thẻ cần giải phóng hôm nay</div>
          </div>
        </div>
        <span
          className="font-code-md font-bold text-secondary"
          data-testid="due-cards-count"
        >
          {bio.dueCards} DUE
        </span>
      </div>

      {/* Năng lượng tuần */}
      <div>
        <div className="mb-space-sm flex items-baseline justify-between">
          <span className="font-label-sm uppercase tracking-widest text-outline">
            Năng lượng tuần
          </span>
          <span className="font-code-md text-primary">{bio.weekEnergy}%</span>
        </div>
        <ProgressBar value={bio.weekEnergy} />
      </div>

      <a
        href="/state"
        className="font-label-md text-primary hover:underline"
        aria-label="Mở trang đánh giá chỉ số cá nhân"
      >
        Cập nhật chỉ số tại S12 →
      </a>
    </Card>
  );
}

/**
 * 1 chỉ số 1..5 kèm thanh tiến trình.
 * `null` → hiện "—" và thanh rỗng (chưa đánh giá hôm nay).
 */
function Scale({
  label,
  icon,
  value,
}: {
  label: string;
  icon: string;
  value: number | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-on-surface-variant">
        <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
          {icon}
        </span>
        <span className="font-label-sm uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-1 font-headline-md text-on-surface">{value === null ? "—" : `${value}/5`}</div>
      <ProgressBar value={value === null ? 0 : (value / 5) * 100} tone="tertiary" className="mt-1" />
    </div>
  );
}
