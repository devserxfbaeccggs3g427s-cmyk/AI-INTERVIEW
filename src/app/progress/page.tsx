import { ProgressView } from "@/components/progress/ProgressView";
import { PageHeader } from "@/components/shell/PageHeader";
import { getProgressReport, progressDigest } from "@/lib/progress-data";

/**
 * S14 — Báo cáo tiến bộ (`/progress`) — tasks.md 16.1 → 16.7.
 *
 * **Server Component**: đọc `Skill` / `Evidence` / `Activity` / `Review` trực
 * tiếp từ Prisma, tính toàn bộ chỉ số rồi đẩy DTO xuống `ProgressView`
 * (Client Component) để xử lý lọc domain và xuất JSON.
 *
 * Không có vanity metric: không hiển thị "tổng giờ học" trần trụi — mọi chỉ số
 * thời gian đều gắn với sản phẩm (`Evidence`).
 *
 * Xem tasks.md 16.1–16.7 · requirements.md §2.12.
 */
export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const report = await getProgressReport();
  const digest = progressDigest(report);

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow={
          <>
            <span>Báo cáo &amp; tiến độ</span>
            <span aria-hidden>·</span>
            <span>Quỹ đạo 6 tháng · heatmap 90 ngày</span>
          </>
        }
        title="Báo cáo tiến bộ"
        description="Tiến độ đo bằng bằng chứng thật, không phải bằng giờ bấm giờ hay cảm nhận chủ quan."
      />

      <ProgressView report={report} digest={digest} />
    </div>
  );
}
