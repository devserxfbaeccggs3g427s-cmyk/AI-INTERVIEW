import { PlanWorkbench } from "@/app/plan/plan-workbench";
import { PageHeader } from "@/components/shell/PageHeader";
import { readPlanSlots } from "@/lib/plan-helpers";
import { prisma } from "@/lib/db";
import { formatVnDateLong } from "@/lib/dates";
import type { AiCallMeta, Domain } from "@/lib/types";
import type { SkillOption } from "@/components/daily-loop/SlotEditor";

/**
 * S02 — Thiết lập kế hoạch 6 slot hôm nay (`/plan`).
 *
 * Server Component: đọc dữ liệu thật (kế hoạch hôm nay, cây kỹ năng, lượt gọi
 * AI gần nhất) rồi đẩy xuống Client Component để chỉnh sửa.
 *
 * Xem tasks.md 6.1 / 6.3 / 6.4 · design.md §4.2 · FR-DL-06.
 */

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const [slots, skills, lastCall] = await Promise.all([
    readPlanSlots(new Date()),
    prisma.skill.findMany({
      select: { id: true, name: true, domain: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    // Task 6.3 — panel hiển thị `AiCall` gần nhất của task `daily_plan`.
    prisma.aiCall.findFirst({
      where: { feature: "daily_plan" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const skillOptions: SkillOption[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain as Domain,
  }));

  const lastAiCall: AiCallMeta | null = lastCall
    ? {
        provider: lastCall.provider === "anthropic" ? "anthropic" : "local",
        model: lastCall.model,
        effort: "medium",
        inputTokens: lastCall.inputTokens,
        outputTokens: lastCall.outputTokens,
        cacheRead: lastCall.cacheRead,
        cacheWrite: lastCall.cacheWrite,
        estimatedCost: lastCall.estimatedCost,
        latencyMs: lastCall.latencyMs,
        fallbackFrom: lastCall.fallbackFrom,
      }
    : null;

  return (
    <div className="space-y-gutter-lg">
      <PageHeader
        eyebrow={
          <>
            <span>Kế hoạch ngày</span>
            <span aria-hidden>·</span>
            <span>AI-01</span>
          </>
        }
        title="Thiết lập kế hoạch 6 slot hôm nay"
        description={`${formatVnDateLong(new Date())} — cấu trúc 6 slot cố định (Chuyên môn · Giao tiếp · Ngoại ngữ ×2 · Cá nhân ×2). AI chỉ điền nội dung, không đổi trục.`}
      />

      <PlanWorkbench
        initialSlots={slots}
        skills={skillOptions}
        lastAiCall={lastAiCall}
      />
    </div>
  );
}
