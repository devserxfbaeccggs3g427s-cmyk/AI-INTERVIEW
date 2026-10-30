"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";

/**
 * `VocabProgress` — thanh tiến độ từ vựng theo nhóm/level.
 *
 * Hiển thị 6 nhóm từ vựng (level 0-5), mỗi nhóm là một thanh tiến trình.
 * Tự động fetch tiến độ từ `/api/srs/progress`.
 * Dùng cho S09 hub — `/language`.
 *
 * Props:
 *   - `lang`: "zh" | "en"
 *
 * Xem tasks.md 10.4 · design.md §4.9.
 */

export type VocabProgressProps = {
  /** Ngôn ngữ: "zh" | "en". */
  lang: "zh" | "en";
};

const DEFAULT_LABELS = [
  "Level 0 (Mới)",
  "Level 1 (1 ngày)",
  "Level 2 (3 ngày)",
  "Level 3 (1 tuần)",
  "Level 4 (2 tuần)",
  "Level 5 (1 tháng+)",
];

export function VocabProgress({ lang }: VocabProgressProps) {
  const [progress, setProgress] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);
  const langLabel = lang === "zh" ? "Trung" : "Anh";

  useEffect(() => {
    let mounted = true;
    fetch(`/api/srs/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.ok) setProgress(data.data);
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [lang]);

  if (loading) {
    return (
      <section className="space-y-gutter-sm" aria-label={`Tiến độ từ vựng ${langLabel}`}>
        <h3 className="font-label-md text-on-surface">Tiến độ {langLabel}</h3>
        <div className="space-y-3" role="list">
          {DEFAULT_LABELS.map((label, i) => (
            <div key={i} className="space-y-1.5" role="listitem">
              <div className="flex justify-between text-label-md">
                <span className="text-on-surface-variant">{label}</span>
                <span className="font-mono text-on-surface">—%</span>
              </div>
              <div className="h-2 bg-surface-container-highest rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const COLOR_CLASSES = [
    "bg-surface-container-highest",
    "bg-primary",
    "bg-primary/60",
    "bg-primary/40",
    "bg-secondary",
    "bg-tertiary",
  ];

  return (
    <section className="space-y-gutter-sm" aria-label={`Tiến độ từ vựng ${langLabel}`}>
      <h3 className="font-label-md text-on-surface">
        Tiến độ {langLabel} ({progress.filter((p) => p > 0).length}/6 nhóm đã bắt đầu)
      </h3>
      <div className="space-y-3" role="list" aria-label={`Các nhóm từ vựng ${langLabel}`}>
        {progress.map((p, i) => {
          const percent = Math.round(p * 100);
          const label = DEFAULT_LABELS[i];
          return (
            <div key={i} className="space-y-1.5" role="listitem">
              <div className="flex justify-between text-label-md">
                <span className="text-on-surface-variant">{label}</span>
                <span className="font-mono text-on-surface">{percent}%</span>
              </div>
              <div
                className={cn(
                  "h-2 rounded-full bg-surface-container-high overflow-hidden",
                  "transition-all duration-300",
                )}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label}: ${percent}%`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    COLOR_CLASSES[i],
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Tổng hợp */}
      <div className="pt-2 border-t border-outline-variant/30">
        <div className="flex justify-between text-label-md text-on-surface-variant">
          <span>Tổng thể</span>
          <span className="font-mono text-on-surface">
            {Math.round((progress.reduce((a, b) => a + b, 0) / progress.length) * 100)}%
          </span>
        </div>
        <div
          className={cn(
            "mt-1.5 h-2 rounded-full bg-surface-container-high overflow-hidden",
            "transition-all duration-300",
          )}
          role="progressbar"
          aria-valuenow={Math.round((progress.reduce((a, b) => a + b, 0) / progress.length) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tổng tiến độ"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              "bg-primary",
            )}
            style={{ width: `${Math.round((progress.reduce((a, b) => a + b, 0) / progress.length) * 100)}%` }}
          />
        </div>
      </div>
    </section>
  );
}