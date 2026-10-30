"use client";

/**
 * S15 — Tab 1 "Hồ sơ & Mục tiêu" (task 9.2).
 *
 * Lưu vào bảng `UserProfile` — chỉ **1 bản ghi duy nhất** cho toàn hệ thống,
 * nên server action dùng `upsert` theo `id` cố định.
 *
 * Xem design.md §4.15 (Tab 1) · requirements.md FR-PS-07 (dữ liệu cá nhân).
 */

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import type { ProfileSaveState, ProfileValues } from "@/lib/settings-types";
import { useActionState, useState } from "react";

export type { ProfileSaveState, ProfileValues };

/** Giọng AI — design.md §4.15 Tab 1. */
const AI_TONES = [
  { value: "direct", label: "Direct — thẳng thắn, ngắn gọn" },
  { value: "coach", label: "Coach — dẫn dắt, đặt câu hỏi" },
  { value: "gentle", label: "Gentle — nhẹ nhàng, động viên" },
] as const;

/** Thang trình độ nội bộ 5 mức (SPEC.md §2.3 · requirements.md 5.2). */
const LEVELS = [
  { value: "zero", label: "Level 0 — chưa có nền tảng" },
  { value: "A1", label: "A1 — sơ cấp" },
  { value: "A2", label: "A2 — sơ cấp nâng cao" },
  { value: "B1", label: "B1 — trung cấp" },
  { value: "B2", label: "B2 — trung cấp nâng cao" },
] as const;

/** Trạng thái + dữ liệu hồ sơ — định nghĩa ở `src/lib/settings-types.ts`. */

export function ProfileTab({
  initial,
  saveAction,
}: {
  initial: ProfileValues;
  saveAction: (prev: ProfileSaveState, formData: FormData) => Promise<ProfileSaveState>;
}) {
  const [name, setName] = useState(initial.name);
  const [goals, setGoals] = useState(initial.goals);
  const [aiTone, setAiTone] = useState(initial.aiTone);
  const [zh, setZh] = useState(initial.learningLangs.includes("zh"));
  const [en, setEn] = useState(initial.learningLangs.includes("en"));
  const [zhLevel, setZhLevel] = useState(initial.zhLevel);
  const [enLevel, setEnLevel] = useState(initial.enLevel);

  const [state, formAction, isPending] = useActionState<ProfileSaveState, FormData>(
    saveAction,
    { ok: false, message: "" },
  );

  /** Ít nhất 1 ngôn ngữ — không cho bỏ trống cả 2. */
  const learningLangs = [zh ? "zh" : null, en ? "en" : null]
    .filter((value): value is string => value !== null)
    .join(",");

  return (
    <Card>
      <CardHeader
        title="Hồ sơ & Mục tiêu"
        subtitle="Thông tin này định hình giọng AI và nội dung gợi ý cho bạn"
        icon="person"
      />

      <form action={formAction} aria-live="polite" className="space-y-gutter">
        {/* Ngôn ngữ học — gửi dưới dạng input ẩn vì là 2 checkbox. */}
        <input type="hidden" name="learningLangs" value={learningLangs} />

        <div className="grid gap-gutter sm:grid-cols-2">
          <Input
            id="profile-name"
            name="name"
            label="Tên của bạn"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Ngọc"
          />

          <Select
            id="profile-tone"
            name="aiTone"
            label="Giọng AI"
            value={aiTone}
            onChange={(e) => setAiTone(e.target.value)}
          >
            {AI_TONES.map((tone) => (
              <option key={tone.value} value={tone.value}>
                {tone.label}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          id="profile-goals"
          name="goals"
          label="Mục tiêu 6 tháng"
          rows={4}
          value={goals}
          maxLength={2000}
          onChange={(e) => setGoals(e.target.value)}
          placeholder="Ví dụ: Đạt B1 tiếng Anh, hoàn thành 3 dự án chuyên môn…"
          hint="Mục tiêu được dùng làm ngữ cảnh khi AI gợi ý — chỉ lưu trên máy."
        />

        <fieldset className="space-y-space-md">
          <legend className="font-label-md text-on-surface-variant">Ngôn ngữ đang học</legend>
          <div className="flex flex-wrap gap-gutter">
            <label className="flex items-center gap-2 text-body-md text-on-surface">
              <input
                type="checkbox"
                name="langZh"
                checked={zh}
                onChange={(e) => setZh(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Tiếng Trung (zh)
            </label>
            <label className="flex items-center gap-2 text-body-md text-on-surface">
              <input
                type="checkbox"
                name="langEn"
                checked={en}
                onChange={(e) => setEn(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Tiếng Anh (en)
            </label>
          </div>
        </fieldset>

        <div className="grid gap-gutter sm:grid-cols-2">
          <Select
            id="profile-zh-level"
            name="zhLevel"
            label="Trình độ Tiếng Trung"
            value={zhLevel}
            onChange={(e) => setZhLevel(e.target.value)}
          >
            {LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </Select>

          <Select
            id="profile-en-level"
            name="enLevel"
            label="Trình độ Tiếng Anh (CEFR)"
            value={enLevel}
            onChange={(e) => setEnLevel(e.target.value)}
          >
            {LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <span className="font-label-sm text-outline">
            {learningLangs.length > 0
              ? `Đang học: ${learningLangs}`
              : "Hãy chọn ít nhất 1 ngôn ngữ"}
          </span>
          <Button type="submit" variant="primary" loading={isPending} icon="save">
            Lưu hồ sơ
          </Button>
        </div>

        <p
          className={`text-body-sm ${
            state.ok ? "text-primary" : state.message ? "text-error" : "text-on-surface-variant"
          }`}
          role="status"
        >
          {state.message}
        </p>
      </form>
    </Card>
  );
}
