"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * S12 — Đánh giá chính: 4 chỉ số + biểu đồ 7/30 ngày + phân tích tương quan.
 *
 * ⚠️ FR-PS-01 — ghi trong ≤15 giây: 4 nút trượt + nút lưu, không form dài.
 * ⚠️ FR-PS-07 — phân tích tương quan **100% cục bộ**: dữ liệu chỉ số không
 * rời máy, UI không gọi AI.
 */

export interface StateDashboardProps {
  todayKey: string;
  prefill: {
    date: string;
    mood: number | null;
    energy: number | null;
    sleep: number | null;
    focus: number | null;
  };
  series: Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    sleep: number | null;
    focus: number | null;
    doneSlots: number;
  }>;
  correlations: Array<{
    metric: string;
    label: string;
    correlation: number;
    samples: number;
    insight: string;
  }>;
}

type MetricKey = "mood" | "energy" | "sleep" | "focus";

const METRICS: Array<{ key: MetricKey; label: string; max: number; suffix: string }> = [
  { key: "mood", label: "Tâm trạng", max: 5, suffix: "/5" },
  { key: "energy", label: "Năng lượng", max: 5, suffix: "/5" },
  { key: "sleep", label: "Giấc ngủ", max: 12, suffix: "h" },
  { key: "focus", label: "Tập trung", max: 5, suffix: "/5" },
];

export function StateDashboard({
  todayKey,
  prefill,
  series,
  correlations,
}: StateDashboardProps) {
  const router = useRouter();

  const [values, setValues] = useState<Record<MetricKey, number>>({
    mood: prefill.mood ?? 3,
    energy: prefill.energy ?? 3,
    sleep: prefill.sleep ?? 0,
    focus: prefill.focus ?? 3,
  });
  const [days, setDays] = useState<7 | 30>(7);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = series.slice(-days);
  const maxDone = Math.max(1, ...visible.map((d) => d.doneSlots));

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayKey, ...values }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không lưu được");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch {
      setError("Không kết nối được — thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-gutter-lg">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Đánh giá chính
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          4 chỉ số · ghi trong vài giây · dữ liệu chỉ lưu cục bộ
        </p>
      </header>

      {/* 4 chỉ số (FR-PS-01) */}
      <section className="grid grid-cols-1 gap-gutter-md sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((metric) => (
          <div key={metric.key} className="rounded-xl bg-surface-container p-space-md">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
              {metric.label}
            </span>

            <div className="mt-space-sm flex items-baseline gap-1">
              <span className="font-headline-md text-headline-md text-on-surface tabular">
                {values[metric.key]}
              </span>
              <span className="font-label-sm text-label-sm text-outline">
                {metric.suffix}
              </span>
            </div>

            {/* Nút trượt nhanh — không cần form dài. */}
            <div className="mt-space-sm flex gap-1">
              {Array.from({ length: metric.max + 1 }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() =>
                    setValues((current) => ({ ...current, [metric.key]: index }))
                  }
                  aria-pressed={values[metric.key] === index}
                  aria-label={`${metric.label} ${index}${metric.suffix}`}
                  className={cn(
                    "h-8 flex-1 rounded-md font-code-md text-code-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    values[metric.key] === index
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
                  )}
                >
                  {index}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-space-sm">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="check" size={16} />
          {saving ? "Đang lưu…" : saved ? "Đã lưu" : "Lưu chỉ số"}
        </button>

        {error && (
          <span role="alert" className="font-label-sm text-label-sm text-error">
            {error}
          </span>
        )}
      </div>

      {/* Biểu đồ mood/energy/sleep + overlay số hành động (FR-PS-06) */}
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Diễn biến theo ngày
          </h2>

          <div className="flex gap-1" role="group" aria-label="Khoảng thời gian">
            {([7, 30] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                aria-pressed={days === option}
                className={cn(
                  "rounded-lg px-3 py-1 font-code-md text-code-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  days === option
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-highest",
                )}
              >
                {option} ngày
              </button>
            ))}
          </div>
        </div>

        {/* Cột: số hành động hoàn thành (overlay) */}
        <div className="mt-space-md flex h-32 items-end gap-1">
          {visible.map((day) => (
            <div
              key={day.date}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${day.date}: ${day.doneSlots} hành động hoàn thành`}
            >
              <div
                className="w-full rounded-t-sm bg-secondary"
                style={{
                  height: `${Math.max(3, (day.doneSlots / maxDone) * 88)}px`,
                }}
              />
              <span className="font-code-md text-code-md text-outline tabular">
                {day.mood ?? "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-space-sm flex flex-wrap gap-space-md">
          <LegendItem color="bg-secondary" label="Số hành động hoàn thành" />
          <LegendItem color="bg-primary" label="Tâm trạng (1–5)" />
          <LegendItem color="bg-tertiary" label="Năng lượng (1–5)" />
          <LegendItem color="bg-outline-variant" label="Giấc ngủ (giờ)" />
        </div>
      </section>

      {/* Phân tích tương quan — cục bộ (FR-PS-05) */}
      <section className="rounded-xl bg-surface-container-low p-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Phân tích tương quan
          </h2>
          <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
            <Icon name="lock" size={12} />
            Chạy cục bộ — dữ liệu không rời máy
          </span>
        </div>

        <ul className="mt-space-md space-y-space-sm">
          {correlations.map((item) => (
            <li
              key={item.metric}
              className="flex flex-wrap items-start justify-between gap-space-sm"
            >
              <span className="font-body-sm text-body-sm text-on-surface">
                {item.label}
                <span className="ml-2 font-code-md text-code-md text-primary tabular">
                  r = {item.correlation}
                </span>
                <span className="ml-2 font-label-sm text-label-sm text-outline">
                  ({item.samples} ngày có dữ liệu)
                </span>
              </span>
              <span className="max-w-md text-body-sm text-body-sm text-on-surface-variant">
                {item.insight}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}
