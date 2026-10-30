"use client";

import { DailyLoopHeader } from "@/components/daily-loop/DailyLoopHeader";
import { useQuickLog } from "@/components/quick-log/QuickLogProvider";
import { Button } from "@/components/ui/Button";

/**
 * S05 — `/log` (task 5.1 phụ).
 *
 * Trang này là **điểm vào** của luồng ghi nhanh: mở Quick-log sheet ngay tại
 * chỗ, kèm link tới lịch sử `/log/history`.
 *
 * Vì sao là Client Component: cần gọi `useQuickLog().open()` để mở sheet —
 * state của sheet nằm ở provider phía client.
 */
export default function LogPage() {
  const { open } = useQuickLog();

  return (
    <div className="flex flex-col gap-gutter-lg">
      <DailyLoopHeader
        eyebrow={<>DAILY LOOP OS / GHI NHANH</>}
        title="Ghi nhanh hoạt động"
        description="Ghi lại việc bạn vừa làm trong vài giây — AI tự điền phần còn lại."
        actions={
          <>
            <Button variant="ghost" size="md" onClick={() => open()}>
              Mở lịch sử
            </Button>
            <Button variant="primary" size="md" icon="bolt" onClick={() => open()}>
              + Ghi nhanh (≤10s)
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-gutter rounded-xl border border-outline-variant/30 bg-surface-container p-gutter">
        <h2 className="font-headline-md text-on-surface">Ghi nhanh trong ≤10 giây</h2>
        <ol className="flex flex-col gap-space-sm text-body-md text-on-surface-variant">
          <li>1. Bấm “+ Ghi nhanh” hoặc nhấn <kbd className="rounded-sm bg-surface-container-high px-1 font-code-md">Cmd/Ctrl + K</kbd>.</li>
          <li>2. Chọn 1 mẫu nhanh (phím <kbd className="rounded-sm bg-surface-container-high px-1 font-code-md">1</kbd>–<kbd className="rounded-sm bg-surface-container-high px-1 font-code-md">6</kbd>) hoặc tự gõ.</li>
          <li>3. Bấm “Ghi nhanh ngay” — lưu ngay, không chờ AI.</li>
        </ol>
        <div className="flex flex-wrap gap-space-sm">
          <Button variant="primary" size="md" icon="bolt" onClick={() => open()}>
            Mở ô ghi nhanh
          </Button>
          <a
            href="/log/history"
            className="inline-flex h-10 items-center rounded-lg border border-outline-variant/40 px-4 font-label-md text-on-surface-variant hover:text-on-surface"
          >
            Xem lịch sử →
          </a>
        </div>
      </div>
    </div>
  );
}
