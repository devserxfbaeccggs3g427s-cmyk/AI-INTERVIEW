"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Chip";
import { useQuickLog } from "@/components/quick-log/QuickLogProvider";
import { useToast } from "@/components/ui/Toaster";
import { DOMAIN_CHIP_CLASS, DOMAIN_RAIL_CLASS } from "@/lib/ui";
import { DOMAIN_LABELS } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DailySlotDTO } from "@/lib/daily-loop-types";

/**
 * `SlotCard` — 1 slot kế hoạch trong ngày (task 4.4).
 *
 * Hành vi (design.md §4.1):
 *   - Chip domain theo màu domain (`DOMAIN_CHIP_CLASS`).
 *   - Tiêu đề + mô tả (cắt ≤120 ký tự) + thời lượng + kỹ năng liên quan.
 *   - Slot ưu tiên có **rail màu bên trái** + badge CTA khác.
 *   - Slot đã xong → tiêu đề gạch ngang + badge "Đã xong".
 *   - "Xong" → `POST /api/log` với `source: "plan_item"` → `router.refresh()`.
 *   - "Hoàn thành nhanh" → mở Quick-log prefill domain + skill + phút.
 *
 * Optimistic update (design.md §7.3): set `done = true` **ngay**, rollback nếu
 * API lỗi. Đây là nơi DUY NHẤT được phép optimistic trong toàn app.
 *
 * Xem requirements.md FR-DL-02 / FR-DL-03 / FR-DL-04.
 */
export function SlotCard({ slot }: { slot: DailySlotDTO }) {
  const router = useRouter();
  const { toast } = useToast();
  const { open } = useQuickLog();

  // Optimistic state — nguồn sự thật tạm thời cho tới khi `router.refresh()`
  // trả về dữ liệu mới từ server.
  const [done, setDone] = useState(slot.done);
  const [busy, setBusy] = useState(false);

  const markDone = async () => {
    if (busy || done) return;
    setBusy(true);
    // Optimistic: bật gạch ngang ngay, chờ server xác nhận.
    setDone(true);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "plan_item",
          planItemId: slot.planItemId ?? undefined,
          domain: slot.domain,
          type: "study",
          title: slot.action,
          minutes: slot.minutes,
          skillId: slot.skillId ?? undefined,
          rating: 3,
          createEvidence: true,
        }),
      });

      const payload = (await res.json()) as {
        ok: boolean;
        error?: { code: string; message: string };
      };

      if (!res.ok || !payload.ok) {
        // Rollback — ô nhập/UI không được để lệch với DB (design.md §7.3).
        setDone(slot.done);
        toast({
          tone: "error",
          title: "Không ghi được",
          description: payload.error?.message ?? "Thử lại sau.",
        });
        return;
      }

      toast({
        tone: "success",
        title: "Đã ghi nhận",
        description: `${slot.action} · ${slot.minutes} phút`,
      });
      router.refresh();
    } catch {
      setDone(slot.done);
      toast({
        tone: "error",
        title: "Không ghi được",
        description: "Mất kết nối — thử lại sau.",
      });
    } finally {
      setBusy(false);
    }
  };

  const quickLog = () => {
    open({
      domain: slot.domain,
      skillId: slot.skillId,
      title: slot.action,
      minutes: slot.minutes,
    });
  };

  // Mô tả cắt ≤120 ký tự (FR-DL-02).
  const detail = slot.detail ? trimTo(slot.detail, 120) : null;

  return (
    <article
      className="flex overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container"
      data-testid={`slot-${slot.slot}`}
      data-done={done ? "true" : "false"}
    >
      {/* Rail màu domain — chỉ slot ưu tiên mới có rail đậm (design.md §4.1). */}
      <div
        className={`${slot.isPriority ? "w-1.5" : "w-1"} ${DOMAIN_RAIL_CLASS[slot.domain]}`}
        aria-hidden
        data-priority={slot.isPriority ? "true" : "false"}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-space-md p-gutter">
        {/* Header: chip domain + số slot + thời lượng */}
        <div className="flex flex-wrap items-center gap-space-sm">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-label-md ${DOMAIN_CHIP_CLASS[slot.domain]}`}
          >
            Slot {slot.slot + 1} · {DOMAIN_LABELS[slot.domain]}
          </span>
          <span className="inline-flex items-center gap-1 font-label-md text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
              schedule
            </span>
            {slot.minutes} phút
          </span>
          {slot.isPriority ? <Badge tone="primary">Ưu tiên hôm nay</Badge> : null}
          {done ? <Badge tone="tertiary">Đã xong</Badge> : null}
        </div>

        {/* Tiêu đề — gạch ngang khi đã xong */}
        <div>
          <h3
            className={`font-headline-sm text-on-surface ${done ? "line-through opacity-60" : ""}`}
            data-testid={`slot-title-${slot.slot}`}
          >
            {slot.action}
          </h3>
          {detail ? (
            <p className="mt-0.5 text-body-sm text-on-surface-variant">{detail}</p>
          ) : null}
        </div>

        {/* Kỹ năng liên quan */}
        {slot.skillName ? (
          <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: "0.875rem" }} aria-hidden>
              account_tree
            </span>
            {slot.skillName}
          </div>
        ) : null}

        {/* Hành động */}
        <div className="flex flex-wrap items-center gap-space-sm">
          <Button
            variant="primary"
            size="sm"
            onClick={markDone}
            loading={busy}
            disabled={done}
            icon="check"
            data-testid={`slot-done-${slot.slot}`}
          >
            {done ? "Đã xong" : "Xong"}
          </Button>
          <Button
            variant={slot.isPriority ? "ai" : "ghost"}
            size="sm"
            onClick={quickLog}
            icon="bolt"
            data-testid={`slot-quick-${slot.slot}`}
          >
            Hoàn thành nhanh
          </Button>
        </div>

        {/* Trạng thái — aria-live cho NFR-06 */}
        <p className="text-body-sm text-on-surface-variant" aria-live="polite">
          {busy ? "Đang ghi nhận…" : done ? "Đã ghi nhận hoạt động này." : "Chưa hoàn thành."}
        </p>
      </div>
    </article>
  );
}

/** Cắt chuỗi kèm dấu "…" nếu vượt `max` ký tự. */
function trimTo(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}
