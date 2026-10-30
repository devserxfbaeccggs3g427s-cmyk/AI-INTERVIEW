"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { RubricScoreInline } from "@/components/rubric/RubricScoreCompact";

interface SessionProgressProps {
  currentIndex: number; // 0-based
  totalQuestions: number;
  timeRemaining: number; // seconds
  totalTime: number; // seconds
  scores?: Record<string, { score: number; note?: string }>;
  rubricType?: "communication" | "technical" | "behavioral";
  onTimeUp?: () => void;
}

export function SessionProgress({
  currentIndex,
  totalQuestions,
  timeRemaining,
  totalTime,
  scores,
  rubricType = "technical",
  onTimeUp,
}: SessionProgressProps) {
  const [localTimeRemaining, setLocalTimeRemaining] = useState(timeRemaining);
  const [isRunning, setIsRunning] = useState(true);

  // Sync with prop
  useEffect(() => {
    setLocalTimeRemaining(timeRemaining);
  }, [timeRemaining]);

  // Timer countdown
  useEffect(() => {
    if (!isRunning || localTimeRemaining <= 0) return;

    const interval = setInterval(() => {
      setLocalTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, localTimeRemaining, onTimeUp]);

  const progress = totalQuestions > 0 ? (currentIndex + 1) / totalQuestions : 0;
  const progressPercent = Math.round(progress * 100);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = localTimeRemaining < 30;
  const isCriticalTime = localTimeRemaining < 10;

  return (
    <Card className="space-y-gutter">
      {/* Question Progress */}
      <div className="space-y-space-sm">
        <div className="flex items-center justify-between">
          <span className="font-label-md text-on-surface">
            Câu {currentIndex + 1} / {totalQuestions}
          </span>
          <span className="font-mono text-label-md text-on-surface-variant">
            {progressPercent}%
          </span>
        </div>
        <div
          className="h-2 bg-surface-container-highest rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Tiến trình: ${progressPercent}%`}
        >
          <div
            className="h-full rounded-full transition-all duration-300 bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-body-xs text-on-surface-variant">
          <span>Bắt đầu</span>
          <span>Kết thúc</span>
        </div>
      </div>

      {/* Timer */}
      <div
        className={cn(
          "flex items-center justify-center gap-space-sm p-gutter rounded-xl font-mono text-headline-sm transition-colors",
          isCriticalTime
            ? "bg-error-container text-error animate-pulse"
            : isLowTime
            ? "bg-tertiary-container text-tertiary"
            : "bg-surface-container-highest text-on-surface",
        )}
        role="timer"
        aria-live="polite"
        aria-label={`Thời gian còn lại: ${formatTime(localTimeRemaining)}`}
      >
        <span className="material-symbols-rounded text-lg" aria-hidden="true">
          {isCriticalTime ? "timer_off" : "timer"}
        </span>
        <span className="tabular-nums">{formatTime(localTimeRemaining)}</span>
        <span className="text-body-sm text-on-surface-variant">/ {formatTime(totalTime)}</span>
      </div>

      {/* Current Score Preview */}
      {scores && Object.keys(scores).length > 0 && (
        <div className="border-t border-outline-variant pt-gutter space-y-space-sm">
          <div className="font-label-md text-on-surface-variant">Điểm tạm tính</div>
          <RubricScoreInline scores={scores} rubricType={rubricType} />
        </div>
      )}

      {/* Question indicators */}
      <div className="flex items-center gap-space-xs overflow-x-auto pb-space-xs" role="list" aria-label="Danh sách câu hỏi">
        {Array.from({ length: totalQuestions }, (_, i) => (
          <button
            key={i}
            type="button"
            className={cn(
              "shrink-0 w-8 h-8 rounded-full border-2 font-label-sm transition-all",
              i === currentIndex
                ? "border-primary bg-primary text-on-primary"
                : i < currentIndex
                ? "border-primary bg-primary-container text-primary"
                : "border-outline-variant bg-surface-container-highest text-on-surface-variant",
            )}
            aria-current={i === currentIndex ? "step" : undefined}
            aria-label={`Câu ${i + 1}${i === currentIndex ? " (đang làm)" : i < currentIndex ? " (đã làm)" : ""}`}
            role="listitem"
          >
            {i + 1}
          </button>
        ))}
      </div>
    </Card>
  );
}

/** Hook để dùng timer trong component cha */
export function useSessionTimer(initialTime: number, onTimeUp?: () => void) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining, onTimeUp]);

  const pause = () => setIsRunning(false);
  const resume = () => setIsRunning(true);
  const reset = (newTime?: number) => {
    setTimeRemaining(newTime ?? initialTime);
    setIsRunning(true);
  };

  return { timeRemaining, isRunning, pause, resume, reset };
}