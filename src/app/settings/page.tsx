import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Cài đặt & chi phí` thuộc feature `settings-cost`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Cài đặt & chi phí"
      description="Cấu hình ứng dụng và theo dõi chi phí gọi AI."
      feature="settings-cost"
    />
  );
}
