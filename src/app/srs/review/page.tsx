import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — màn hình `Ôn 1 thẻ` thuộc feature `srs-language-review`.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Ôn 1 thẻ"
      description="Phiên ôn 1 thẻ theo lịch FSRS: nhập lại → tự chấm → lên lịch lại."
      feature="srs-language-review"
    />
  );
}
