import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Bài kiểm tra ngoại ngữ` thuộc feature `language-test`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Bài kiểm tra ngoại ngữ"
      description="Danh sách bài kiểm tra và kết quả theo chuẩn CEFR/HSK."
      feature="language-test"
    />
  );
}
