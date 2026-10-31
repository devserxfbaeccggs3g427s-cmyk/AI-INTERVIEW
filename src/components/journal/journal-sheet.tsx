"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * Sheet nhật ký (S06).
 *
 * ⚠️ FR-PSJ-01 — bản nháp lưu **cục bộ** (SQLite), tự lưu sau 800ms ngừng
 * gõ, và khôi phục được sau khi tải lại trang.
 *
 * ⚠️ P3 — bản nháp **không** tính vào thống kê hoạt động. Chỉ khi bấm
 * "Lưu vào lịch sử" (commit) mới tạo `Activity` + `Evidence`.
 *
 * ⚠️ FR-PSJ-03 — nút "Gửi AI phản hồi" là hành động **duy nhất** được phép
 * đưa nội dung nhật ký ra khỏi máy.
 *
 * ⚠️ FR-PSJ-05 — không có API key ⇒ ẩn nút AI, tuyệt đối **không** giả lập
 * phản hồi AI.
 */

export interface JournalSheetProps {
  /** Ngày (yyyy-MM-dd). */
  date: string;
  /** Ngữ cảnh hiện tại — dùng để chọn 3 câu hỏi gợi ý. */
  context: "after_study" | "end_of_day" | "end_of_week" | "anytime";
  /** 3 câu hỏi gợi ý theo ngữ cảnh. */
  questions: Array<{ text: string }>;
  /** Có API key không (false ⇒ ẩn nút AI). */
  aiEnabled: boolean;
  /** Bản nháp đang sửa (null = tạo mới). */
  initialId?: string | null;
  initialContent?: string;
  /** Phản hồi AI đã có (khi sửa nhật ký cũ). */
  initialAiSummary?: string | null;
  initialAiQuestion?: string | null;
  /** Trạng thái hiện tại của nhật ký. */
  initialStatus?: "draft" | "published";
}

const AUTOSAVE_DELAY_MS = 800;

export function JournalSheet({
  date,
  context,
  questions,
  aiEnabled,
  initialId = null,
  initialContent = "",
  initialAiSummary = null,
  initialAiQuestion = null,
  initialStatus = "draft",
}: JournalSheetProps) {
  const router = useRouter();

  const [content, setContent] = useState(initialContent);
  const [entryId, setEntryId] = useState<string | null>(initialId);
  const [status, setStatus] = useState<"draft" | "published">(initialStatus);
  const [aiSummary, setAiSummary] = useState<string | null>(initialAiSummary);
  const [aiQuestion, setAiQuestion] = useState<string | null>(initialAiQuestion);
  const [answer, setAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(initialId);
  const hadFeedbackRef = useRef(Boolean(initialAiSummary || initialAiQuestion));

  // Tự lưu sau 800ms ngừng gõ (FR-PSJ-01).
  function onContentChange(value: string) {
    setContent(value);

    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void saveDraft(value);
    }, AUTOSAVE_DELAY_MS);
  }

  async function saveDraft(value: string): Promise<string | null> {
    if (value.trim().length === 0) return null;

    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: value,
          id: savedRef.current,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không lưu được bản nháp");
        return null;
      }

      savedRef.current = payload.data.id;
      setEntryId(payload.data.id);
      setStatus(payload.data.status);
      setSavedAt(new Date().toLocaleTimeString("vi-VN"));
      setError(null);

      // ⚠️ FR-PSJ-06 — sửa nhật ký đã có phản hồi ⇒ phản hồi cũ "lỗi thời".
      if (hadFeedbackRef.current) {
        setAiSummary(null);
        setAiQuestion(null);
        hadFeedbackRef.current = false;
      }

      return payload.data.id as string;
    } catch {
      setError("Không kết nối được — bản nháp vẫn còn trong ô nhập");
      return null;
    }
  }

  /** Gửi AI phản hồi — hành động duy nhất đưa dữ liệu ra khỏi máy. */
  async function requestAiFeedback() {
    const id = entryId ?? (await saveDraft(content));
    if (!id) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/journal/feedback-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reflectionId: id, consent: true }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không lấy được phản hồi AI");
        return;
      }

      setAiSummary(payload.data.summary);
      setAiQuestion(payload.data.question);
      hadFeedbackRef.current = true;
      setToast("Đã nhận phản hồi AI");
      router.refresh();
    } catch {
      setError("Không kết nối được — nhật ký vẫn cục bộ");
    } finally {
      setSaving(false);
    }
  }

  /** Commit nhật ký ⇒ thành hoạt động (P3). */
  async function commit() {
    const id = entryId ?? (await saveDraft(content));
    if (!id) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit" }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không lưu được nhật ký");
        return;
      }

      setStatus("published");
      setToast("Đã lưu vào lịch sử");
      router.refresh();
    } catch {
      setError("Không kết nối được");
    } finally {
      setSaving(false);
    }
  }

  async function saveAnswer() {
    if (!entryId || answer.trim().length === 0) return;

    try {
      const res = await fetch(`/api/journal/${entryId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không lưu được câu trả lời");
        return;
      }

      setShowAnswer(false);
      setToast("Đã lưu câu trả lời");
    } catch {
      setError("Không kết nối được");
    }
  }

  // Toast tự ẩn.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const contextLabel =
    context === "after_study"
      ? "Sau buổi học"
      : context === "end_of_day"
        ? "Cuối ngày"
        : context === "end_of_week"
          ? "Cuối tuần"
          : "Bất cứ lúc nào";

  return (
    <div className="space-y-gutter-md">
      {/* Tiêu đề */}
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Nhật ký</h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {date} · {contextLabel}
        </p>
      </header>

      {/* Nhật ký */}
      <div className="rounded-xl bg-surface-container p-space-lg">
        <label htmlFor="journal-content" className="sr-only">
          Nội dung nhật ký
        </label>
        <textarea
          id="journal-content"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder="Bạn nghĩ gì hôm nay?"
          rows={8}
          className="w-full resize-y rounded-lg bg-surface-container-low p-space-md text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />

        {/* Gợi ý câu hỏi (FR-PSJ-02) */}
        <div className="mt-space-sm flex flex-wrap gap-space-xs">
          {questions.map((question) => (
            <button
              key={question.text}
              type="button"
              onClick={() =>
                onContentChange(`${content}${content ? "\n" : ""}${question.text} `)
              }
              className="rounded-full bg-surface-container-high px-3 py-1.5 text-left font-label-sm text-label-sm text-on-surface-variant transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {question.text}
            </button>
          ))}
        </div>

        {/* Trạng thái lưu */}
        <div className="mt-space-sm flex flex-wrap items-center justify-between gap-space-sm">
          <span className="font-label-sm text-label-sm text-outline">
            {savedAt
              ? `Đã lưu cục bộ lúc ${savedAt}`
              : "Tự lưu cục bộ sau 800ms ngừng gõ"}
          </span>

          {/* ⚠️ FR-PSJ-05 — không có key ⇒ ẩn nút AI, không giả lập phản hồi. */}
          {aiEnabled ? (
            <button
              type="button"
              onClick={() => void requestAiFeedback()}
              disabled={saving || content.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-lg bg-secondary-container px-3 py-1.5 font-label-md text-label-md text-secondary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="neurology" size={16} />
              {saving ? "Đang hỏi AI…" : "Gửi AI phản hồi"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
              <Icon name="lock" size={12} />
              Chưa có API key — nhật ký chỉ lưu cục bộ
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-space-sm font-label-sm text-label-sm text-error">
            {error}
          </p>
        )}
      </div>

      {/* Commit — P3: chỉ khi lưu vào lịch sử mới thành hoạt động. */}
      <div className="flex flex-wrap items-center gap-space-sm">
        <button
          type="button"
          onClick={() => void commit()}
          disabled={saving || content.trim().length === 0 || status === "published"}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="check" size={16} />
          {status === "published" ? "Đã lưu vào lịch sử" : "Lưu vào lịch sử"}
        </button>

        <span className="font-label-sm text-label-sm text-outline">
          {status === "published"
            ? "Đã tính vào thống kê hoạt động"
            : "Bản nháp chưa tính vào thống kê"}
        </span>
      </div>

      {/* Phản hồi AI (FR-PS-03) */}
      {(aiSummary || aiQuestion) && (
        <div className="rounded-xl bg-surface-container-low p-space-lg">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Phản hồi AI
          </h2>

          {aiSummary && (
            <p className="mt-space-sm text-body-md text-body-md text-on-surface">
              {aiSummary}
            </p>
          )}

          {aiQuestion && (
            <div className="mt-space-md rounded-lg bg-surface-container p-space-md">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
                Câu hỏi sắc
              </p>
              <p className="mt-space-xs text-body-md text-body-md text-on-surface">
                {aiQuestion}
              </p>

              {showAnswer ? (
                <div className="mt-space-sm">
                  <label htmlFor="journal-answer" className="sr-only">
                    Câu trả lời
                  </label>
                  <textarea
                    id="journal-answer"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={"Trả lời ở đây…"}
                    rows={3}
                    className="w-full resize-y rounded-lg bg-surface-container-low p-space-sm text-body-sm text-body-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <div className="mt-space-sm flex justify-end gap-space-sm">
                    <button
                      type="button"
                      onClick={() => setShowAnswer(false)}
                      className="rounded-lg bg-surface-container px-3 py-1.5 font-label-md text-label-md text-on-surface-variant transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Huỷ
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveAnswer()}
                      disabled={answer.trim().length === 0}
                      className="rounded-lg bg-primary-container px-3 py-1.5 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Lưu câu trả lời
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAnswer(true)}
                  className="mt-space-sm inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon name="edit" size={14} />
                  Ghi câu trả lời
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-primary/30 bg-surface-container-highest px-4 py-2 font-label-md text-label-md text-on-surface shadow-md"
        >
          {toast}
        </div>
      )}

      {/* Ngữ cảnh hiện tại — hỗ trợ debug + minh bạch ngữ cảnh gợi ý */}
      <p className="sr-only">Ngữ cảnh: {contextLabel}</p>
    </div>
  );
}
