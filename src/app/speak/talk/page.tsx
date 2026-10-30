"use client";

/**
 * S08 — Luyện giao tiếp Nói (/speak/talk)
 *
 * Client Component vì có state (MediaRecorder, audio playback, STT).
 * Flow:
 * 1. PromptCard (đề bài + badge CEFR) — dùng chung với S07
 * 2. VoiceRecorder (ghi âm + phát lại + waveform + timer)
 * 3. Web Speech API STT (transcribe real-time) — speech/hooks.ts
 * 4. Gọi API /api/grade (mode="talk") → hiển thị RubricGrid + DeltaBadge
 *
 * Xem tasks.md 18.1–18.6 · SPEC.md S08 · design.md §4.8.
 */

import { useState, useCallback, useEffect } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { PromptCard, usePromptBank, type PromptItem } from "@/components/speak/SpeakingPractice";
import { PromptBank } from "@/components/speak/PromptBank";
import { VoiceRecorder, useSpeechRecognition } from "@/components/speak/VoiceRecorder";
import { RubricGrid, DeltaBadge, type RubricScore } from "@/components/rubric/RubricGrid";
import { cn } from "@/lib/cn";

const TAB_LABELS = {
  write: "Viết",
  talk: "Nói",
  conversation: "Hội thoại",
} as const;

type TabKey = keyof typeof TAB_LABELS;

export default function SpeakTalkPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("talk");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [transcript, setTranscript] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [result, setResult] = useState<RubricScore | null>(null);
  const [previousTotal, setPreviousTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const {
    prompt,
    language,
    loadPrompt,
    onNewPrompt,
    onCustomPrompt,
    onLanguageChange,
  } = usePromptBank("vi");

  // Speech Recognition for real-time transcript
  const { isListening, transcript: sttTranscript, error: sttError, startListening, stopListening } =
    useSpeechRecognition(language, (t) => {
      setTranscript(t);
      // Could auto-save interim results to localStorage for resume (18.6)
    });

  // Handle recording completion
  const handleRecordingComplete = useCallback((blob: Blob, durationMs: number) => {
    setAudioBlob(blob);
    setAudioDuration(durationMs);
  }, []);

  // Handle grading
  const handleGrade = useCallback(async () => {
    if (!audioBlob || isGrading) return;

    setIsGrading(true);
    setError(null);

    try {
      // Use transcript if available, otherwise send empty string (API will handle)
      const contentToGrade = transcript.trim() || "(không có transcript)";

      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "talk",
          prompt: prompt.text,
          content: contentToGrade,
          language,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.error?.message || "Chấm bài thất bại");
        return;
      }

      setResult(data.data);
      setPreviousTotal(data.data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra khi chấm bài");
    } finally {
      setIsGrading(false);
    }
  }, [audioBlob, transcript, prompt.text, language, isGrading]);

  const handleNewPrompt = useCallback(() => {
    onNewPrompt();
    setAudioBlob(null);
    setAudioDuration(0);
    setTranscript("");
    setResult(null);
    setError(null);
    stopListening();
  }, [onNewPrompt, stopListening]);

  const handleCustomPrompt = useCallback(() => {
    onCustomPrompt();
    setAudioBlob(null);
    setAudioDuration(0);
    setTranscript("");
    setResult(null);
    setError(null);
    stopListening();
  }, [onCustomPrompt, stopListening]);

  /**
   * Nạp 1 đề từ kho bài tập làm đề mới (tasks.md 11.7).
   * Xoá bản ghi / transcript / kết quả cũ vì chúng không còn khớp đề.
   */
  const handleUseSavedPrompt = useCallback(
    (saved: PromptItem) => {
      loadPrompt(saved);
      setAudioBlob(null);
      setAudioDuration(0);
      setTranscript("");
      setResult(null);
      setError(null);
      stopListening();
    },
    [loadPrompt, stopListening],
  );

  // Auto-start STT when recording starts (could be integrated into VoiceRecorder)
  useEffect(() => {
    // STT starts manually via button for now
  }, []);

  return (
    <div className="space-y-gutter-lg max-w-3xl mx-auto px-gutter-md py-gutter-lg">
      <PageHeader
        eyebrow="Giao tiếp · AI-04"
        title="Luyện giao tiếp — Nói"
        description="Nói vào micro để luyện phản xạ và đo độ trôi chảy, độ rõ ràng."
      />

      {/* Tab Switcher (18.4) — Viết · Nói · Hội thoại */}
      <div className="flex gap-space-sm border-b border-outline-variant/40">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "primary" : "ghost"}
            size="sm"
            onClick={() => {
              setActiveTab(tab);
              if (tab !== "talk") stopListening();
            }}
          >
            {TAB_LABELS[tab]}
          </Button>
        ))}
      </div>

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

      {/* Tab Content */}
      {activeTab === "talk" && (
        <div className="space-y-gutter-lg">
          {/* Voice Recorder */}
          <VoiceRecorder
            onRecordingComplete={handleRecordingComplete}
            maxDurationMs={5 * 60 * 1000}
            language={language}
          />

          {/* STT Controls */}
          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-gutter-md space-y-gutter-sm">
            <div className="flex flex-wrap items-center gap-gutter-sm">
              <h4 className="font-label-lg text-on-surface">Nhận diện giọng nói (STT)</h4>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-label-xs font-medium",
                  isListening
                    ? "bg-primary-container text-primary animate-pulse"
                    : "bg-surface-container-high text-on-surface-variant"
                )}
              >
                {isListening ? "Đang nghe..." : "Đang chờ"}
              </span>
            </div>

            <div className="flex flex-wrap gap-space-sm">
              <Button
                variant={isListening ? "danger" : "secondary"}
                size="sm"
                onClick={isListening ? stopListening : startListening}
                icon={isListening ? "stop" : "mic"}
                disabled={!audioBlob} // Only enable after recording
              >
                {isListening ? "Dừng nghe" : "Bắt đầu nghe"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript(!showTranscript)}
                icon={showTranscript ? "visibility_off" : "visibility"}
              >
                {showTranscript ? "Ẩn transcript" : "Hiện transcript"}
              </Button>
            </div>

            {sttError && (
              <p className="text-body-sm text-error">{sttError}</p>
            )}

            {showTranscript && (
              <div className="rounded-lg bg-surface-container p-gutter-md min-h-[100px] max-h-64 overflow-auto">
                <p className="text-body-md text-on-surface whitespace-pre-wrap font-mono">
                  {transcript || sttTranscript || "Chưa có transcript. Nhấn 'Bắt đầu nghe' sau khi ghi âm."}
                </p>
              </div>
            )}
          </div>

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

          {/* Grade button (enabled when has audio) */}
          {!result && audioBlob && (
            <div className="flex justify-center">
              <Button
                variant="ai"
                size="lg"
                onClick={handleGrade}
                disabled={isGrading}
                loading={isGrading}
                icon="psychology"
                className="w-full max-w-xs"
              >
                Chấm bài nói bằng AI
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Placeholder for Write tab (redirects to /speak/write) */}
      {activeTab === "write" && (
        <div className="text-center py-gutter-xl">
          <p className="text-body-md text-on-surface-variant mb-gutter-md">
            Chuyển đến trang Luyện viết để làm bài viết.
          </p>
          <Button
            variant="primary"
            onClick={() => window.location.href = "/speak/write"}
            icon="edit"
          >
            Mở trang Viết
          </Button>
        </div>
      )}

      {/* Placeholder for Conversation tab (Phase 2) */}
      {activeTab === "conversation" && (
        <div className="text-center py-gutter-xl">
          <p className="text-body-md text-on-surface-variant mb-gutter-md">
            Chế độ Hội thoại AI sẽ có ở Phase 2 (tasks.md 18.4 / 19.2).
          </p>
          <Button variant="ghost" disabled>
            Sắp có
          </Button>
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
          <p>• Nhấn nút micro đỏ để bắt đầu ghi âm (tối đa 5 phút)</p>
          <p>• Sau khi ghi xong, nhấn nút "Bắt đầu nghe" để transcribe (STT)</p>
          <p>• Nhấn "Chấm bài nói bằng AI" để nhận điểm rubric 5 tiêu chí</p>
          <p>• 3 tab: Viết (chuyển sang /speak/write) · Nói · Hội thoại (Phase 2)</p>
        </div>
      </details>
    </div>
  );
}