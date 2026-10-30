"use client";

import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/Chip";
import { useState } from "react";

/**
 * `LevelSwitcher` — bộ chuyển đổi ngôn ngữ + hiển thị trình độ (task 14.2).
 *
 * - Hiển thị level ước tính: HSK (zh), CEFR (en) từ UserProfile.zhLevel/enLevel.
 * - Cho phép chuyển đổi ngôn ngữ làm bài kiểm tra.
 * - Đề xuất word groups dựa trên level hiện tại.
 *
 * Props:
 *  - zhLevel: "zero" | "HSK1" | "HSK2" ...
 *  - enLevel: "zero" | "A1" | "A2" | "B1" | "B2" ...
 *  - onLangChange: callback khi người dùng chuyển đổi ngôn ngữ.
 *
 * Xem tasks.md 14.2 · design.md §4.19 / S21.
 */

/** Mapping HSK level label. */
const HSK_LABELS: Record<string, string> = {
  zero: "Chưa có trình độ",
  HSK1: "HSK 1",
  HSK2: "HSK 2",
  HSK3: "HSK 3",
  HSK4: "HSK 4",
  HSK5: "HSK 5",
  HSK6: "HSK 6",
};

/** Mapping CEFR level label. */
const CEFR_LABELS: Record<string, string> = {
  zero: "Chưa có trình độ",
  A1: "A1",
  A2: "A2",
  B1: "B1",
  B2: "B2",
  C1: "C1",
  C2: "C2",
};

export interface LevelSwitcherProps {
  zhLevel: string;
  enLevel: string;
  onLangChange?: (lang: "zh" | "en") => void;
  className?: string;
}

export function LevelSwitcher({
  zhLevel,
  enLevel,
  onLangChange,
  className,
}: LevelSwitcherProps) {
  const [activeLang, setActiveLang] = useState<"zh" | "en">("zh");

  const currentLevel = activeLang === "zh" ? zhLevel : enLevel;
  const levelLabel = activeLang === "zh"
    ? HSK_LABELS[zhLevel] ?? zhLevel
    : CEFR_LABELS[enLevel] ?? enLevel;

  // Đề xuất word groups dựa trên level (task 14.14).
  const suggestedWordGroups = getSuggestedWordGroups(activeLang, currentLevel);

  const handleLangChange = (lang: "zh" | "en") => {
    setActiveLang(lang);
    onLangChange?.(lang);
  };

  return (
    <div className={cn("space-y-space-md", className)}>
      {/* Chuyển đổi ngôn ngữ + level */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            onClick={() => handleLangChange("zh")}
            className={cn(
              "px-3 py-1.5 rounded-md font-label-sm transition-colors",
              activeLang === "zh"
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            Tiếng Trung
          </button>
          <button
            type="button"
            onClick={() => handleLangChange("en")}
            className={cn(
              "px-3 py-1.5 rounded-md font-label-sm transition-colors",
              activeLang === "en"
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high",
            )}
          >
            Tiếng Anh
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-label-sm text-on-surface-variant">Trình độ:</span>
          <Chip tone="outline">{levelLabel}</Chip>
        </div>
      </div>

      {/* Đề xuất word groups (task 14.14) */}
      {suggestedWordGroups.length > 0 && (
        <div>
          <p className="font-label-sm text-on-surface-variant mb-1">
            Nhóm từ đề xuất:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedWordGroups.map((group) => (
              <span
                key={group}
                className="font-label-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded"
              >
                {group}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Đề xuất word groups dựa trên level — task 14.14. */
function getSuggestedWordGroups(lang: "zh" | "en", level: string): string[] {
  const zhGroups: Record<string, string[]> = {
    zero: ["hoc", "ngu-phap"],
    HSK1: ["hoc", "song", "gia-dinh", "am-thuc"],
    HSK2: ["hoc", "cong-viec", "the-thao", "so-thich"],
    HSK3: ["hoc", "van-hoa", "tam-ly", "phat-trien"],
  };

  const enGroups: Record<string, string[]> = {
    zero: ["improve", "schedule"],
    A1: ["daily", "family", "jobs", "food"],
    A2: ["time", "hobbies", "work", "health"],
    B1: ["travel", "education", "technology", "environment"],
  };

  const groups = lang === "zh" ? zhGroups : enGroups;
  return groups[level] ?? groups.zero ?? [];
}

