/**
 * `TestTypeCard` — thẻ chọn loại bài kiểm tra (task 14.1).
 *
 * 4 loại: placement / topic / benchmark / from_content.
 * Mỗi thẻ có: số lượng câu + biểu tượng đồng hồ nếu có bật timer.
 *
 * Props:
 *  - type: loại bài kiểm tra
 *  - label: nhãn hiển thị
 *  - description: mô tả ngắn
 *  - questionCount: số câu hỏi
 *  - hasTimer: có đếm ngược không
 *  - onClick: handler chọn
 *  - icon: Material Symbols icon name
 *
 * Xem tasks.md 14.1 · design.md §4.19 / S19.
 */

import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { color } from "@/styles/tokens";

export type TestType = "placement" | "topic" | "benchmark" | "from_content";

export interface TestTypeCardProps {
  type: TestType;
  label: string;
  description: string;
  questionCount: number;
  hasTimer: boolean;
  onClick: () => void;
  icon?: string;
}

const TYPE_COLORS: Record<TestType, string> = {
  placement: color("primary"),
  topic: color("tertiary"),
  benchmark: color("secondary"),
  from_content: color("error"),
};

export function TestTypeCard({
  type,
  label,
  description,
  questionCount,
  hasTimer,
  onClick,
  icon = "quiz",
}: TestTypeCardProps) {
  const iconColor = TYPE_COLORS[type] ?? color("outline");

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md",
        "border-2",
      )}
    >
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ backgroundColor: `${iconColor}20` }}
          >
            <span className="material-symbols text-xl" style={{ color: iconColor }}>
              {icon}
            </span>
          </div>

          <div>
            <h3 className="font-semibold text-base">{label}</h3>
            <p className="text-sm text-tertiary mt-0.5">{description}</p>
          </div>
        </div>

        {/* Số câu + timer */}
        <div className="flex items-center gap-2 text-sm">
          {hasTimer && (
            <span className="material-symbols text-base" style={{ color: color("error") }}>
              schedule
            </span>
          )}
          <span className="font-medium">{questionCount} câu</span>
        </div>
      </div>
    </Card>
  );
}