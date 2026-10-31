import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { getSkillDetail } from "@/lib/skills";

import { SkillDetail } from "@/components/skills/skill-detail";

export const dynamic = "force-dynamic";

/**
 * S04 — Chi tiết kỹ năng (`/skills/[id]`).
 *
 * ⚠️ NFR-SK-01 — không phụ thuộc AI: toàn bộ số liệu là truy vấn SQLite.
 */
export default async function SkillDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const detail = await getSkillDetail(id);
  if (!detail) notFound();

  // Breadcrumb: đường dẫn từ domain tới node.
  const path: Array<{ id: string; name: string }> = [];
  let currentId: string | null = id;

  while (currentId) {
    const row: { id: string; name: string; parentId: string | null } | null =
      await prisma.skill.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
    if (!row) break;
    path.unshift({ id: row.id, name: row.name });
    currentId = row.parentId;
  }

  return <SkillDetail detail={detail} path={path} />;
}
