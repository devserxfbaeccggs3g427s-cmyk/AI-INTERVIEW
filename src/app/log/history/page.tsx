import { HistoryList, type HistoryRow, type HistoryStats } from "@/components/quick-log/HistoryList";
import { DailyLoopHeader } from "@/components/daily-loop/DailyLoopHeader";
import { prisma } from "@/lib/db";
import { DOMAINS, type Domain } from "@/lib/types";

/**
 * S05 — Lịch sử ghi nhanh `/log/history` (task 5.6).
 *
 * Server Component: đọc `Activity` từ Prisma rồi truyền xuống
 * `HistoryList` (client) để filter bằng `searchParams`.
 *
 * Filter chạy server-side qua `?domain=` — URL chia sẻ được, và không cần
 * `useEffect` (design.md §7.3).
 */
export const dynamic = "force-dynamic";

export default async function LogHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const params = await searchParams;
  const domainParam = params.domain;
  const domain: Domain | null = DOMAINS.includes(domainParam as Domain)
    ? (domainParam as Domain)
    : null;

  const activities = await prisma.activity.findMany({
    where: domain ? { domain } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      skill: { select: { name: true } },
      evidences: { select: { rating: true }, take: 1 },
    },
  });

  const rows: HistoryRow[] = activities.map((a) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    domain: a.domain as Domain,
    type: a.type,
    minutes: a.minutes,
    skillName: a.skill?.name ?? null,
    rating: a.evidences[0]?.rating ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  // Thống kê phân bổ nỗ lực — tính trên TẤT CẢ hoạt động (không lọc) để
  // thanh stacked bar luôn cho bối cảnh đầy đủ, không phụ thuộc filter.
  const all = await prisma.activity.findMany({
    select: { domain: true, minutes: true },
  });

  const byDomain = Object.fromEntries(DOMAINS.map((d) => [d, 0])) as Record<Domain, number>;
  let totalMinutes = 0;
  for (const a of all) {
    const d = a.domain as Domain;
    if (d in byDomain) byDomain[d] += a.minutes;
    totalMinutes += a.minutes;
  }

  const stats: HistoryStats = {
    totalMinutes,
    byDomain,
    totalCount: all.length,
  };

  return (
    <div className="flex flex-col gap-gutter-lg">
      <DailyLoopHeader
        eyebrow={<>DAILY LOOP OS / NHẬT KÝ</>}
        title="Lịch sử ghi nhanh"
        description="Mọi hoạt động đã ghi — mới nhất ở trên cùng. Lọc theo lĩnh vực để xem phân bổ nỗ lực."
      />

      <HistoryList rows={rows} stats={stats} activeDomain={domain} />
    </div>
  );
}
