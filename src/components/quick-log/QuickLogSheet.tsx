"use client";

import { AiPrefill, type AiPrefillData, type AiPrefillField } from "@/components/quick-log/AiPrefill";
import { PresetChips, QUICK_LOG_PRESETS, type QuickLogPreset } from "@/components/quick-log/PresetChips";
import { useQuickLog } from "@/components/quick-log/QuickLogProvider";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  DOMAIN_LABELS,
  DOMAINS,
  type ActivityType,
  type Domain,
} from "@/lib/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `QuickLogSheet` — sheet trượt lên ghi nhanh (task 5.1 · 5.3 · 5.7).
 *
 * Luồng 2 bước (design.md §4.5):
 *   - **Bước 1 — Ghi nhanh:** 6 preset chip (1–6) + textarea tự do + nút
 *     "Ghi nhanh ngay" + link "Xem lịch sử".
 *   - **Bước 2 — AI tự phân tích:** card confidence / domain / skill / phút /
 *     nỗ lực + nút "Sửa" + checkbox "Tự động tạo 1 Evidence".
 *
 * Vì sao `POST /api/log` chạy ở **bước 1** (task 5.3): ghi `Activity` tức thì
 * → toast → đóng sheet trong ≤10s, KHÔNG chờ AI. AI chỉ là bước 2 (phân tích
 * bổ sung), và lỗi AI không được chặn việc ghi (AC-2).
 *
 * Bản nháp `localStorage` (task 5.7 · AC-14): mỗi lần gõ → lưu nháp; đóng tab
 * rồi mở lại vẫn còn nội dung.
 *
 * Xem tasks.md 5.1–5.7 · design.md §4.5 / §7.2 / §7.3.
 */

/** Key lưu bản nháp — đặc tả AC-14 quy định đúng key này. */
const DRAFT_KEY = "daily-loop:quicklog-draft";

type Draft = {
  text: string;
  domain: Domain;
  type: ActivityType;
  minutes: number;
  skillId: string | null;
  title: string;
  createEvidence: boolean;
  updatedAt: number;
};

const EMPTY_DRAFT: Draft = {
  text: "",
  domain: "professional",
  type: "study",
  minutes: 25,
  skillId: null,
  title: "",
  createEvidence: false,
  updatedAt: 0,
};

export function QuickLogSheet() {
  const { isOpen, prefill, open, close } = useQuickLog();
  const { toast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiData, setAiData] = useState<AiPrefillData | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // Track whether user has typed content (for preset shortcut suppression).
  // Updated by onChange, read by keydown handler — avoids closure staleness.
  const hasUserContentRef = useRef(false);

  // ─── Mở sheet ────────────────────────────────────────────────────────────
  // `AppShell` phát `window` event `quicklog:open` khi nhấn Cmd/Ctrl+K —
  // `QuickLogProvider` KHÔNG tự nghe event này, nên ta nghe ở đây (task 5.1).
  useEffect(() => {
    const onOpen = () => open();
    window.addEventListener("quicklog:open", onOpen);
    return () => window.removeEventListener("quicklog:open", onOpen);
  }, [open]);

  // Khôi phục bản nháp khi mở (task 5.7 · AC-14).
  useEffect(() => {
    if (!isOpen) return;
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        setDraft({ ...EMPTY_DRAFT, ...parsed });
        hasUserContentRef.current = (parsed.text ?? "").trim().length > 0;
      } catch {
        // Bản nháp hỏng → bỏ qua, dùng bản nháp rỗng.
        window.localStorage.removeItem(DRAFT_KEY);
        hasUserContentRef.current = false;
      }
    } else {
      hasUserContentRef.current = false;
    }
    setStep(1);
    setAiData(null);
    setAiError(null);
    setActivePreset(null);
  }, [isOpen]);

  // Focus vào ô nhập khi mở (task 5.1: "focus vào ô nhập khi mở").
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [isOpen, step]);

  // Lưu bản nháp mỗi lần gõ (task 5.7).
  useEffect(() => {
    if (!isOpen) return;
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }));
      } catch {
        // localStorage bị chặn (private mode) → bỏ qua, không chặn luồng.
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [draft, isOpen]);

  // Prefill từ S01 ("Hoàn thành nhanh") — chỉ áp dụng khi mở mới.
  useEffect(() => {
    if (!isOpen || !prefill) return;
    setDraft((prev) => ({
      ...prev,
      domain: (prefill.domain as Domain) ?? prev.domain,
      skillId: prefill.skillId ?? prev.skillId,
      title: prefill.title ?? prev.title,
      minutes: prefill.minutes ?? prev.minutes,
      text: prev.text || (prefill.title ? `${prefill.title}` : prev.text),
    }));
  }, [isOpen, prefill]);

  // ─── Phím tắt 1–6 (task 5.2) ────────────────────────────────────────────
  // Chỉ hoạt động khi sheet đang mở, và KHÔNG ghi đè nội dung người dùng
  // đang gõ — trừ khi ô nhập đang TRỐNG (khi đó preset là cách nhanh nhất
  // để bắt đầu). Đây là quyết định có chủ đích, ghi rõ ở comment.
  // Dùng handler onKeyDown TRỰC TIẾP trên textarea (qua prop) — cách tin cậy
  // nhất vì React gắn listener ở DOM node, tránh timing issue với useEffect.
  // Đọc DOM value trực tiếp từ e.currentTarget.value (ground truth) —
  // ref React (hasUserContentRef) có thể stale do onChange chạy SAU keydown
  // trong event loop (Playwright fill + press rất nhanh).
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const idx = Number(e.key) - 1;
      const preset = QUICK_LOG_PRESETS[idx];
      if (!preset) return;

      // Không ghi đè khi người dùng đã gõ nội dung.
      // Ưu tiên DOM value (ground truth) — ref React có thể stale.
      // Luôn preventDefault để chặn browser chèn ký tự số vào textarea
      // (trước khi quyết định có apply preset hay không).
      e.preventDefault();

      // Không ghi đè khi người dùng đã gõ nội dung.
      if (e.currentTarget.value.trim().length > 0) return;

      applyPreset(preset);
    },
    [],
  );

  const applyPreset = useCallback((preset: QuickLogPreset) => {
    setActivePreset(preset.key);
    setDraft((prev) => ({
      ...prev,
      text: preset.sample,
      title: preset.sample,
      domain: preset.domain,
      type: preset.type,
      minutes: preset.minutes,
    }));
    // Focus ô nhập để người dùng sửa tiếp ngay (task 5.2).
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  // ─── Bước 1 — ghi nhanh (task 5.3) ──────────────────────────────────────
  const submit = async () => {
    const text = draft.text.trim();
    if (!text) {
      toast({ tone: "warning", title: "Chưa có nội dung", description: "Nhập hoặc chọn 1 mẫu trước nhé." });
      textareaRef.current?.focus();
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "quick_log",
          domain: draft.domain,
          type: draft.type,
          title: draft.title.trim() || text.slice(0, 200),
          content: text,
          minutes: draft.minutes,
          skillId: draft.skillId ?? undefined,
          createEvidence: draft.createEvidence,
        }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        error?: { code: string; message: string };
      };

      if (!res.ok || !payload.ok) {
        toast({
          tone: "error",
          title: "Không ghi được",
          description: payload.error?.message ?? "Thử lại sau.",
        });
        return;
      }

      toast({
        tone: "success",
        title: "Đã ghi nhận",
        description: `${draft.title.trim() || text.slice(0, 60)} · ${draft.minutes} phút`,
      });

      // Xoá bản nháp sau khi ghi thành công.
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Bỏ qua.
      }
      hasUserContentRef.current = false;
      setDraft(EMPTY_DRAFT);
      close();
      router.refresh();
    } catch {
      toast({ tone: "error", title: "Không ghi được", description: "Mất kết nối — thử lại sau." });
    } finally {
      setSaving(false);
    }
  };

  // ─── Bước 2 — AI tự phân tích (task 5.4) ─────────────────────────────────
  const runAutofill = useCallback(async () => {
    const text = draft.text.trim();
    if (!text) return;
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await fetch("/api/log/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        data?: Omit<AiPrefillData, "skillName"> & { skillName?: string | null };
        error?: { code: string; message: string };
      };

      if (!res.ok || !payload.ok || !payload.data) {
        // AI lỗi → giữ form, KHÔNG chặn bước 1 (AC-2 · design.md §7.2).
        setAiError(payload.error?.message ?? "AI chưa phân tích được — bạn có thể điền tay.");
        return;
      }

      setAiData({
        confidence: payload.data.confidence,
        domain: payload.data.domain,
        skillId: payload.data.skillId ?? null,
        skillName: payload.data.skillName ?? null,
        minutes: payload.data.minutes,
        effort: payload.data.effort,
        title: payload.data.title,
        type: payload.data.type,
      });
    } catch {
      setAiError("Không kết nối được tới AI — bạn vẫn có thể điền tay các trường.");
    } finally {
      setAnalyzing(false);
    }
  }, [draft.text]);

  // Chuyển sang bước 2 → chạy AI.
  const goToStep2 = () => {
    setStep(2);
    void runAutofill();
  };

  // ─── Sửa 1 trường theo gợi ý AI (task 5.4) ───────────────────────────────
  const editField = (field: AiPrefillField) => {
    switch (field) {
      case "domain":
        setStep(1);
        textareaRef.current?.focus();
        break;
      case "skill":
        setStep(1);
        break;
      case "minutes":
        setStep(1);
        break;
      case "effort":
        setStep(1);
        break;
      case "title":
        setStep(1);
        titleRef.current?.focus();
        break;
      case "type":
        setStep(1);
        break;
      default:
        break;
    }
  };

  return (
    <Sheet open={isOpen} onClose={close} title="Ghi nhanh hoạt động">
      <div className="flex flex-col gap-gutter">
        {/* Bước 1 — ghi nhanh */}
        {step === 1 ? (
          <>
            <div className="flex flex-col gap-space-md">
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <span className="font-label-sm uppercase tracking-widest text-outline">
                  Bước 1 · Ghi nhanh
                </span>
                <span className="font-label-sm text-outline">Nhấn 1–6 để chọn mẫu nhanh</span>
              </div>

              <PresetChips onPick={applyPreset} activeKey={activePreset} />

              <div className="flex flex-col gap-1">
                <label htmlFor="quicklog-text" className="font-label-md text-on-surface-variant">
                  Bạn vừa làm gì?
                </label>
                <textarea
                  id="quicklog-text"
                  ref={textareaRef}
                  value={draft.text}
                  onChange={(e) => {
                    const val = e.target.value;
                    hasUserContentRef.current = val.trim().length > 0;
                    setActivePreset(null);
                    setDraft((prev) => ({ ...prev, text: val, title: val }));
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Ví dụ: ôn 20 thẻ tiếng Trung, viết 5 câu về chủ đề hôm nay…"
                  rows={4}
                  className="w-full rounded-lg bg-surface-container-lowest p-3 text-body-md text-on-surface border border-outline-variant/40 placeholder:text-outline/70 focus:border-primary focus:outline-none resize-y"
                  data-testid="quicklog-textarea"
                  aria-describedby="quicklog-hint"
                />
                <p id="quicklog-hint" className="text-body-sm text-on-surface-variant">
                  Bản nháp được giữ lại kể cả khi bạn đóng tab (AC-14).
                </p>
              </div>

              <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="quicklog-title" className="font-label-md text-on-surface-variant">
                    Tiêu đề
                  </label>
                  <input
                    id="quicklog-title"
                    ref={titleRef}
                    value={draft.title}
                    onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Tóm tắt hoạt động"
                    className="h-10 w-full rounded-lg bg-surface-container-lowest px-3 text-body-md text-on-surface border border-outline-variant/40 placeholder:text-outline/70 focus:border-primary focus:outline-none"
                    data-testid="quicklog-title"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="quicklog-domain" className="font-label-md text-on-surface-variant">
                    Lĩnh vực
                  </label>
                  <select
                    id="quicklog-domain"
                    value={draft.domain}
                    onChange={(e) => setDraft((prev) => ({ ...prev, domain: e.target.value as Domain }))}
                    className="h-10 w-full rounded-lg bg-surface-container-lowest px-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none"
                    data-testid="quicklog-domain"
                  >
                    {DOMAINS.map((d) => (
                      <option key={d} value={d}>
                        {DOMAIN_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="quicklog-type" className="font-label-md text-on-surface-variant">
                    Loại hoạt động
                  </label>
                  <select
                    id="quicklog-type"
                    value={draft.type}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, type: e.target.value as ActivityType }))
                    }
                    className="h-10 w-full rounded-lg bg-surface-container-lowest px-3 text-body-md text-on-surface border border-outline-variant/40 focus:border-primary focus:outline-none"
                    data-testid="quicklog-type"
                  >
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-label-md text-on-surface-variant">Thời lượng</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[15, 25, 45, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, minutes: m }))}
                        className={`rounded-lg border px-2 py-1 font-label-md ${
                          draft.minutes === m
                            ? "border-primary bg-primary-container/20 text-primary"
                            : "border-outline-variant/40 text-on-surface-variant"
                        }`}
                        aria-pressed={draft.minutes === m}
                      >
                        {m}′
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-space-sm rounded-lg bg-surface-container px-space-md py-space-sm">
                <input
                  type="checkbox"
                  checked={draft.createEvidence}
                  onChange={(e) => setDraft((prev) => ({ ...prev, createEvidence: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  data-testid="create-evidence-checkbox-step1"
                />
                <span className="text-body-sm text-on-surface-variant">
                  Tự động tạo 1 Evidence bằng chứng vào Cây kỹ năng
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <a href="/log/history" className="font-label-md text-primary hover:underline">
                Xem lịch sử →
              </a>
              <div className="flex items-center gap-space-sm">
                <Button variant="ghost" size="md" icon="auto_awesome" onClick={goToStep2}>
                  AI tự phân tích
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  icon="bolt"
                  onClick={submit}
                  loading={saving}
                  disabled={saving}
                  data-testid="quicklog-submit"
                >
                  Ghi nhanh ngay
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Bước 2 — AI tự phân tích */
          <>
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <span className="font-label-sm uppercase tracking-widest text-outline">
                Bước 2 · AI tự phân tích
              </span>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                ← Quay lại bước 1
              </Button>
            </div>

            <AiPrefill
              data={aiData}
              error={aiError}
              loading={analyzing}
              onRetry={runAutofill}
              onEdit={editField}
              createEvidence={draft.createEvidence}
              onCreateEvidenceChange={(v) => setDraft((prev) => ({ ...prev, createEvidence: v }))}
            />

            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <a href="/log/history" className="font-label-md text-primary hover:underline">
                Xem lịch sử →
              </a>
              <Button
                variant="primary"
                size="md"
                icon="bolt"
                onClick={submit}
                loading={saving}
                disabled={saving}
                data-testid="quicklog-submit-step2"
              >
                Ghi nhanh ngay
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Export để test dùng key bản nháp. */
export { DRAFT_KEY };
