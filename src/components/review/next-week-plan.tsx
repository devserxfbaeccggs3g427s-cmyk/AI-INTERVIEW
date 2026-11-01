"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { NextWeekPlan, NextWeekPlanSlot } from "@/lib/weekly-review";

export interface NextWeekPlanProps {
  plan: NextWeekPlan;
  editable: boolean;
  onChange: (plan: NextWeekPlan) => void;
  onApprove: () => Promise<void>;
  /** Tuần đích — hiển thị trong tiêu đề. */
  weekLabel: string;
  warning: string | null;
  applying: boolean;
}

/**
 * 6 slot dạng card — sửa inline (FR-WR-06) + nút duyệt.
 *
 * ⚠️ Kéo đổi slot không được làm mất index 0..5 — luôn giữ đủ 6 slot.
 */
export function NextWeekPlanView({
  plan,
  editable,
  onChange,
  onApprove,
  weekLabel,
  warning,
  applying,
}: NextWeekPlanProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const updateSlot = (index: number, patch: Partial<NextWeekPlanSlot>) => {
    const slots = plan.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot));
    onChange({ ...plan, slots });
  };

  const moveSlot = (from: number, to: number) => {
    if (from === to) return;
    const slots = [...plan.slots];
    const [moved] = slots.splice(from, 1);
    if (!moved) return;
    slots.splice(to, 0, moved);
    // Giữ index 0..5 theo thứ tự mới.
    onChange({ ...plan, slots: slots.map((slot, index) => ({ ...slot, slot: index })) });
  };

  return (
    <div className="bg-surface-container p-space-lg rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-space-md">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          Kế hoạch đề xuất {weekLabel}
        </h2>
        <span className="rounded bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
          {plan.slots.length}/6 slot
        </span>
      </div>

      {plan.reducedLoad && (
        <p className="mt-space-md bg-tertiary/10 text-tertiary rounded-lg p-space-md font-body-sm text-body-sm">
          <Icon name="trending_down" size={16} className="mr-1" />
          Tự giảm tải
          {plan.reduceReason ? `: ${plan.reduceReason}` : "."}
        </p>
      )}

      {warning && (
        <p
          role="status"
          className="mt-space-md bg-error/10 text-error rounded-lg p-space-md font-body-sm text-body-sm"
        >
          {warning}
        </p>
      )}

      {plan.slots.length === 0 ? (
        <p className="mt-space-md font-body-md text-body-md text-on-surface-variant">
          Chưa có kế hoạch đề xuất — bấm “Tự động tổng hợp” để AI sinh.
        </p>
      ) : (
        <ul className="mt-space-md space-y-space-sm">
          {plan.slots.map((slot, index) => (
            <li
              key={index}
              draggable={editable}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) moveSlot(dragIndex, index);
                setDragIndex(null);
              }}
              className="bg-surface-container-high rounded-lg p-space-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <div className="flex items-center gap-space-sm">
                  <span className="rounded bg-surface-container-highest px-2 py-0.5 font-code-md text-code-md text-on-surface">
                    Slot {slot.slot}
                  </span>
                  <span className="font-label-sm text-label-sm text-outline">
                    {slot.domain}
                  </span>
                  {slot.startTime && slot.endTime && (
                    <span className="font-code-md text-code-md text-outline tabular">
                      {slot.startTime}–{slot.endTime}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-space-sm">
                  <span className="font-code-md text-code-md tabular text-on-surface-variant">
                    {slot.minutes} phút
                  </span>
                  {editable && (
                    <>
                      <button
                        type="button"
                        onClick={() => moveSlot(index, Math.max(0, index - 1))}
                        disabled={index === 0}
                        aria-label={`Kéo slot ${slot.slot} lên`}
                        className="rounded p-1 text-outline transition hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                      >
                        <Icon name="arrow_upward" size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlot(index, Math.min(plan.slots.length - 1, index + 1))}
                        disabled={index === plan.slots.length - 1}
                        aria-label={`Kéo slot ${slot.slot} xuống`}
                        className="rounded p-1 text-outline transition hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
                      >
                        <Icon name="arrow_downward" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editable ? (
                <div className="mt-space-sm space-y-space-xs">
                  <input
                    value={slot.action}
                    onChange={(event) => updateSlot(index, { action: event.target.value })}
                    aria-label={`Hành động slot ${slot.slot}`}
                    className="w-full rounded bg-surface-container-lowest px-space-sm py-1 font-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <input
                    value={slot.detail}
                    onChange={(event) => updateSlot(index, { detail: event.target.value })}
                    aria-label={`Chi tiết slot ${slot.slot}`}
                    className="w-full rounded bg-surface-container-lowest px-space-sm py-1 font-body-sm text-body-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <div className="flex flex-wrap gap-space-sm">
                    <label className="font-label-sm text-label-sm text-outline">
                      Phút
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={slot.minutes}
                        onChange={(event) =>
                          updateSlot(index, { minutes: Number(event.target.value) || 5 })
                        }
                        aria-label={`Số phút slot ${slot.slot}`}
                        className="ml-1 w-16 rounded bg-surface-container-lowest px-space-sm py-1 font-code-md text-code-md tabular text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    </label>
                    <label className="font-label-sm text-label-sm text-outline">
                      Bắt đầu
                      <input
                        type="time"
                        value={slot.startTime ?? ""}
                        onChange={(event) => updateSlot(index, { startTime: event.target.value })}
                        aria-label={`Giờ bắt đầu slot ${slot.slot}`}
                        className="ml-1 rounded bg-surface-container-lowest px-space-sm py-1 font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    </label>
                    <label className="font-label-sm text-label-sm text-outline">
                      Kết thúc
                      <input
                        type="time"
                        value={slot.endTime ?? ""}
                        onChange={(event) => updateSlot(index, { endTime: event.target.value })}
                        aria-label={`Giờ kết thúc slot ${slot.slot}`}
                        className="ml-1 rounded bg-surface-container-lowest px-space-sm py-1 font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    </label>
                  </div>
                  {slot.focusHint && (
                    <p className="font-body-sm text-body-sm text-tertiary">
                      {slot.focusHint}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-space-sm">
                  <p className="font-body-md text-body-md text-on-surface">
                    {slot.action}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {slot.detail}
                  </p>
                  {slot.skillName && (
                    <p className="font-label-sm text-label-sm text-outline">
                      Kỹ năng: {slot.skillName}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void onApprove()}
        disabled={applying || plan.slots.length !== 6}
        className={cn(
          "mt-space-md rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          (applying || plan.slots.length !== 6) && "opacity-60",
        )}
      >
        <Icon name="done_all" size={16} className="mr-1" />
        {applying ? "Đang ghi…" : "Duyệt & áp dụng"}
      </button>
    </div>
  );
}
