"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { PlanSlotDTO } from "@/lib/daily-loop";
import type { SlotKind } from "@/lib/config";

/**
 * Card 1 slot (S01) — nút hành động theo loại slot.
 *
 * P3: bấm "Hoàn thành" tạo `Activity` + `Evidence` — **KHÔNG** tăng `Skill.level`.
 * Idempotent: bấm 2 lần không tạo 2 Activity (server trả `alreadyDone`).
 */

/**
 * Nút hành động chính theo loại slot (task 19.3).
 *
 * Mỗi loại slot mở đúng màn hình nghiệp vụ tương ứng:
 *  - `srs`          → S10 (Phiên ôn 1 thẻ)
 *  - `speak_write`  → S08 (Luyện giao tiếp — Nói)
 *  - `language`     → S11 (Luyện ngoại ngữ chủ động)
 *  - `journal`      → S06 (Nhật ký & phản hồi AI)
 *  - `study`/`health` → chỉ có "Hoàn thành" (không có màn hình riêng)
 */
const PRIMARY_ACTION: Record<
  SlotKind,
  { label: string; href: string | null; icon: string; tone: "primary" | "tertiary" | "ghost" }
> = {
  study: { label: "Hoàn thành", href: null, icon: "check", tone: "primary" },
  speak_write: { label: "Luyện tập", href: "/practice/speak", icon: "record_voice_over", tone: "ghost" },
  srs: { label: "Bắt đầu ôn", href: "/srs/review", icon: "style", tone: "tertiary" },
  language: { label: "Luyện ngoại ngữ", href: "/practice/language", icon: "translate", tone: "ghost" },
  journal: { label: "Viết nhật ký", href: "/journal", icon: "edit_note", tone: "ghost" },
  health: { label: "Hoàn thành", href: null, icon: "check", tone: "primary" },
};

const TONE_CLASS: Record<"primary" | "tertiary" | "ghost", string> = {
  primary:
    "bg-primary-container text-on-primary hover:brightness-105 active:scale-[0.98]",
  tertiary:
    "bg-tertiary text-on-tertiary hover:brightness-105 active:scale-[0.98]",
  ghost:
    "bg-surface-container-highest text-on-surface hover:bg-surface-variant",
};

export interface DailySlotCardProps {
  item: PlanSlotDTO;
  /** Ngày đang xem (yyyy-MM-dd) — dùng cho request complete. */
  date: string;
  /** Ngày đang xem — khác hôm nay thì chỉ đọc. */
  isToday: boolean;
  /** Có sẵn kế hoạch chưa — quyết định hiện nút hành động hay CTA. */
  hasPlan: boolean;
}

export function DailySlotCard({ item, date, isToday, hasPlan }: DailySlotCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  async function markDone() {
    setError(null);
    try {
      const res = await fetch(`/api/plan/${date}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: item.slot }),
      });
      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không đánh dấu được");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Không kết nối được — thử lại");
    }
  }

  async function markNotDone() {
    setError(null);
    try {
      const res = await fetch(`/api/plan/${date}/complete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: item.slot }),
      });
      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không bỏ đánh dấu được");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Không kết nối được — thử lại");
    }
  }

  const done = item.done;
  const primary = PRIMARY_ACTION[item.kind];

  return (
    <article
      data-slot={item.slot}
      className={cn(
        "relative overflow-hidden rounded-xl p-space-md shadow-md",
        "border-l-2",
        done
          ? "bg-surface-container border-l-primary shadow-sm"
          : "bg-surface-container border-l-outline-variant",
      )}
    >
      <div className="flex items-start gap-space-sm">
        {/* Icon trạng thái */}
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            done ? "bg-primary/20 text-primary" : "bg-surface-container-highest text-outline",
          )}
        >
          <Icon name={done ? "check" : "radio_button_unchecked"} size={16} />
        </span>

        <div className="min-w-0 flex-1">
          {/* Header: chip domain + phút */}
          <div className="flex flex-wrap items-center gap-space-sm">
            <SlotLabel slot={item.slot} domain={item.domain} />
            <span className="font-code-md text-code-md text-on-surface-variant tabular">
              {item.minutes} phút
            </span>
            {item.source === "fallback" && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-tertiary/10 px-2 py-0.5 font-label-sm text-label-sm text-tertiary"
                title="Kế hoạch sinh bằng rule cục bộ (offline), không phải AI"
              >
                <Icon name="offline_bolt" size={12} />
                Offline
              </span>
            )}
          </div>

          {/* Tiêu đề */}
          <h3
            className={cn(
              "mt-space-sm font-headline-sm text-headline-sm",
              done ? "text-outline line-through decoration-outline/60" : "text-on-surface",
            )}
          >
            {item.action}
          </h3>

          {/* Mô tả */}
          {item.detail && (
            <p className="mt-space-xs text-body-sm text-body-sm text-on-surface-variant">
              {item.detail}
            </p>
          )}

          {/* Kỹ năng gắn — bỏ qua nếu skill đã bị xoá (skillId trỏ tới id không còn) */}
          {item.skillName && (
            <p className="mt-space-xs font-label-sm text-label-sm text-outline">
              Kỹ năng: {item.skillName}
            </p>
          )}

          {/* Hành động */}
          <div className="mt-space-sm flex flex-wrap items-center gap-space-sm">
            {done ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-lg bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
                  <Icon name="verified" size={14} className="text-primary" />
                  Bằng chứng +1
                </span>
                {/* 19.4 — nút phụ "Xem lại" cho slot đã xong. */}
                <button
                  type="button"
                  onClick={() => setShowDetail((v) => !v)}
                  aria-expanded={showDetail}
                  className="inline-flex items-center gap-1 rounded-lg bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface-variant transition hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon name="visibility" size={14} />
                  Xem lại
                </button>

                {/* R-DL-5 — đường bỏ đánh dấu: bấm "Xong" nhầm thì gỡ được. */}
                <button
                  type="button"
                  onClick={markNotDone}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant transition hover:bg-surface-container-highest disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon name="undo" size={14} />
                  Bỏ đánh dấu
                </button>
              </>
            ) : !hasPlan ? null : !isToday ? (
              <span className="font-label-sm text-label-sm text-tertiary">
                Chỉ đánh dấu được cho hôm nay
              </span>
            ) : (
              <>
                {/* 19.3 — nút chính theo `kind`. */}
                {primary.href ? (
                  <Link
                    href={primary.href}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      TONE_CLASS[primary.tone],
                    )}
                  >
                    <Icon name={primary.icon} size={16} />
                    {primary.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={markDone}
                    disabled={pending}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold transition",
                      "disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      TONE_CLASS[primary.tone],
                    )}
                  >
                    <Icon name={primary.icon} size={16} />
                    {pending ? "Đang lưu…" : primary.label}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Chi tiết mở rộng khi bấm "Xem lại" (19.4) */}
          {done && showDetail && (
            <div className="mt-space-sm rounded-lg bg-surface-container-low p-space-sm">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Chi tiết slot
              </p>
              <p className="mt-space-xs text-body-sm text-body-sm text-on-surface-variant">
                {item.detail ?? item.action} · {item.minutes} phút ·{" "}
                {item.skillName ? `kỹ năng ${item.skillName}` : "không gắn kỹ năng"}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-space-xs font-label-sm text-label-sm text-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/** Chip "Slot N · Domain" — dùng chung pattern với DomainChip. */
function SlotLabel({ slot, domain }: { slot: number; domain: PlanSlotDTO["domain"] }) {
  return (
    // Nền `container-high` (4.52:1 với `outline`) — `container-highest` chỉ 3.87:1
    // nên không đạt WCAG AA cho chữ nhỏ (design-system §9).
    <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-outline">
      Slot {slot + 1} · {domainLabel(domain)}
    </span>
  );
}

function domainLabel(domain: PlanSlotDTO["domain"]): string {
  switch (domain) {
    case "professional":
      return "Chuyên môn";
    case "communication":
      return "Giao tiếp";
    case "language":
      return "Ngoại ngữ";
    case "personal":
      return "Cá nhân";
  }
}
