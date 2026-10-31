import { getSkillTree } from "@/lib/skills";

import { SkillTree } from "@/components/skills/skill-tree";

export const dynamic = "force-dynamic";

/**
 * S03 — Cây kỹ năng & bằng chứng (`/skills`).
 *
 * ⚠️ NFR-SK-01 — **không phụ thuộc AI**: toàn bộ số liệu là truy vấn SQLite.
 * ⚠️ NFR-SK-04 — không N+1: `getSkillTree()` dùng 3 query cho toàn bộ cây.
 */
export default async function SkillsPage() {
  const tree = await getSkillTree();

  return (
    <div className="space-y-gutter-lg">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Cây kỹ năng & bằng chứng
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          Không sử dụng phần trăm ước lượng. Mọi nấc thăng cấp 0→5 đều yêu cầu mốc bằng
          chứng.
        </p>
      </header>

      <SkillTree tree={tree} />
    </div>
  );
}
