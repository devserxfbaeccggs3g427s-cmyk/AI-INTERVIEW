"use client";

import { cn } from "@/lib/cn";
import { color } from "@/styles/tokens";
import { useCallback, useEffect } from "react";

/**
 * `QuestionMatrix` — lưới trạng thái câu hỏi + phím tắp (task 14.7).
 *
 * - Hiển thị 40 ô (cấu hình được `cols x rows`).
 * - Mỗi ô: chưa trả lời, đã trả lời, đang chọn.
 * - Phím tắp: 1-4 chọn option, Space đánh dấu, Enter đến câu tiếp theo.
 *
 * Props:
 *  - itemCount: tổng số câu (mặc định 40).
 *  - currentIndex: câu hiện tại đang làm.
 *  - answeredIndices: mảng index đã trả lời.
 *  - selectedIndex: câu đang chọn option (hover/kích chọn).
 *  - cols: số cột (mặc định 8).
 *  - onNavigate: chuyển câu (index).
 *  - onSelectOption: chọn option (index, optionIndex 0-3).
 *
 * Xem tasks.md 14.7 · design.md §4.19 / S20.
 */

export interface QuestionMatrixProps {
  itemCount?: number;
  currentIndex: number;
  answeredIndices: number[];
  cols?: number;
  onNavigate: (index: number) => void;
  onSelectOption?: (index: number, optionIndex: number) => void;
  /** Enter - xac nhan cau hien tai (chi chuyen cau khi cau do da co dap an). */
  onConfirm?: () => void;
  className?: string;
}

type CellState = "answered" | "current" | "pending";

export function QuestionMatrix({
  itemCount = 40,
  currentIndex,
  answeredIndices = [],
  cols = 8,
  onNavigate,
  onSelectOption,
  onConfirm,
  className,
}: QuestionMatrixProps) {
  const rows = Math.ceil(itemCount / cols);

  // Tính trạng thái ô
  const getCellState = (i: number): CellState => {
    if (i === currentIndex) return "current";
    if (answeredIndices.includes(i)) return "answered";
    return "pending";
  };

  // Handlers bàn phím (task 14.7)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Không bắt phím tắt khi người dùng đang GÕ vào ô nhập (cloze / writing).
      // Nếu không, phím "Space" và "1-4" sẽ bị nuốt và không gõ được vào ô.
      // Radio/checkbox vẫn được phép — sau khi bấm radio, phím "1-4" phải còn tác dụng.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isTextEntry =
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          (tag === "INPUT" && !["radio", "checkbox"].includes((target as HTMLInputElement).type));
        if (isTextEntry) {
          return;
        }
      }

      const answered = answeredIndices.includes(currentIndex);

      // 1-4: chọn option
      if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const optionIndex = parseInt(e.key, 10) - 1;
        onSelectOption?.(currentIndex, optionIndex);
        return;
      }

      // Space: chuyển sang câu tiếp theo (tasks.md 14.7)
      if (e.code === "Space") {
        e.preventDefault();
        const next = currentIndex < itemCount - 1 ? currentIndex + 1 : currentIndex;
        onNavigate(next);
        return;
      }

      // Enter: xác nhận câu hiện tại (tasks.md 14.7).
      // Chỉ chuyển câu khi câu hiện tại đã có đáp án — tránh bỏ sót câu.
      if (e.key === "Enter") {
        e.preventDefault();
        if (answered) {
          const next = currentIndex < itemCount - 1 ? currentIndex + 1 : currentIndex;
          onNavigate(next);
        } else {
          onConfirm?.();
        }
        return;
      }

      // Mũi tên trái/phải: chuyển câu
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : 0;
        onNavigate(prev);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = currentIndex < itemCount - 1 ? currentIndex + 1 : currentIndex;
        onNavigate(next);
        return;
      }
    },
    [currentIndex, itemCount, answeredIndices, onNavigate, onSelectOption, onConfirm],
  );

  // Đăng ký phím tắp toàn cục
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const cellSize = 40;
  const cellGap = 4;

  // Màu theo trạng thái
  const getStateColor = (state: CellState): string => {
    switch (state) {
      case "answered":
        return color("primary");
      case "current":
        return color("tertiary");
      case "pending":
        return color("outline-variant");
      default:
        return color("outline-variant");
    }
  };

  const getCellBg = (state: CellState): string => {
    switch (state) {
      case "answered":
        return `${color("primary")}20`;
      case "current":
        return `${color("tertiary")}30`;
      case "pending":
        return "bg-surface-container";
      default:
        return "bg-surface-container";
    }
  };

  return (
    <div className={cn("inline-grid gap-1", className)} style={{ gridTemplateColumns: `repeat(${cols}, ${cellSize}px)` }}>
      {Array.from({ length: itemCount }).map((_, i) => {
        const state = getCellState(i);
        const cellColor = getStateColor(state);
        const cellBg = getCellBg(state);

        return (
          <button
            key={i}
            type="button"
            onClick={() => onNavigate(i)}
            className={cn(
              "relative flex items-center justify-center rounded-md font-label-sm font-medium transition-all",
              cellBg,
              "hover:scale-105",
            )}
            style={{
              width: cellSize,
              height: cellSize,
              border: state === "current" ? `2px solid ${cellColor}` : "1px solid transparent",
            }}
            aria-label={`Câu ${i + 1}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span style={{ color: state === "pending" ? color("on-surface-variant") : cellColor }}>
              {i + 1}
            </span>
            {/* Dấu chấm cho câu đã trả lời */}
            {state === "answered" && (
              <span
                className="absolute bottom-0.5 h-1 w-1 rounded-full"
                style={{ backgroundColor: cellColor }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Chú thích phím tắp (task 14.7). */
export function QuestionMatrixLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 font-label-sm text-on-surface-variant">
      <div className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: color("outline-variant") }}
        />
        <span>Chưa trả lời</span>
      </div>
      <div className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: color("primary") }}
        />
        <span>Đã trả lời</span>
      </div>
      <div className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: color("tertiary") }}
        />
        <span>Hiện tại</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <kbd className="rounded border border-outline-variant/40 px-1.5 py-0.5">1-4</kbd>
        <span>chọn option</span>
        <kbd className="rounded border border-outline-variant/40 px-1.5 py-0.5">Space</kbd>
        <span>tiếp theo</span>
        <kbd className="rounded border border-outline-variant/40 px-1.5 py-0.5">Enter</kbd>
        <span>xác nhận</span>
      </div>
    </div>
  );
}