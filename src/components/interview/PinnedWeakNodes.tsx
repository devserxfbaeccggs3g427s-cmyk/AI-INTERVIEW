"use client";

import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import type { SkillOption } from "@/components/daily-loop/SlotEditor";

interface PinnedNode {
  id: string;
  name: string;
  domain: string;
  evidenceCount: number;
  score: number;
}

/**
 * Gắn 5 node yếu nhất từ cây kỹ năng — tasks.md 13.2
 * Ưu tiên: ít bằng chứng hơn, điểm thấp hơn
 */
export function PinnedWeakNodes({
  skills,
  maxNodes = 5,
}: {
  skills: SkillOption[];
  maxNodes?: number;
}) {
  // Sắp xếp: ít evidence hơn lên trước, rồi điểm thấp hơn
  const sorted = [...skills].sort((a, b) => {
    // Giả sử skills có evidenceCount và score - nhưng SkillOption chỉ có id, name, domain
    // Cần query thêm từ DB hoặc truyền vào
    return 0;
  });

  // Vì SkillOption không có evidenceCount/score, component này cần nhận dữ liệu bổ sung
  // Đây là placeholder - logic thực sẽ ở server component

  return (
    <Card className="space-y-gutter">
      <h3 className="font-headline-sm text-on-surface">Node yếu nhất (tự động gắn)</h3>
      <p className="text-body-sm text-on-surface-variant">
        Hệ thống ưu tiên node 0 bằng chứng (Score 0.0) trước node 2 bằng chứng (Score 1.2).
        Bạn có thể bỏ ghim node không muốn luyện.
      </p>
      <div className="flex flex-wrap gap-space-sm" aria-label="Node yếu ghim">
        {/* Placeholder - sẽ render từ server */}
        <Chip tone="outline">
          Chưa có dữ liệu
        </Chip>
      </div>
    </Card>
  );
}

/** Component server-side sẽ dùng để lấy 5 node yếu nhất */
export async function getWeakestNodes(prisma: any, limit = 5): Promise<PinnedNode[]> {
  // Query skills với evidence count và level (score proxy)
  const skills = await prisma.skill.findMany({
    select: {
      id: true,
      name: true,
      domain: true,
      level: true,
      _count: { select: { evidences: true } },
    },
    orderBy: [
      { evidences: { _count: "asc" } }, // ít evidence trước
      { level: "asc" }, // level thấp trước
    ],
    take: limit,
  });

  return skills.map((s: any) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    evidenceCount: s._count.evidences,
    score: s.level * 1.2, // proxy score
  }));
}