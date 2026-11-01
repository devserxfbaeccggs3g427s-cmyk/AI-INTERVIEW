"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { QuestionCard } from "@/components/test/question-card";
import { cn } from "@/lib/cn";
import type { Lang, ScoredItem, TestType } from "@/lib/test";

export interface TestSessionRunnerProps {
  test: {
    id: string;
    lang: Lang;
    testType: TestType;
    topic: string | null;
    level: string;
    totalCount: number;
    timerSec: number | null;
  };
  initialItems: ScoredItem[];
}

interface AnswerResponse {
  ok: boolean;
  data?: {
    saved: boolean;
    index: number;
    isCorrect: boolean | null;
    correctAnswer?: string;
    explanation?: string;
    pendingAi?: boolean;
  };
  message?: string;
}

/**
 * S20 — Làm bài.
 *
 * ⚠️ FR-LT-15: ghi **từng câu** ngay khi có đáp án ⇒ đóng tab không mất dữ liệu.
 * ⚠️ FR-LT-16: quay lại câu đã trả lời để sửa ⇒ ghi đè.
 * ⚠️ FR-LT-17: cờ `F` ⇒ câu đó **không** bị đẩy thẻ về ôn.
 * ⚠️ Timer hết giờ ⇒ tự nộp **đúng 1 lần** (`reason: "timeout"`).
 */
export function TestSessionRunner({ test, initialItems }: TestSessionRunnerProps) {
  const router = useRouter();

  const [items, setItems] = useState<ScoredItem[]>(initialItems);
  const [currentIndex, setCurrentIndex] = useState(() => firstUnansweredIndex(initialItems));
  const [remainingSec, setRemainingSec] = useState(test.timerSec ?? 0);
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [gradingIndexes, setGradingIndexes] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const submittedRef = useRef(false);
  const startedAtRef = useRef(Date.now());
  const questionEnteredAtRef = useRef(Date.now());

  const current = items[currentIndex] ?? null;
  const answeredCount = items.filter(
    (item) => item.userAnswer !== null && item.userAnswer.trim() !== "",
  ).length;

  /* ── Chấm nền bằng AI (AI-15) ─────────────────────────────────────── */
  const gradeOpen = useCallback(
    async (index: number) => {
      setGradingIndexes((prev) => new Set(prev).add(index));
      try {
        const res = await fetch("/api/test/grade-open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId: test.id, index }),
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { rubric: unknown; score: number; isCorrect: boolean; feedback: string };
          message?: string;
        };

        if (!body.ok || !body.data) {
          setError(body.message ?? "Chưa chấm được câu này — thử lại.");
          return;
        }

        setItems((prev) =>
          prev.map((item, i) =>
            i === index
              ? {
                  ...item,
                  rubric: body.data?.rubric as ScoredItem["rubric"],
                  isCorrect: body.data?.isCorrect ?? null,
                  notes: body.data?.feedback ?? null,
                  scored: true,
                }
              : item,
          ),
        );
      } catch {
        setError("Chưa chấm được câu này — thử lại.");
      } finally {
        setGradingIndexes((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    },
    [test.id],
  );

  /* ── Lưu đáp án ───────────────────────────────────────────────────── */
  const saveAnswer = useCallback(
    async (index: number, userAnswer: string, flagged?: boolean) => {
      const seconds = Math.max(
        0,
        Math.round((Date.now() - questionEnteredAtRef.current) / 1000),
      );

      // Cập nhật optimistic để UI phản hồi tức thì.
      setItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                userAnswer,
                flagged: flagged ?? item.flagged,
              }
            : item,
        ),
      );

      try {
        const res = await fetch("/api/test/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testId: test.id,
            index,
            userAnswer,
            seconds,
            ...(flagged === undefined ? {} : { flagged }),
          }),
        });

        const body = (await res.json()) as AnswerResponse;
        if (!body.ok || !body.data) {
          setError(body.message ?? "Không lưu được câu trả lời — thử lại.");
          return;
        }

        setSavedAt(new Date().toLocaleTimeString("vi-VN"));
        setError(null);

        const isOpen = current?.itemType === "writing" || current?.itemType === "translation";
        if (isOpen && body.data.pendingAi) {
          void gradeOpen(index);
        } else {
          setItems((prev) =>
            prev.map((item, i) =>
              i === index
                ? {
                    ...item,
                    isCorrect: body.data?.isCorrect ?? null,
                    explanation: body.data?.explanation ?? null,
                    scored: true,
                  }
                : item,
            ),
          );
        }
      } catch {
        setError("Không lưu được câu trả lời — thử lại.");
      }
    },
    [current?.itemType, gradeOpen, test.id],
  );

  /* ── Nộp bài ──────────────────────────────────────────────────────── */
  const submit = useCallback(
    async (reason: "manual" | "timeout") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);

      try {
        const res = await fetch("/api/test/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId: test.id, reason }),
        });
        const body = (await res.json()) as { ok: boolean; message?: string };

        if (!body.ok) {
          setError(body.message ?? "Không nộp được bài — thử lại.");
          submittedRef.current = false;
          setSubmitting(false);
          return;
        }

        router.push(`/test/${test.id}`);
      } catch {
        setError("Không nộp được bài — thử lại.");
        submittedRef.current = false;
        setSubmitting(false);
      }
    },
    [router, test.id],
  );

  /* ── Timer ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (test.timerSec === null || paused || submitting) return;

    const timer = setInterval(() => {
      setRemainingSec((value) => {
        if (value <= 1) {
          clearInterval(timer);
          void submit("timeout");
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [test.timerSec, paused, submitting, submit]);

  /* ── Phím tắt ─────────────────────────────────────────────────────── */
  const goNext = useCallback(() => {
    setCurrentIndex((index) => Math.min(index + 1, items.length - 1));
    questionEnteredAtRef.current = Date.now();
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
    questionEnteredAtRef.current = Date.now();
  }, []);

  const toggleFlag = useCallback(() => {
    if (!current) return;
    void saveAnswer(current.index, current.userAnswer ?? "", true);
  }, [current, saveAnswer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (submitting) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (!typing && event.key >= "1" && event.key <= "4" && current?.options) {
        const option = current.options[Number(event.key) - 1];
        if (option !== undefined) {
          event.preventDefault();
          void saveAnswer(current.index, option, false);
          return;
        }
      }

      if (event.key.toLowerCase() === "p" && !typing) {
        event.preventDefault();
        goPrev();
        return;
      }

      if (event.key.toLowerCase() === "f" && !typing) {
        event.preventDefault();
        toggleFlag();
        return;
      }

      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, goNext, goPrev, submit, submitting, toggleFlag, saveAnswer]);

  const elapsedTotal = Math.round((Date.now() - startedAtRef.current) / 1000);

  const progressSegments = useMemo(() => {
    return items.map((item, index) => {
      const answered = item.userAnswer !== null && item.userAnswer.trim() !== "";
      if (index === currentIndex) return "bg-tertiary";
      return answered ? "bg-primary" : "bg-surface-container-high";
    });
  }, [items, currentIndex]);

  return (
    <div className="space-y-gutter-lg">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-space-md">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="rounded bg-primary/10 px-2 py-1 font-label-sm text-label-sm text-primary">
            Level {test.level}
          </span>
          <span className="rounded bg-surface-container px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
            {test.testType === "benchmark" ? "Đề chuẩn" : test.testType}
          </span>
          <span className="rounded bg-surface-container px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
            <Icon name="sync" size={12} /> đồng bộ
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <h1 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            {buildTitle(test)}
          </h1>

          <div className="flex items-center gap-space-sm">
            {test.timerSec !== null && (
              <div
                aria-live="polite"
                aria-label="Thời gian còn lại"
                className={cn(
                  "rounded-lg bg-surface-container-lowest px-3 py-2 font-code-md text-code-md font-semibold tabular",
                  remainingSec <= 60 ? "text-error" : "text-on-surface",
                )}
              >
                <Icon name="timer" size={16} className="mr-1 text-tertiary" />
                {formatClock(remainingSec)}
              </div>
            )}

            {test.timerSec !== null && (
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-pressed={paused}
                className="rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name={paused ? "play_arrow" : "pause"} size={16} />
                {paused ? "Tiếp tục" : "Tạm dừng"}
              </button>
            )}

            <button
              type="button"
              onClick={() => void submit("manual")}
              disabled={submitting}
              className="rounded-lg bg-primary-container px-3 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              <Icon name="fact_check" size={16} />
              {submitting ? "Đang nộp…" : "Nộp bài sớm"}
            </button>
          </div>
        </div>

        {test.timerSec !== null && remainingSec <= 60 && remainingSec > 0 && (
          <p
            role="status"
            className="bg-error/10 text-error rounded-lg p-space-md font-body-sm text-body-sm"
          >
            Còn 1 phút
          </p>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="bg-error/10 text-error rounded-lg p-space-md font-body-sm text-body-sm"
        >
          {error}
        </p>
      )}

      {/* ── Progress rail ──────────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <div className="flex h-2 gap-1 overflow-hidden rounded bg-surface-container-lowest p-0.5">
          {progressSegments.map((segment, index) => (
            <span
              key={index}
              className={cn("h-full flex-1 rounded-sm", segment)}
              aria-hidden="true"
            />
          ))}
        </div>
        <p className="mt-space-sm font-label-sm text-label-sm text-outline">
          {answeredCount} đã làm · 1 đang làm · {items.length - answeredCount} chưa
          trả lời
        </p>
      </section>

      {/* ── Ô câu hỏi ──────────────────────────────────────────────────── */}
      {current && (
        <section className="bg-surface-container-lowest p-space-lg rounded-xl">
          <QuestionCard
            item={current}
            index={currentIndex}
            lang={test.lang}
            value={current.userAnswer}
            flagged={current.flagged}
            disabled={submitting}
            onChange={(value) => void saveAnswer(current.index, value, false)}
            onToggleFlag={() => void toggleFlag()}
          />

          {gradingIndexes.has(currentIndex) && (
            <p
              aria-live="polite"
              className="mt-space-md font-label-md text-label-md text-secondary"
            >
              <Icon name="neurology" size={16} className="mr-1" /> AI đang chấm…
            </p>
          )}

          {current.notes && !gradingIndexes.has(currentIndex) && (
            <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
              {current.notes}
            </p>
          )}
        </section>
      )}

      {/* ── Điều hướng ─────────────────────────────────────────────────── */}
      <nav
        aria-label="Điều hướng câu hỏi"
        className="flex flex-wrap items-center gap-space-sm"
      >
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="rounded-lg bg-surface-container px-3 py-2 font-label-md text-label-md text-on-surface transition hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <Icon name="arrow_back" size={16} /> Câu trước [P]
        </button>

        <button
          type="button"
          onClick={toggleFlag}
          className="rounded-lg bg-tertiary-container/20 px-3 py-2 font-label-md text-label-md text-tertiary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="flag" size={16} /> Bỏ qua / đánh dấu [F]
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex >= items.length - 1}
          className="rounded-lg bg-primary px-3 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          Câu tiếp theo [Ctrl+Enter] <Icon name="arrow_forward" size={16} />
        </button>
      </nav>

      {/* ── Ma trận câu hỏi ────────────────────────────────────────────── */}
      <section className="bg-surface-container p-space-lg rounded-xl">
        <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Ma trận câu hỏi
        </h2>
        <ol className="mt-space-sm grid grid-cols-8 gap-1 overflow-x-auto">
          {items.map((item, index) => {
            const answered = item.userAnswer !== null && item.userAnswer.trim() !== "";
            const isCurrent = index === currentIndex;
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentIndex(index);
                    questionEnteredAtRef.current = Date.now();
                  }}
                  aria-label={`Câu ${index + 1}`}
                  aria-current={isCurrent ? "true" : undefined}
                  className={cn(
                    "relative flex aspect-square w-full items-center justify-center rounded font-code-md text-code-md tabular transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isCurrent
                      ? "bg-tertiary text-on-tertiary"
                      : answered
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {index + 1}
                  {item.flagged && (
                    <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-error" />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Panel quy tắc FSRS + phím tắt + dự phóng ──────────────────── */}
      <section className="grid grid-cols-1 gap-gutter-md lg:grid-cols-3">
        <div className="bg-surface-container-low p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            <Icon name="sync_saved_locally" size={18} className="mr-1 text-secondary" />
            Quy tắc FSRS SRS tự động
          </h2>
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
            Câu sai sẽ bị đẩy về ôn hôm nay khi bạn nộp bài: hạ stability, tăng
            lapses, đến hạn ngay. Câu bỏ trống hoặc câu bạn chủ động gắn cờ không
            tính là bằng chứng quên.
          </p>
        </div>

        <div className="bg-surface-container-low p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Phím tắt nhanh
          </h2>
          <ul className="mt-space-sm space-y-space-xs font-body-sm text-body-sm text-on-surface-variant">
            {[
              ["1", "–", "4", "Chọn đáp án"],
              ["P", "", "Câu trước"],
              ["F", "", "Gắn cờ"],
              ["Ctrl", "+", "Enter", "Câu tiếp theo"],
              ["Space", "", "Nghe phát âm"],
            ].map(([a, sep, b, label]) => (
              <li key={label} className="flex items-center gap-space-sm">
                <kbd className="rounded bg-surface-container-high px-1.5 py-0.5 font-code-md text-code-md">
                  {a}
                </kbd>
                {sep && <span>{sep}</span>}
                {b && (
                  <kbd className="rounded bg-surface-container-high px-1.5 py-0.5 font-code-md text-code-md">
                    {b}
                  </kbd>
                )}
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface-container-low p-space-lg rounded-xl">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Độ ổn định dự phóng
          </h2>
          <p className="mt-space-sm font-headline-sm text-headline-sm text-on-surface">
            {answeredCount > 0
              ? `${Math.round((answeredCount / Math.max(1, items.length)) * 100)}%`
              : "—"}
          </p>
          <p className="mt-1 font-label-sm text-label-sm text-outline">
            {answeredCount}/{items.length} câu đã trả lời
          </p>
          <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
            Tốc độ trung bình:{" "}
            {computeAvgSeconds(items) !== null
              ? `${computeAvgSeconds(items)} s/câu`
              : "—"}
          </p>
          {savedAt && (
            <p className="mt-space-sm font-label-sm text-label-sm text-primary">
              Đã lưu vào SQLite lúc {savedAt} (Zero Data Loss)
            </p>
          )}
          <p className="mt-space-sm font-label-sm text-label-sm text-outline">
            Tổng thời gian: {formatClock(elapsedTotal)}
          </p>
        </div>
      </section>
    </div>
  );
}

/** Câu đầu tiên chưa trả lời — khôi phục phiên (FR-LT-15). */
export function firstUnansweredIndex(items: ScoredItem[]): number {
  const index = items.findIndex(
    (item) => item.userAnswer === null || item.userAnswer.trim() === "",
  );
  return index === -1 ? Math.max(0, items.length - 1) : index;
}

function buildTitle(test: TestSessionRunnerProps["test"]): string {
  const labels: Record<TestType, string> = {
    placement: "Bài Kiểm Tra Định Vị",
    topic: "Bài Kiểm Tra Theo Chủ Đề",
    benchmark: "Bài Kiểm Tra Chuẩn",
    from_content: "Kiểm Tra Từ Nội Dung Thực Tế",
  };
  return `${labels[test.testType]}${test.topic ? ` — ${test.topic}` : ""}`;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function computeAvgSeconds(items: ScoredItem[]): number | null {
  const times = items
    .map((item) => item.seconds)
    .filter((value): value is number => typeof value === "number");
  if (times.length === 0) return null;
  return Math.round(times.reduce((sum, value) => sum + value, 0) / times.length);
}
