"use client";

/**
 * SpeakingPractice — Component dùng chung cho S07 (Viết) và S08 (Nói).
 *
 * Hiển thị:
 * - PromptCard: đề bài + badge CEFR + nút "Đề khác" / "Tạo đề theo chủ đề"
 * - WriteEditor: textarea + bộ đếm từ + nút "Chấm bài"
 *
 * Xem tasks.md 11.1 / 11.2 · SPEC.md S07.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export interface PromptItem {
  id: string;
  text: string;
  level: CEFRLevel;
  language: "vi" | "en" | "zh";
  category: string;
}

const CEFR_COLORS: Record<CEFRLevel, string> = {
  A1: "bg-green-100 text-green-800",
  A2: "bg-lime-100 text-lime-800",
  B1: "bg-yellow-100 text-yellow-800",
  B2: "bg-orange-100 text-orange-800",
  C1: "bg-red-100 text-red-800",
};

const PROMPT_BANK: PromptItem[] = [
  // Vietnamese
  { id: "vi-1", text: "Viết email cho sếp xin 2 ngày nghỉ phép", level: "B1", language: "vi", category: "Công việc" },
  { id: "vi-2", text: "Viết tin nhắn cảm ơn bạn bè đã chúc mừng sinh nhật", level: "A2", language: "vi", category: "Cá nhân" },
  { id: "vi-3", text: "Viết bài blog ngắn về thói quen đọc sách hàng ngày", level: "B2", language: "vi", category: "Phát triển bản thân" },
  { id: "vi-4", text: "Viết thư khiếu nại về dịch vụ giao hàng chậm", level: "B1", language: "vi", category: "Khiếu nại" },
  { id: "vi-5", text: "Viết kịch bản giới thiệu bản thân trong phỏng vấn việc làm", level: "B2", language: "vi", category: "Công việc" },
  // English
  { id: "en-1", text: "Write an email to your manager requesting 2 days off", level: "B1", language: "en", category: "Work" },
  { id: "en-2", text: "Write a thank you message to friends for birthday wishes", level: "A2", language: "en", category: "Personal" },
  { id: "en-3", text: "Write a short blog post about daily reading habit", level: "B2", language: "en", category: "Self-improvement" },
  { id: "en-4", text: "Write a complaint letter about late delivery service", level: "B1", language: "en", category: "Complaint" },
  { id: "en-5", text: "Write a self-introduction script for a job interview", level: "B2", language: "en", category: "Work" },
  // Chinese
  { id: "zh-1", text: "给主管写邮件请两天假", level: "B1", language: "zh", category: "工作" },
  { id: "zh-2", text: "写感谢朋友生日祝福的信息", level: "A2", language: "zh", category: "个人" },
  { id: "zh-3", text: "写一篇关于每日阅读习惯的短博客", level: "B2", language: "zh", category: "自我提升" },
  { id: "zh-4", text: "写一封关于快递延迟的投诉信", level: "B1", language: "zh", category: "投诉" },
  { id: "zh-5", text: "写面试自我介绍脚本", level: "B2", language: "zh", category: "工作" },
];

function getRandomPrompt(language: "vi" | "en" | "zh", level?: CEFRLevel): PromptItem | undefined {
  let filtered = PROMPT_BANK.filter((p) => p.language === language);
  if (level) filtered = filtered.filter((p) => p.level === level);
  if (filtered.length === 0) filtered = PROMPT_BANK.filter((p) => p.language === language);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function PromptCard({
  prompt,
  onNewPrompt,
  onCustomPrompt,
  language,
}: {
  prompt: PromptItem;
  onNewPrompt: () => void;
  onCustomPrompt: () => void;
  language: "vi" | "en" | "zh";
}) {
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-gutter-md space-y-gutter-sm">
      <div className="flex flex-wrap items-center gap-space-sm">
        <span className={cn("px-2 py-0.5 rounded-full text-label-sm font-medium", CEFR_COLORS[prompt.level])}>
          {prompt.level}
        </span>
        <span className="px-2 py-0.5 rounded-full text-label-sm bg-surface-container-high text-on-surface-variant">
          {prompt.category}
        </span>
        <span className="ml-auto px-2 py-0.5 rounded-full text-label-sm bg-primary-container/20 text-primary">
          {language.toUpperCase()}
        </span>
      </div>
      <p className="text-body-lg text-on-surface">{prompt.text}</p>
      <div className="flex flex-wrap gap-space-sm pt-gutter-xs">
        <Button variant="ghost" size="sm" onClick={onNewPrompt} icon="refresh">
          Đề khác
        </Button>
        <Button variant="secondary" size="sm" onClick={onCustomPrompt} icon="add">
          Tạo đề theo chủ đề
        </Button>
      </div>
    </div>
  );
}

export function WriteEditor({
  value,
  onChange,
  onSubmit,
  disabled,
  maxWords = 500,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxWords?: number;
}) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const isOverLimit = wordCount > maxWords;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <div className="space-y-gutter-sm">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Viết bài tại đây... (Ctrl+Enter để chấm)"
        rows={10}
        className={cn(isOverLimit && "border-error")}
        hint={`${wordCount}/${maxWords} từ${isOverLimit ? " · vượt giới hạn" : ""}`}
      />
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-on-surface-variant">
          Mẹo: Ctrl+Enter để gửi chấm bài
        </p>
        <Button
          variant="ai"
          size="lg"
          onClick={onSubmit}
          disabled={disabled || value.trim().length === 0}
          icon="psychology"
          loading={disabled}
        >
          Chấm bằng AI
        </Button>
      </div>
    </div>
  );
}

export function usePromptBank(initialLanguage: "vi" | "en" | "zh" = "vi") {
  const fallbackPrompt = PROMPT_BANK.find((p) => p.language === initialLanguage) ?? PROMPT_BANK[0];
  const getPrompt = useCallback(
    (lang: "vi" | "en" | "zh", level?: CEFRLevel): PromptItem => {
      return getRandomPrompt(lang, level) ?? PROMPT_BANK.find((p) => p.language === lang)! ?? PROMPT_BANK[0];
    },
    [],
  );
  const [prompt, setPrompt] = useState<PromptItem>(() => getPrompt(initialLanguage));
  const [language, setLanguage] = useState<"vi" | "en" | "zh">(initialLanguage);

  const handleNewPrompt = useCallback(() => {
    setPrompt(getPrompt(language, prompt.level));
  }, [language, prompt.level, getPrompt]);

  const handleCustomPrompt = useCallback(() => {
    const topic = window.prompt("Nhập chủ đề bạn muốn luyện (ví dụ: email xin nghỉ, giới thiệu bản thân...):");
    if (topic?.trim()) {
      const customPrompt: PromptItem = {
        id: `custom-${Date.now()}`,
        text: topic.trim(),
        level: prompt.level,
        language,
        category: "Tự tạo",
      };
      setPrompt(customPrompt);
    }
  }, [language, prompt.level]);

  const handleLanguageChange = useCallback((lang: "vi" | "en" | "zh") => {
    setLanguage(lang);
    setPrompt(getPrompt(lang));
  }, [getPrompt]);

  /**
   * Nạp 1 đề có sẵn (ví dụ từ kho bài tập — tasks.md 11.7).
   *
   * Khác `onLanguageChange`: hàm này **không** sinh đề ngẫu nhiên, mà dùng
   * đúng đề được chọn, đồng thời đồng bộ ngôn ngữ đang chọn trong UI cho khớp
   * với ngôn ngữ của đề.
   */
  const loadPrompt = useCallback((next: PromptItem) => {
    setPrompt(next);
    setLanguage(next.language);
  }, []);

  return {
    prompt,
    language,
    setPrompt,
    loadPrompt,
    onNewPrompt: handleNewPrompt,
    onCustomPrompt: handleCustomPrompt,
    onLanguageChange: handleLanguageChange,
  };
}