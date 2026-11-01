"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Thiết lập phiên phỏng vấn (S11 — `/interview/setup`).
 *
 * ⚠️ FR-MI-11 — không có API key ⇒ nói rõ, KHÔNG giả lập interviewer.
 * ⚠️ FR-MI-08 — gợi ý kỹ năng yếu tính **cục bộ** từ Evidence.
 */

export interface InterviewProfileDTO {
  id: string;
  label: string;
  jobTitle: string;
  seniority: string;
  language: string;
  questionKinds: string;
  focusSkills: string;
  answerMode: string;
  englishClarity: boolean;
}

export interface WeakSkillDTO {
  skillId: string;
  name: string;
  band: string;
  /** Điểm ưu tiên (thấp = yếu hơn). */
  score: number;
}

export interface InterviewSetupProps {
  profiles: InterviewProfileDTO[];
  weakSkills: WeakSkillDTO[];
  aiEnabled: boolean;
}

const QUESTION_KIND_OPTIONS = [
  { value: "concept", label: "Kiến thức nền" },
  { value: "design", label: "Thiết kế hệ thống" },
  { value: "debug", label: "Debug" },
  { value: "tradeoff", label: "Đánh đổi kỹ thuật" },
  { value: "behavioral", label: "Hành vi" },
] as const;

export function InterviewSetup({
  profiles,
  weakSkills,
  aiEnabled,
}: InterviewSetupProps) {
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(
    profiles[0]?.id ?? null,
  );
  const [plannedCount, setPlannedCount] = useState(8);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  async function start() {
    if (!selectedId) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedId,
          plannedCount,
          focusHint:
            weakSkills.length > 0
              ? `Tập trung vào: ${weakSkills.map((s) => s.name).join(", ")}`
              : undefined,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không bắt đầu được phiên");
        return;
      }

      router.push(`/interview/session?id=${payload.data.session.id}`);
    } catch {
      setError("Không kết nối được");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-gutter-md">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          AI Interview Studio
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {profiles.length} hồ sơ phỏng vấn · chấm theo rubric chi tiết từng lượt
        </p>
      </header>

      {/* ⚠️ FR-MI-11 */}
      {!aiEnabled && (
        <div className="rounded-xl bg-tertiary/10 p-space-md">
          <p className="inline-flex items-center gap-1 font-label-md text-label-md text-tertiary">
            <Icon name="lock" size={14} />
            Chưa có API key — phỏng vấn AI cần API key
          </p>
        </div>
      )}

      {/* Chọn hồ sơ */}
      <div>
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
          Hồ sơ
        </span>

        {profiles.length === 0 ? (
          <p className="mt-space-sm font-body-md text-body-md text-on-surface-variant">
            Chưa có hồ sơ phỏng vấn nào.
          </p>
        ) : (
          <ul className="mt-space-sm space-y-space-sm" role="radiogroup" aria-label="Hồ sơ phỏng vấn">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedId === profile.id}
                  onClick={() => setSelectedId(profile.id)}
                  className={cn(
                    "w-full rounded-xl p-space-md text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selectedId === profile.id
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-container text-on-surface hover:bg-surface-container-high",
                  )}
                >
                  <span className="block font-headline-sm text-headline-sm">
                    {profile.label}
                  </span>
                  <span className="mt-space-xs block font-body-sm text-body-sm opacity-90">
                    {profile.jobTitle} · {profile.seniority} ·{" "}
                    {profile.language === "vi" ? "tiếng Việt" : "tiếng Anh"}
                  </span>
                  <span className="mt-space-xs block font-label-sm text-label-sm opacity-75">
                    {profile.questionKinds.split(",").join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Số câu */}
      <div>
        <label
          htmlFor="planned-count"
          className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
        >
          Số câu dự kiến
        </label>
        <input
          id="planned-count"
          type="number"
          min={1}
          max={20}
          value={plannedCount}
          onChange={(event) =>
            setPlannedCount(Math.min(20, Math.max(1, Number(event.target.value))))
          }
          className="mt-space-xs w-28 rounded-lg bg-surface-container-low p-space-sm font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {/* Gợi ý kỹ năng yếu (FR-MI-08) */}
      {weakSkills.length > 0 && (
        <section className="rounded-xl bg-surface-container-low p-space-lg">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Nên luyện gì
          </h2>

          <ul className="mt-space-md space-y-space-sm">
            {weakSkills.map((skill) => (
              <li key={skill.skillId} className="flex items-start gap-space-sm">
                <span className="shrink-0 rounded-full bg-tertiary/20 px-2 py-0.5 font-code-md text-code-md text-tertiary">
                  {skill.band}
                </span>
                <span className="min-w-0">
                  <span className="block font-body-sm text-body-sm text-on-surface">
                    {skill.name}
                  </span>
                  <span className="block font-label-sm text-label-sm text-outline tabular">
                    Ưu tiên {skill.score.toFixed(1)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => void start()}
        disabled={creating || !selectedId || !aiEnabled}
        className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon name="play_arrow" size={16} />
        {creating ? "Đang bắt đầu…" : "Bắt đầu phỏng vấn"}
      </button>

      {error && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {error}
        </p>
      )}

      {/* Danh sách loại câu hỏi (giúp người dùng hiểu hồ sơ) */}
      {selected && (
        <section className="rounded-xl bg-surface-container p-space-lg">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Loại câu hỏi trong hồ sơ
          </h2>
          <ul className="mt-space-md flex flex-wrap gap-space-xs">
            {selected.questionKinds.split(",").map((kind) => (
              <li
                key={kind}
                className="rounded-full bg-surface-container-high px-3 py-1 font-label-sm text-label-sm text-on-surface-variant"
              >
                {QUESTION_KIND_OPTIONS.find((o) => o.value === kind)?.label ??
                  kind}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
