import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Báo cáo tuần` thuộc feature `weekly-progress-report`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Báo cáo tuần"
      description="Tổng hợp bằng chứng trong tuần và điều chỉnh kế hoạch cho tuần sau."
      feature="weekly-progress-report"
    />
  );
}
