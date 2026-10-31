import { toDateKey } from "@/lib/dates";

import { QuickLogLauncher } from "@/components/quick-log/quick-log-launcher";

export const dynamic = "force-dynamic";

/**
 * S05 — Quick-log (`/log`).
 *
 * ⚠️ FR-QL-01 — sheet mở **ngay lập tức**: trang này chỉ render launcher,
 * không gọi API nào trước khi người dùng bấm.
 */
export default function LogPage() {
  return (
    <div className="space-y-gutter-lg">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Ghi nhanh
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          Chọn 1 preset hoặc gõ mô tả — ghi xong trong vài giây.
        </p>
      </header>

      <QuickLogLauncher date={toDateKey(new Date())} />
    </div>
  );
}
