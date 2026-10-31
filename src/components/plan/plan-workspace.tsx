"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { PlanSlotDTO } from "@/lib/daily-loop";
import { usePlanStream } from "@/components/plan/use-plan-stream";

/**
 * S02 — Sinh kế hoạch AI: xem trước · sửa inline · kéo đổi · duyệt.
 *
 * Bản nháp nằm trong state của client (R-DL-10). Chỉ ghi vào SQLite khi bấm
 * "Duyệt & Áp dụng" → `PATCH /api/plan/items` với `apply: true`.
 */

export interface PlanWorkspaceProps {
  date: string;
  initialItems: PlanSlotDTO[];
  aiAvailable: boolean;
  /** Slot đã hoàn thành — không sửa được, không bị AI ghi đè. */
  lockedSlots: number[];
}


export function PlanWorkspace({
  date,
  initialItems,
  aiAvailable,
  lockedSlots,
}: PlanWorkspaceProps) {
  const router = useRouter();
  const {
    items,
    setItems,
    streamState,
    error,
    setError,
    usage,
    source,
    generate,
  } = usePlanStream({ date, initialItems, aiAvailable });

  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);

  const locked = new Set(lockedSlots);
  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);

  // ── Duyệt & áp dụng ──────────────────────────────────────────────────────
  async function applyPlan() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          items: items.map((item) => ({
            slot: item.slot,
            domain: item.domain,
            action: item.action,
            detail: item.detail ?? "",
            minutes: item.minutes,
            skillId: item.skillId,
          })),
          apply: true,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không duyệt được kế hoạch.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Không kết nối được máy chủ — thử lại.");
    } finally {
      setApplying(false);
    }
  }

  // ── Sửa inline ───────────────────────────────────────────────────────────
  function updateSlot(slot: number, patch: Partial<PlanSlotDTO>) {
    setItems((current) =>
      current.map((item) => (item.slot === slot ? { ...item, ...patch } : item)),
    );
  }

  /** Đổi chỗ 2 slot — chỉ trong cùng domain (bất biến tập 4 trục). */
  function swapSlots(a: number, b: number) {
    const itemA = items.find((i) => i.slot === a);
    const itemB = items.find((i) => i.slot === b);
    if (!itemA || !itemB) return;

    if (itemA.domain !== itemB.domain) {
      setError("Chỉ đổi thứ tự được trong cùng trục.");
      return;
    }

    setItems((current) =>
      current.map((item) => {
        if (item.slot === a) return { ...itemB, slot: a };
        if (item.slot === b) return { ...itemA, slot: b };
        return item;
      }),
    );
  }

  return (
    <div className="space-y-gutter-lg">
      {/* Header panel */}
      <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              Daily Loop OS / Kế hoạch ngày
            </span>
            <h1 className="mt-space-xs font-headline-lg text-headline-lg text-on-surface">
              Thiết lập kế hoạch 6 slot
            </h1>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-1 font-code-md text-code-md text-secondary">
              <Icon name="neurology" size={14} />
              {aiAvailable ? "AI-01" : "OFFLINE"}
            </span>
            <p className="mt-space-xs font-label-sm text-label-sm text-outline tabular">
              Tổng lượng cam kết: {totalMinutes} phút
            </p>
          </div>
        </div>

        {/* Nhóm nút */}
        <div className="mt-space-lg flex flex-wrap gap-space-sm">
          <button
            type="button"
            onClick={() => void generate("generate")}
            disabled={!aiAvailable || streamState === "streaming"}
            className="inline-flex items-center gap-1 rounded-lg bg-surface-container px-3 py-2 font-label-md text-label-md text-on-surface-variant transition hover:bg-surface-container-high disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="refresh" size={16} />
            Sinh lại toàn bộ (AI)
          </button>

          <button
            type="button"
            onClick={() => void generate("fallback")}
            disabled={streamState === "streaming"}
            className="inline-flex items-center gap-1 rounded-lg bg-surface-container px-3 py-2 font-label-md text-label-md text-on-surface-variant transition hover:bg-surface-container-high disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="offline_bolt" size={16} />
            Khôi phục Offline Fallback
          </button>

          <button
            type="button"
            onClick={() => void applyPlan()}
            disabled={applying || streamState === "streaming" || items.length === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="check" size={16} />
            {applying ? "Đang áp dụng…" : "Duyệt & Áp dụng kế hoạch"}
            <kbd className="ml-1 rounded bg-on-primary/20 px-1 font-label-sm text-label-sm">⌘↵</kbd>
          </button>
        </div>

        {/* Directive banner */}
        <div className="mt-space-md rounded-xl bg-surface-container-high/60 p-space-md backdrop-blur-md">
          <p className="text-body-sm text-body-sm text-on-surface-variant">
            <strong className="font-semibold text-on-surface">Nguyên tắc P1 &amp; định dạng 6 slot cố định:</strong>{" "}
            AI chỉ điền nội dung &amp; tối ưu thời lượng dựa trên cây kỹ năng và sinh trắc học, không
            thay đổi cấu trúc 4 trục thực thi.
          </p>
        </div>
      </section>

      {/* Trạng thái stream — aria-live (NFR-DL-06).
          `role="status"` bắt buộc — `aria-live` trên <div> trần bị axe
          báo `aria-prohibited-attr` (serious). */}
      <div role="status" aria-live="polite" className="sr-only">
        {streamState === "streaming" && "AI đang sinh kế hoạch"}
        {streamState === "done" && "Đã sinh xong kế hoạch"}
        {streamState === "error" && `Lỗi: ${error ?? ""}`}
      </div>

      {streamState === "streaming" && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-container p-space-md">
          <span className="material-symbols-outlined animate-spin text-secondary" data-icon="progress_activity" aria-hidden="true" />
          <span className="font-label-md text-label-md text-on-surface-variant">
            AI-01 đang sinh kế hoạch…
          </span>
        </div>
      )}

      {/* Lỗi */}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-space-sm rounded-xl bg-error-container/40 p-space-md"
        >
          <span className="text-body-sm text-body-sm text-error">{error}</span>
          <button
            type="button"
            onClick={() => void generate(aiAvailable ? "generate" : "fallback")}
            className="rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-on-surface"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 6 card slot */}
      <section aria-label="6 khối thời gian">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            6 khối thời gian tối ưu
          </h2>
          <span className="font-label-md text-label-md text-outline">
            {items.length} / 6 slot
          </span>
        </div>

        <div className="mt-space-md space-y-space-md">
          {items.map((item) => (
            <SlotCard
              key={item.slot}
              item={item}
              isLocked={locked.has(item.slot)}
              isEditing={editingSlot === item.slot}
              onToggleEdit={() =>
                setEditingSlot((current) => (current === item.slot ? null : item.slot))
              }
              onUpdate={(patch) => updateSlot(item.slot, patch)}
              onSwap={(otherSlot) => swapSlots(item.slot, otherSlot)}
              allSlots={items.map((i) => i.slot)}
            />
          ))}

          {/* Skeleton cho slot chưa tới */}
          {streamState === "streaming" &&
            Array.from({ length: Math.max(0, 6 - items.length) }, (_, i) => (
              <div
                key={`skeleton-${i}`}
                className="h-24 animate-pulse rounded-xl bg-surface-container-highest"
              />
            ))}
        </div>
      </section>

      {/* Chi phí phiên sinh — dữ liệu thật từ SSE (FR-DL-02f) */}
      {usage && (
        <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Chi phí phiên sinh
          </span>
          <dl className="mt-space-sm grid grid-cols-2 gap-space-md lg:grid-cols-4">
            <CostItem
              label="Input (cached)"
              value={`${usage.inputTokens} tkns`}
              sub={`${usage.cacheRead} đọc từ cache`}
            />
            <CostItem label="Output" value={`${usage.outputTokens} tkns`} />
            <CostItem label="Độ trễ" value={`${usage.latencyMs}ms`} />
            <CostItem label="Chi phí" value={`$${usage.estimatedCost.toFixed(6)}`} />
          </dl>
          <p className="mt-space-sm font-label-sm text-label-sm text-outline">
            Nguồn: {source === "fallback" ? "bộ sinh rule cục bộ (0 token)" : "AI-01 · claude-opus-5"}
          </p>
        </section>
      )}
    </div>
  );
}

/** Card 1 slot ở S02 — sửa inline tại chỗ, không rời card. */
function SlotCard({
  item,
  isLocked,
  isEditing,
  onToggleEdit,
  onUpdate,
  onSwap,
  allSlots,
}: {
  item: PlanSlotDTO;
  isLocked: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<PlanSlotDTO>) => void;
  onSwap: (otherSlot: number) => void;
  allSlots: number[];
}) {
  return (
    <article
      data-slot={item.slot}
      className={cn(
        "rounded-xl p-space-md shadow-md transition",
        isLocked ? "bg-surface-container-low opacity-80" : "bg-surface-container-low hover:bg-surface-container",
      )}
    >
      <div className="flex flex-wrap items-center gap-space-sm">
        <span className="rounded bg-surface-container-high px-2 py-0.5 font-code-md text-code-md text-outline">
          SLOT {String(item.slot + 1).padStart(2, "0")}
        </span>
        <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-outline">
          {DOMAIN_LABELS[item.domain]}
        </span>
        <span className="font-code-md text-code-md text-on-surface-variant tabular">
          {item.minutes} phút
        </span>

        {isLocked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-label-sm text-label-sm text-primary">
            <Icon name="verified" size={12} />
            Đã hoàn thành
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggleEdit}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1 font-label-sm text-label-sm text-on-surface-variant transition hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="edit" size={14} />
            {isEditing ? "Đóng" : "Sửa inline"}
          </button>
        )}
      </div>

      {isEditing && !isLocked ? (
        <div className="mt-space-md space-y-space-sm">
          <Field label="Tiêu đề">
            <input
              type="text"
              value={item.action}
              maxLength={160}
              onChange={(e) => onUpdate({ action: e.target.value })}
              className="w-full rounded-lg bg-surface-container-lowest p-space-sm text-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </Field>

          <Field label="Mô tả (≤120 ký tự)">
            <textarea
              value={item.detail ?? ""}
              maxLength={120}
              rows={2}
              onChange={(e) => onUpdate({ detail: e.target.value })}
              className="w-full rounded-lg bg-surface-container-lowest p-space-sm text-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </Field>

          <Field label="Thời lượng (phút)">
            <input
              type="number"
              value={item.minutes}
              min={5}
              max={90}
              onChange={(e) => onUpdate({ minutes: Number(e.target.value) })}
              className="w-28 rounded-lg bg-surface-container-lowest p-space-sm font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </Field>

          {/* Đổi chỗ — chỉ trong cùng domain */}
          <Field label="Đổi thứ tự ưu tiên với slot">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value !== "") onSwap(Number(e.target.value));
              }}
              className="rounded-lg bg-surface-container-lowest p-space-sm font-label-md text-label-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">— chọn slot —</option>
              {allSlots
                .filter((slot) => slot !== item.slot)
                .map((slot) => (
                  <option key={slot} value={slot}>
                    Slot {slot + 1}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      ) : (
        <>
          <h3 className="mt-space-sm font-headline-sm text-headline-sm text-on-surface">
            {item.action}
          </h3>
          {item.detail && (
            <p className="mt-space-xs text-body-sm text-body-sm text-on-surface-variant">
              {item.detail}
            </p>
          )}
          {item.skillName && (
            <p className="mt-space-xs font-label-sm text-label-sm text-outline">
              Gắn cây kỹ năng: {item.skillName}
            </p>
          )}
        </>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </span>
      <div className="mt-space-xs">{children}</div>
    </label>
  );
}

function CostItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </dt>
      <dd className="mt-space-xs font-code-md text-code-md text-on-surface tabular">{value}</dd>
      {sub && <dd className="font-label-sm text-label-sm text-outline">{sub}</dd>}
    </div>
  );
}

const DOMAIN_LABELS: Record<PlanSlotDTO["domain"], string> = {
  professional: "Chuyên môn",
  communication: "Giao tiếp",
  language: "Ngoại ngữ",
  personal: "Cá nhân",
};
