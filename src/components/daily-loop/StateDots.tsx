"use client";

/**
 * S12 — Chấm trạng thái 7 ngày + form ghi nhận + toggle khoảng biểu đồ.
 *
 * ⚠️ Vì sao form nằm chung file với `StateDots`?
 *   Task 8.3 yêu cầu "bấm chấm để sửa" — nghĩa là chấm và form PHẢI chia sẻ
 *   client state (bấm chấm → đổi giá trị trong form). Tách ra 2 file sẽ bắt buộc
 *   phải dựng thêm một Context chỉ để truyền state. Phân công file cho nhóm này
 *   chỉ cho phép ghi `src/components/daily-loop/StateDots.tsx` và
 *   `DataSentCard.tsx`, nên gộp 2 phần vào 1 file là phương án ít xâm lấn nhất.
 *
 * Xem tasks.md 8.1 / 8.3 / 8.5 · requirements.md FR-PS-01, US-10 (AC 10.1, 10.4, 10.7).
 */

import { CorrelationChart, type ChartDay } from "@/components/charts/CorrelationChart";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Label } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { RatingScale } from "@/components/ui/Slider";
import type { SaveState } from "@/lib/settings-types";
import { useActionState, useState } from "react";

export type { SaveState };

/** Một ngày trong ma trận 7 ngày — nguồn: bảng `DailyState` đọc ở server. */
export type StateDay = {
  /** Key `YYYY-MM-DD` (giờ local). */
  key: string;
  /** Nhãn thứ ngắn: "T2" · "CN" … */
  weekday: string;
  /** Nhãn ngày: "23/10". */
  dayLabel: string;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  sleep: number | null;
  note: string | null;
  /** Đã có bản ghi hay chưa — quyết định màu chấm. */
  filled: boolean;
  /** Là ngày đang chọn trong form hay không. */
  isToday: boolean;
};

/** Nhãn ngữ nghĩa 5 mức — requirements.md §2.10 AC 10.1. */
const MOOD_LABELS = ["Tệ", "Hơi mệt", "Bình thường", "Tốt", "Rất tốt"] as const;
const ENERGY_LABELS = ["Kiệt sức", "Hơi lười", "Ổn", "Tỉnh táo", "Tràn năng lượng"] as const;
const FOCUS_LABELS = ["Phân tán", "Gián đoạn", "Kiểm soát", "Rất sâu", "Flow State"] as const;

/** Trạng thái trả về từ server action `saveDailyState` — định nghĩa ở `src/lib/settings-types.ts`. */

/**
 * Màu chấm theo mood/energy trung bình.
 *
 * - Không có dữ liệu → nền trung tính (`surface-container-highest`).
 * - Trung bình >= 4 → `primary` (tốt).
 * - Trung bình = 3 → `tertiary` (trung bình).
 * - Trung bình < 3 → `error` (cần chú ý).
 */
function dotTone(day: StateDay): string {
  if (!day.filled) return "bg-surface-container-highest";
  const values = [day.mood, day.energy].filter((v): v is number => v !== null);
  if (values.length === 0) return "bg-surface-container-highest";
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (avg >= 4) return "bg-primary";
  if (avg >= 3) return "bg-tertiary";
  return "bg-error";
}

/**
 * Ma trận chấm 7 ngày gần nhất (task 8.3).
 *
 * Bấm vào 1 chấm → `onSelect` đưa giá trị của ngày đó vào form để sửa
 * (AC 10.7 — "bấm để sửa nhanh một ngày bất kỳ").
 */
export function StateDots({
  days,
  selectedKey,
  onSelect,
}: {
  days: StateDay[];
  selectedKey: string;
  onSelect: (day: StateDay) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const isSelected = day.key === selectedKey;
        return (
          <button
            key={day.key}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={isSelected}
            title={`${day.weekday} ${day.dayLabel}${
              day.filled ? ` · Mood ${day.mood ?? "-"}/5, Energy ${day.energy ?? "-"}/5` : " · chưa ghi"
            }`}
            className={`flex flex-col items-center gap-1 rounded p-2 transition-transform hover:scale-105 ${
              isSelected
                ? "bg-primary/20 ring-1 ring-primary"
                : "bg-surface-container-high/60 hover:bg-surface-container-high"
            }`}
          >
            <span className={`font-label-sm ${isSelected ? "text-primary" : "text-outline"}`}>
              {day.isToday ? "Nay" : day.weekday}
            </span>
            <span className={`h-3 w-3 rounded-[9999px] ${dotTone(day)}`} aria-hidden />
            <span
              className={`font-code-md text-[10px] ${
                isSelected ? "font-semibold text-primary" : "text-on-surface-variant"
              }`}
            >
              {day.filled ? `${day.mood ?? "-"}/5` : "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bảng nhãn 5 mức — hiển thị đầy đủ ngữ nghĩa của slider (AC 10.1).
 *
 * `RatingScale` chỉ có 2 nhãn (low/high) nên ta vẽ thêm hàng nhãn 5 mức và
 * tô đậm mức đang chọn.
 */
function ScaleLabels({ labels, value }: { labels: readonly string[]; value: number }) {
  return (
    <div className="flex justify-between gap-1 pt-0.5">
      {labels.map((label, index) => (
        <span
          key={label}
          className={`text-[10px] leading-tight ${
            index + 1 === value ? "font-semibold text-primary" : "text-outline"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Panel ghi nhận trạng thái (task 8.1) + toggle 7/30 ngày (task 8.5).
 *
 * - Server action `saveAction` do `src/app/state/page.tsx` truyền vào → upsert
 *   `DailyState` theo `date` (unique) rồi `revalidatePath("/state")` (task 8.2).
 * - `range` điều khiển cửa sổ thời gian của `CorrelationChart`.
 */
export function StateLogger({
  days,
  chartDays,
  initial,
  initialDate,
  saveAction,
}: {
  days: StateDay[];
  chartDays: ChartDay[];
  /** Giá trị prefill — mặc định lấy từ hôm qua (design.md §4.12). */
  initial: { mood: number; energy: number; focus: number; sleep: number; note: string };
  /** Ngày đang chọn trong form lúc mở trang — `YYYY-MM-DD`. */
  initialDate: string;
  saveAction: (prev: SaveState, formData: FormData) => Promise<SaveState>;
}) {
  const [selectedKey, setSelectedKey] = useState(initialDate);
  const [mood, setMood] = useState(initial.mood);
  const [energy, setEnergy] = useState(initial.energy);
  const [focus, setFocus] = useState(initial.focus);
  const [sleep, setSleep] = useState(initial.sleep);
  const [note, setNote] = useState(initial.note);
  const [range, setRange] = useState<7 | 30>(7);

  const [state, formAction, isPending] = useActionState<SaveState, FormData>(
    async (prev, formData) => {
      const startedAt = Date.now();
      const next = await saveAction(prev, formData);
      return { ...next, elapsedMs: Date.now() - startedAt };
    },
    { ok: false, message: "" },
  );

  /** Bấm chấm 1 ngày → đổi ngày đang sửa + nạp lại giá trị của ngày đó. */
  const selectDay = (day: StateDay) => {
    setSelectedKey(day.key);
    setMood(day.mood ?? 3);
    setEnergy(day.energy ?? 3);
    setFocus(day.focus ?? 3);
    setSleep(day.sleep ?? 7);
    setNote(day.note ?? "");
  };

  return (
    <div className="grid gap-gutter-lg lg:grid-cols-12">
      {/* ── Cột trái: form ghi nhận ─────────────────────────────────────── */}
      <div className="space-y-gutter-lg lg:col-span-7">
        <Card>
          <CardHeader
            title="Ghi nhận siêu tốc hôm nay"
            subtitle="Prefill tự động từ hôm qua • Bấm một chạm lưu ngay"
            icon="person"
            action={<Badge tone="primary">Chế độ ≤15s</Badge>}
          />

          <form action={formAction} aria-live="polite" className="space-y-space-md">
            {/* Ngày đang ghi — ẩn, server action dùng để upsert đúng ngày. */}
            <input type="hidden" name="date" value={selectedKey} />
            {/*
              `RatingScale` render thẳng `<input type="range">` không có `name`
              → phải truyền giá trị slider qua input ẩn, nếu không server action
              sẽ nhận `NaN` cho mood/energy/focus.
            */}
            <input type="hidden" name="mood" value={mood} />
            <input type="hidden" name="energy" value={energy} />
            <input type="hidden" name="focus" value={focus} />

            <div className="space-y-space-sm rounded-lg bg-surface-container p-space-md">
              <div className="flex items-center justify-between">
                <Label>Tâm trạng (Mood)</Label>
                <span className="font-code-md text-primary">{MOOD_LABELS[mood - 1] ?? ""}</span>
              </div>
              <RatingScale
                id="state-mood"
                label="Tâm trạng (Mood)"
                value={mood}
                onChange={setMood}
                lowLabel="1 Tệ"
                highLabel="5 Rất tốt"
              />
              <ScaleLabels labels={MOOD_LABELS} value={mood} />
            </div>

            <div className="space-y-space-sm rounded-lg bg-surface-container p-space-md">
              <div className="flex items-center justify-between">
                <Label>Năng lượng sinh lý (Energy)</Label>
                <span className="font-code-md text-primary">
                  {ENERGY_LABELS[energy - 1] ?? ""}
                </span>
              </div>
              <RatingScale
                id="state-energy"
                label="Năng lượng sinh lý (Energy)"
                value={energy}
                onChange={setEnergy}
                lowLabel="1 Kiệt sức"
                highLabel="5 Tràn năng lượng"
              />
              <ScaleLabels labels={ENERGY_LABELS} value={energy} />
            </div>

            <div className="space-y-space-sm rounded-lg bg-surface-container p-space-md">
              <div className="flex items-center justify-between">
                <Label>Mức độ tập trung (Focus)</Label>
                <span className="font-code-md text-primary">{FOCUS_LABELS[focus - 1] ?? ""}</span>
              </div>
              <RatingScale
                id="state-focus"
                label="Mức độ tập trung (Focus)"
                value={focus}
                onChange={setFocus}
                lowLabel="1 Phân tán"
                highLabel="5 Flow State"
              />
              <ScaleLabels labels={FOCUS_LABELS} value={focus} />
            </div>

            <div className="rounded-lg bg-surface-container p-space-md">
              <Input
                id="state-sleep"
                name="sleep"
                label="Giấc ngủ đêm qua (giờ)"
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={String(sleep)}
                onChange={(e) => setSleep(Number(e.target.value))}
                hint="Bước 0.5 giờ · nằm trong khoảng 0–24h"
              />
            </div>

            <div className="rounded-lg bg-surface-container p-space-md">
              <Input
                id="state-note"
                name="note"
                label="Ghi chú nhịp sinh học (tuỳ chọn)"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: hôm nay ngủ muộn nên buổi sáng hơi uể"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-space-md">
              <span className="font-label-sm text-outline">
                {days.find((d) => d.key === selectedKey)?.filled
                  ? "Prefill hôm qua: 100% khớp"
                  : "Prefill hôm qua: chưa có dữ liệu — dùng mặc định"}
              </span>
              <Button type="submit" variant="primary" size="lg" loading={isPending} icon="bolt">
                Lưu trạng thái (≤15s)
              </Button>
            </div>

            {/* Trạng thái sau khi lưu — aria-live polite (design.md §7.3). */}
            <p
              className={`text-body-sm ${
                state.ok ? "text-primary" : state.message ? "text-error" : "text-on-surface-variant"
              }`}
              role="status"
            >
              {state.message}
            </p>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Ma trận điểm 7 ngày (bấm để sửa nhanh)"
            subtitle="Mỗi chấm = 1 ngày — bấm để nạp giá trị vào form"
            icon="touch_app"
          />
          <StateDots days={days} selectedKey={selectedKey} onSelect={selectDay} />
        </Card>
      </div>

      {/* ── Cột phải: biểu đồ tương quan ─────────────────────────────────── */}
      <div className="space-y-gutter-lg lg:col-span-5">
        <CorrelationChart days={chartDays} range={range} onRangeChange={setRange} />
      </div>
    </div>
  );
}
