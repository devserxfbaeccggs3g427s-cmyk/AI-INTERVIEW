import { ComingSoon } from "@/components/shell/coming-soon";

export const dynamic = "force-dynamic";

/**
 * Placeholder — Chi tiết kỹ năng (S04) thuộc feature `skill-tree-evidence`.
 */
export default async function Page(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  return (
    <ComingSoon
      title="Chi tiết kỹ năng"
      description={`Mức hiện tại, tiêu chí đạt và toàn bộ bằng chứng của kỹ năng ${id}.`}
      feature="skill-tree-evidence"
    />
  );
}
