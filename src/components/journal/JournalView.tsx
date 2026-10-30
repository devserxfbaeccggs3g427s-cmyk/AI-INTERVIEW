"use client";

import { AiResponseCard } from "@/components/journal/AiResponseCard";
import { ClassifyCard } from "@/components/journal/ClassifyCard";
import { JournalEditor } from "@/components/journal/JournalEditor";
import { JournalHistory } from "@/components/journal/JournalHistory";
import { PromptSuggestions } from "@/components/journal/PromptSuggestions";
import { Button } from "@/components/ui/Button";
import { Card, Label } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/cn";
import {
  clearJournalDraft,
  formatAiFeedback,
  providerModelLabel,
  type JournalClassifyResult,
  type JournalEntryDTO,
  type JournalFeedback,
} from "@/lib/journal";
import type { EvidenceRating } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * `JournalView` — phần tương tác của S06 (tasks.md 12.1–12.7).
 *
 * Trách nhiệm:
 *   - Giữ state nội dung nhật ký (editor + bản nháp `localStorage`).
 *   - Gọi AI-05 (`/api/journal/feedback`) **chỉ** khi bấm "Gửi AI phản hồi".
 *   - Gọi AI-06 (`/api/journal/classify`) **chỉ** khi bấm "Phân loại".
 *   - Lưu entry (`/api/journal/entry`) → `Activity` + `Reflection`.
 *   - Nút "Chấp nhận → tạo Evidence" → tạo Evidence cho skill được đề xuất.
 *
 * ⚠️ Privacy (FR-PS-07 · task 12.7): **không** có request nào tự động khi
 * gõ. Mọi lượt gọi AI đều bắt nguồn từ 1 cú bấm của người dùng.
 *
 * Xem tasks.md 12.1–12.7 · design.md §4.6.
 */

export function JournalView({
  initialEntries,
}: {
  /** Lịch sử entry (server đọc sẵn từ `Reflection`). */
  initialEntries: JournalEntryDTO[];
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [content, setContent] = useState("");
  const [entries, setEntries] = useState<JournalEntryDTO[]>(initialEntries);

  const [feedback, setFeedback] = useState<JournalFeedback | null>(null);
  const [feedbackProvider, setFeedbackProvider] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const [classify, setClassify] = useState<JournalClassifyResult | null>(null);
  const [classifyProvider, setClassifyProvider] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [creatingEvidence, setCreatingEvidence] = useState(false);
  const [evidenceCreated, setEvidenceCreated] = useState(false);
  /** Activity đã lưu — Evidence sẽ gắn vào đúng entry này. */
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null);

  // ─── AI-05: gửi AI phản hồi (chỉ khi bấm nút) ────────────────────────────
  const sendToAi = useCallback(async () => {
    const text = content.trim();
    if (!text || sendingFeedback) return;

    setSendingFeedback(true);
    try {
      const res = await fetch("/api/journal/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        data?: JournalFeedback;
        meta?: { provider: "local" | "anthropic"; model: string };
        error?: { code: string; message: string };
      };

      if (!res.ok || !payload.ok || !payload.data) {
        toast({
          tone: "error",
          title: "AI chưa phản hồi được",
          description: payload.error?.message ?? "Thử lại sau.",
        });
        return;
      }

      setFeedback(payload.data);
      if (payload.meta) setFeedbackProvider(providerModelLabel(payload.meta));
      setEvidenceCreated(false);
      setSavedActivityId(null);
    } catch {
      toast({ tone: "error", title: "Không gửi được", description: "Mất kết nối — thử lại sau." });
    } finally {
      setSendingFeedback(false);
    }
  }, [content, sendingFeedback, toast]);

  // ─── AI-06: phân loại (chỉ khi bấm nút) ─────────────────────────────────
  const runClassify = useCallback(async () => {
    const text = content.trim();
    if (!text || classifying) return;

    setClassifying(true);
    setClassifyError(null);
    try {
      const res = await fetch("/api/journal/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        data?: JournalClassifyResult;
        meta?: { provider: "local" | "anthropic"; model: string };
        error?: { code: string; message: string };
      };

      if (!res.ok || !payload.ok || !payload.data) {
        setClassifyError(payload.error?.message ?? "AI chưa phân loại được.");
        return;
      }

      setClassify(payload.data);
      if (payload.meta) setClassifyProvider(providerModelLabel(payload.meta));
    } catch {
      setClassifyError("Không phân loại được — kiểm tra kết nối Ollama.");
    } finally {
      setClassifying(false);
    }
  }, [content, classifying]);

  // ─── Lưu entry → Activity + Reflection ───────────────────────────────────
  const saveEntry = useCallback(async () => {
    const text = content.trim();
    if (!text || saving) return;

    setSaving(true);
    try {
      const res = await fetch("/api/journal/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          domain: "personal",
          type: "journal",
          prompt: "",
          aiFeedback: feedback ? formatAiFeedback(feedback) : undefined,
          skillId: classify?.skillId ?? undefined,
        }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        data?: { activityId: string };
        error?: { code: string; message: string };
      };

      if (!res.ok || !payload.ok || !payload.data) {
        toast({
          tone: "error",
          title: "Không lưu được",
          description: payload.error?.message ?? "Thử lại sau.",
        });
        return;
      }

      setSavedActivityId(payload.data.activityId);
      clearJournalDraft(window.localStorage);
      toast({ tone: "success", title: "Đã lưu entry nhật ký" });

      // Refresh lịch sử từ server.
      router.refresh();
      const listRes = await fetch("/api/journal/entry?limit=20");
      if (listRes.ok) {
        const listPayload = (await listRes.json()) as { ok: boolean; data?: JournalEntryDTO[] };
        if (listPayload.ok && listPayload.data) setEntries(listPayload.data);
      }
    } catch {
      toast({ tone: "error", title: "Không lưu được", description: "Mất kết nối — thử lại sau." });
    } finally {
      setSaving(false);
    }
  }, [content, feedback, classify, saving, toast, router]);

  // ─── 12.4: Chấp nhận → tạo Evidence cho skill được đề xuất ───────────────
  const acceptEvidence = useCallback(
    async (rating: EvidenceRating) => {
      const skillId = classify?.skillId ?? null;
      if (!skillId) {
        toast({
          tone: "warning",
          title: "Chưa có skill nào",
          description: "Bấm “Phân loại” trước để AI chỉ đúng kỹ năng.",
        });
        return;
      }
      if (!savedActivityId) {
        toast({
          tone: "warning",
          title: "Hãy lưu entry trước",
          description: "Evidence cần gắn vào 1 entry nhật ký đã lưu.",
        });
        return;
      }

      setCreatingEvidence(true);
      try {
        const res = await fetch("/api/journal/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activityId: savedActivityId,
            skillId,
            rating,
            createEvidence: true,
          }),
        });
        const payload = (await res.json()) as {
          ok: boolean;
          data?: { evidenceId: string | null; skillLevel: number | null };
          error?: { code: string; message: string };
        };

        if (!res.ok || !payload.ok) {
          toast({
            tone: "error",
            title: "Không tạo được Evidence",
            description: payload.error?.message ?? "Thử lại sau.",
          });
          return;
        }

        setEvidenceCreated(true);
        toast({
          tone: "success",
          title: "Đã tạo 1 Evidence",
          description:
            payload.data?.skillLevel !== null && payload.data?.skillLevel !== undefined
              ? `Skill "${classify?.skillName}" lên level ${payload.data.skillLevel}.`
              : `Gắn vào skill "${classify?.skillName}".`,
        });
        router.refresh();
      } catch {
        toast({ tone: "error", title: "Không tạo được Evidence", description: "Thử lại sau." });
      } finally {
        setCreatingEvidence(false);
      }
    },
    [classify, savedActivityId, toast, router],
  );

  return (
    <div className="grid grid-cols-1 gap-gutter-lg xl:grid-cols-12">
      {/* ── Trái 8: editor + phản hồi AI ─────────────────────────────────── */}
      <div className="flex flex-col gap-gutter-lg xl:col-span-8">
        {/* Banner bảo mật (FR-PS-07 · requirements.md 4.11). */}
        <div
          className="flex flex-wrap items-center justify-between gap-space-sm rounded-xl border border-outline-variant/30 bg-surface-container px-gutter py-space-md"
          data-testid="journal-privacy-banner"
        >
          <span className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: "1rem" }}
              aria-hidden
            >
              lock
            </span>
            Chỉ đoạn văn bản bạn chủ động bấm “Gửi AI phản hồi” mới chuyển đến AI.
          </span>
          <span className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label-sm text-outline">Encrypted</span>
            <span className="font-label-sm text-outline">SQLite: Encrypted DB Connected</span>
          </span>
        </div>

        <JournalEditor
          value={content}
          onChange={setContent}
          onSubmit={sendToAi}
          submitting={sendingFeedback}
        />

        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <Button
            variant="secondary"
            size="md"
            icon="save"
            onClick={saveEntry}
            loading={saving}
            disabled={saving || content.trim().length === 0}
            data-testid="journal-save-entry"
          >
            Lưu entry nhật ký
          </Button>
          {savedActivityId ? (
            <span className="text-body-sm text-on-surface-variant" data-testid="journal-saved-hint">
              Đã lưu — bạn có thể chấp nhận tạo Evidence ngay dưới đây.
            </span>
          ) : null}
        </div>

        {feedback ? (
          <AiResponseCard
            summary={feedback.summary}
            sharpQuestion={feedback.sharpQuestion}
            skillName={classify?.skillName ?? null}
            skillId={classify?.skillId ?? null}
            evidenceCreated={evidenceCreated}
            creatingEvidence={creatingEvidence}
            onAccept={acceptEvidence}
            onDismiss={() => setFeedback(null)}
          />
        ) : (
          <Card tone="low" className="flex flex-col items-center gap-space-sm py-gutter-lg text-center">
            <span
              className="material-symbols-outlined text-outline"
              style={{ fontSize: "2rem" }}
              aria-hidden
            >
              auto_awesome
            </span>
            <Label>Chưa có phản hồi AI</Label>
            <p className="max-w-prose text-body-sm text-on-surface-variant">
              Viết nhật ký rồi bấm “Gửi AI phản hồi” — bạn sẽ nhận 1 câu tóm tắt và 1 câu hỏi
              sắc để tự chất vấn.
            </p>
          </Card>
        )}

        {feedbackProvider ? (
          <p className="text-body-sm text-outline">Phản hồi bởi: {feedbackProvider}</p>
        ) : null}
      </div>

      {/* ── Phải 4: gợi ý + phân loại + lịch sử ───────────────────────────── */}
      <div className="flex flex-col gap-gutter-lg xl:col-span-4">
        <PromptSuggestions content={content} onInsert={setContent} />

        <ClassifyCard
          result={classify}
          providerLabel={classifyProvider}
          loading={classifying}
          onClassify={runClassify}
          error={classifyError}
        />

        <JournalHistory entries={entries} />
      </div>
    </div>
  );
}
