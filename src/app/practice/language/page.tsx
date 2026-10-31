import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Luyện ngoại ngữ chủ động` thuộc feature `communication-training`.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Luyện ngoại ngữ chủ động"
      description="Bài luyện theo chủ đề, AI chấm và chỉ ra điểm yếu."
      feature="communication-training"
    />
  );
}
