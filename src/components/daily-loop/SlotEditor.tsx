"use client";

import { cn } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SLOT_TEMPLATE } from "@/lib/plan";
import { DOMAIN_LABELS, type Domain, type PlanSlot } from "@/lib/types";

/**
 * Editor cho 1 slot trong S02 — 6 slot **cố định** (SPEC.md §2.1).
 *
 * Nguyên tắc: cấu trúc slot KHÔNG đổi (domain cố định theo `SLOT_TEMPLATE`),
 * chỉ nội dung được sửa. Select domain cho phép hiển thị nhưng **không** cho
 * đổi giá trị — đúng yêu cầu "cấu trúc slot không đổi, chỉ nội dung thay đổi".
 *
 * Xem tasks.md 6.1 · design.md §4.2.
 */

/** Preset phút gợi ý theo domain — lấy min/max từ `SLOT_TEMPLATE`. */
function minutePresets(domain: Domain): number[] {
  const t = SLOT_TEMPLATE.find((s) => s.domain === domain);
  if (!t) return [15, 25, 30, 45];
  const mid = Math.round((t.minMinutes + t.maxMinutes) / 2);
  return [...new Set([t.minMinutes, mid, t.maxMinutes])].sort((a, b) => a - b);
}

/** Option skill cho Select — gom theo domain để dễ chọn. */
export type SkillOption = {
  id: string;
  name: string;
  domain: Domain;
};

export function SlotEditor({
  slot,
  skills,
  onChange,
  onRemove,
  disabled,
}: {
  slot: PlanSlot;
  /** Danh sách skill node để chọn — lấy từ DB. */
  skills: SkillOption[];
  /** Gọi khi nội dung slot thay đổi. */
  onChange: (next: PlanSlot) => void;
  /** Gọi khi bấm "Xoá". */
  onRemove: () => void;
  /** Khoá toàn bộ editor (trong lúc đang chạy AI / apply). */
  disabled?: boolean;
}) {
  const template = SLOT_TEMPLATE.find((t) => t.slot === slot.slot);
  // Domain cố định theo template — KHÔNG lấy từ slot để tránh lệch cấu trúc.
  const domain: Domain = template?.domain ?? slot.domain;
  const presets = minutePresets(domain);

  const domainSkills = skills.filter((s) => s.domain === domain);
  const otherSkills = skills.filter((s) => s.domain !== domain);

  const patch = (changes: Partial<PlanSlot>) => {
    onChange({
      ...slot,
      ...changes,
      // Domain & slot index là bất biến của cấu trúc 6 slot.
      slot: slot.slot,
      domain,
    });
  };

  return (
    <article
      data-slot-index={slot.slot}
      data-testid={`slot-editor-${slot.slot}`}
      className={cn(
        "rounded-xl border border-outline-variant/30 bg-surface-container-low p-gutter",
        "transition-colors hover:bg-surface-container",
        slot.done && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="rounded bg-surface-container-highest px-2 py-0.5 font-code-md text-label-sm font-bold text-primary">
            SLOT {String(slot.slot + 1).padStart(2, "0")}
          </span>
          <Chip tone={domain === "professional" ? "primary" : "neutral"}>
            {DOMAIN_LABELS[domain]}
          </Chip>
          <span className="font-code-md text-label-md text-on-surface">{slot.minutes} phút</span>
          {slot.done ? <Chip tone="primary">Đã xong</Chip> : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon="delete"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Xoá slot ${slot.slot + 1}`}
        >
          Xoá
        </Button>
      </div>

      <div className="mt-gutter space-y-space-md">
        <div className="grid gap-space-md md:grid-cols-2">
          {/* Select domain — hiển thị để đối chiếu cấu trúc, KHÔNG cho đổi. */}
          <Select
            label="Domain (cố định theo cấu trúc slot)"
            value={domain}
            disabled
            aria-readonly
            hint="Cấu trúc 6 slot cố định — AI chỉ điền nội dung, không đổi trục."
          >
            <option value={domain}>{DOMAIN_LABELS[domain]}</option>
          </Select>

          <Input
            label="Tiêu đề hành động"
            value={slot.action}
            maxLength={200}
            disabled={disabled}
            onChange={(e) => patch({ action: e.target.value })}
            placeholder="Ví dụ: Phân tích yêu cầu — viết 5 use case"
          />
        </div>

        <Textarea
          label="Mô tả (tối đa 240 ký tự)"
          value={slot.detail ?? ""}
          maxLength={240}
          rows={2}
          disabled={disabled}
          onChange={(e) => patch({ detail: e.target.value })}
          placeholder="Cách làm cụ thể cho hành động này"
        />

        <div className="grid gap-space-md md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Input
              label="Thời lượng (phút)"
              type="number"
              min={5}
              max={120}
              value={slot.minutes}
              disabled={disabled}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({ minutes: Number.isFinite(n) ? Math.max(1, Math.round(n)) : slot.minutes });
              }}
            />
            {/* Preset gợi ý theo domain — lấy từ SLOT_TEMPLATE. */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-label-sm uppercase tracking-widest text-outline">
                Gợi ý
              </span>
              {presets.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  onClick={() => patch({ minutes: m })}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-label-md transition-colors",
                    slot.minutes === m
                      ? "bg-primary-container/25 text-primary"
                      : "bg-surface-container-high text-on-surface-variant hover:text-on-surface",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  {m}′
                </button>
              ))}
            </div>
          </div>

          <Select
            label="Skill node liên quan"
            value={slot.skillId ?? ""}
            disabled={disabled}
            onChange={(e) => patch({ skillId: e.target.value || null })}
            hint="Có thể gắn skill của domain khác nếu cần."
          >
            <option value="">— Không gắn —</option>
            {domainSkills.length > 0 ? (
              <optgroup label={`${DOMAIN_LABELS[domain]} (domain của slot)`}>
                {domainSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {otherSkills.length > 0 ? (
              <optgroup label="Domain khác">
                {otherSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </div>
      </div>
    </article>
  );
}
