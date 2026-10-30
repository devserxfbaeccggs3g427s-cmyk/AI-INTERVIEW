/**
 * S19 — trang chọn loại bài kiểm tra ngoại ngữ (task 14.1, 14.2, 14.3, 14.20).
 *
 * Server Component — fetch UserProfile (level) + lịch sử benchmark để hiển thị.
 * Truyền dữ liệu qua props cho Client Component con (TestTypeCard, BenchmarkChart).
 *
 * Tầng dữ liệu nằm ở `@/lib/test-page-data` — page file chỉ được export các
 * field đặc biệt của Next.js (`default`, `dynamic`, `metadata`…), nên không
 * thể export `getS19Data` từ đây.
 *
 * Xem tasks.md 14.1 / 14.2 / 14.3 / 14.20 · design.md §4.19 / S19.
 */

import { PageHeader } from "@/components/shell/PageHeader";
import { BenchmarkChart } from "@/components/test/BenchmarkChart";
import { TestTypeSection } from "@/components/test/TestTypeSection";
import { FromContentModal } from "@/components/test/FromContentModal";
import { Card } from "@/components/ui/Card";
import { getS19Data } from "@/lib/test-page-data";

export const dynamic = "force-dynamic";

export default async function TestPage() {
  const data = await getS19Data();

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow="Bài kiểm tra · AI-14"
        title="Bài kiểm tra ngoại ngữ"
        description="4 kiểu đề: định vị, theo chủ đề, chuẩn và tự sinh từ nội dung văn bản."
      />

      {/* Language switcher + TestTypeCard */}
      <Card className="p-gutter">
        <TestTypeSection
          configs={data.testTypeConfigs}
          zhLevel={data.profile?.zhLevel ?? "zero"}
          enLevel={data.profile?.enLevel ?? "zero"}
        />
      </Card>

      {/* BenchmarkChart */}
      <BenchmarkChart
        periods={data.benchmarkPeriods}
        itemTypeAccuracies={data.itemTypeAccuracies}
        wrongWords={data.wrongWords}
      />

      {/* From-content modal trigger */}
      <Card className="p-gutter">
        <FromContentModal
          lang={data.profile?.learningLangs.includes("zh") ? "zh" : "en"}
        />
      </Card>
    </div>
  );
}
