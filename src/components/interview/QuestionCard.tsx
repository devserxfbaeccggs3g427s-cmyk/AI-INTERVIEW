"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";

const KIND_LABELS: Record<string, string> = {
  concept: "Khái niệm",
  design: "Thiết kế hệ thống",
  debug: "Debug / Troubleshoot",
  tradeoff: "Đánh đổi (Trade-off)",
  behavioral: "Hành vi (STAR)",
};

const KIND_ICONS: Record<string, string> = {
  concept: "lightbulb",
  design: "architecture",
  debug: "bug_report",
  tradeoff: "balance",
  behavioral: "psychology",
};

interface QuestionCardProps {
  index: number;
  total: number;
  question: string;
  kind: string;
  skillName?: string | null;
  onFlag?: () => void;
}

export function QuestionCard({
  index,
  total,
  question,
  kind,
  skillName,
  onFlag,
}: QuestionCardProps) {
  const kindLabel = KIND_LABELS[kind] || kind;
  const kindIcon = KIND_ICONS[kind] || "help";

  return (
    <Card className="space-y-gutter">
      <div className="flex items-start justify-between gap-gutter">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="font-label-md text-on-surface-variant">
              Câu {index + 1} / {total}
            </span>
            <Chip tone="primary" icon={kindIcon}>
              {kindLabel}
            </Chip>
            {skillName && (
              <Chip tone="outline" icon="code">
                {skillName}
              </Chip>
            )}
          </div>
          <p className="mt-gutter font-headline-sm text-on-surface leading-relaxed">
            {question}
          </p>
        </div>

        {onFlag && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onFlag}
            aria-label="Báo cáo câu hỏi này có vấn đề"
            className="shrink-0"
          >
            <span className="material-symbols-rounded text-lg">flag</span>
            <span className="hidden sm:inline">Báo cáo</span>
          </Button>
        )}
      </div>
    </Card>
  );
}