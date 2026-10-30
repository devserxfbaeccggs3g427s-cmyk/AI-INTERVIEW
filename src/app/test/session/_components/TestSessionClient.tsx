/**
 * S20 — Client Component cho trang làm bài kiểm tra (task 14.6, 14.7, 14.8, 14.9, 14.10).
 *
 * Có state tương tác (trả lời, timer, matrix).
 * Nhận `testId` từ URL params → fetch TestSession + items từ API.
 *
 * Tách khỏi `page.tsx` vì `useSearchParams()` bắt buộc phải nằm trong
 * `<Suspense>` — page file là Server Component nên bọc ở đó.
 *
 * Xem tasks.md 14.6 / 14.7 / 14.8 / 14.9 · design.md §4.19 / S20.
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { ItemRenderer, type TestItemRenderProps } from "@/components/test/ItemRenderer";
import { QuestionMatrix, QuestionMatrixLegend } from "@/components/test/QuestionMatrix";
import { CardHeader, Label } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { ItemType } from "@/lib/test-types";

export interface SessionItem {
  index: number;
  itemType: ItemType;
  prompt: string;
  audioText: string | null;
  options: string[] | null;
  answer: string | null;
  userAnswer: string | null;
  cardId: string | null;
  seconds: number | null;
}

export interface TestSessionData {
  testId: string;
  lang: "zh" | "en";
  testType: string;
  items: SessionItem[];
  hasTimer: boolean;
  timeLimitSec?: number; // cho benchmark + from_content
}

export function TestSessionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = searchParams.get("testId");
  const { toast } = useToast();

  const [testData, setTestData] = useState<TestSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Thời gian đã dùng cho câu hiện tại (task 14.8 — `durationSec` + `TestItem.seconds`).
   *
   * `questionStartedAt` = mốc thời gian câu hiện tại bắt đầu được nhìn.
   * Khi trả lời → `elapsedForCurrent()` = (giờ hiện tại - mốc) / 1000 → gửi lên API.
   * Khi chuyển câu → reset mốc về `now`.
   */
  const questionStartedAt = useRef<number>(Date.now());
  const elapsedForCurrent = useCallback(() => {
    return Math.max(0, Math.round((Date.now() - questionStartedAt.current) / 1000));
  }, []);

  /** Thời gian đã dùng (giây) của từng câu — nguồn cho `TestItem.seconds`. */
  const durationsRef = useRef<Record<number, number>>({});

  // Reset mốc thời gian khi đổi câu.
  useEffect(() => {
    questionStartedAt.current = Date.now();
  }, [currentIndex]);

  // Fetch test session data
  useEffect(() => {
    const fetchData = async () => {
      if (!testId) {
        router.push("/test");
        return;
      }

      try {
        const res = await fetch(`/api/test/session/${testId}`);
        const result = await res.json();

        if (!result.ok) {
          throw new Error(result.error?.message ?? "Không thể tải bài kiểm tra");
        }

        const data: TestSessionData = result.data;
        setTestData(data);

        // Khởi tạo timer nếu có
        if (data.hasTimer && data.timeLimitSec) {
          setTimeLeft(data.timeLimitSec);
        }

        // Khởi tạo answers từ userAnswer đã lưu
        const saved: Record<number, string> = {};
        for (const item of data.items) {
          if (item.userAnswer) {
            saved[item.index] = item.userAnswer;
          }
        }
        setAnswers(saved);
      } catch (err) {
        const error = err as Error;
        toast({ title: "Lỗi", description: error.message, tone: "error" });
        router.push("/test");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [testId, router, toast]);

  // Timer effect
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, testData]);

  // Format time mm:ss
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Handle answer change + persist
  const handleAnswerChange = useCallback(
    (index: number, value: string) => {
      setAnswers((prev) => ({ ...prev, [index]: value }));

      const seconds = elapsedForCurrent();
      // Nhớ thời gian đã dùng của câu này để khi nộp bài gửi đúng số liệu.
      durationsRef.current[index] = seconds;

      // Persist ngay lập tức (task 14.9) + thời gian thực tế đã dùng (task 14.8).
      fetch("/api/test/answer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: testData?.testId ?? "",
          index,
          userAnswer: value,
          seconds,
        }),
      }).catch(() => {});
    },
    [testData?.testId, elapsedForCurrent],
  );

  // Navigate to question
  const handleNavigate = (index: number) => {
    if (testData) {
      setCurrentIndex(Math.max(0, Math.min(index, testData.items.length - 1)));
    }
  };

  // Select option (task 14.7)
  const handleSelectOption = useCallback(
    (index: number, optionIndex: number) => {
      if (!testData) return;
      const item = testData.items[index];
      if (item && item.options && optionIndex < item.options.length) {
        const optionValue = item.options[optionIndex];
        handleAnswerChange(index, optionValue ?? "");
      }
    },
    [testData, handleAnswerChange],
  );

  // Enter — xác nhận câu hiện tại (task 14.7).
  // Câu đã trả lời → chuyển câu; chưa trả lời → nhắc người dùng.
  const handleConfirm = useCallback(() => {
    if (answers[currentIndex] === undefined) {
      toast({
        title: "Chưa có đáp án",
        description: "Hãy chọn hoặc nhập đáp án trước khi xác nhận.",
        tone: "error",
      });
      return;
    }
    const next = Math.min(currentIndex + 1, (testData?.items.length ?? 1) - 1);
    setCurrentIndex(next);
  }, [answers, currentIndex, testData, toast]);

  // Submit test
  const handleSubmit = async () => {
    if (!testData) return;
    setIsSubmitting(true);

    try {
      const answersArray = Object.entries(answers).map(([index, userAnswer]) => {
        const idx = parseInt(index, 10);
        return {
          index: idx,
          userAnswer,
          // Thời gian đo thực tế trong phiên (task 14.8); fallback về giá trị đã lưu.
          seconds: durationsRef.current[idx] ?? testData.items[idx]?.seconds ?? 0,
        };
      });

      const res = await fetch("/api/test/grade-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: testData.testId,
          answers: answersArray,
        }),
      });

      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error?.message ?? "Không thể chấm bài");
      }

      // Hoàn tất bài → tạo Activity + Evidence (task 14.19).
      // Không chặn luồng: lỗi finish vẫn cho người dùng xem kết quả.
      try {
        await fetch("/api/test/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testId: testData.testId,
            totalScore: result.data.totalScore,
            maxScore: result.data.maxScore ?? testData.items.length,
            durationSec: result.data.durationSec ?? 0,
          }),
        });
      } catch {
        // Bỏ qua — trang kết quả vẫn dùng được.
      }

      toast({
        title: "Bài kiểm tra đã nộp",
        description: result.data.message,
        tone: "success",
      });

      // Chuyển đến trang kết quả (S21)
      router.push(`/test/${testData.testId}`);
    } catch (err) {
      const error = err as Error;
      toast({ title: "Lỗi", description: error.message, tone: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols animate-spin">autorenew</span>
        <span className="ml-2">Đang tải bài kiểm tra...</span>
      </div>
    );
  }

  if (!testData) {
    return null;
  }

  const currentItem = testData.items[currentIndex];
  if (!currentItem) {
    return null;
  }

  const answeredCount = Object.keys(answers).length;
  const item: TestItemRenderProps = {
    index: currentItem.index,
    itemType: currentItem.itemType,
    prompt: currentItem.prompt,
    audioText: currentItem.audioText,
    options: currentItem.options,
    answer: currentItem.answer,
    userAnswer: currentItem.userAnswer,
    seconds: currentItem.seconds,
  };

  return (
    <div className="space-y-gutter-lg">
      {/* Header: tiêu đề + timer */}
      <div className="flex items-center justify-between">
        <CardHeader
          title={`Bài kiểm tra ${testData.lang === "zh" ? "Tiếng Trung" : "Tiếng Anh"}`}
          subtitle={`Câu ${currentIndex + 1}/${testData.items.length} · ${answeredCount} đã trả lời`}
        />
        {timeLeft !== null && (
          <div
            className={cn(
              "font-headline-md font-bold",
              timeLeft <= 60 ? "text-error" : "text-on-surface",
            )}
          >
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Item renderer */}
      <Card className="p-gutter">
        <ItemRenderer
          item={item}
          value={answers[currentIndex] ?? ""}
          onChange={(val) => handleAnswerChange(currentIndex, val)}
          onPlayAudio={() => {
            // TTS play — task 14.8
            if ("speechSynthesis" in window && item.audioText) {
              const utterance = new SpeechSynthesisUtterance(item.audioText);
              utterance.lang = testData.lang === "zh" ? "zh-CN" : "en-US";
              speechSynthesis.speak(utterance);
            }
          }}
          disabled={isSubmitting}
        />
      </Card>

      {/* Navigation + Matrix */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            icon="arrow_back"
            onClick={() => handleNavigate(currentIndex - 1)}
            disabled={currentIndex === 0 || isSubmitting}
          >
            Trước
          </Button>
          <Button
            variant="ghost"
            icon="arrow_forward"
            onClick={() => handleNavigate(currentIndex + 1)}
            disabled={currentIndex >= testData.items.length - 1 || isSubmitting}
          >
            Sau
          </Button>
        </div>

        <Button
          variant="primary"
          icon="done"
          onClick={handleSubmit}
          loading={isSubmitting}
        >
          Nộp bài
        </Button>
      </div>

      {/* Question Matrix */}
      <div className="rounded-lg bg-surface-container p-gutter">
        <div className="flex items-center justify-between mb-3">
          <Label>Sơ đồ câu hỏi</Label>
          <span className="font-label-sm text-on-surface-variant">
            {answeredCount}/{testData.items.length} đã trả lời
          </span>
        </div>
        <QuestionMatrix
          itemCount={testData.items.length}
          currentIndex={currentIndex}
          answeredIndices={Object.keys(answers).map(Number)}
          cols={8}
          onNavigate={handleNavigate}
          onSelectOption={handleSelectOption}
          onConfirm={handleConfirm}
        />
        <div className="mt-4">
          <QuestionMatrixLegend />
        </div>
      </div>
    </div>
  );
}