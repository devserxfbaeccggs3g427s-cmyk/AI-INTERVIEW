"use client";

/**
 * PlanProposal — đề xuất 6 slot tuần sau từ AI-07 (S13).
 *
 * Hiển thị danh sách slot có thể chỉnh sửa inline (action / detail / minutes),
 * kèm nút "Duyệt & Áp dụng" → ghi `PlanItem` với `source='ai'` cho thứ Hai
 * tuần sau, toast số lượng đã ghi.
 *
 * Xem tasks.md 15.5 · design.md §4.13 · FR-DL-06.
 */

import { useCallback, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { SLOT_TEMPLATE } from "@/lib/plan";
import { DOMAIN_LABELS, type Domain, type PlanSlot } from "@/lib/types";
import { addDays, startOfWeek, dateKey } from "@/lib/dates";

export type { PlanSlot };

/** Nhãn thứ Hai tuần sau — tính từ hôm nay (giờ local). */
function nextMondayKey(now: Date = new Date()): string {
  const weekStart = startOfWeek(now);
  const monday = addDays(weekStart, 7); // thứ Hai tuần sau
  return dateKey(monday);
}

export type PlanProposalProps = {
  /** 6 slot (hoặc 3 khi giảm tải) từ AI. */
  initialSlots: PlanSlot[];
  /** Mô tả giảm tải — hiển thị nếu có. */
  reliefNote?: string | null;
  /** Số thẻ skill để chọn — lấy từ DB. */
  skills: Array<{ id: string; name: string; domain: Domain }>;
};

export function PlanProposal({ initialSlots, reliefNote, skills }: PlanProposalProps) {
  const { toast } = useToast();
  const [slots, setSlots] = useState<PlanSlot[]>(initialSlots);
  const [applying, setApplying] = useState(false);

  const slotCount = slots.length;
  const targetDate = nextMondayKey();

  const patchSlot = useCallback(
    (index: number, changes: Partial<PlanSlot>) => {
      setSlots((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...changes } : s)),
      );
    },
    [],
  );

  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: slots.map((s) => ({
            ...s,
            done: false, // slot tuần sau chưa hoàn thành
          })),
          source: "ai",
          date: targetDate,
        }),
      });

      const data = await res.json() as
        | { ok: true; data: { written: number; keptDone: number; removed: number } }
        | { ok: false; error: { code: string; message: string } };

      if (!data.ok) {
        toast({
          tone: "error",
          title: "Áp dụng thất bại",
          description: data.error.message,
        });
        return;
      }

      toast({
        tone: "success",
        title: `Đã ghi ${data.data.written} slot vào kế hoạch tuần sau`,
        description: `Áp dụng cho thứ Hai ${targetDate}.`,
      });
    } catch {
      toast({
        tone: "error",
        title: "Không kết nối được máy chủ",
        description: "Thử lại sau.",
      });
    } finally {
      setApplying(false);
    }
  }, [slots, targetDate, toast]);

  const totalMinutes = slots.reduce((acc, s) => acc + s.minutes, 0);

  return (
    <Card tone="base">
      <CardHeader
        title="Khung lập kế hoạch tuần sau"
        subtitle={
          <div className="flex flex-wrap items-center gap-space-sm">
            <Chip tone="neutral" icon="schedule">
              {slotCount} slot
            </Chip>
            <span className="font-label-sm text-on-surface-variant">
              {totalMinutes} phút cam kết
            </span>
            {reliefNote ? <Chip tone="tertiary" icon="info">{reliefNote}</Chip> : null}
          </div>
        }
        icon="calendar_today"
        action={
          <span className="font-label-sm text-on-surface-variant">
            {targetDate} (CN → T2)
          </span>
        }
      />

      <div className="space-y-gutter-md">
        {slots.map((slot, index) => {
          const template = SLOT_TEMPLATE[slot.slot];
          if (!template) return null;

          return (
            <SlotRow
              key={slot.slot}
              slot={slot}
              template={template}
              skills={skills}
              onPatch={(changes) => patchSlot(index, changes)}
              disabled={applying}
            />
          );
        })}

        <div className="flex gap-gutter">
          <Button
            variant="primary"
            icon="verified"
            onClick={handleApply}
            loading={applying}
            disabled={applying}
            data-testid="apply-weekly-plan"
          >
            Duyệt & Áp dụng Kế hoạch Tuần {targetDate.slice(0, 10)}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Dòng slot — dùng SlotEditor pattern: Chip domain + Input action + Textarea detail + Input minutes.
 */
function SlotRow({
  slot,
  template,
  skills,
  onPatch,
  disabled,
}: {
  slot: PlanSlot;
  template: { domain: Domain; content: string; minMinutes: number; maxMinutes: number };
  skills: Array<{ id: string; name: string; domain: Domain }>;
  onPatch: (changes: Partial<PlanSlot>) => void;
  disabled: boolean;
}) {
  const domain = slot.domain;
  const domainLabel = DOMAIN_LABELS[domain];
  const icon = slot.done ? "check_circle" : "schedule";
  const iconText = slot.done ? "Đã xong" : "Chưa xong";

  const domainSkills = skills.filter((s) => s.domain === domain);

  const presetOptions = [
    template.minMinutes,
    Math.round((template.minMinutes + template.maxMinutes) / 2),
    template.maxMinutes,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-gutter space-y-space-md">
      {/* Header slot: SLOT xx | Domain chip | minutes | done marker */}
      <div className="flex flex-wrap items-center gap-space-sm">
        <span
          className="rounded bg-surface-container-highest px-2 py-0.5 font-code-md text-label-sm font-bold text-primary"
          style={{ display: "inline-block" }}
        >
          SLOT {String(slot.slot + 1).padStart(2, "0")}
        </span>
        <Chip tone={domain === "professional" ? "primary" : "neutral"}>
          {domainLabel}
        </Chip>
        <span className="font-code-md text-label-md text-on-surface">{slot.minutes} phút</span>
        <Chip tone={slot.done ? "primary" : "outline"} icon={icon}>
          {iconText}
        </Chip>
      </div>

      {/* Grid: action + domain (readonly) */}
      <div className="grid gap-space-md md:grid-cols-2">
        <Input
          label="Tiêu đề hành động"
          value={slot.action}
          maxLength={200}
          disabled={disabled}
          onChange={(e) => onPatch({ action: e.target.value })}
          placeholder="Ví dụ: Phân tích yêu cầu — viết 5 use case"
        />
        <Input
          label="Domain (cố định theo cấu trúc)"
          value={domainLabel}
          disabled
          aria-readonly
        />
      </div>

      {/* Detail */}
      <Textarea
        label="Mô tả (tối đa 240 ký tự)"
        value={slot.detail ?? ""}
        maxLength={240}
        rows={2}
        disabled={disabled}
        onChange={(e) => onPatch({ detail: e.target.value || null })}
        placeholder="Cách làm cụ thể cho hành động này"
      />

      {/* Minutes + skill selection */}
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
              onPatch({ minutes: Number.isFinite(n) ? Math.max(1, Math.round(n)) : slot.minutes });
            }}
          />
          <div className="flex flex-wrap items-center gap-1">
            <Label>Gợi ý</Label>
            {presetOptions.map((m) => (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => onPatch({ minutes: m })}
                className={`
                  rounded px-1.5 py-0.5 font-label-md transition-colors
                  ${
                    slot.minutes === m
                      ? "bg-primary-container/25 text-primary"
                      : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                  }
                  disabled:pointer-events-none disabled:opacity-50
                `}
              >
                {m}′
              </button>
            ))}
          </div>
        </div>

        <SelectSkill
          label="Skill node"
          value={slot.skillId ?? ""}
          skills={domainSkills}
          allSkills={skills}
          disabled={disabled}
          onChange={(v) => onPatch({ skillId: v || null })}
        />
      </div>
    </div>
  );
}

/** Select đơn giản cho skill — dùng children option theo đúng API Select. */
function SelectSkill({
  label,
  value,
  skills,
  allSkills,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  skills: Array<{ id: string; name: string; domain: Domain }>;
  allSkills: Array<{ id: string; name: string; domain: Domain }>;
  disabled: boolean;
  onChange: (val: string) => void;
}) {
  const domainSkills = skills;
  const otherSkills = allSkills.filter((s) => !skills.includes(s));

  return (
    <div className="flex flex-col gap-1">
      <label className="font-label-md text-on-surface-variant">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`
          h-10 w-full rounded-lg bg-surface-container-lowest px-3 text-body-md text-on-surface
          border border-outline-variant/40 transition-colors focus:border-primary focus:outline-none
          disabled:cursor-not-allowed disabled:opacity-50
        `}
      >
        <option value="">— Không gắn —</option>
        {domainSkills.length > 0 ? (
          <optgroup label="Cùng domain">
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
      </select>
    </div>
  );
}
