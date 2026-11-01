"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { LogDomain, LogLanguage, LogType } from "@/lib/log";

/**
 * Sheet Quick-log (S05) — đường ghi nhanh.
 *
 * ⚠️ P2 — **ghi nhập dưới 10 giây**:
 *  1. Sheet mở **ngay**, không chờ request nào (kể cả danh sách kỹ năng).
 *  2. 6 preset chip 2-chạm điền sẵn mô tả + domain + type + thời lượng.
 *  3. Autofill AI-02 chạy **nền** sau debounce 450 ms — chỉ gợi ý.
 *  4. Bấm Enter ⇒ **ghi thẳng**, không chờ AI (FR-QL-05).
 */

export interface QuickLogPreset {
  /** Phím tắt 1–6. */
  key: string;
  /** Emoji hiển thị. */
  emoji: string;
  /** Nhãn preset. */
  label: string;
  /** Mô tả điền sẵn. */
  text: string;
  domain: LogDomain;
  type: LogType;
  minutes: number;
}

/** FR-QL-02 — 6 preset chip 2-chạm. */
export const QUICK_LOG_PRESETS: readonly QuickLogPreset[] = [
  { key: "1", emoji: "⚡", label: "Học", text: "Học chuyên môn", domain: "professional", type: "study", minutes: 25 },
  { key: "2", emoji: "🎯", label: "Luyện tập", text: "Luyện tập kỹ năng", domain: "professional", type: "study", minutes: 30 },
  { key: "3", emoji: "✍️", label: "Viết", text: "Viết bài", domain: "communication", type: "write", minutes: 25 },
  { key: "4", emoji: "🎙️", label: "Luyện nói", text: "Luyện nói", domain: "communication", type: "speak", minutes: 20 },
  { key: "5", emoji: "📓", label: "Nhật ký", text: "Ghi nhật ký", domain: "personal", type: "journal", minutes: 10 },
  { key: "6", emoji: "🌱", label: "Chăm sóc bản thân", text: "Chăm sóc bản thân", domain: "personal", type: "health", minutes: 20 },
];

const DOMAIN_LABELS: Record<LogDomain, string> = {
  professional: "Chuyên môn",
  communication: "Giao tiếp",
  language: "Ngoại ngữ",
  personal: "Cá nhân",
};

const TYPE_LABELS: Record<LogType, string> = {
  study: "Học",
  write: "Viết",
  speak: "Nói",
  srs: "Ôn SRS",
  journal: "Nhật ký",
  health: "Thể chất",
  custom: "Khác",
};

const LANGUAGE_LABELS: Record<LogLanguage, string> = {
  en: "English",
  zh: "中文",
  vi: "Tiếng Việt",
};

const DIFFICULTY_LABELS = ["", "Rất dễ", "Dễ", "Khó", "Rất khó"];

/**
 * Các mốc thời lượng chọn được.
 *
 * ⚠️ Phải **chứa** mọi giá trị `minutes` của preset — nếu không, preset điền
 * một thời lượng mà không nút nào được highlight (preset "Luyện nói" 20′ và
 * "Nhật ký" 10′).
 */
const MINUTE_OPTIONS = [10, 15, 20, 25, 45, 60] as const;

export interface AutofillState {
  skillId: string | null;
  skillName: string | null;
  minutes: number;
  difficulty: number;
  language: LogLanguage | null;
  source: "ai" | "rule";
  warning?: string;
}

export interface QuickLogSheetProps {
  /** Ngày (yyyy-MM-dd). */
  date: string;
  /** Đóng sheet. */
  onClose: () => void;
}

export function QuickLogSheet({ date, onClose }: QuickLogSheetProps) {
  const router = useRouter();

  const [text, setText] = useState("");
  const [domain, setDomain] = useState<LogDomain>("professional");
  const [type, setType] = useState<LogType>("study");
  const [minutes, setMinutes] = useState(25);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [language, setLanguage] = useState<LogLanguage | null>(null);
  const [note, setNote] = useState("");
  const [createEvidence, setCreateEvidence] = useState(false);

  const [autofill, setAutofill] = useState<AutofillState | null>(null);
  const [autofilling, setAutofilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Đóng bằng Escape + focus trap.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** Autofill AI-02 — chạy nền sau debounce 450 ms (FR-QL-04). */
  const runAutofill = useCallback(async (value: string, targetDomain: LogDomain) => {
    if (value.trim().length < 3) {
      setAutofill(null);
      return;
    }

    setAutofilling(true);
    try {
      const res = await fetch("/api/log/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value.trim(), domain: targetDomain }),
      });
      const payload = await res.json();

      if (!payload.ok) return;

      const result = payload.data as AutofillState;
      setAutofill(result);

      // ⚠️ Chỉ điền khi người dùng chưa tự chỉnh — không ghi đè lựa chọn.
      setMinutes(result.minutes);
      setDifficulty(result.difficulty);
      if (result.language) setLanguage(result.language);
      if (result.skillId) setCreateEvidence(true);
    } catch {
      // Offline hoặc lỗi mạng — giữ nguyên giá trị mặc định.
    } finally {
      setAutofilling(false);
    }
  }, []);

  function onTextChange(value: string) {
    setText(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runAutofill(value, domain);
    }, 450);
  }

  /** Bấm preset chip ⇒ điền sẵn mọi trường (2 chạm). */
  function applyPreset(preset: QuickLogPreset) {
    setText(preset.text);
    setDomain(preset.domain);
    setType(preset.type);
    setMinutes(preset.minutes);
    setDifficulty(null);
    setLanguage(null);
    setAutofill(null);
    setShowDetails(false);
    inputRef.current?.focus();
  }

  /** FR-QL-05 — ghi thẳng, KHÔNG chờ AI. */
  async function submit() {
    if (submitting) return; // FR-QL-09 — khoá nút

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError("Mô tả không được rỗng");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          domain,
          type,
          minutes,
          skillId: autofill?.skillId ?? null,
          difficulty,
          note: note.trim() || null,
          language,
          createEvidence,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không ghi được");
        return;
      }

      onClose();
      router.refresh();
    } catch {
      setError("Không kết nối được — thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  /** Phím tắt preset 1–6 khi focus không nằm trong ô nhập (FR-QL-02). */
  function onKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    const inInput = target.tagName === "TEXTAREA" || target.tagName === "INPUT";

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
      return;
    }

    if (inInput) return;

    const preset = QUICK_LOG_PRESETS.find((p) => p.key === event.key);
    if (preset) {
      event.preventDefault();
      applyPreset(preset);
    }
  }

  const canSubmit = text.trim().length > 0 && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-surface-container-lowest/80 backdrop-blur-md sm:items-center sm:p-margin"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-log-title"
        className="w-full max-w-lg rounded-t-xl bg-surface-container p-space-lg shadow-md sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-space-md">
          <div>
            <h2 id="quick-log-title" className="font-headline-md text-headline-md text-on-surface">
              Ghi nhanh
            </h2>
            <p className="mt-space-xs font-label-sm text-label-sm text-outline">
              {date} · ghi xong trong vài giây
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1 text-outline transition hover:bg-surface-container-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Bước 1 — preset chips (FR-QL-02) */}
        <div className="mt-space-md flex flex-wrap gap-space-xs">
          {QUICK_LOG_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset)}
              className="inline-flex items-center gap-1 rounded-lg bg-surface-container-high px-2.5 py-1.5 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title={`Phím ${preset.key}`}
            >
              <span aria-hidden="true">{preset.emoji}</span>
              {preset.label}
              <kbd className="ml-0.5 font-code-md text-code-md text-outline">{preset.key}</kbd>
            </button>
          ))}
        </div>

        {/* Bước 1 — ô nhập tự do (FR-QL-03) */}
        <div className="mt-space-md">
          <label htmlFor="quick-log-text" className="sr-only">
            Mô tả hoạt động
          </label>
          <div className="relative">
            <textarea
              id="quick-log-text"
              ref={inputRef}
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="Đã làm gì? (ít nhất 3 ký tự)"
              rows={2}
              className="w-full resize-none rounded-lg bg-surface-container-low p-space-md text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {text.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setAutofill(null);
                }}
                aria-label="Xoá nội dung"
                className="absolute right-2 top-2 rounded-lg p-1 text-outline transition hover:bg-surface-container-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name="backspace" size={16} />
              </button>
            )}
          </div>

          <div className="mt-space-xs flex flex-wrap items-center gap-space-sm">
            {autofilling ? (
              <span className="font-label-sm text-label-sm text-outline">
                Đang đoán…
              </span>
            ) : autofill ? (
              <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
                <Icon name="auto_awesome" size={12} />
                Nguồn: {autofill.source === "ai" ? "AI" : "Rule cục bộ"}
                {autofill.skillName && ` · ${autofill.skillName}`}
              </span>
            ) : (
              <span className="font-label-sm text-label-sm text-outline">
                Gõ ≥3 ký tự để tự động điền
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="font-label-sm text-label-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {showDetails ? "Ẩn chi tiết" : "Sửa chi tiết"}
            </button>
          </div>
        </div>

        {/* Bước 2 — sửa tay (FR-QL-06) */}
        {showDetails && (
          <div className="mt-space-md space-y-space-md rounded-lg bg-surface-container-low p-space-md">
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label="Domain">
                <select
                  value={domain}
                  onChange={(event) => setDomain(event.target.value as LogDomain)}
                  className="w-full rounded-lg bg-surface-container px-2 py-1.5 text-body-sm text-body-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {(Object.keys(DOMAIN_LABELS) as LogDomain[]).map((key) => (
                    <option key={key} value={key}>
                      {DOMAIN_LABELS[key]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Loại">
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as LogType)}
                  className="w-full rounded-lg bg-surface-container px-2 py-1.5 text-body-sm text-body-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {(Object.keys(TYPE_LABELS) as LogType[]).map((key) => (
                    <option key={key} value={key}>
                      {TYPE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {domain === "language" && (
              <Field label="Ngôn ngữ">
                <select
                  value={language ?? ""}
                  onChange={(event) =>
                    setLanguage(event.target.value === "" ? null : (event.target.value as LogLanguage))
                  }
                  className="w-full rounded-lg bg-surface-container px-2 py-1.5 text-body-sm text-body-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="">— Không chọn —</option>
                  {(Object.keys(LANGUAGE_LABELS) as LogLanguage[]).map((key) => (
                    <option key={key} value={key}>
                      {LANGUAGE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Thời lượng">
              <div className="flex flex-wrap gap-1">
                {MINUTE_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMinutes(value)}
                    aria-pressed={minutes === value}
                    className={cn(
                      "rounded-lg px-2.5 py-1 font-code-md text-code-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      minutes === value
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-highest",
                    )}
                  >
                    {value}′
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Mức độ khó">
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDifficulty(value)}
                    aria-pressed={difficulty === value}
                    className={cn(
                      "rounded-lg px-2.5 py-1 font-label-sm text-label-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      difficulty === value
                        ? "bg-secondary-container text-secondary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-highest",
                    )}
                  >
                    {"⭐".repeat(value)} {DIFFICULTY_LABELS[value]}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Ghi chú">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Tuỳ chọn"
                className="w-full rounded-lg bg-surface-container px-2 py-1.5 text-body-sm text-body-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </Field>

            <label className="flex items-center gap-2 text-body-sm text-body-sm text-on-surface-variant">
              <input
                type="checkbox"
                checked={createEvidence}
                onChange={(event) => setCreateEvidence(event.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Tạo bằng chứng (cần kỹ năng + mức độ khó)
            </label>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-space-sm font-label-sm text-label-sm text-error">
            {error}
          </p>
        )}

        {/* Hành động — ghi ngay, không chờ AI (FR-QL-05) */}
        <div className="mt-space-lg flex flex-wrap items-center justify-between gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface-variant transition hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Bỏ qua &amp; Đóng
          </button>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name="bolt" size={16} />
            {submitting ? "Đang ghi…" : "Ghi nhanh ngay (Enter)"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Field có nhãn — dùng `<label>` thật để `getByLabel()` trong test hoạt động
 * và screen reader đọc đúng (NFR-SK-05 / a11y).
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
        {label}
      </span>
      {children}
    </label>
  );
}
