import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Cây kỹ năng` thuộc feature `skill-tree-evidence`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Cây kỹ năng"
      description="Xem cây kỹ năng, mức hiện tại và bằng chứng đã tích lũy cho từng kỹ năng."
      feature="skill-tree-evidence"
    />
  );
}
