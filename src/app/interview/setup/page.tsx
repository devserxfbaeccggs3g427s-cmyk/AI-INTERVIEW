import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Mock Interview` thuộc feature `mock-interview`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Mock Interview"
      description="Cấu hình phiên phỏng vấn: vị trí, độ khó và số câu."
      feature="mock-interview"
    />
  );
}
