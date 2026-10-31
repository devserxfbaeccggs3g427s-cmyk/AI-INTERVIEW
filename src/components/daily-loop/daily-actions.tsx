"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { QuickLogTrigger } from "@/components/daily-loop/quick-log-trigger";
import { ReplanModal } from "@/components/daily-loop/replan-modal";
import type { PlanSlotDTO } from "@/lib/daily-loop";

/**
 * Nhóm hành động chính trên S01:
 * - "+ Ghi nhanh (≤10s)" → mở sheet Quick-log **tức thì** (P2)
 * - "Lập lại kế hoạch hôm nay (AI)" → mở modal "Cân chỉnh lại hôm nay" (FR-DL-06)
 */
export interface DailyActionsProps {
  date: string;
  isToday: boolean;
  /** Năng lượng tuần 0–100 — hiện trong rationale của modal. */
  energyPct: number;
  /** Số slot đã hoàn thành (bất biến khi sinh lại). */
  doneCount: number;
  /** Kế hoạch hiện tại — dùng để dựng gợi ý phân bổ. */
  items: PlanSlotDTO[];
}

export function DailyActions({
  date,
  isToday,
  energyPct,
  doneCount,
  items,
}: DailyActionsProps) {
  const router = useRouter();
  const [replanOpen, setReplanOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  /** Gợi ý phân bổ lại — slot chưa xong, sắp theo thứ tự ưu tiên. */
  const suggestions = items
    .filter((item) => !item.done)
    .map((item) => ({
      slot: item.slot,
      label: item.action,
      minutes: item.minutes,
    }));

  async function regenerate() {
    setRegenerating(true);
    try {
      await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mode: "regenerate", keepDone: true }),
      });
      setReplanOpen(false);
      router.refresh();
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-space-sm">
        <QuickLogTrigger date={date} />

        <button
          type="button"
          onClick={() => setReplanOpen(true)}
          disabled={!isToday}
          className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md text-secondary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="neurology" size={16} />
          Lập lại kế hoạch hôm nay (AI)
        </button>
      </div>

      <ReplanModal
        open={replanOpen}
        onClose={() => setReplanOpen(false)}
        onRegenerate={() => void regenerate()}
        energyPct={energyPct}
        doneCount={doneCount}
        suggestions={suggestions}
        loading={regenerating}
      />
    </>
  );
}
