"use client";

/**
 * S07 — Luyện giao tiếp Viết (/speak/write)
 *
 * Client Component vì có state (textarea, loading, kết quả chấm).
 * Flow:
 * 1. Hiển thị PromptCard (đề bài + badge CEFR + nút "Đề khác"/"Tạo đề")
 * 2. WriteEditor (textarea + đếm từ + nút "Chấm bằng AI")
 * 3. Gọi API /api/grade (mode="write") → hiển thị RubricGrid + DeltaBadge
 * 4. Lưu kết quả vào Activity + Evidence (xử lý ở API)
 *
 * Xem tasks.md 11.1–11.6 · SPEC.md S07 · design.md §4.7.
 */

import { useState, useCallback } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import {
  PromptCard,
  WriteEditor,
  usePromptBank,
  type PromptItem,
} from "@/components/speak/SpeakingPractice";
import { PromptBank } from "@/components/speak/PromptBank";
import { RubricGrid, DeltaBadge, type RubricScore } from "@/components/rubric/RubricGrid";

export default function SpeakWritePage() {
  const [content, setContent] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [result, setResult] = useState<RubricScore | null>(null);
  const [previousTotal, setPreviousTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    prompt,
    language,
    loadPrompt,
    onNewPrompt,
    onCustomPrompt,
    onLanguageChange,
  } = usePromptBank("vi");

  const handleGrade = useCallback(async () => {
    if (!content.trim() || isGrading) return;

    setIsGrading(true);
    setError(null);

    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "write",
          prompt: prompt.text,
          content,
          language,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.error?.message || "Chấm bài thất bại");
        return;
      }

      setResult(data.data);
      // Lưu điểm tổng để so sánh lần sau
      setPreviousTotal(data.data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra khi chấm bài");
    } finally {
      setIsGrading(false);
    }
  }, [content, prompt.text, language, isGrading]);

  const handleNewPrompt = useCallback(() => {
    onNewPrompt();
    setContent("");
    setResult(null);
    setError(null);
  }, [onNewPrompt]);

  const handleCustomPrompt = useCallback(() => {
    onCustomPrompt();
    setContent("");
    setResult(null);
    setError(null);
  }, [onCustomPrompt]);

  /**
   * Nạp 1 đề từ kho bài tập làm đề mới (tasks.md 11.7).
   * Xoá nội dung bài đang viết + kết quả chấm cũ vì chúng không còn khớp đề.
   */
  const handleUseSavedPrompt = useCallback(
    (saved: PromptItem) => {
      loadPrompt(saved);
      setContent("");
      setResult(null);
      setError(null);
    },
    [loadPrompt],
  );

  return (
    <div className="space-y-gutter-lg max-w-3xl mx-auto px-gutter-md py-gutter-lg">
      <PageHeader
        eyebrow="Giao tiếp · AI-03"
        title="Luyện giao tiếp — Viết"
        description="Viết câu trả lời bằng văn bản và nhận chấm điểm theo 5 tiêu chí giao tiếp."
      />

      {/* Language Selector */}
      <div className="flex flex-wrap items-center gap-space-sm">
        <span className="font-label-sm text-on-surface-variant">Ngôn ngữ:</span>
        {(["vi", "en", "zh"] as const).map((lang) => (
          <Button
            key={lang}
            variant={language === lang ? "primary" : "ghost"}
            size="sm"
            onClick={() => onLanguageChange(lang)}
          >
            {lang.toUpperCase()}
          </Button>
        ))}
      </div>

      {/* Prompt Card */}
      <PromptCard
        prompt={prompt}
        onNewPrompt={handleNewPrompt}
        onCustomPrompt={handleCustomPrompt}
        language={language}
      />

      {/* Kho bài tập (11.7) — lưu / nạp đề đã lưu */}
      <PromptBank prompt={prompt} onUsePrompt={handleUseSavedPrompt} />

      {/* Write Editor */}
      <WriteEditor
        value={content}
        onChange={setContent}
        onSubmit={handleGrade}
        disabled={isGrading}
        maxWords={500}
      />

      {error && (
        <div className="rounded-lg bg-error-container p-gutter-md text-error">
          <p className="font-label-md">Lỗi</p>
          <p className="text-body-sm">{error}</p>
        </div>
      )}

      {/* Grading Result */}
      {result && (
        <div className="space-y-gutter-md animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
            <h3 className="font-headline-md text-on-surface">Kết quả chấm điểm</h3>
            <DeltaBadge
              current={result.total}
              previous={previousTotal}
              label="So với lần trước"
            />
          </div>

          <RubricGrid data={result} />

          {/* Action buttons after grading */}
          <div className="flex flex-wrap gap-space-sm">
            <Button variant="secondary" onClick={handleNewPrompt} icon="refresh">
              Làm bài mới
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)} icon="close">
              Đóng kết quả
            </Button>
          </div>
        </div>
      )}

      {/* Help text */}
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-space-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-rounded text-lg">info</span>
          Hướng dẫn
        </summary>
        <div className="mt-gutter-sm space-y-1 text-body-sm text-on-surface-variant">
          <p>• Chọn đề bài hoặc tự tạo chủ đề</p>
          <p>• Viết tối thiểu 50 từ, tối đa 500 từ</p>
          <p>• Nhấn "Chấm bằng AI" (Ctrl+Enter) để nhận điểm rubric 5 tiêu chí</p>
          <p>• Kết quả bao gồm: điểm từng tiêu chí, nhận xét, đề xuất sửa, tổng điểm</p>
          <p>• So sánh với lần làm trước để theo dõi tiến bộ (DeltaBadge)</p>
        </div>
      </details>
    </div>
  );
}