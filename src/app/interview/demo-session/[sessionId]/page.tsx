"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ScorecardMatrix } from "@/components/interview/ScorecardMatrix";
import { cn } from "@/lib/cn";

interface ReportData {
  overallScore: number;
  questionCount: number;
  kindsPresent: string[];
  matrix: Record<string, Record<string, { score: number; note?: string }>>;
  delta: Record<string, number> | null;
  strengths: Array<{
    title: string;
    evidence: string;
    criterion: string;
    kind: string;
  }>;
  weaknesses: Array<{
    title: string;
    evidence: string;
    criterion: string;
    kind: string;
    suggestion: string;
  }>;
  practicePlan: Array<{
    skill: string;
    kind: string;
    reason: string;
  }>;
  summary: string;
}

interface ActivityData {
  id: string;
  minutes: number;
  title: string;
  quality: number;
}

export default function InterviewDemoSessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [report, setReport] = useState<ReportData | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const fetchReport = async () => {
    try {
      const response = await fetch("/api/interview/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json();
      if (data.ok) {
        setReport(data.data.report);
        setActivity({ id: data.data.activityId, minutes: 0, title: "", quality: 0 });
      } else {
        throw new Error(data.error?.message || "Không thể tạo báo cáo");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  };

  // Check if report already exists (activityId on session)
  const checkExistingReport = async () => {
    try {
      const response = await fetch(`/api/interview/session/${sessionId}`);
      const data = await response.json();
      if (data.ok && data.data.totalScore !== null) {
        // Report exists, fetch it
        await fetchReport();
      }
    } catch {
      // Ignore, will generate new
    }
  };

  useEffect(() => {
    checkExistingReport();
  }, [sessionId]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setError(null);
    await fetchReport();
    setGeneratingReport(false);
  };

  const KIND_LABELS: Record<string, string> = {
    concept: "Khái niệm",
    design: "Thiết kế",
    debug: "Debug",
    tradeoff: "Đánh đổi",
    behavioral: "Hành vi",
  };

  const KIND_ICONS: Record<string, string> = {
    concept: "lightbulb",
    design: "architecture",
    debug: "bug_report",
    tradeoff: "balance",
    behavioral: "psychology",
  };

  if (loading && !report) {
    return (
      <div className="max-w-4xl mx-auto p-gutter-lg text-center">
        <div className="animate-pulse space-y-gutter">
          <div className="h-8 bg-surface-container-highest rounded w-1/2 mx-auto"></div>
          <div className="h-4 bg-surface-container-highest rounded w-1/3 mx-auto"></div>
          <div className="h-64 bg-surface-container-highest rounded"></div>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="max-w-2xl mx-auto p-gutter-lg text-center">
        <h1 className="font-headline-lg text-error mb-gutter">Lỗi</h1>
        <p className="text-on-surface-variant mb-gutter">{error}</p>
        <Button onClick={() => router.push("/interview/setup")}>Quay lại cấu hình</Button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-2xl mx-auto p-gutter-lg space-y-gutter">
        <PageHeader
          eyebrow="Mock Interview · AI-13"
          title="Mock Interview — Kết quả"
          description="Scorecard 5 tiêu chí, 3 điểm mạnh, 3 điểm yếu và đề xuất luyện tiếp."
        />
        <Card className="text-center">
          <span className="material-symbols-rounded text-6xl text-primary mb-gutter block">assessment</span>
          <h2 className="font-headline-md text-on-surface mb-space-sm">Phiên đã hoàn tất</h2>
          <p className="text-on-surface-variant mb-gutter">
            Bấm nút bên dưới để tạo báo cáo chi tiết với AI.
          </p>
          <Button size="lg" onClick={handleGenerateReport} disabled={generatingReport} className="min-w-[200px]">
            {generatingReport ? "Đang tạo báo cáo..." : "Tạo báo cáo AI"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-gutter-lg space-y-gutter-lg">
      <PageHeader
        eyebrow="Mock Interview · AI-13"
        title="Mock Interview — Báo cáo kết quả"
        description={`Tổng điểm: ${report.overallScore.toFixed(1)}/5.0 · ${report.questionCount} câu hỏi · ${report.kindsPresent.length} dạng câu`}
        actions={
          <Button variant="ghost" onClick={() => router.push("/interview/setup")}>
            Phỏng vấn lại
          </Button>
        }
      />

      {/* Overall Score Card */}
      <Card className={cn("bg-primary-container/10 border-primary/20", "space-y-gutter")}>
        <div className="flex items-center justify-between flex-wrap gap-gutter">
          <div className="space-y-space-xs">
            <p className="font-label-md text-on-surface-variant">ĐIỂM TỔNG TRUNG BÌNH</p>
            <div className="flex items-baseline gap-space-sm">
              <span
                className="font-system-headline font-mono"
                style={{
                  fontSize: "clamp(3rem, 8vw, 5rem)",
                  color: `var(--md-sys-color-${report.overallScore >= 3.5 ? "primary" : report.overallScore >= 2.5 ? "tertiary" : "error"})`,
                }}
              >
                {report.overallScore.toFixed(1)}
              </span>
              <span className="text-body-lg text-on-surface-variant self-end mb-2">/ 5.0</span>
            </div>
            <p className="text-body-sm text-on-surface-variant">
              {report.questionCount} câu hỏi · {report.kindsPresent.map(k => KIND_LABELS[k]).join(", ")}
            </p>
          </div>

          <div className="flex flex-col items-end gap-space-sm shrink-0">
            {activity && (
              <Button variant="ghost" size="sm" onClick={() => router.push(`/log/history`)}>Xem nhật ký hoạt động</Button>
            )}
            <div className="flex items-center gap-space-xs text-body-sm text-on-surface-variant">
              <span className="material-symbols-rounded">schedule</span>
              <span>~{Math.round(report.questionCount * 5)} phút</span>
            </div>
          </div>
        </div>

        {/* Quick kind scores */}
        <div className="pt-gutter border-t border-outline-variant/50">
          <div className="flex flex-wrap gap-space-sm">
            {report.kindsPresent.map((kind) => {
              const kindData = report.matrix[kind] ?? {};
              const keys = kind === "behavioral"
                ? ["clarity", "structure", "tone", "natural", "grammar"]
                : ["accuracy", "depth", "reasoning", "communication", "tradeoff"];
              const avg = keys.reduce((sum, k) => sum + (kindData[k]?.score || 0), 0) / keys.length;
              const tone = avg >= 3.5 ? "primary" : avg >= 2.5 ? "secondary" : "tertiary";
              return (
                <Chip
                  key={kind}
                  tone={tone}
                  icon={KIND_ICONS[kind]}
                >
                  {KIND_LABELS[kind]}: {avg.toFixed(1)}
                </Chip>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Scorecard Matrix */}
      <ScorecardMatrix
        matrix={report.matrix}
        delta={report.delta || undefined}
        overallScore={report.overallScore}
        questionCount={report.questionCount}
        kindsPresent={report.kindsPresent}
      />

      {/* Strengths & Weaknesses */}
      <div className="grid gap-gutter-lg lg:grid-cols-2">
        {/* Strengths */}
        <Card className="space-y-gutter border-green-200 dark:border-green-800">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-rounded text-green-600 dark:text-green-400">trending_up</span>
            <h3 className="font-headline-sm text-on-surface">3 ĐIỂM MẠNH</h3>
          </div>
          <div className="space-y-gutter">
            {report.strengths.map((s, idx) => (
              <div key={idx} className="space-y-space-sm p-gutter bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                <div className="flex items-start gap-space-sm">
                  <span className="material-symbols-rounded text-green-600 dark:text-green-400 shrink-0 mt-1">check_circle</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-label-md text-on-surface">{s.title}</h4>
                    <p className="text-body-sm text-on-surface-variant mt-space-xs">
                      <span className="font-medium">{s.criterion}</span> · {KIND_LABELS[s.kind] || s.kind}
                    </p>
                  </div>
                  <span className="shrink-0 px-space-sm py-space-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                    #{idx + 1}
                  </span>
                </div>
                <blockquote className="pl-gutter border-l-2 border-green-300 dark:border-green-700 text-body-sm text-on-surface-variant italic">
                  "{s.evidence}"
                </blockquote>
              </div>
            ))}
          </div>
        </Card>

        {/* Weaknesses */}
        <Card className="space-y-gutter border-red-200 dark:border-red-800">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-rounded text-red-600 dark:text-red-400">trending_down</span>
            <h3 className="font-headline-sm text-on-surface">3 ĐIỂM YẾU</h3>
          </div>
          <div className="space-y-gutter">
            {report.weaknesses.map((w, idx) => (
              <div key={idx} className="space-y-space-sm p-gutter bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                <div className="flex items-start gap-space-sm">
                  <span className="material-symbols-rounded text-red-600 dark:text-red-400 shrink-0 mt-1">highlight_off</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-label-md text-on-surface">{w.title}</h4>
                    <p className="text-body-sm text-on-surface-variant mt-space-xs">
                      <span className="font-medium">{w.criterion}</span> · {KIND_LABELS[w.kind] || w.kind}
                    </p>
                  </div>
                  <span className="shrink-0 px-space-sm py-space-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
                    #{idx + 1}
                  </span>
                </div>
                <p className="pl-gutter text-body-sm text-on-surface-variant">
                  <span className="font-medium">Bằng chứng:</span> {w.evidence}
                </p>
                <p className="pl-gutter text-body-sm text-primary">
                  <span className="font-medium">Đề xuất:</span> {w.suggestion}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Practice Plan */}
      <Card className="space-y-gutter border-primary/20 bg-primary-container/5">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-rounded text-primary">fitness_center</span>
          <h3 className="font-headline-sm text-on-surface">KẾ HOẠCH LUYỆN TẬP ĐỀ XUẤT</h3>
        </div>
        <div className="space-y-space-sm">
          {report.practicePlan.map((p, idx) => (
            <div
              key={idx}
              className="p-gutter bg-surface rounded-xl border border-outline-variant/50 flex items-start gap-gutter"
            >
              <span className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-headline-sm font-mono">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-space-sm flex-wrap">
                  <span className="font-label-md text-on-surface">{p.skill}</span>
                  <Chip tone="outline" icon={KIND_ICONS[p.kind]}>
                    {KIND_LABELS[p.kind] || p.kind}
                  </Chip>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-space-xs">{p.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Summary */}
      <Card className="space-y-gutter bg-tertiary-container/10 border-tertiary/20">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-rounded text-tertiary">summarize</span>
          <h3 className="font-headline-sm text-on-surface">TÓM TẮT</h3>
        </div>
        <p className="text-body-md text-on-surface-variant">{report.summary}</p>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-space-sm justify-center">
        <Button size="lg" onClick={() => router.push("/interview/setup")}>
          Phỏng vấn lại
        </Button>
        <Button variant="ghost" size="lg" onClick={() => router.push("/review")}>
          Xem Weekly Review
        </Button>
        <Button variant="ghost" size="lg" onClick={() => router.push("/log/history")}>
          Nhật ký hoạt động
        </Button>
      </div>
    </div>
  );
}