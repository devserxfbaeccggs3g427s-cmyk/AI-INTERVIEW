import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Nhật ký & phản hồi AI` thuộc feature `personal-state-journal`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Nhật ký & phản hồi AI"
      description="Ghi nhật nhanh và nhận phản hồi có cấu trúc từ AI."
      feature="personal-state-journal"
    />
  );
}
