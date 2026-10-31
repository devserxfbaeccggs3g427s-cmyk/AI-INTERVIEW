import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Báo cáo tiến bộ` thuộc feature `weekly-progress-report`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Báo cáo tiến bộ"
      description="Theo dõi tiến bộ theo lộ trình 3 giai đoạn và từng kỹ năng."
      feature="weekly-progress-report"
    />
  );
}
