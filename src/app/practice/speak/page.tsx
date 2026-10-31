import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Luyện giao tiếp — Nói` thuộc feature `communication-training`.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Luyện giao tiếp — Nói"
      description="Ghi âm và nhận phản hồi có cấu trúc từ AI."
      feature="communication-training"
    />
  );
}
