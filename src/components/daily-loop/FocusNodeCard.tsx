"use client";

import { Badge, ProgressBar, ProgressSegments, Stat } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { MAX_LEVEL, evidenceToNextLevel, progressToNextLevel } from "@/lib/levels";
import type { FocusDTO } from "@/lib/daily-loop-types";

/**
 * `FocusNodeCard` — "Mục tiêu hạt nhân hôm nay" (task 4.2).
 *
 * Hiển thị: tên skill node, bậc hiện tại / mục tiêu, thanh tiến trình level
 * kế tiếp, số bằng chứng xác thực, thời gian tích lũy + trạng thái AI engine.
 *
 * Vì sao là Client Component: `Card`/`Chip` gọi `cn()` — hàm này nằm trong
 * `src/components/ui/Button.tsx` (file có `"use client"`), nên Server Component
 * không thể gọi trực tiếp (Next.js chặn với lỗi "Attempted to call cn() from
 * the server"). Đánh dấu client ở đây giữ đúng ranh giới RSC.
 *
 * Xem design.md §4.1 · requirements.md FR-SK-03.
 */
export function FocusNodeCard({ focus }: { focus: FocusDTO }) {
  const progress = progressToNextLevel(focus.level, focus.evidenceCount);
  const need = evidenceToNextLevel(focus.level, focus.evidenceCount);
  const hours = Math.round((focus.accumulatedMinutes / 60) * 10) / 10;

  return (
    <Card className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-start justify-between gap-gutter">
        <div className="min-w-0">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-primary" aria-hidden>
              track_changes
            </span>
            <span className="font-label-sm uppercase tracking-widest text-on-surface-variant">
              Mục tiêu hạt nhân hôm nay
            </span>
          </div>
          <h2 className="mt-1 font-headline-lg text-on-surface">{focus.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-space-sm">
            {/* Bậc hiện tại / mục tiêu */}
            <span className="font-label-md text-on-surface">
              Bậc {focus.level} / {MAX_LEVEL}
            </span>
            <span className="font-label-sm text-outline">(Target: {focus.targetLevel}/{MAX_LEVEL})</span>
            {focus.isManual ? (
              <Badge tone="primary">Đã đặt thủ công</Badge>
            ) : (
              <Badge tone="outline">Tự động — skill yếu nhất</Badge>
            )}
          </div>
        </div>

        {/* Trạng thái AI engine — nhãn đọc từ `AiCall` thật (FR-AI-11) */}
        <div className="flex shrink-0 items-center gap-space-sm rounded-lg bg-surface-container-low px-space-md py-space-sm">
          <span className="material-symbols-outlined text-secondary" aria-hidden>
            memory
          </span>
          <div className="min-w-0">
            <div className="font-label-sm uppercase tracking-widest text-outline">
              Trạng thái AI Engine
            </div>
            <div className="font-code-md text-secondary">{focus.aiChip}</div>
          </div>
        </div>
      </div>

      {/* Thanh tiến trình level kế tiếp */}
      <div>
        <div className="mb-space-sm flex items-baseline justify-between gap-space-sm">
          <span className="font-label-md text-on-surface-variant">
            Tiến trình lên bậc {Math.min(focus.level + 1, MAX_LEVEL)}
          </span>
          <span className="font-code-md text-primary">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
        <p className="mt-space-sm text-body-sm text-on-surface-variant">
          {need > 0
            ? `Cần thêm ${need} bằng chứng xác thực (rating ≥ 3) để lên bậc ${focus.level + 1}.`
            : "Đã đạt bậc tối đa."}
        </p>
      </div>

      {/* 4 ô chỉ số — đối chiếu mockup S01 */}
      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <Stat
          label="Cột mốc hiện tại"
          value={
            <>
              Bậc {focus.level} / {MAX_LEVEL}
            </>
          }
          hint={`(Target: ${focus.targetLevel}/${MAX_LEVEL})`}
        />
        <Stat
          label="Bằng chứng xác thực"
          value={focus.evidenceCount}
          hint="bằng chứng rating ≥ 3"
          icon="verified"
        />
        <Stat label="Thời gian tích lũy" value={`${hours} giờ`} hint={`${focus.accumulatedMinutes} phút`} />
        <Stat label="Trạng thái AI Engine" value={focus.aiIsLocal ? "Local" : "Cloud"} hint={focus.aiChip} />
      </div>

      {/* Level dạng segment — mỗi segment = 1 bậc (0..5) */}
      <div>
        <div className="mb-space-sm font-label-sm uppercase tracking-widest text-outline">
          Bậc kỹ năng
        </div>
        <ProgressSegments current={focus.level} total={MAX_LEVEL + 1} />
      </div>
    </Card>
  );
}
