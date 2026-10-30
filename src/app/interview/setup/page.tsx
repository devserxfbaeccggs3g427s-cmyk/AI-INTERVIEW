"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";
import { ProfileCard, SEED_PROFILES, type InterviewProfile } from "@/components/interview/ProfileCard";
import { cn } from "@/lib/cn";

const QUESTION_COUNTS = [5, 8, 12] as const;
const RESPONSE_MODES = [
  { value: "text", label: "Viết (textarea)" },
  { value: "voice", label: "Nói (Web Speech API)" },
] as const;
const LANGUAGES = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "Tiếng Anh" },
] as const;

const KIND_LABELS: Record<string, string> = {
  concept: "Khái niệm",
  design: "Thiết kế hệ thống",
  debug: "Debug / Troubleshoot",
  tradeoff: "Đánh đổi (Trade-off)",
  behavioral: "Hành vi (STAR)",
};

export default function InterviewSetupPage() {
  const [profiles, setProfiles] = useState<InterviewProfile[]>(SEED_PROFILES);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(SEED_PROFILES[0]?.id ?? null);
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [responseMode, setResponseMode] = useState<"text" | "voice">("text");
  const [language, setLanguage] = useState<"vi" | "en">("vi");
  const [questionKinds, setQuestionKinds] = useState<string[]>(["concept", "design", "tradeoff", "debug"]);
  const [advancedOptions, setAdvancedOptions] = useState({
    followUpDepth: 2,
    timePerQuestion: 300, // seconds
    strictScoring: false,
  });

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId)!;

  // Estimate cost: ~$0.02 per question with Opus, ~$0.18 for 8 questions
  const estimatedCost = (questionCount * 0.0225).toFixed(2);

  const handleKindToggle = (kind: string) => {
    setQuestionKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProfileId) return;

    // Create interview session via API
    try {
      const response = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfileId,
          questionCount,
          responseMode,
          language,
          questionKinds,
          advancedOptions,
        }),
      });

      const data = await response.json();
      if (data.ok && data.data?.sessionId) {
        window.location.href = `/interview/session/${data.data.sessionId}`;
      } else {
        alert(data.error?.message || "Không thể tạo phiên phỏng vấn");
      }
    } catch {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleCreateProfile = () => {
    const newProfile: InterviewProfile = {
      id: `custom-${Date.now()}`,
      label: "Hồ sơ mới",
      jobTitle: "",
      seniority: "Senior",
      language: "vi",
      questionKinds: ["concept", "design", "tradeoff"],
      focusSkills: [],
    };
    setProfiles((prev) => [...prev, newProfile]);
    setSelectedProfileId(newProfile.id);
  };

  const handleUpdateProfile = (profile: InterviewProfile) => {
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? profile : p)));
  };

  const handleDeleteProfile = (id: string) => {
    if (profiles.length <= 1) {
      alert("Phải có ít nhất 1 hồ sơ");
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    if (selectedProfileId === id) {
      setSelectedProfileId(profiles[0]?.id || null);
    }
  };

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id);
  };

  return (
    <div className="space-y-gutter-lg max-w-4xl mx-auto p-gutter-lg">
      <PageHeader
        eyebrow="Mock Interview · AI-11"
        title="Mock Interview — Cấu hình"
        description="Chọn hồ sơ vai trò, dạng câu hỏi và số câu để bắt đầu phiên phỏng vấn."
      />

      <form onSubmit={handleSubmit} className="space-y-gutter-lg">
        {/* Profile Selection */}
        <ProfileCard
          profiles={profiles}
          selectedId={selectedProfileId}
          onSelect={handleSelectProfile}
          onCreate={handleCreateProfile}
          onUpdate={handleUpdateProfile}
          onDelete={handleDeleteProfile}
        />

        {/* Session Configuration */}
        <Card className="space-y-gutter">
          <h3 className="font-headline-sm text-on-surface">Cấu hình phiên</h3>

          <div className="grid gap-gutter sm:grid-cols-2">
            <div className="space-y-space-sm">
              <label className="font-label-md text-on-surface">Số câu hỏi</label>
              <div className="flex flex-wrap gap-space-sm" role="radiogroup" aria-label="Số câu hỏi">
                {QUESTION_COUNTS.map((count) => (
                  <label
                    key={count}
                    className={cn(
                      "px-gutter py-space-sm rounded-xl border font-label-md cursor-pointer transition-colors",
                      questionCount === count
                        ? "border-primary bg-primary-container/10 text-primary"
                        : "border-outline-variant hover:border-outline",
                    )}
                  >
                    <input
                      type="radio"
                      name="questionCount"
                      value={count}
                      checked={questionCount === count}
                      onChange={() => setQuestionCount(count)}
                      className="sr-only"
                    />
                    {count} câu
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-space-sm">
              <label className="font-label-md text-on-surface">Phương thức trả lời</label>
              <div className="flex flex-wrap gap-space-sm" role="radiogroup" aria-label="Phương thức trả lời">
                {RESPONSE_MODES.map((mode) => (
                  <label
                    key={mode.value}
                    className={cn(
                      "px-gutter py-space-sm rounded-xl border font-label-md cursor-pointer transition-colors",
                      responseMode === mode.value
                        ? "border-primary bg-primary-container/10 text-primary"
                        : "border-outline-variant hover:border-outline",
                    )}
                  >
                    <input
                      type="radio"
                      name="responseMode"
                      value={mode.value}
                      checked={responseMode === mode.value}
                      onChange={() => setResponseMode(mode.value as "text" | "voice")}
                      className="sr-only"
                    />
                    {mode.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-space-sm">
              <label className="font-label-md text-on-surface">Ngôn ngữ phỏng vấn</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "vi" | "en")}
                className="w-full rounded-lg bg-surface-container-lowest border border-outline-variant/40 px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-space-sm">
              <label className="font-label-md text-on-surface">Thời gian mỗi câu (giây)</label>
              <Slider
                min={60}
                max={600}
                step={30}
                value={advancedOptions.timePerQuestion}
                onChange={(e) =>
                  setAdvancedOptions((prev) => ({ ...prev, timePerQuestion: Number(e.target.value) }))
                }
                valueText={`${advancedOptions.timePerQuestion}s`}
              />
            </div>
          </div>

          <div className="space-y-space-sm">
            <label className="font-label-md text-on-surface">Dạng câu hỏi</label>
            <div className="flex flex-wrap gap-space-sm" role="group" aria-label="Dạng câu hỏi">
              {(Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>).map((kind) => (
                <label
                  key={kind}
                  className={cn(
                    "inline-flex items-center gap-space-xs cursor-pointer px-space-md py-space-xs rounded-full font-label-sm transition-colors",
                    questionKinds.includes(kind)
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-highest text-on-surface",
                  )}
                >
                  <input
                    type="checkbox"
                    value={kind}
                    checked={questionKinds.includes(kind)}
                    onChange={() => handleKindToggle(kind)}
                    className="sr-only peer"
                  />
                  <span>{KIND_LABELS[kind]}</span>
                </label>
              ))}
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Tối thiểu 1 dạng câu hỏi. Hệ thống sẽ phân bổ đều các dạng được chọn.
            </p>
          </div>

          <details className="border-t border-outline-variant pt-gutter">
            <summary className="font-label-md text-on-surface-variant cursor-pointer select-none">
              Tuỳ chọn nâng cao
            </summary>
            <div className="mt-gutter grid gap-gutter sm:grid-cols-2">
              <div className="space-y-space-sm">
                <label className="font-label-md text-on-surface">
                  Độ sâu follow-up: {advancedOptions.followUpDepth}
                </label>
                <Slider
                  min={0}
                  max={3}
                  step={1}
                  value={advancedOptions.followUpDepth}
                  onChange={(e) =>
                    setAdvancedOptions((prev) => ({ ...prev, followUpDepth: Number(e.target.value) }))
                  }
                  valueText={advancedOptions.followUpDepth === 0 ? "Tắt" : String(advancedOptions.followUpDepth)}
                />
                <p className="text-body-sm text-on-surface-variant">
                  Số câu hỏi theo dõi sau mỗi câu trả lời (0 = tắt adaptive)
                </p>
              </div>

              <div className="space-y-space-sm">
                <label className="flex items-center gap-space-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.strictScoring}
                    onChange={(e) =>
                      setAdvancedOptions((prev) => ({ ...prev, strictScoring: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <span className="font-label-md text-on-surface">Chấm điểm nghiêm ngặt</span>
                </label>
                <p className="text-body-sm text-on-surface-variant ml-6">
                  Yêu cầu AI đưa ra điểm thấp hơn khi câu trả lời thiếu chiều sâu
                </p>
              </div>
            </div>
          </details>
        </Card>

        {/* Cost Estimate & Start */}
        <Card className="space-y-gutter bg-primary-container/10 border-primary/20">
          <div className="flex items-center justify-between flex-wrap gap-gutter">
            <div className="space-y-space-xs">
              <p className="font-headline-sm text-on-surface">Chi phí ước tính</p>
              <p className="text-body-md text-on-surface-variant">
                ~${estimatedCost} / phiên ({questionCount} câu × Opus + Local follow-up)
              </p>
            </div>
            <Button type="submit" size="lg" className="min-w-[160px]">
              Bắt đầu phỏng vấn
            </Button>
          </div>

          {selectedProfile && (
            <div className="pt-gutter border-t border-outline-variant">
              <p className="font-label-md text-on-surface-variant">Hồ sơ đang chọn: <span className="font-medium text-on-surface">{selectedProfile.label}</span></p>
              <p className="text-body-sm text-on-surface-variant">
                {selectedProfile.jobTitle} · {selectedProfile.seniority} · {questionCount} câu · {RESPONSE_MODES.find(m => m.value === responseMode)?.label}
              </p>
            </div>
          )}
        </Card>
      </form>
    </div>
  );
}