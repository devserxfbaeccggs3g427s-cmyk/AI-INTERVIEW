"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { QuestionCard } from "@/components/interview/QuestionCard";
import { ResponsePanel } from "@/components/interview/ResponsePanel";
import { SessionProgress } from "@/components/interview/SessionProgress";
import { RubricScoreCompact } from "@/components/rubric/RubricScoreCompact";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface TurnData {
  index: number;
  question: string;
  kind: string;
  skillName?: string | null;
  answer?: string;
  scores?: Record<string, { score: number; note?: string }>;
  total?: number;
  feedback?: string;
  nextQuestion?: string;
}

interface SessionData {
  id: string;
  profileId: string;
  plannedCount: number;
  askedCount: number;
  status: string;
  totalScore?: number;
  turns: TurnData[];
}

export default function InterviewSessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [timePerQuestion, setTimePerQuestion] = useState(300);
  const [error, setError] = useState<string | null>(null);

  // Fetch session data
  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch(`/api/interview/session/${sessionId}`);
      if (!response.ok) throw new Error("Không tải được phiên");
      const data = await response.json();
      if (data.ok) {
        setSession(data.data);
        setCurrentTurnIndex(data.data.turns.length - 1);
        setTimePerQuestion(data.data.timePerQuestion || 300);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Poll for updates (when AI generates next question)
  useEffect(() => {
    if (isComplete || isSubmitting) return;
    const interval = setInterval(() => {
      fetchSession();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchSession, isComplete, isSubmitting]);

  const currentTurn = session?.turns[currentTurnIndex];
  const isLastQuestion = currentTurnIndex >= (session?.plannedCount || 0) - 1;
  const allAnswered = session?.turns.every((t) => t.answer) ?? false;

  const handleSubmit = async (answer: string) => {
    if (!currentTurn || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/interview/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          turnIndex: currentTurnIndex,
          answer,
        }),
      });

      const data = await response.json();
      if (!data.ok) throw new Error(data.error?.message || "Lỗi chấm điểm");

      // Refresh session to get updated turn with scores
      await fetchSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = async () => {
    if (currentTurnIndex < (session?.turns.length || 0) - 1) {
      setCurrentTurnIndex((prev) => prev + 1);
    } else if (!isLastQuestion) {
      // Need to generate next question - but turn API should handle this
      // For now, just wait for poll to pick up new turn
    } else {
      // Session complete
      setIsComplete(true);
      router.push(`/interview/demo-session/${sessionId}`);
    }
  };

  const handleFlagQuestion = () => {
    // TODO: Log flag
    alert("Đã ghi nhận báo cáo câu hỏi. Cảm ơn!");
  };

  if (error && !session) {
    return (
      <div className="max-w-2xl mx-auto p-gutter-lg text-center">
        <h1 className="font-headline-lg text-error mb-gutter">Lỗi</h1>
        <p className="text-on-surface-variant mb-gutter">{error}</p>
        <Button onClick={() => router.push("/interview/setup")}>Quay lại cấu hình</Button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto p-gutter-lg text-center">
        <div className="animate-pulse">Đang tải phiên phỏng vấn...</div>
      </div>
    );
  }

  if (isComplete || (allAnswered && isLastQuestion)) {
    return (
      <div className="max-w-2xl mx-auto p-gutter-lg text-center">
        <div className="space-y-gutter">
          <span className="material-symbols-rounded text-6xl text-primary">check_circle</span>
          <h1 className="font-headline-lg text-on-surface">Hoàn tất phỏng vấn!</h1>
          <p className="text-on-surface-variant">
            Bạn đã trả lời tất cả {session.plannedCount} câu hỏi.
          </p>
          <Button size="lg" onClick={() => router.push(`/interview/demo-session/${sessionId}`)}>
            Xem kết quả
          </Button>
        </div>
      </div>
    );
  }

  const progressScores = currentTurn?.scores
    ? { [currentTurn.kind]: currentTurn.scores }
    : undefined;

  return (
    <div className="max-w-4xl mx-auto p-gutter-lg space-y-gutter-lg">
      <PageHeader
        eyebrow="Mock Interview · AI-12"
        title="Phiên phỏng vấn"
        description={`Hồ sơ: ${session.profileId} · Câu ${currentTurnIndex + 1} / ${session.plannedCount}`}
      />

      <div className="grid gap-gutter-lg lg:grid-cols-12">
        {/* Main column */}
        <div className="lg:col-span-8 space-y-gutter-lg">
          {currentTurn && (
            <QuestionCard
              index={currentTurnIndex}
              total={session.plannedCount}
              question={currentTurn.question}
              kind={currentTurn.kind}
              skillName={currentTurn.skillName}
              onFlag={handleFlagQuestion}
            />
          )}

          {currentTurn && !currentTurn.answer ? (
            <ResponsePanel
              onSubmit={handleSubmit}
              disabled={isSubmitting}
              timeRemaining={timePerQuestion}
              placeholder="Nhập câu trả lời... (Enter để gửi, Shift+Enter để xuống dòng)"
            />
          ) : currentTurn && currentTurn.answer ? (
            <Card className="space-y-gutter">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-on-surface">Câu trả lời của bạn</h3>
                <span className="font-label-md text-primary">Đã gửi</span>
              </div>
              <div className="p-gutter bg-surface-container-highest rounded-xl whitespace-pre-wrap text-body-md text-on-surface">
                {currentTurn.answer}
              </div>

              {currentTurn.scores && (
                <RubricScoreCompact
                  scores={currentTurn.scores}
                  rubricType={
                    currentTurn.kind === "behavioral"
                      ? "communication"
                      : "technical"
                  }
                  showNotes
                />
              )}

              {currentTurn.feedback && (
                <div className="p-gutter bg-tertiary-container/20 rounded-xl border border-tertiary/20">
                  <h4 className="font-label-md text-tertiary mb-space-sm">Nhận xét AI</h4>
                  <p className="text-body-sm text-on-surface-variant">{currentTurn.feedback}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={handleNextQuestion}
                  disabled={isSubmitting}
                  className="min-w-[160px]"
                >
                  {isLastQuestion ? "Hoàn tất & Xem kết quả" : "Câu tiếp theo"}
                </Button>
              </div>
            </Card>
          ) : null}

          {/* Previous turns summary */}
          {currentTurnIndex > 0 && (
            <details className="group">
              <summary className="font-label-md text-on-surface-variant cursor-pointer flex items-center gap-space-sm">
                <span className="material-symbols-rounded">history</span>
                Xem {currentTurnIndex} câu trước ({currentTurnIndex} / {session.plannedCount})
              </summary>
              <div className="mt-gutter space-y-gutter">
                {session.turns.slice(0, currentTurnIndex).map((turn, idx) => (
                  <Card key={turn.index} className="space-y-space-sm">
                    <div className="flex items-center gap-space-sm">
                      <span className="font-label-md text-on-surface-variant">Câu {turn.index + 1}</span>
                      <span className="px-space-sm py-space-xs bg-primary-container text-primary rounded-full text-xs font-medium">
                        {turn.kind}
                      </span>
                    </div>
                    <p className="text-body-md text-on-surface">{turn.question}</p>
                    <p className="text-body-sm text-on-surface-variant italic">"{(turn.answer || "").slice(0, 150)}..."</p>
                    {turn.scores && (
                      <RubricScoreCompact
                        scores={turn.scores}
                        rubricType={
                          turn.kind === "behavioral"
                            ? "communication"
                            : "technical"
                        }
                        compact
                      />
                    )}
                  </Card>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Sidebar - Progress */}
        <div className="lg:col-span-4">
          <SessionProgress
            currentIndex={currentTurnIndex}
            totalQuestions={session.plannedCount}
            timeRemaining={timePerQuestion}
            totalTime={timePerQuestion}
            scores={currentTurn?.scores}
            rubricType={
              currentTurn?.kind === "behavioral"
                ? "communication"
                : "technical"
            }
          />
        </div>
      </div>
    </div>
  );
}