"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Form hồ sơ (S15 — FR-SC-01..07).
 *
 * ⚠️ FR-SC-04 — phải còn **≥ 1 ngôn ngữ** đang học: bỏ hết ngôn ngữ thì
 * nút lưu bị chặn và hiện lý do.
 *
 * ⚠️ FR-SC-07 — lưu có phản hồi rõ ràng (nút + toast `aria-live="polite"`),
 * không mất dữ liệu đang gõ khi lỗi.
 */

export interface ProfileFormProps {
  initial: {
    name: string | null;
    goals: string | null;
    aiTone: "direct" | "coach" | "gentle";
    learningLangs: Array<"en" | "zh" | "vi">;
    zhLevel: string;
    enLevel: string;
    viLevel: string;
    languageStandard: "cefr" | "hsk" | "both";
    interviewLang: "en" | "vi";
    monthlyBudgetUsd: number;
    saverMode: boolean;
  };
}

const TONES = [
  { value: "direct", label: "Thẳng thắn", hint: "Nói thẳng điều cần sửa" },
  { value: "coach", label: "Huấn luyện", hint: "Dẫn dắt từng bước" },
  { value: "gentle", label: "Nhẹ nhàng", hint: "Khuyến khích, ít phê bình" },
] as const;

const LANGS = [
  { value: "en" as const, label: "Tiếng Anh" },
  { value: "zh" as const, label: "Tiếng Trung" },
  { value: "vi" as const, label: "Tiếng Việt" },
];

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const HSK_LEVELS = ["zero", "1", "2", "3", "4", "5", "6"];

export function ProfileForm({ initial }: ProfileFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initial.name ?? "");
  const [goals, setGoals] = useState(initial.goals ?? "");
  const [aiTone, setAiTone] = useState(initial.aiTone);
  const [learningLangs, setLearningLangs] = useState(initial.learningLangs);
  const [zhLevel, setZhLevel] = useState(initial.zhLevel);
  const [enLevel, setEnLevel] = useState(initial.enLevel);
  const [viLevel, setViLevel] = useState(initial.viLevel);
  const [languageStandard, setLanguageStandard] = useState(initial.languageStandard);
  const [interviewLang, setInterviewLang] = useState(initial.interviewLang);
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState(
    String(initial.monthlyBudgetUsd),
  );
  const [saverMode, setSaverMode] = useState(initial.saverMode);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleLang(code: "en" | "zh" | "vi") {
    setLearningLangs((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    );
  }

  async function save() {
    // ⚠️ FR-SC-04 — ≥ 1 ngôn ngữ.
    if (learningLangs.length === 0) {
      setError("Phải chọn ít nhất 1 ngôn ngữ đang học");
      return;
    }

    const budget = Number(monthlyBudgetUsd);
    if (!Number.isFinite(budget) || budget < 0) {
      setError("Ngân sách phải là số ≥ 0");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          goals: goals.trim() || null,
          aiTone,
          learningLangs,
          zhLevel,
          enLevel,
          viLevel,
          languageStandard,
          interviewLang,
          monthlyBudgetUsd: budget,
          saverMode,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không lưu được hồ sơ");
        return;
      }

      setToast("Đã lưu hồ sơ");
      router.refresh();
    } catch {
      setError("Không kết nối được — thay đổi chưa được lưu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-gutter-md">
      {/* Tên + mục tiêu */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">Hồ sơ</h2>

        <div className="mt-space-md space-y-space-md">
          <div>
            <label
              htmlFor="profile-name"
              className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
            >
              Tên hiển thị
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tên của bạn"
              className="mt-space-xs w-full rounded-lg bg-surface-container-low p-space-sm text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="font-code-md text-code-md text-outline tabular">
              {name.length}/80
            </span>
          </div>

          <div>
            <label
              htmlFor="profile-goals"
              className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
            >
              Mục tiêu dài hạn
            </label>
            <textarea
              id="profile-goals"
              value={goals}
              maxLength={2000}
              onChange={(event) => setGoals(event.target.value)}
              placeholder="Bạn muốn đạt được gì trong 6 tháng tới?"
              rows={5}
              className="mt-space-xs w-full resize-y rounded-lg bg-surface-container-low p-space-sm text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span className="font-code-md text-code-md text-outline tabular">
              {goals.length}/2000
            </span>
          </div>
        </div>
      </section>

      {/* Giọng văn AI */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Giọng văn AI
        </h2>

        <div role="radiogroup" aria-label="Giọng văn AI" className="mt-space-md flex flex-wrap gap-space-sm">
          {TONES.map((tone) => (
            <button
              key={tone.value}
              type="button"
              role="radio"
              aria-checked={aiTone === tone.value}
              onClick={() => setAiTone(tone.value)}
              className={cn(
                "rounded-lg px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                aiTone === tone.value
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
              )}
            >
              <span className="block font-label-md text-label-md">{tone.label}</span>
              <span className="block font-label-sm text-label-sm opacity-80">
                {tone.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Ngôn ngữ */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">
          Ngôn ngữ
        </h2>

        {/* Chuẩn hiển thị ưu tiên */}
        <div className="mt-space-md">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Chuẩn hiển thị ưu tiên
          </span>
          <div className="mt-space-xs flex flex-wrap gap-space-xs">
            {(
              [
                { value: "cefr", label: "CEFR" },
                { value: "hsk", label: "HSK" },
                { value: "both", label: "Cả hai" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={languageStandard === option.value}
                onClick={() => setLanguageStandard(option.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 font-label-sm text-label-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  languageStandard === option.value
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ngôn ngữ đang học */}
        <div className="mt-space-md">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Đang học (chọn ít nhất 1)
          </span>
          <div
            role="group"
            aria-label="Ngôn ngữ đang học"
            className="mt-space-xs flex flex-wrap gap-space-xs"
          >
            {LANGS.map((lang) => (
              <button
                key={lang.value}
                type="button"
                aria-pressed={learningLangs.includes(lang.value)}
                onClick={() => toggleLang(lang.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 font-label-sm text-label-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  learningLangs.includes(lang.value)
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
          {learningLangs.length === 0 && (
            <p className="mt-space-xs font-label-sm text-label-sm text-error">
              Phải chọn ít nhất 1 ngôn ngữ đang học
            </p>
          )}
        </div>

        {/* Mức hiện tại */}
        <div className="mt-space-md grid grid-cols-1 gap-space-md sm:grid-cols-3">
          <LevelSelect
            id="level-en"
            label="Tiếng Anh"
            value={enLevel}
            onChange={setEnLevel}
            options={CEFR_LEVELS}
          />
          <LevelSelect
            id="level-zh"
            label="Tiếng Trung"
            value={zhLevel}
            onChange={setZhLevel}
            options={HSK_LEVELS}
          />
          <LevelSelect
            id="level-vi"
            label="Tiếng Việt (bản ngữ)"
            value={viLevel}
            onChange={setViLevel}
            options={CEFR_LEVELS}
          />
        </div>

        {/* Ngôn ngữ phỏng vấn */}
        <div className="mt-space-md">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Ngôn ngữ phỏng vấn mặc định
          </span>
          <div
            role="group"
            aria-label="Ngôn ngữ phỏng vấn"
            className="mt-space-xs flex flex-wrap gap-space-xs"
          >
            {(
              [
                { value: "en" as const, label: "Tiếng Anh" },
                { value: "vi" as const, label: "Tiếng Việt" },
              ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={interviewLang === option.value}
                onClick={() => setInterviewLang(option.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 font-label-sm text-label-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  interviewLang === option.value
                    ? "bg-secondary-container text-secondary"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Chi phí */}
      <section className="rounded-xl bg-surface-container p-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface">Chi phí AI</h2>

        <div className="mt-space-md">
          <label
            htmlFor="budget"
            className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
          >
            Ngân sách tháng (USD)
          </label>
          <input
            id="budget"
            type="number"
            min={0}
            step={1}
            value={monthlyBudgetUsd}
            onChange={(event) => setMonthlyBudgetUsd(event.target.value)}
            className="mt-space-xs w-40 rounded-lg bg-surface-container-low p-space-sm font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {/* Chế độ khẩn cấp tiết kiệm */}
        <div className="mt-space-md flex items-start justify-between gap-space-md">
          <div>
            <span className="font-label-md text-label-md text-on-surface">
              Chế độ khẩn cấp tiết kiệm
            </span>
            <p className="font-label-sm text-label-sm text-outline">
              Ép mọi lời gọi AI về model nhẹ. Chất lượng chấm điểm giảm.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={saverMode}
            onClick={() => setSaverMode((current) => !current)}
            className={cn(
              "relative h-6 w-12 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              saverMode ? "bg-primary" : "bg-surface-container-highest",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all",
                saverMode ? "left-6" : "left-0.5",
              )}
            />
          </button>
        </div>
      </section>

      {/* Lưu */}
      <div className="flex flex-wrap items-center gap-space-sm">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-container px-4 py-2 font-label-md text-label-md font-semibold text-on-primary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="check" size={16} />
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>

        {error && (
          <span role="alert" className="font-label-sm text-label-sm text-error">
            {error}
          </span>
        )}
      </div>

      {/* Toast — FR-SC-07 */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-primary/30 bg-surface-container-highest px-4 py-2 font-label-md text-label-md text-on-surface shadow-md"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function LevelSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-space-xs w-full rounded-lg bg-surface-container-low p-space-sm font-code-md text-code-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
