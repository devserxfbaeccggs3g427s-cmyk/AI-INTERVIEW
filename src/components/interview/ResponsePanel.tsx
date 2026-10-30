"use client";

import { useState, FormEvent, KeyboardEvent, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";

interface ResponsePanelProps {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  responseMode?: "text" | "voice";
  timeRemaining?: number;
}

export function ResponsePanel({
  onSubmit,
  disabled = false,
  placeholder = "Nhập câu trả lời của bạn... (Enter để gửi, Shift+Enter để xuống dòng)",
  maxLength = 5000,
  responseMode = "text",
  timeRemaining,
}: ResponsePanelProps) {
  const [answer, setAnswer] = useState("");
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= maxLength) {
      setAnswer(value);
      setCharCount(value.length);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (answer.trim() && !disabled) {
        onSubmit(answer.trim());
        setAnswer("");
        setCharCount(0);
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (answer.trim() && !disabled) {
      onSubmit(answer.trim());
      setAnswer("");
      setCharCount(0);
    }
  };

  const isNearLimit = charCount > maxLength * 0.9;

  return (
    <Card className="space-y-gutter">
      <form onSubmit={handleSubmit} className="space-y-space-sm">
        <div className="flex items-center justify-between">
          <label htmlFor="answer" className="font-label-md text-on-surface">
            Câu trả lời
          </label>
          <span
            className={cn(
              "font-mono text-label-sm",
              isNearLimit ? "text-error" : "text-on-surface-variant",
            )}
          >
            {charCount} / {maxLength}
          </span>
        </div>

        <Textarea
          ref={textareaRef}
          id="answer"
          value={answer}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={6}
          disabled={disabled}
          className="font-body-md"
        />

        {responseMode === "voice" && (
          <div className="flex items-center gap-space-sm p-space-sm bg-surface-container-highest rounded-xl">
            <span className="material-symbols-rounded text-primary">mic</span>
            <span className="font-body-sm text-on-surface-variant">
              Chế độ giọng nói: Nhấn nút ghi âm bên dưới để nói câu trả lời
            </span>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-space-sm">
          <div className="flex items-center gap-space-sm text-body-sm text-on-surface-variant">
            <kbd className="px-space-xs py-0.5 bg-surface-container-highest rounded text-xs font-mono">
              Enter
            </kbd>
            <span>Gửi</span>
            <span aria-hidden="true">·</span>
            <kbd className="px-space-xs py-0.5 bg-surface-container-highest rounded text-xs font-mono">
              Shift
            </kbd>
            <kbd className="px-space-xs py-0.5 bg-surface-container-highest rounded text-xs font-mono">
              Enter
            </kbd>
            <span>Xuống dòng</span>
          </div>

          {timeRemaining && timeRemaining > 0 && (
            <div className="flex items-center gap-space-sm font-mono text-label-md" aria-live="polite">
              <span className="material-symbols-rounded text-lg">timer</span>
              <span className={cn(timeRemaining < 30 ? "text-error" : "text-on-surface")}>
                {Math.ceil(timeRemaining)}s
              </span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={disabled || !answer.trim()}
            className="min-w-[120px]"
          >
            Gửi
          </Button>
        </div>
      </form>
    </Card>
  );
}