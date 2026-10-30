"use client";

import { cn } from "@/components/ui/Button";
import { DOMAIN_CHIP_CLASS } from "@/lib/ui";
import { type Domain } from "@/lib/types";

/**
 * 6 preset chip đánh số `1`–`6` cho bước 1 của Quick-log (task 5.2).
 *
 * Nội dung mẫu lấy từ mockup S05 (design.md §4.5):
 *   1 Học 25′ · 2 Luyện tập · 3 Viết · 4 Luyện nói · 5 Nhật ký · 6 Chăm sóc bản thân.
 *
 * Phím tắt: nhấn `1`–`6` (không cần modifier) → điền nội dung mẫu vào ô nhập
 * rồi focus ô nhập. Chỉ hoạt động khi sheet đang mở (component chỉ được
 * render khi mở) và **không ghi đè** nội dung người dùng đang gõ.
 *
 * Xem tasks.md 5.2.
 */
export type QuickLogPreset = {
  /** Phím tắt 1–6. */
  key: number;
  label: string;
  /** Nội dung mẫu điền vào textarea. */
  sample: string;
  domain: Domain;
  /** Gợi ý loại hoạt động — dùng làm `type` khi lưu. */
  type: "study" | "write" | "speak" | "journal" | "health" | "custom";
  minutes: number;
};

export const QUICK_LOG_PRESETS: QuickLogPreset[] = [
  {
    key: 1,
    label: "Học 25 phút",
    sample: "Học 25 phút Pomodoro",
    domain: "professional",
    type: "study",
    minutes: 25,
  },
  {
    key: 2,
    label: "Luyện tập",
    sample: "Luyện tập giải thuật toán LeetCode",
    domain: "professional",
    type: "study",
    minutes: 45,
  },
  {
    key: 3,
    label: "Viết",
    sample: "Viết bài phân tích Technical Design",
    domain: "communication",
    type: "write",
    minutes: 30,
  },
  {
    key: 4,
    label: "Luyện nói",
    sample: "Luyện nói tiếng Anh / Shadowing Mock",
    domain: "communication",
    type: "speak",
    minutes: 20,
  },
  {
    key: 5,
    label: "Nhật ký",
    sample: "Nhật ký suy nghĩ cuối ngày",
    domain: "personal",
    type: "journal",
    minutes: 10,
  },
  {
    key: 6,
    label: "Chăm sóc bản thân",
    sample: "Chạy bộ 3km & giãn cơ phục hồi",
    domain: "personal",
    type: "health",
    minutes: 30,
  },
];

export function PresetChips({
  onPick,
  activeKey,
  className,
}: {
  onPick: (preset: QuickLogPreset) => void;
  /** Preset đang được chọn — để đánh dấu trạng thái. */
  activeKey?: number | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-space-sm", className)} role="group" aria-label="Mẫu ghi nhanh nhanh">
      {QUICK_LOG_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p)}
          data-testid={`preset-${p.key}`}
          data-preset-key={p.key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-label-md transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
            DOMAIN_CHIP_CLASS[p.domain],
            activeKey === p.key && "ring-2 ring-primary",
          )}
          aria-label={`Mẫu ${p.key}: ${p.label}`}
        >
          <kbd className="rounded-sm bg-surface-container-lowest/40 px-1 font-code-md text-[0.6875rem]">
            {p.key}
          </kbd>
          <span className="whitespace-nowrap">{p.label}</span>
        </button>
      ))}
    </div>
  );
}
