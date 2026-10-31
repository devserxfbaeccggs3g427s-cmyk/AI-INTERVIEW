import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Ôn tập ngoại ngữ` thuộc feature `srs-language-review`.
 *
 * ⚠️ Trang này tồn tại để (1) bottom nav / overflow menu không prefetch 404
 * và (2) người dùng thấy màn hình "sắp có" thay vì lỗi.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Ôn tập ngoại ngữ"
      description="Lịch ôn theo lịch FSRS với các thẻ đến hạn."
      feature="srs-language-review"
    />
  );
}
