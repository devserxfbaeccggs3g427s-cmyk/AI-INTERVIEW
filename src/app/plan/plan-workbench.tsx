"use client";

import { SlotEditor, type SkillOption } from "@/components/daily-loop/SlotEditor";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge, Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toaster";
import { SLOT_TEMPLATE } from "@/lib/plan";
import { DOMAIN_LABELS, type AiCallMeta, type PlanSlot } from "@/lib/types";
import { useCallback, useMemo, useState } from "react";

/**
 * Workbench S02 — 6 slot editable + panel AI + diff view + nút Áp dụng.
 *
 * Vì sao là Client Component: toàn bộ state (nội dung slot, kết quả AI, diff,
 * trạng thái nút) nằm trong React. **Không** dùng `button:has(...)` / truy vấn
 * DOM như mockup — mockup dùng selector CSS không hợp lệ làm nút "Áp dụng"
 * không bao giờ được tìm thấy (design.md §4.2 "Bug mockup").
 *
 * Xem tasks.md 6.1 / 6.3 / 6.4 · design.md §4.2 · FR-DL-06.
 */

/** Kết quả trả về từ `POST /api/plan/generate`. */
type GenerateResult = {
  ok: true;
  data: {
    slots: PlanSlot[];
    meta: AiCallMeta;
    applied?: { written: number; keptDone: number; removed: number };
  };
};

type GenerateError = { ok: false; error: { code: string; message: string } };

/** Nhãn provider hiển thị đúng như design.md §4.2 yêu cầu. */
function providerLabel(meta: AiCallMeta): string {
  if (meta.provider === "anthropic") return `Anthropic · ${meta.model}`;
  // Provider local: ưu tiên model thật (qwen2.5:7b), fallback là rule cục bộ.
  return `Local · ${meta.model}`;
}

/** Slot đã bị xoá → action rỗng. */
function isEmptySlot(slot: PlanSlot): boolean {
  return slot.action.trim().length === 0;
}

/** So sánh 2 slot để dựng diff (thêm / sửa / xoá / giữ). */
type DiffKind = "added" | "changed" | "removed" | "same" | "kept-done";

function diffSlots(oldSlots: PlanSlot[], newSlots: PlanSlot[]): DiffKind[] {
  const oldBySlot = new Map(oldSlots.map((s) => [s.slot, s]));
  return newSlots.map((s) => {
    const prev = oldBySlot.get(s.slot);
    if (!prev) return "added";
    if (isEmptySlot(s)) return "removed";
    if (prev.done) return "kept-done";
    if (
      prev.action !== s.action ||
      prev.detail !== s.detail ||
      prev.minutes !== s.minutes ||
      prev.skillId !== s.skillId
    ) {
      return "changed";
    }
    return "same";
  });
}

const DIFF_LABEL: Record<DiffKind, { text: string; tone: "primary" | "tertiary" | "secondary" | "outline" | "error" }> = {
  added: { text: "Mới", tone: "primary" },
  changed: { text: "Sửa", tone: "tertiary" },
  removed: { text: "Xoá", tone: "error" },
  same: { text: "Giữ nguyên", tone: "outline" },
  "kept-done": { text: "Đã xong — giữ", tone: "secondary" },
};

export function PlanWorkbench({
  initialSlots,
  skills,
  lastAiCall,
}: {
  /** 6 slot hiện có trong DB (có thể rỗng nếu chưa lập kế hoạch). */
  initialSlots: PlanSlot[];
  /** Danh sách skill node để chọn. */
  skills: SkillOption[];
  /** Lượt gọi AI gần nhất — đọc từ `AiCall` (task 6.3). */
  lastAiCall: AiCallMeta | null;
}) {
  const { toast } = useToast();

  const [slots, setSlots] = useState<PlanSlot[]>(initialSlots);
  const [meta, setMeta] = useState<AiCallMeta | null>(lastAiCall);
  const [aiSlots, setAiSlots] = useState<PlanSlot[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const totalMinutes = useMemo(
    () => slots.filter((s) => !isEmptySlot(s)).reduce((acc, s) => acc + s.minutes, 0),
    [slots],
  );

  const patchSlot = useCallback((next: PlanSlot) => {
    setSlots((prev) => prev.map((s) => (s.slot === next.slot ? next : s)));
    setDirty(true);
  }, []);

  const removeSlot = useCallback((slotIndex: number) => {
    // Slot đã `done` không được xoá — giữ công sức đã hoàn thành (FR-DL-06).
    setSlots((prev) =>
      prev.map((s) =>
        s.slot === slotIndex && !s.done ? { ...s, action: "", detail: null, skillId: null } : s,
      ),
    );
    setDirty(true);
  }, []);

  /** Sinh lại 6 slot bằng AI (chưa ghi DB). */
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      const data = (await res.json()) as GenerateResult | GenerateError;
      if (!data.ok) {
        toast({ tone: "error", title: "Sinh kế hoạch thất bại", description: data.error.message });
        return;
      }
      setAiSlots(data.data.slots);
      setMeta(data.data.meta);
      toast({
        tone: "success",
        title: "Đã sinh 6 slot mới",
        description: "Kiểm tra phần khác biệt rồi bấm Áp dụng.",
      });
    } catch {
      toast({ tone: "error", title: "Không kết nối được máy chủ", description: "Thử lại sau." });
    } finally {
      setGenerating(false);
    }
  }, [toast]);

  /** Áp dụng bộ slot AI → ghi đè `PlanItem` hôm nay (giữ slot `done`). */
  const handleApply = useCallback(async () => {
    if (!aiSlots) return;
    setApplying(true);
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = (await res.json()) as GenerateResult | GenerateError;
      if (!data.ok) {
        toast({ tone: "error", title: "Áp dụng thất bại", description: data.error.message });
        return;
      }
      const applied = data.data.applied ?? { written: data.data.slots.length, keptDone: 0, removed: 0 };
      setSlots(data.data.slots);
      setAiSlots(null);
      setMeta(data.data.meta);
      setDirty(false);
      toast({
        tone: "success",
        title: `Đã ghi ${applied.written} slot vào kế hoạch hôm nay`,
        description:
          applied.keptDone > 0
            ? `${applied.keptDone} slot đã hoàn thành được giữ nguyên.`
            : "Kế hoạch đã cập nhật trên S01.",
      });
    } catch {
      toast({ tone: "error", title: "Không áp dụng được", description: "Thử lại sau." });
    } finally {
      setApplying(false);
    }
  }, [aiSlots, toast]);

  /** Lưu chỉnh sửa thủ công của 6 slot. */
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: slots.map((s) => ({
            slot: s.slot,
            domain: s.domain,
            action: s.action,
            detail: s.detail,
            minutes: s.minutes,
            skillId: s.skillId,
            done: s.done,
            source: "manual",
          })),
          source: "manual",
        }),
      });
      const data = (await res.json()) as
        | { ok: true; data: { written: number; keptDone: number; removed: number } }
        | GenerateError;
      if (!data.ok) {
        toast({ tone: "error", title: "Lưu thất bại", description: data.error.message });
        return;
      }
      setDirty(false);
      toast({
        tone: "success",
        title: `Đã lưu ${data.data.written} slot`,
        description:
          data.data.removed > 0 ? `${data.data.removed} slot đã được xoá.` : undefined,
      });
    } catch {
      toast({ tone: "error", title: "Không lưu được", description: "Thử lại sau." });
    } finally {
      setSaving(false);
    }
  }, [slots, toast]);

  const diff = useMemo(
    () => (aiSlots ? diffSlots(slots, aiSlots) : null),
    [aiSlots, slots],
  );

  const isFallback = meta !== null && meta.provider === "local";

  return (
    <div className="grid grid-cols-1 gap-gutter-lg xl:grid-cols-12">
      {/* ── Trái: 8 cột — danh sách 6 slot ───────────────────────────────── */}
      <section className="xl:col-span-8" aria-label="Danh sách 6 slot kế hoạch">
        <div className="mb-gutter flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex flex-wrap items-center gap-space-md">
            <Label>6 Khối thời gian — cấu trúc cố định</Label>
            <Chip tone="neutral" icon="schedule">
              {totalMinutes} phút cam kết
            </Chip>
            {dirty ? <Chip tone="tertiary">Có thay đổi chưa lưu</Chip> : null}
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <Button
              variant="secondary"
              size="sm"
              icon="save"
              onClick={handleSave}
              loading={saving}
              disabled={!dirty}
              data-testid="save-plan"
            >
              Lưu chỉnh sửa
            </Button>
          </div>
        </div>

        <div className="space-y-gutter-md" aria-live="polite">
          {slots.map((slot) => (
            <SlotEditor
              key={slot.slot}
              slot={slot}
              skills={skills}
              onChange={patchSlot}
              onRemove={() => removeSlot(slot.slot)}
              disabled={generating || applying}
            />
          ))}
        </div>
      </section>

      {/* ── Phải: 4 cột — panel AI ───────────────────────────────────────── */}
      <aside className="xl:col-span-4" aria-label="Thông tin AI và áp dụng kế hoạch">
        <div className="space-y-gutter-md">
          <Card tone="base">
            <CardHeader
              title="AI Đề xuất"
              subtitle="AI chỉ điền nội dung — không đổi cấu trúc 6 slot."
              icon="psychology"
            />

            <div className="space-y-space-md">
              <Button
                variant="ai"
                icon="autorenew"
                onClick={handleGenerate}
                loading={generating}
                disabled={applying}
                className="w-full"
                data-testid="generate-plan"
              >
                Sinh lại toàn bộ (AI)
              </Button>

              {/* Panel thông tin lượt gọi AI gần nhất (task 6.3). */}
              <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-gutter">
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <Label>Lượt gọi gần nhất</Label>
                  {isFallback ? (
                    <Chip tone="tertiary" icon="cloud_off">
                      Offline — dùng rule cục bộ
                    </Chip>
                  ) : meta ? (
                    <Chip tone="secondary" icon="cloud">
                      Online
                    </Chip>
                  ) : null}
                </div>

                {meta ? (
                  <dl className="mt-space-md space-y-space-xs font-code-md text-label-md text-on-surface-variant">
                    <div className="flex items-center justify-between gap-space-sm">
                      <dt>Provider · Model</dt>
                      <dd className="text-right text-on-surface">{providerLabel(meta)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-space-sm">
                      <dt>Effort</dt>
                      <dd className="text-on-surface">{meta.effort ?? "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-space-sm">
                      <dt>Token vào / ra</dt>
                      <dd className="text-on-surface">
                        {meta.inputTokens} / {meta.outputTokens}
                      </dd>
                    </div>
                    {meta.cacheRead > 0 || meta.cacheWrite > 0 ? (
                      <div className="flex items-center justify-between gap-space-sm">
                        <dt>Cache đọc / ghi</dt>
                        <dd className="text-on-surface">
                          {meta.cacheRead} / {meta.cacheWrite}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-space-sm">
                      <dt>Thời gian sinh</dt>
                      <dd className="text-on-surface">{meta.latencyMs} ms</dd>
                    </div>
                    {meta.fallbackFrom ? (
                      <div className="flex items-center justify-between gap-space-sm">
                        <dt>Fallback từ</dt>
                        <dd className="text-on-surface">{meta.fallbackFrom}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="mt-space-md text-body-sm text-on-surface-variant">
                    Chưa có lượt gọi nào. Bấm &quot;Sinh lại toàn bộ (AI)&quot; để bắt đầu.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Diff view + nút Áp dụng (task 6.2 / 6.4). */}
          {aiSlots && diff ? (
            <Card tone="base">
              <CardHeader
                title="Khác biệt so với kế hoạch hiện tại"
                subtitle="Xem trước khi ghi đè."
                icon="difference"
              />
              <ul className="space-y-space-sm" aria-live="polite" data-testid="plan-diff">
                {aiSlots.map((slot, index) => {
                  const kind = diff[index] ?? "same";
                  const info = DIFF_LABEL[kind];
                  const prev = slots.find((s) => s.slot === slot.slot);
                  // Khi "kept-done" hiển thị nội dung slot CŨ (đã xong), không phải slot mới.
                  const displayAction =
                    kind === "kept-done" && prev
                      ? prev.action
                      : isEmptySlot(slot)
                        ? "(trống)"
                        : slot.action;
                  return (
                    <li
                      key={slot.slot}
                      className="flex items-start justify-between gap-space-sm text-body-sm"
                    >
                      <span className="font-code-md text-on-surface-variant">
                        SLOT {String(slot.slot + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-on-surface">
                        {displayAction}
                      </span>
                      <Badge tone={info.tone}>{info.text}</Badge>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-gutter flex flex-col gap-space-sm">
                <Button
                  variant="primary"
                  icon="verified"
                  onClick={handleApply}
                  loading={applying}
                  disabled={generating}
                  className="w-full"
                  data-testid="apply-plan"
                >
                  Áp dụng
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setAiSlots(null)}
                  disabled={applying}
                  className="w-full"
                >
                  Bỏ qua
                </Button>
              </div>
            </Card>
          ) : null}

          {/* Nguyên tắc cấu trúc 6 slot — nhắc lại ràng buộc cho người dùng. */}
          <Card tone="low">
            <Label>Nguyên tắc P1 — cấu trúc 6 slot cố định</Label>
            <ul className="mt-space-md space-y-space-xs text-body-sm text-on-surface-variant">
              {SLOT_TEMPLATE.map((t) => (
                <li key={t.slot} className="flex items-baseline gap-space-sm">
                  <span className="font-code-md text-label-sm text-primary">
                    {String(t.slot + 1).padStart(2, "0")}
                  </span>
                  <span>
                    {DOMAIN_LABELS[t.domain]} · {t.content} ({t.minMinutes}&ndash;{t.maxMinutes}&prime;)
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </aside>
    </div>
  );
}
